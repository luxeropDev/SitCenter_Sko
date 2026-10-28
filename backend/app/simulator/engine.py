"""Embedded simulator: a single asyncio task driven by SimulatorState in DB.

Guarantees: at most one loop per process (guarded by a lock + task handle),
state persisted in DB so a restart resumes from the stored tick, graceful
cancellation on shutdown.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.timeutil import utcnow
from app.models import SimulatorState, Station
from app.schemas.telemetry import ReadingIn, TelemetryIngest
from app.services import telemetry_service
from app.simulator.scenarios import SCENARIOS, StationProfile, generate

log = logging.getLogger("urpaq.simulator")


def get_state(db: Session) -> SimulatorState:
    st = db.get(SimulatorState, 1)
    if st is None:
        st = SimulatorState(id=1)
        db.add(st)
        db.commit()
        db.refresh(st)
    return st


def state_dict(db: Session, state: SimulatorState, driver_alive: bool) -> Dict[str, Any]:
    stations = db.query(Station).filter(Station.is_deleted.is_(False), Station.source_type == "simulator").all()
    return {
        "state": state.state,
        "scenario": state.scenario,
        "scenarios": list(SCENARIOS),
        "interval_seconds": state.interval_seconds,
        "intensity": state.intensity,
        "time_acceleration": state.time_acceleration,
        "seed": state.seed,
        "tick": state.tick,
        "sim_elapsed_seconds": round(state.sim_elapsed_seconds, 1),
        "sent_count": state.sent_count,
        "error_count": state.error_count,
        "last_event_at": state.last_event_at,
        "last_error": state.last_error,
        "driver": state.driver,
        "driver_alive": driver_alive,
        "driver_heartbeat_at": state.driver_heartbeat_at,
        "stations": [
            {"id": s.id, "code": s.code, "name": s.name, "scenario": s.scenario, "status": s.status, "interval_seconds": s.interval_seconds}
            for s in stations
        ],
        "synthetic": True,
        "updated_at": state.updated_at,
    }


def profile_for(st: Station) -> StationProfile:
    th = (st.configuration or {}).get("thresholds", {})
    sim = (st.configuration or {}).get("simulator", {})
    return StationProfile(
        baseline_level_cm=float(th.get("baseline_level_cm", 120.0)),
        critical_level_cm=float(th.get("critical_level_cm", 300.0)),
        base_temperature_c=float(sim.get("base_temperature_c", 12.0)),
        base_soil_pct=float(sim.get("base_soil_pct", 35.0)),
    )


def build_payloads(db: Session, state: SimulatorState, measured_at: datetime) -> List[TelemetryIngest]:
    """Compute one tick of readings for every online simulator station (pure w.r.t. state)."""
    dt = state.interval_seconds * state.time_acceleration
    t = state.sim_elapsed_seconds
    payloads: List[TelemetryIngest] = []
    stations = db.query(Station).filter(Station.is_deleted.is_(False), Station.source_type == "simulator", Station.status == "online").all()
    for st in stations:
        scenario = st.scenario if st.scenario in SCENARIOS else state.scenario
        values = generate(scenario, t, dt, state.intensity, profile_for(st), state.seed, st.code)
        readings = [ReadingIn(parameter=p, value=v) for p, v in values.items() if p in (st.parameters or [])]
        if not readings:
            continue
        event_id = f"sim-{state.seed}-{st.code}-{state.tick}"[:64]
        payloads.append(TelemetryIngest(station_id=st.id, measured_at=measured_at, event_id=event_id, readings=readings))
    return payloads


def run_tick(db: Session) -> int:
    """Perform one simulator tick synchronously: generate + ingest. Returns number of payloads sent."""
    state = get_state(db)
    if state.state != "running":
        return 0
    now = utcnow()
    payloads = build_payloads(db, state, now)
    sent = 0
    for p in payloads:
        try:
            telemetry_service.ingest(db, p, source="simulator")
            sent += 1
        except Exception as exc:  # noqa: BLE001 - keep loop alive, record error
            db.rollback()
            state = get_state(db)
            state.error_count += 1
            state.last_error = str(exc)[:500]
            log.warning("simulator ingest failed for station %s: %s", p.station_id, exc)
    state = get_state(db)
    state.tick += 1
    state.sim_elapsed_seconds += state.interval_seconds * state.time_acceleration
    state.sent_count += sent
    state.last_event_at = now
    state.driver_heartbeat_at = now
    db.commit()
    return sent


class EmbeddedSimulator:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._stop = asyncio.Event()

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        async with self._lock:
            if self.running:
                return
            self._stop.clear()
            self._task = asyncio.create_task(self._loop(), name="urpaq-simulator")
            log.info("embedded simulator loop started")

    async def stop(self) -> None:
        async with self._lock:
            if self._task is None:
                return
            self._stop.set()
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._task = None
            log.info("embedded simulator loop stopped")

    async def _loop(self) -> None:
        while not self._stop.is_set():
            interval = 5.0
            try:
                with SessionLocal() as db:
                    state = get_state(db)
                    interval = float(state.interval_seconds)
                    if state.driver != "embedded":
                        state.driver = "embedded"
                    if state.state == "running":
                        await asyncio.to_thread(run_tick, db)
                    else:
                        state.driver_heartbeat_at = utcnow()
                        db.commit()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                log.exception("simulator loop error: %s", exc)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=max(0.5, interval))
            except asyncio.TimeoutError:
                pass


simulator = EmbeddedSimulator()


def driver_alive(state: SimulatorState) -> bool:
    if state.driver_heartbeat_at is None:
        return False
    return (utcnow() - state.driver_heartbeat_at).total_seconds() <= max(15.0, state.interval_seconds * 3)

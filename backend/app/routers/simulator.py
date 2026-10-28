from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, ingest_auth, require_operator
from app.core.errors import ValidationFailed
from app.core.timeutil import utcnow
from app.models import Station, User
from app.schemas.admin import SimulatorScenarioRequest, SimulatorStartRequest
from app.services import audit_service
from app.simulator.engine import driver_alive, get_state, state_dict
from app.simulator.scenarios import SCENARIOS, preview

router = APIRouter(prefix="/simulator", tags=["simulator"])


def _status(db: Session):
    state = get_state(db)
    d = state_dict(db, state, driver_alive(state))
    d["mode"] = get_settings().simulator_mode
    # external runner needs thresholds to reproduce station profiles
    ths = {s.id: (s.configuration or {}).get("thresholds", {}) for s in db.query(Station).filter(Station.source_type == "simulator").all()}
    for s in d["stations"]:
        s["thresholds"] = ths.get(s["id"], {})
    return d


@router.get("/status")
def status(db: Session = Depends(get_db)):
    """Public (read-only) simulator status; also consumed by the external runner."""
    return _status(db)


@router.get("/preview")
def scenario_preview(scenario: str = "RISING_WATER", intensity: float = 1.0, seed: int = 42, minutes: int = 120, user: User = Depends(get_current_user)):
    scenario = scenario.upper()
    if scenario not in SCENARIOS:
        raise ValidationFailed(f"unknown scenario {scenario}", code="unknown_scenario")
    minutes = max(5, min(720, minutes))
    return {"scenario": scenario, "intensity": intensity, "seed": seed, "points": preview(scenario, intensity, seed, minutes, 60)}


def _apply(state, body) -> dict:
    changes = {}
    for k in ("intensity", "interval_seconds", "time_acceleration", "seed"):
        v = getattr(body, k, None)
        if v is not None:
            setattr(state, k, v)
            changes[k] = v
    scenario = getattr(body, "scenario", None)
    if scenario:
        scenario = scenario.upper()
        if scenario not in SCENARIOS:
            raise ValidationFailed(f"unknown scenario {scenario}", code="unknown_scenario")
        state.scenario = scenario
        changes["scenario"] = scenario
    return changes


@router.post("/start")
def start(body: SimulatorStartRequest = SimulatorStartRequest(), db: Session = Depends(get_db), user: User = Depends(require_operator)):
    state = get_state(db)
    changes = _apply(state, body)
    if body.scenario:
        db.query(Station).filter(Station.source_type == "simulator", Station.is_deleted.is_(False)).update({Station.scenario: state.scenario})
    if state.state == "stopped":
        state.tick = 0
        state.sim_elapsed_seconds = 0.0
    state.state = "running"
    audit_service.record(db, actor=user, action="simulator.start", entity_type="simulator", entity_id=1, details=changes)
    db.commit()
    return _status(db)


@router.post("/pause")
def pause(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    state = get_state(db)
    if state.state == "running":
        state.state = "paused"
        audit_service.record(db, actor=user, action="simulator.pause", entity_type="simulator", entity_id=1)
    db.commit()
    return _status(db)


@router.post("/stop")
def stop(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    state = get_state(db)
    if state.state != "stopped":
        state.state = "stopped"
        audit_service.record(db, actor=user, action="simulator.stop", entity_type="simulator", entity_id=1)
    db.commit()
    return _status(db)


@router.post("/reset")
def reset(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    state = get_state(db)
    state.state = "stopped"
    state.tick = 0
    state.sim_elapsed_seconds = 0.0
    state.sent_count = 0
    state.error_count = 0
    state.last_error = ""
    audit_service.record(db, actor=user, action="simulator.reset", entity_type="simulator", entity_id=1)
    db.commit()
    return _status(db)


@router.post("/scenario")
def set_scenario(body: SimulatorScenarioRequest, db: Session = Depends(get_db), user: User = Depends(require_operator)):
    state = get_state(db)
    changes = _apply(state, body)
    q = db.query(Station).filter(Station.source_type == "simulator", Station.is_deleted.is_(False))
    if body.station_ids:
        q = q.filter(Station.id.in_(body.station_ids))
    updated = q.update({Station.scenario: state.scenario}, synchronize_session=False)
    # A scenario change restarts the scenario clock so curves start from the beginning.
    if not body.station_ids:
        state.tick = 0
        state.sim_elapsed_seconds = 0.0
    changes["stations_updated"] = updated
    changes["station_ids"] = body.station_ids
    audit_service.record(db, actor=user, action="simulator.scenario", entity_type="simulator", entity_id=1, details=changes)
    db.commit()
    return _status(db)


class HeartbeatBody(BaseModel):
    driver: str = "external"


class AdvanceBody(BaseModel):
    sent: int = 0


@router.post("/heartbeat")
def heartbeat(body: HeartbeatBody, source: str = Depends(ingest_auth), db: Session = Depends(get_db)):
    state = get_state(db)
    if state.driver == "embedded" and driver_alive(state):
        raise ValidationFailed("embedded simulator is active; external runner refused", code="simulator_conflict")
    state.driver = "external"
    state.driver_heartbeat_at = utcnow()
    db.commit()
    return {"ok": True}


@router.post("/advance")
def advance(body: AdvanceBody, source: str = Depends(ingest_auth), db: Session = Depends(get_db)):
    """Called by the external runner after it has posted one tick for all stations."""
    state = get_state(db)
    if state.driver != "external":
        raise ValidationFailed("advance is only valid for the external driver", code="simulator_conflict")
    state.tick += 1
    state.sim_elapsed_seconds += state.interval_seconds * state.time_acceleration
    state.sent_count += max(0, body.sent)
    state.last_event_at = utcnow()
    state.driver_heartbeat_at = utcnow()
    db.commit()
    return {"tick": state.tick}

"""Idempotent demo seed: users, stations, settings, telemetry history and historical alerts.

All data is SYNTHETIC. Demo passwords are for local development only.
Run:  python -m app.seed            (idempotent)
      python -m app.seed --reset    (drop & recreate demo data)
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import timedelta
from typing import Dict, List

from sqlalchemy.orm import Session

from app.core.database import SessionLocal, init_db
from app.core.security import hash_password
from app.core.timeutil import utcnow
from app.models import Alert, AuditLog, RiskAssessment, SimulatorState, Station, SystemSetting, Telemetry, User
from app.services import telemetry_service
from app.services.risk_engine import PARAMETER_UNITS
from app.simulator.scenarios import StationProfile, generate

log = logging.getLogger("urpaq.seed")

DEMO_USERS = [
    {"username": "admin", "email": "admin@urpaq.local", "full_name": "Администратор системы", "password": "Admin12345!", "role": "admin"},
    {"username": "operator", "email": "operator@urpaq.local", "full_name": "Дежурный оператор", "password": "Operator12345!", "role": "operator"},
    {"username": "observer", "email": "observer@urpaq.local", "full_name": "Наблюдатель", "password": "Observer12345!", "role": "observer"},
]

# Synthetic demo stations: Petropavlovsk / Esil (Ishim) river area plus a few others across Kazakhstan.
DEMO_STATIONS = [
    {"code": "ESIL-PTR-01", "name": "Есиль — Петропавловск, центральный мост", "description": "Синтетическая станция уровня воды на р. Есиль в черте Петропавловска.",
     "latitude": 54.8745, "longitude": 69.1620, "scenario": "NORMAL", "interval_seconds": 10,
     "thresholds": {"baseline_level_cm": 150, "warning_level_cm": 260, "critical_level_cm": 340}, "seed_scenario": "NORMAL"},
    {"code": "ESIL-PTR-02", "name": "Есиль — Петропавловск, Заречный", "description": "Синтетическая станция в низинной застройке правого берега.",
     "latitude": 54.9010, "longitude": 69.1965, "scenario": "RISING_WATER", "interval_seconds": 10,
     "thresholds": {"baseline_level_cm": 120, "warning_level_cm": 220, "critical_level_cm": 300}, "seed_scenario": "RISING_WATER"},
    {"code": "ESIL-SKO-03", "name": "Есиль — Сергеевское водохранилище", "description": "Синтетический пост ниже плотины Сергеевского водохранилища.",
     "latitude": 53.8822, "longitude": 67.4117, "scenario": "RAPID_FLOOD", "interval_seconds": 10,
     "thresholds": {"baseline_level_cm": 110, "warning_level_cm": 200, "critical_level_cm": 280}, "seed_scenario": "RAPID_FLOOD"},
    {"code": "ESIL-PTR-04", "name": "Есиль — Петропавловск, Подгора", "description": "Синтетическая станция в районе Подгоры (левый берег).",
     "latitude": 54.8590, "longitude": 69.1240, "scenario": "NORMAL", "interval_seconds": 10,
     "thresholds": {"baseline_level_cm": 140, "warning_level_cm": 240, "critical_level_cm": 320}, "seed_scenario": "NORMAL"},
    {"code": "TOBOL-KST-05", "name": "Тобол — Костанай", "description": "Синтетический пост на р. Тобол (Костанай).",
     "latitude": 53.2198, "longitude": 63.6354, "scenario": "NORMAL", "interval_seconds": 15,
     "thresholds": {"baseline_level_cm": 130, "warning_level_cm": 230, "critical_level_cm": 310}, "seed_scenario": "NORMAL"},
    {"code": "ZHAIYK-ORL-06", "name": "Жайык — Орал", "description": "Синтетический пост на р. Жайык (Урал) у г. Орал.",
     "latitude": 51.2333, "longitude": 51.3667, "scenario": "NORMAL", "interval_seconds": 15,
     "thresholds": {"baseline_level_cm": 160, "warning_level_cm": 280, "critical_level_cm": 360}, "seed_scenario": "NORMAL"},
    {"code": "ERTIS-PVL-07", "name": "Ертіс — Павлодар", "description": "Синтетический пост на р. Ертіс (Иртыш) у г. Павлодар.",
     "latitude": 52.2873, "longitude": 76.9674, "scenario": "NORMAL", "interval_seconds": 15,
     "thresholds": {"baseline_level_cm": 170, "warning_level_cm": 290, "critical_level_cm": 380}, "seed_scenario": "NORMAL"},
]

HISTORY_MINUTES = 180
HISTORY_STEP_SEC = 60


def _seed_users(db: Session) -> Dict[str, User]:
    out = {}
    for u in DEMO_USERS:
        row = db.query(User).filter(User.username == u["username"]).first()
        if row is None:
            row = User(username=u["username"], email=u["email"], full_name=u["full_name"], password_hash=hash_password(u["password"]), role=u["role"])
            db.add(row)
            db.flush()
        out[u["username"]] = row
    return out


def _seed_stations(db: Session) -> List[Station]:
    out = []
    for s in DEMO_STATIONS:
        row = db.query(Station).filter(Station.code == s["code"]).first()
        if row is None:
            row = Station(code=s["code"], name=s["name"], description=s["description"], latitude=s["latitude"], longitude=s["longitude"],
                          source_type="simulator", scenario=s["scenario"], status="online", parameters=list(PARAMETER_UNITS.keys()),
                          configuration={"thresholds": {**{"critical_rise_rate_cm_h": 30, "critical_rainfall_mm_h": 15, "soil_dry_pct": 20, "soil_saturated_pct": 85}, **s["thresholds"]},
                                         "simulator": {"base_temperature_c": 11.0, "base_soil_pct": 35.0}, "synthetic": True},
                          interval_seconds=s["interval_seconds"])
            db.add(row)
            db.flush()
        out.append(row)
    return out


def _seed_history(db: Session, stations: List[Station]) -> int:
    """Generate 3 hours of 1-minute history per station (only if the station has no history yet)."""
    inserted = 0
    now = utcnow()
    for st, spec in zip(stations, DEMO_STATIONS):
        if db.query(Telemetry.id).filter(Telemetry.station_id == st.id).first():
            continue
        th = st.configuration["thresholds"]
        profile = StationProfile(baseline_level_cm=th["baseline_level_cm"], critical_level_cm=th["critical_level_cm"], base_temperature_c=11.0, base_soil_pct=35.0)
        scenario = spec["seed_scenario"]
        steps = HISTORY_MINUTES * 60 // HISTORY_STEP_SEC
        # Scenario time: RISING_WATER station is ~25 min into the scenario (medium risk);
        # RAPID_FLOOD station is ~40 min in (high risk); NORMAL stations are stable.
        offset = {"NORMAL": 0.0, "RISING_WATER": 25 * 60.0 - HISTORY_MINUTES * 60, "RAPID_FLOOD": 40 * 60.0 - HISTORY_MINUTES * 60}[scenario]
        for i in range(steps + 1):
            t_sec = i * HISTORY_STEP_SEC
            sim_t = max(0.0, offset + t_sec)
            values = generate(scenario, sim_t, HISTORY_STEP_SEC, 1.0, profile, 42, st.code)
            measured_at = now - timedelta(seconds=(steps - i) * HISTORY_STEP_SEC)
            for p, v in values.items():
                db.add(Telemetry(station_id=st.id, parameter=p, value=v, unit=PARAMETER_UNITS[p], measured_at=measured_at,
                                 received_at=measured_at, event_id=f"seed-{st.code}-{i}", source="seed"))
                inserted += 1
        st.last_seen_at = now
        db.flush()
        # Assess risk at a few points to build risk history + create demo alerts naturally.
        for minutes_ago in (120, 90, 60, 30, 15, 5, 0):
            at = now - timedelta(minutes=minutes_ago)
            _assess_at(db, st, at)
    return inserted


def _assess_at(db: Session, st: Station, at):
    """Assess risk using only data up to `at` (used to build a plausible risk history)."""
    from app.services import settings_service
    from app.services.risk_engine import Reading, assess_risk

    risk_settings = settings_service.get_risk_settings(db)
    alert_settings = settings_service.get_alert_settings(db)
    rows = (db.query(Telemetry).filter(Telemetry.station_id == st.id, Telemetry.measured_at <= at)
            .order_by(Telemetry.measured_at.desc()).limit(400).all())
    latest = {}
    series = []
    for r in rows:
        if r.parameter not in latest:
            latest[r.parameter] = Reading(r.parameter, r.value, r.measured_at)
        if r.parameter == "water_level_cm":
            series.append(Reading(r.parameter, r.value, r.measured_at))
    series.reverse()
    series = series[-16:]
    result = assess_risk(latest=latest, water_level_series=series, station_config=st.configuration, risk_settings=risk_settings, now=at)
    prev = (db.query(RiskAssessment).filter(RiskAssessment.station_id == st.id).order_by(RiskAssessment.assessed_at.desc()).first())
    db.add(RiskAssessment(station_id=st.id, assessed_at=at, risk_level=result.level, score=None if result.score is None else round(result.score, 2),
                          explanation={"ru": result.explanation_ru, "kk": result.explanation_kk, "trend": result.trend,
                                       "forecasts": [f.to_dict() for f in result.forecasts]},
                          contributing_factors=[f.to_dict() for f in result.factors], data_quality=result.data_quality,
                          algorithm_version=result.algorithm_version))
    db.flush()
    from app.services import alert_service

    alert, action = alert_service.evaluate_alerts(db, st, result, prev.risk_level if prev else None, alert_settings)
    if alert is not None and action == "created":
        alert.created_at = at
        alert.updated_at = at
    db.flush()


def _seed_historical_alerts(db: Session, stations: List[Station], users: Dict[str, User]) -> int:
    """A couple of resolved historical incidents so the alert journal is not empty."""
    if db.query(Alert.id).filter(Alert.event_type == "demo_history").first():
        return 0
    now = utcnow()
    operator = users["operator"]
    created = 0
    specs = [
        (stations[0], "medium", now - timedelta(days=2, hours=3), now - timedelta(days=2, hours=1), "Уровень вернулся в норму после кратковременного подъёма."),
        (stations[3], "high", now - timedelta(days=1, hours=6), now - timedelta(days=1, hours=2), "Прорыв ледового затора ликвидирован, уровень снижается (учебный сценарий)."),
        (stations[5], "medium", now - timedelta(hours=20), now - timedelta(hours=17), "Осадки прекратились, тренд стабилизировался."),
    ]
    for st, sev, created_at, resolved_at, note in specs:
        a = Alert(station_id=st.id, severity=sev, event_type="demo_history", title=f"{'Высокий' if sev == 'high' else 'Повышенный'} риск подтопления: {st.name}",
                  description="Исторический демонстрационный инцидент (синтетические данные).",
                  trigger_factors={"synthetic": True, "risk_level": sev, "score": 72.0 if sev == "high" else 48.0}, status="resolved",
                  acknowledged_by=operator.id, acknowledged_at=created_at + timedelta(minutes=7), resolved_by=operator.id, resolved_at=resolved_at,
                  resolution_note=note, created_at=created_at, updated_at=resolved_at)
        db.add(a)
        db.flush()
        db.add(AuditLog(actor_id=operator.id, actor_name=operator.username, action="alert.resolved", entity_type="alert", entity_id=str(a.id),
                        created_at=resolved_at, details={"station_id": st.id, "severity": sev, "note": note}))
        created += 1
    return created


def seed(verbose: bool = True, reset: bool = False) -> Dict[str, int]:
    init_db()
    with SessionLocal() as db:
        if reset:
            for model in (Telemetry, RiskAssessment, Alert, AuditLog, SimulatorState, Station, SystemSetting):
                db.query(model).delete()
            db.query(User).filter(User.username.in_([u["username"] for u in DEMO_USERS])).delete(synchronize_session=False)
            db.commit()
        users = _seed_users(db)
        stations = _seed_stations(db)
        if db.get(SimulatorState, 1) is None:
            db.add(SimulatorState(id=1, state="stopped", scenario="NORMAL", interval_seconds=5.0, intensity=1.0, time_acceleration=6.0, seed=42))
            db.flush()
        tele = _seed_history(db, stations)
        hist = _seed_historical_alerts(db, stations, users)
        db.commit()
        stats = {"users": len(users), "stations": len(stations), "telemetry_inserted": tele, "historical_alerts": hist}
        if verbose:
            print("Seed complete:", stats)
            print("\nDemo accounts (LOCAL DEVELOPMENT ONLY — change before any real deployment):")
            for u in DEMO_USERS:
                print(f"  {u['role']:<9} {u['username']:<9} {u['password']}")
        return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="delete demo data and recreate")
    args = ap.parse_args()
    seed(verbose=True, reset=args.reset)
    sys.exit(0)

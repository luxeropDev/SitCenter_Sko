from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationFailed
from app.core.timeutil import utcnow
from app.models import RiskAssessment, Station, Telemetry
from app.services import alert_service, settings_service, station_service
from app.services.risk_engine import PARAM_WATER_LEVEL, PARAMETER_UNITS, Reading, RiskResult, assess_risk

log = logging.getLogger("urpaq.telemetry")

MAX_RANGE = timedelta(days=30)
MAX_POINTS = 5000


def resolve_station(db: Session, station_id: Optional[int], station_code: Optional[str]) -> Station:
    st = None
    if station_id is not None:
        st = db.get(Station, station_id)
    elif station_code:
        st = db.query(Station).filter(Station.code == station_code).first()
    if st is None or st.is_deleted:
        raise NotFoundError("Станция не найдена", code="station_not_found")
    return st


def water_level_series(db: Session, station_id: int, limit: int = 64) -> List[Reading]:
    rows = (
        db.query(Telemetry)
        .filter(Telemetry.station_id == station_id, Telemetry.parameter == PARAM_WATER_LEVEL)
        .order_by(Telemetry.measured_at.desc(), Telemetry.id.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return [Reading(r.parameter, r.value, r.measured_at) for r in rows]


def assess_station(db: Session, st: Station, *, now: Optional[datetime] = None, persist: bool = True) -> Tuple[RiskResult, Optional[RiskAssessment], Optional[str]]:
    """Run the risk engine for a station, persist assessment, and manage alerts."""
    now = now or utcnow()
    risk_settings = settings_service.get_risk_settings(db)
    alert_settings = settings_service.get_alert_settings(db)
    latest = {t.parameter: Reading(t.parameter, t.value, t.measured_at) for t in station_service.latest_values(db, st.id)}
    series = water_level_series(db, st.id, limit=max(16, int(risk_settings.get("trend_window_points", 8)) * 2))
    result = assess_risk(latest=latest, water_level_series=series, station_config=st.configuration, risk_settings=risk_settings, now=now)

    if not persist:
        return result, None, None

    prev = station_service.latest_risk(db, st.id)
    prev_level = prev.risk_level if prev else None
    row = RiskAssessment(
        station_id=st.id,
        assessed_at=now,
        risk_level=result.level,
        score=None if result.score is None else round(result.score, 2),
        explanation={"ru": result.explanation_ru, "kk": result.explanation_kk, "trend": result.trend,
                     "forecasts": [f.to_dict() for f in result.forecasts]},
        contributing_factors=[f.to_dict() for f in result.factors],
        data_quality=result.data_quality,
        algorithm_version=result.algorithm_version,
    )
    db.add(row)
    db.flush()
    alert, action = (None, None)
    if st.status == "online":
        alert, action = alert_service.evaluate_alerts(db, st, result, prev_level, alert_settings)
    return result, row, (f"{action}:{alert.id}" if alert and action else None)


def ingest(db: Session, payload, source: str) -> Dict[str, Any]:
    st = resolve_station(db, payload.station_id, payload.station_code)
    if st.status != "online":
        st.error_count += 1
        st.last_error_at = utcnow()
        db.commit()
        raise ValidationFailed(f"Станция {st.code} не принимает данные (статус {st.status})", code="station_not_online")
    unknown = [r.parameter for r in payload.readings if r.parameter not in (st.parameters or [])]
    if unknown:
        st.error_count += 1
        st.last_error_at = utcnow()
        db.commit()
        raise ValidationFailed(f"Станция не поддерживает параметры: {unknown}", code="unsupported_parameter", details={"unsupported": unknown})

    received = utcnow()
    duplicate = False
    if payload.event_id:
        exists = db.query(Telemetry.id).filter(Telemetry.event_id == payload.event_id).first()
        if exists:
            duplicate = True
    accepted = 0
    if not duplicate:
        for r in payload.readings:
            db.add(Telemetry(station_id=st.id, parameter=r.parameter, value=float(r.value), unit=r.unit or PARAMETER_UNITS[r.parameter],
                             measured_at=payload.measured_at, received_at=received, event_id=payload.event_id, source=source[:16]))
            accepted += 1
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            duplicate = True
            accepted = 0
            st = db.get(Station, st.id)
    if not duplicate:
        if st.last_seen_at is None or payload.measured_at > st.last_seen_at:
            st.last_seen_at = payload.measured_at
    result, row, alert_action = assess_station(db, st, now=received)
    db.commit()
    alert_id = None
    action = None
    if alert_action:
        action, aid = alert_action.split(":")
        alert_id = int(aid)
    return {"station_id": st.id, "accepted": accepted, "duplicate": duplicate, "risk_level": result.level,
            "score": None if result.score is None else round(result.score, 1), "alert_id": alert_id, "alert_action": action}


def clamp_range(from_time: Optional[datetime], to_time: Optional[datetime], default: timedelta) -> Tuple[datetime, datetime]:
    to_time = to_time or utcnow()
    from_time = from_time or (to_time - default)
    if from_time >= to_time:
        raise ValidationFailed("from must be earlier than to", code="bad_range")
    if to_time - from_time > MAX_RANGE:
        raise ValidationFailed(f"range may not exceed {MAX_RANGE.days} days", code="range_too_large")
    return from_time, to_time


def history(db: Session, station_id: int, parameter: str, from_time: datetime, to_time: datetime, bucket_seconds: Optional[int]) -> Dict[str, Any]:
    if parameter not in PARAMETER_UNITS:
        raise ValidationFailed(f"unknown parameter {parameter}", code="unknown_parameter")
    q = (
        db.query(Telemetry.measured_at, Telemetry.value)
        .filter(Telemetry.station_id == station_id, Telemetry.parameter == parameter,
                Telemetry.measured_at >= from_time, Telemetry.measured_at <= to_time)
        .order_by(Telemetry.measured_at.asc())
    )
    count_raw = q.count()
    span = (to_time - from_time).total_seconds()
    if bucket_seconds is None and count_raw > MAX_POINTS:
        bucket_seconds = max(1, int(span / 1500))
    points: List[Dict[str, Any]] = []
    if bucket_seconds:
        acc: Dict[int, List[float]] = {}
        for t, v in q.yield_per(2000):
            k = int((t - from_time).total_seconds() // bucket_seconds)
            acc.setdefault(k, []).append(v)
        for k in sorted(acc):
            vals = acc[k]
            points.append({"t": from_time + timedelta(seconds=k * bucket_seconds), "v": round(sum(vals) / len(vals), 3)})
    else:
        points = [{"t": t, "v": v} for t, v in q.limit(MAX_POINTS).all()]
    return {"station_id": station_id, "parameter": parameter, "unit": PARAMETER_UNITS[parameter], "from_time": from_time,
            "to_time": to_time, "bucket_seconds": bucket_seconds, "points": points, "count_raw": count_raw}


def latest_all(db: Session) -> List[Dict[str, Any]]:
    stale = float(settings_service.get_risk_settings(db).get("stale_after_seconds", 900))
    out = []
    for st in db.query(Station).filter(Station.is_deleted.is_(False)).order_by(Station.name).all():
        data = station_service.serialize(db, st, stale)
        out.append({"station_id": st.id, "code": st.code, "name": st.name, "status": st.status, "connection": data["connection"],
                    "latest": data["latest"], "risk": data["risk"]})
    return out


def risk_history(db: Session, station_id: int, from_time: datetime, to_time: datetime, limit: int = 500) -> List[RiskAssessment]:
    return (
        db.query(RiskAssessment)
        .filter(RiskAssessment.station_id == station_id, RiskAssessment.assessed_at >= from_time, RiskAssessment.assessed_at <= to_time)
        .order_by(RiskAssessment.assessed_at.desc())
        .limit(limit)
        .all()
    )


def risk_level_changes(db: Session, station_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    rows = (
        db.query(RiskAssessment.assessed_at, RiskAssessment.risk_level, RiskAssessment.score)
        .filter(RiskAssessment.station_id == station_id)
        .order_by(RiskAssessment.assessed_at.asc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    prev = None
    for at, lvl, score in rows:
        if lvl != prev:
            out.append({"at": at, "from": prev, "to": lvl, "score": score})
            prev = lvl
    return out[-limit:]

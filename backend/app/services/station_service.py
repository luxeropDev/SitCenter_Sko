from __future__ import annotations

import re
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationFailed
from app.core.timeutil import utcnow
from app.models import Alert, RiskAssessment, Station, Telemetry
from app.services.risk_engine import PARAMETER_UNITS, merge_station_thresholds


def _gen_code(db: Session, name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()[:16] or "ST"
    code = base
    i = 1
    while db.query(Station).filter(Station.code == code).first() is not None:
        i += 1
        code = f"{base}-{i}"
    return code


def get_station(db: Session, station_id: int, include_deleted: bool = False) -> Station:
    st = db.get(Station, station_id)
    if st is None or (st.is_deleted and not include_deleted):
        raise NotFoundError(f"Станция {station_id} не найдена", code="station_not_found")
    return st


def get_by_code(db: Session, code: str) -> Optional[Station]:
    return db.query(Station).filter(Station.code == code, Station.is_deleted.is_(False)).first()


def list_stations(
    db: Session,
    *,
    search: Optional[str] = None,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    scenario: Optional[str] = None,
    include_deleted: bool = False,
    sort: str = "name",
    order: str = "asc",
    page: int = 1,
    page_size: int = 50,
) -> Tuple[List[Station], int]:
    q = db.query(Station)
    if not include_deleted:
        q = q.filter(Station.is_deleted.is_(False))
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(Station.name.ilike(like), Station.code.ilike(like), Station.description.ilike(like)))
    if status:
        q = q.filter(Station.status == status)
    if source_type:
        q = q.filter(Station.source_type == source_type)
    if scenario:
        q = q.filter(Station.scenario == scenario.upper())
    total = q.count()
    col = {"name": Station.name, "code": Station.code, "status": Station.status, "created_at": Station.created_at,
           "last_seen_at": Station.last_seen_at, "updated_at": Station.updated_at}.get(sort, Station.name)
    q = q.order_by(col.desc() if order == "desc" else col.asc(), Station.id.asc())
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def create_station(db: Session, data: Dict[str, Any]) -> Station:
    thresholds = data.pop("thresholds", None) or {}
    code = data.pop("code", None) or _gen_code(db, data["name"])
    if db.query(Station).filter(Station.code == code).first():
        raise ConflictError(f"Станция с кодом {code} уже существует", code="station_code_exists")
    st = Station(code=code, configuration={"thresholds": merge_station_thresholds({"thresholds": thresholds})}, **data)
    db.add(st)
    db.flush()
    return st


def update_station(db: Session, st: Station, data: Dict[str, Any]) -> Station:
    thresholds = data.pop("thresholds", None)
    for k, v in data.items():
        if v is not None:
            setattr(st, k, v)
    if thresholds is not None:
        cfg = dict(st.configuration or {})
        cfg["thresholds"] = merge_station_thresholds({"thresholds": thresholds})
        st.configuration = cfg
    st.updated_at = utcnow()
    db.flush()
    return st


def telemetry_count(db: Session, station_id: int) -> int:
    return db.query(func.count(Telemetry.id)).filter(Telemetry.station_id == station_id).scalar() or 0


def delete_station(db: Session, st: Station, *, hard: bool) -> Dict[str, Any]:
    """Soft-delete by default (history preserved). Hard delete removes all related rows."""
    history = telemetry_count(db, st.id)
    alerts = db.query(func.count(Alert.id)).filter(Alert.station_id == st.id).scalar() or 0
    if hard:
        db.delete(st)
        db.flush()
        return {"mode": "hard", "telemetry_removed": history, "alerts_removed": alerts}
    st.is_deleted = True
    st.status = "offline"
    st.updated_at = utcnow()
    db.flush()
    return {"mode": "soft", "telemetry_preserved": history, "alerts_preserved": alerts}


def restore_station(db: Session, st: Station) -> Station:
    st.is_deleted = False
    st.updated_at = utcnow()
    db.flush()
    return st


def latest_values(db: Session, station_id: int) -> List[Telemetry]:
    sub = (
        db.query(Telemetry.parameter, func.max(Telemetry.measured_at).label("mt"))
        .filter(Telemetry.station_id == station_id)
        .group_by(Telemetry.parameter)
        .subquery()
    )
    rows = (
        db.query(Telemetry)
        .join(sub, (Telemetry.parameter == sub.c.parameter) & (Telemetry.measured_at == sub.c.mt))
        .filter(Telemetry.station_id == station_id)
        .all()
    )
    seen: Dict[str, Telemetry] = {}
    for r in rows:
        if r.parameter not in seen or r.id > seen[r.parameter].id:
            seen[r.parameter] = r
    return list(seen.values())


def latest_risk(db: Session, station_id: int) -> Optional[RiskAssessment]:
    return (
        db.query(RiskAssessment)
        .filter(RiskAssessment.station_id == station_id)
        .order_by(RiskAssessment.assessed_at.desc(), RiskAssessment.id.desc())
        .first()
    )


def active_alert_count(db: Session, station_id: int) -> int:
    return db.query(func.count(Alert.id)).filter(Alert.station_id == station_id, Alert.status.in_(["new", "acknowledged"])).scalar() or 0


def connection_state(st: Station, stale_after: float) -> Tuple[str, Optional[float]]:
    if st.status != "online" or st.is_deleted:
        return "disabled", None
    if st.last_seen_at is None:
        return "disconnected", None
    age = (utcnow() - st.last_seen_at).total_seconds()
    expected = max(st.interval_seconds * 3, 30)
    if age <= expected:
        return "connected", round(age, 1)
    if age <= stale_after:
        return "delayed", round(age, 1)
    return "disconnected", round(age, 1)


def serialize(db: Session, st: Station, stale_after: float, *, with_latest: bool = True) -> Dict[str, Any]:
    now = utcnow()
    latest: List[Dict[str, Any]] = []
    if with_latest:
        for t in sorted(latest_values(db, st.id), key=lambda x: x.parameter):
            age = (now - t.measured_at).total_seconds()
            fresh = "fresh" if age <= max(st.interval_seconds * 3, 30) else ("aging" if age <= stale_after else "stale")
            latest.append({"parameter": t.parameter, "value": t.value, "unit": t.unit, "measured_at": t.measured_at,
                           "received_at": t.received_at, "age_seconds": round(age, 1), "freshness": fresh})
    risk = latest_risk(db, st.id)
    conn, latency = connection_state(st, stale_after)
    risk_out = None
    if risk is not None:
        risk_out = {"risk_level": risk.risk_level, "score": risk.score, "assessed_at": risk.assessed_at, "explanation": risk.explanation or {}}
        # Do not present an old low/medium/high verdict as current when the data has gone stale.
        wl_age = next((v["age_seconds"] for v in latest if v["parameter"] == "water_level_cm"), None)
        if with_latest and (wl_age is None or wl_age > stale_after) and risk.risk_level in ("low", "medium", "high"):
            risk_out = {"risk_level": "stale" if wl_age is not None else "insufficient_data", "score": None, "assessed_at": risk.assessed_at,
                        "explanation": {"ru": "Данные устарели: оценка риска приостановлена до поступления новых измерений.",
                                        "kk": "Деректер ескірген: жаңа өлшемдер келгенше тәуекелді бағалау тоқтатылды.", "previous_level": risk.risk_level, "previous_score": risk.score}}
    return {
        **{c: getattr(st, c) for c in ("id", "code", "name", "description", "latitude", "longitude", "source_type", "scenario",
                                        "status", "parameters", "configuration", "interval_seconds", "is_deleted", "created_at",
                                        "updated_at", "last_seen_at", "error_count", "last_error_at")},
        "risk": risk_out,
        "latest": latest,
        "active_alerts": active_alert_count(db, st.id),
        "connection": conn,
        "latency_seconds": latency,
    }

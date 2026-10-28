from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.timeutil import utcnow
from app.core.deps import get_current_user, require_admin, require_operator
from app.models import Alert, User
from app.schemas.alert import AlertOut, RiskOut
from app.schemas.common import Message, Page
from app.schemas.station import StationCreate, StationOut, StationUpdate
from app.schemas.telemetry import TelemetrySeries
from app.services import audit_service, settings_service, station_service, telemetry_service
from app.services.risk_engine import merge_station_thresholds

router = APIRouter(prefix="/stations", tags=["stations"])


def _stale(db: Session) -> float:
    return float(settings_service.get_risk_settings(db).get("stale_after_seconds", 900))


@router.get("", response_model=Page[StationOut])
def list_stations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    search: Optional[str] = Query(default=None, max_length=100),
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    scenario: Optional[str] = None,
    include_deleted: bool = False,
    sort: str = "name",
    order: str = "asc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    if include_deleted and user.role != "admin":
        include_deleted = False
    items, total = station_service.list_stations(db, search=search, status=status, source_type=source_type, scenario=scenario,
                                                 include_deleted=include_deleted, sort=sort, order=order, page=page, page_size=page_size)
    stale = _stale(db)
    return Page(items=[station_service.serialize(db, s, stale) for s in items], total=total, page=page, page_size=page_size,
                pages=max(1, -(-total // page_size)))


@router.post("", response_model=StationOut, status_code=201)
def create_station(body: StationCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    data = body.model_dump()
    data["thresholds"] = body.thresholds.model_dump()
    st = station_service.create_station(db, data)
    audit_service.record(db, actor=user, action="station.created", entity_type="station", entity_id=st.id, details={"code": st.code, "name": st.name})
    db.commit()
    return station_service.serialize(db, st, _stale(db))


@router.get("/{station_id}", response_model=StationOut)
def get_station(station_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    st = station_service.get_station(db, station_id, include_deleted=user.role == "admin")
    return station_service.serialize(db, st, _stale(db))


@router.patch("/{station_id}", response_model=StationOut)
def update_station(station_id: int, body: StationUpdate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    st = station_service.get_station(db, station_id, include_deleted=True)
    data = body.model_dump(exclude_unset=True)
    if "thresholds" in data and body.thresholds is not None:
        data["thresholds"] = body.thresholds.model_dump()
    station_service.update_station(db, st, data)
    audit_service.record(db, actor=user, action="station.updated", entity_type="station", entity_id=st.id, details={"changes": list(data.keys())})
    db.commit()
    return station_service.serialize(db, st, _stale(db))


@router.delete("/{station_id}", response_model=Message)
def delete_station(station_id: int, hard: bool = False, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    st = station_service.get_station(db, station_id, include_deleted=True)
    info = station_service.delete_station(db, st, hard=hard)
    audit_service.record(db, actor=user, action="station.deleted" if hard else "station.disabled", entity_type="station", entity_id=station_id, details=info)
    db.commit()
    msg = "Станция удалена вместе с историей" if hard else "Станция отключена; история измерений сохранена"
    return Message(message=msg, details=info)


@router.post("/{station_id}/restore", response_model=StationOut)
def restore_station(station_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    st = station_service.get_station(db, station_id, include_deleted=True)
    station_service.restore_station(db, st)
    audit_service.record(db, actor=user, action="station.restored", entity_type="station", entity_id=st.id)
    db.commit()
    return station_service.serialize(db, st, _stale(db))


@router.get("/{station_id}/telemetry", response_model=TelemetrySeries)
def station_telemetry(
    station_id: int,
    parameter: str = "water_level_cm",
    from_time: Optional[datetime] = Query(default=None, alias="from"),
    to_time: Optional[datetime] = Query(default=None, alias="to"),
    bucket_seconds: Optional[int] = Query(default=None, ge=1, le=86400),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    station_service.get_station(db, station_id, include_deleted=True)
    f, t = telemetry_service.clamp_range(from_time, to_time, timedelta(hours=1))
    return telemetry_service.history(db, station_id, parameter, f, t, bucket_seconds)


@router.get("/{station_id}/risk")
def station_risk(station_id: int, history_limit: int = Query(default=200, ge=1, le=2000), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    st = station_service.get_station(db, station_id, include_deleted=True)
    result, _, _ = telemetry_service.assess_station(db, st, persist=False)
    latest = station_service.latest_risk(db, st.id)
    changes = telemetry_service.risk_level_changes(db, st.id)
    now = utcnow()
    hist = telemetry_service.risk_history(db, st.id, now - timedelta(days=7), now, history_limit)
    return {
        "station_id": st.id,
        "current": result.to_dict(),
        "thresholds": merge_station_thresholds(st.configuration),
        "stored": None if latest is None else RiskOut.model_validate(latest),
        "level_changes": changes,
        "history": [{"assessed_at": r.assessed_at, "risk_level": r.risk_level, "score": r.score} for r in reversed(hist)],
    }


@router.get("/{station_id}/alerts", response_model=List[AlertOut])
def station_alerts(station_id: int, limit: int = Query(default=50, ge=1, le=500), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    st = station_service.get_station(db, station_id, include_deleted=True)
    rows = db.query(Alert).filter(Alert.station_id == st.id).order_by(Alert.created_at.desc()).limit(limit).all()
    users = {u.id: u.username for u in db.query(User).all()}
    out = []
    for a in rows:
        d = AlertOut.model_validate(a)
        d.station_name, d.station_code = st.name, st.code
        d.acknowledged_by_name = users.get(a.acknowledged_by)
        d.resolved_by_name = users.get(a.resolved_by)
        out.append(d)
    return out

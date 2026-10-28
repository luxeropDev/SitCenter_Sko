from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_operator
from app.models import Alert, Station, User
from app.schemas.alert import AlertOut, ResolveRequest
from app.schemas.common import Page
from app.services import alert_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _decorate(db: Session, rows):
    users = {u.id: u.username for u in db.query(User).all()}
    stations = {s.id: s for s in db.query(Station).all()}
    out = []
    for a in rows:
        d = AlertOut.model_validate(a)
        st = stations.get(a.station_id)
        d.station_name = st.name if st else None
        d.station_code = st.code if st else None
        d.acknowledged_by_name = users.get(a.acknowledged_by)
        d.resolved_by_name = users.get(a.resolved_by)
        out.append(d)
    return out


@router.get("", response_model=Page[AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    station_id: Optional[int] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = Query(default=None, max_length=100),
    from_time: Optional[datetime] = Query(default=None, alias="from"),
    to_time: Optional[datetime] = Query(default=None, alias="to"),
    sort: str = "created_at",
    order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
):
    q = db.query(Alert)
    if station_id:
        q = q.filter(Alert.station_id == station_id)
    if severity:
        q = q.filter(Alert.severity == severity)
    if status:
        q = q.filter(Alert.status == status)
    if from_time:
        q = q.filter(Alert.created_at >= from_time)
    if to_time:
        q = q.filter(Alert.created_at <= to_time)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(Alert.title.ilike(like), Alert.description.ilike(like)))
    total = q.count()
    col = {"created_at": Alert.created_at, "severity": Alert.severity, "status": Alert.status, "updated_at": Alert.updated_at}.get(sort, Alert.created_at)
    q = q.order_by(col.desc() if order == "desc" else col.asc(), Alert.id.desc())
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=_decorate(db, rows), total=total, page=page, page_size=page_size, pages=max(1, -(-total // page_size)))


@router.get("/counts")
def counts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from sqlalchemy import func

    by_status = dict(db.query(Alert.status, func.count(Alert.id)).group_by(Alert.status).all())
    by_sev = dict(db.query(Alert.severity, func.count(Alert.id)).filter(Alert.status.in_(["new", "acknowledged"])).group_by(Alert.severity).all())
    return {"by_status": {k: int(v) for k, v in by_status.items()}, "active_by_severity": {k: int(v) for k, v in by_sev.items()}}


@router.get("/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _decorate(db, [alert_service.get_alert(db, alert_id)])[0]


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge(alert_id: int, db: Session = Depends(get_db), user: User = Depends(require_operator)):
    alert = alert_service.get_alert(db, alert_id)
    alert_service.acknowledge(db, alert, user)
    db.commit()
    return _decorate(db, [alert])[0]


@router.post("/{alert_id}/resolve", response_model=AlertOut)
def resolve(alert_id: int, body: ResolveRequest = ResolveRequest(), db: Session = Depends(get_db), user: User = Depends(require_operator)):
    alert = alert_service.get_alert(db, alert_id)
    alert_service.resolve(db, alert, user, body.note)
    db.commit()
    return _decorate(db, [alert])[0]

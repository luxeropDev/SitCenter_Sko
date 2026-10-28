"""Recent activity feed for the UI.

Exposes a *filtered* view of the audit log to every authenticated user: only
operational events (alerts, simulator, stations). Authentication, user and
settings events stay admin-only through ``/api/audit-log``.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import AuditLog, User
from app.schemas.admin import AuditOut

router = APIRouter(prefix="/events", tags=["events"])

PUBLIC_ENTITY_TYPES = ("alert", "simulator", "station")


@router.get("/recent", response_model=List[AuditOut])
def recent_events(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    entity_type: Optional[str] = Query(default=None, description="alert | simulator | station"),
    limit: int = Query(default=20, ge=1, le=100),
):
    types = PUBLIC_ENTITY_TYPES if entity_type is None else tuple(t for t in PUBLIC_ENTITY_TYPES if t == entity_type)
    if not types:
        return []
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type.in_(types))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .all()
    )
    return rows

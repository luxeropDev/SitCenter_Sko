from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.services import analytics_service, telemetry_service

router = APIRouter(tags=["analytics"])


@router.get("/analytics/overview")
def overview(
    from_time: Optional[datetime] = Query(default=None, alias="from"),
    to_time: Optional[datetime] = Query(default=None, alias="to"),
    station_id: Optional[int] = None,
    scenario: Optional[str] = None,
    compare: bool = Query(default=False, description="Also return aggregates for the previous period of equal length"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    f, t = telemetry_service.clamp_range(from_time, to_time, timedelta(hours=24))
    return analytics_service.overview(db, f, t, station_id, scenario, compare=compare)


@router.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return analytics_service.dashboard_summary(db)

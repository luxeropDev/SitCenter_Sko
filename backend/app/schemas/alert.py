from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class AlertOut(ORMModel):
    id: int
    station_id: int
    station_name: Optional[str] = None
    station_code: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    severity: str
    event_type: str
    title: str
    description: str
    trigger_factors: Dict[str, Any]
    status: str
    acknowledged_by: Optional[int]
    acknowledged_by_name: Optional[str] = None
    acknowledged_at: Optional[datetime]
    resolved_by: Optional[int]
    resolved_by_name: Optional[str] = None
    resolved_at: Optional[datetime]
    resolution_note: str
    escalation_count: int


class ResolveRequest(BaseModel):
    note: str = Field(default="", max_length=1000)


class RiskOut(ORMModel):
    id: int
    station_id: int
    assessed_at: datetime
    risk_level: str
    score: Optional[float]
    explanation: Dict[str, Any]
    contributing_factors: Any
    data_quality: Dict[str, Any]
    algorithm_version: str

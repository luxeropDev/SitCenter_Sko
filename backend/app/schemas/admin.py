from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class RiskWeights(BaseModel):
    level: float = Field(ge=0)
    rise_rate: float = Field(ge=0)
    rainfall: float = Field(ge=0)
    soil: float = Field(ge=0)
    trend: float = Field(ge=0)


class RiskThresholds(BaseModel):
    medium: float = Field(gt=0, le=100)
    high: float = Field(gt=0, le=100)


class RiskSettingsIn(BaseModel):
    weights: Optional[RiskWeights] = None
    thresholds: Optional[RiskThresholds] = None
    stale_after_seconds: Optional[int] = Field(default=None, ge=30, le=604800)
    soil_stale_after_seconds: Optional[int] = Field(default=None, ge=60, le=2592000)
    trend_window_points: Optional[int] = Field(default=None, ge=3, le=500)
    trend_min_points: Optional[int] = Field(default=None, ge=2, le=100)
    forecast_horizons_hours: Optional[List[float]] = Field(default=None, max_length=5)


class AlertSettingsIn(BaseModel):
    suppression_minutes: Optional[int] = Field(default=None, ge=0, le=1440)
    alert_on_medium: Optional[bool] = None
    auto_resolve_after_minutes: Optional[int] = Field(default=None, ge=0, le=10080)


class SystemSettingsIn(BaseModel):
    risk: Optional[RiskSettingsIn] = None
    alerts: Optional[AlertSettingsIn] = None
    ui_refresh_seconds: Optional[int] = Field(default=None, ge=2, le=300)


class SystemSettingsOut(BaseModel):
    risk: Dict[str, Any]
    alerts: Dict[str, Any]
    ui_refresh_seconds: int
    updated_at: Optional[datetime]
    algorithm_version: str


class AuditOut(ORMModel):
    id: int
    actor_id: Optional[int]
    actor_name: str
    action: str
    entity_type: str
    entity_id: Optional[str]
    created_at: datetime
    details: Dict[str, Any]


class SimulatorScenarioRequest(BaseModel):
    scenario: str
    station_ids: Optional[List[int]] = None
    intensity: Optional[float] = Field(default=None, ge=0.1, le=3.0)
    interval_seconds: Optional[float] = Field(default=None, ge=0.5, le=600)
    time_acceleration: Optional[float] = Field(default=None, ge=0.1, le=60)
    seed: Optional[int] = Field(default=None, ge=0, le=2**31 - 1)


class SimulatorStartRequest(BaseModel):
    scenario: Optional[str] = None
    intensity: Optional[float] = Field(default=None, ge=0.1, le=3.0)
    interval_seconds: Optional[float] = Field(default=None, ge=0.5, le=600)
    time_acceleration: Optional[float] = Field(default=None, ge=0.1, le=60)
    seed: Optional[int] = Field(default=None, ge=0, le=2**31 - 1)

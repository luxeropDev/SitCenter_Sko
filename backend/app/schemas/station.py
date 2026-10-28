from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel
from app.services.risk_engine import PARAMETER_UNITS, validate_station_thresholds

SOURCE_TYPES = ("simulator", "device")
STATION_STATUSES = ("online", "offline", "maintenance")
SCENARIOS = ("NORMAL", "RISING_WATER", "RAPID_FLOOD")


class StationThresholds(BaseModel):
    baseline_level_cm: float = 120.0
    warning_level_cm: float = 220.0
    critical_level_cm: float = 300.0
    critical_rise_rate_cm_h: float = 30.0
    critical_rainfall_mm_h: float = 15.0
    soil_dry_pct: float = 20.0
    soil_saturated_pct: float = 85.0

    @model_validator(mode="after")
    def _check(self):
        problems = validate_station_thresholds(self.model_dump())
        if problems:
            raise ValueError("; ".join(problems))
        return self


class StationBase(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    description: str = Field(default="", max_length=2000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    source_type: str = "simulator"
    scenario: str = "NORMAL"
    status: str = "online"
    parameters: List[str] = Field(default_factory=lambda: list(PARAMETER_UNITS.keys()))
    interval_seconds: int = Field(default=10, ge=1, le=3600)
    thresholds: StationThresholds = Field(default_factory=StationThresholds)

    @field_validator("source_type")
    @classmethod
    def _src(cls, v: str) -> str:
        if v not in SOURCE_TYPES:
            raise ValueError(f"source_type must be one of {SOURCE_TYPES}")
        return v

    @field_validator("scenario")
    @classmethod
    def _scn(cls, v: str) -> str:
        v = v.upper()
        if v not in SCENARIOS:
            raise ValueError(f"scenario must be one of {SCENARIOS}")
        return v

    @field_validator("status")
    @classmethod
    def _st(cls, v: str) -> str:
        if v not in STATION_STATUSES:
            raise ValueError(f"status must be one of {STATION_STATUSES}")
        return v

    @field_validator("parameters")
    @classmethod
    def _params(cls, v: List[str]) -> List[str]:
        bad = [p for p in v if p not in PARAMETER_UNITS]
        if bad:
            raise ValueError(f"unknown parameters: {bad}")
        if "water_level_cm" not in v:
            raise ValueError("water_level_cm is required for flood monitoring")
        return list(dict.fromkeys(v))

    @field_validator("latitude", "longitude")
    @classmethod
    def _finite(cls, v: float) -> float:
        import math

        if not math.isfinite(v):
            raise ValueError("coordinate must be finite")
        return v


class StationCreate(StationBase):
    code: Optional[str] = Field(default=None, min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")


class StationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=128)
    description: Optional[str] = Field(default=None, max_length=2000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    source_type: Optional[str] = None
    scenario: Optional[str] = None
    status: Optional[str] = None
    parameters: Optional[List[str]] = None
    interval_seconds: Optional[int] = Field(default=None, ge=1, le=3600)
    thresholds: Optional[StationThresholds] = None

    _v1 = field_validator("source_type")(StationBase._src.__func__)  # type: ignore[attr-defined]
    _v2 = field_validator("scenario")(StationBase._scn.__func__)  # type: ignore[attr-defined]
    _v3 = field_validator("status")(StationBase._st.__func__)  # type: ignore[attr-defined]

    @field_validator("parameters")
    @classmethod
    def _params(cls, v):
        return StationBase._params.__func__(cls, v) if v is not None else v  # type: ignore[attr-defined]


class LatestValue(BaseModel):
    parameter: str
    value: float
    unit: str
    measured_at: datetime
    received_at: datetime
    age_seconds: float
    freshness: str  # fresh | aging | stale


class RiskSummary(BaseModel):
    risk_level: str
    score: Optional[float]
    assessed_at: Optional[datetime]
    explanation: Dict[str, Any] = Field(default_factory=dict)


class StationOut(ORMModel):
    id: int
    code: str
    name: str
    description: str
    latitude: float
    longitude: float
    source_type: str
    scenario: str
    status: str
    parameters: List[str]
    configuration: Dict[str, Any]
    interval_seconds: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    last_seen_at: Optional[datetime]
    error_count: int
    last_error_at: Optional[datetime]
    risk: Optional[RiskSummary] = None
    latest: List[LatestValue] = Field(default_factory=list)
    active_alerts: int = 0
    connection: str = "unknown"  # connected | delayed | disconnected | disabled
    latency_seconds: Optional[float] = None

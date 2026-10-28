from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel
from app.services.risk_engine import PARAMETER_RANGES, PARAMETER_UNITS


class ReadingIn(BaseModel):
    parameter: str
    value: float
    unit: Optional[str] = None

    @field_validator("parameter")
    @classmethod
    def _p(cls, v: str) -> str:
        if v not in PARAMETER_UNITS:
            raise ValueError(f"unknown parameter '{v}'")
        return v

    @model_validator(mode="after")
    def _check(self):
        if not math.isfinite(self.value):
            raise ValueError(f"{self.parameter}: value must be a finite number")
        lo, hi = PARAMETER_RANGES[self.parameter]
        if not (lo <= self.value <= hi):
            raise ValueError(f"{self.parameter}: value {self.value} outside plausible range [{lo}, {hi}]")
        expected = PARAMETER_UNITS[self.parameter]
        if self.unit is None:
            self.unit = expected
        elif self.unit != expected:
            raise ValueError(f"{self.parameter}: unit must be '{expected}', got '{self.unit}'")
        return self


class TelemetryIngest(BaseModel):
    station_id: Optional[int] = None
    station_code: Optional[str] = None
    measured_at: datetime
    event_id: Optional[str] = Field(default=None, max_length=64)
    readings: List[ReadingIn] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def _check(self):
        if self.station_id is None and not self.station_code:
            raise ValueError("station_id or station_code is required")
        if self.measured_at.tzinfo is None:
            raise ValueError("measured_at must include a timezone offset")
        now = datetime.now(timezone.utc)
        if self.measured_at > now + timedelta(minutes=5):
            raise ValueError("measured_at is in the future")
        if self.measured_at < now - timedelta(days=30):
            raise ValueError("measured_at is older than 30 days")
        seen = set()
        for r in self.readings:
            if r.parameter in seen:
                raise ValueError(f"duplicate parameter {r.parameter} in readings")
            seen.add(r.parameter)
        return self


class TelemetryOut(ORMModel):
    id: int
    station_id: int
    parameter: str
    value: float
    unit: str
    measured_at: datetime
    received_at: datetime
    event_id: Optional[str]
    source: str


class IngestResult(BaseModel):
    station_id: int
    accepted: int
    duplicate: bool
    risk_level: str
    score: Optional[float]
    alert_id: Optional[int] = None
    alert_action: Optional[str] = None


class SeriesPoint(BaseModel):
    t: datetime
    v: float


class TelemetrySeries(BaseModel):
    station_id: int
    parameter: str
    unit: str
    from_time: datetime
    to_time: datetime
    bucket_seconds: Optional[int]
    points: List[SeriesPoint]
    count_raw: int

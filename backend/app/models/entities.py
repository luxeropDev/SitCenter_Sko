from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime
from app.core.timeutil import utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), default="")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="observer", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, index=True)


class Station(Base):
    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), default="simulator", nullable=False, index=True)
    scenario: Mapped[str] = mapped_column(String(32), default="NORMAL", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="online", nullable=False, index=True)
    parameters: Mapped[List[str]] = mapped_column(JSON, default=list)
    configuration: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    interval_seconds: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)

    telemetry: Mapped[List["Telemetry"]] = relationship(back_populates="station", cascade="all, delete-orphan")
    alerts: Mapped[List["Alert"]] = relationship(back_populates="station", cascade="all, delete-orphan")


class Telemetry(Base):
    __tablename__ = "telemetry"
    __table_args__ = (
        Index("ix_telemetry_station_param_time", "station_id", "parameter", "measured_at"),
        Index("ix_telemetry_station_time", "station_id", "measured_at"),
        UniqueConstraint("event_id", "parameter", name="uq_telemetry_event_param"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False, index=True)
    event_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="simulator", nullable=False)

    station: Mapped["Station"] = relationship(back_populates="telemetry")


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    __table_args__ = (Index("ix_risk_station_time", "station_id", "assessed_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)
    assessed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False, index=True)
    risk_level: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    explanation: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    contributing_factors: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list)
    data_quality: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    algorithm_version: Mapped[str] = mapped_column(String(16), nullable=False)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_station_status", "station_id", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, default="risk_threshold")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    trigger_factors: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="new", index=True)
    acknowledged_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    resolution_note: Mapped[str] = mapped_column(Text, default="")
    escalation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    station: Mapped["Station"] = relationship(back_populates="alerts")


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_name: Mapped[str] = mapped_column(String(64), default="system")
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False, index=True)
    details: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)


class SystemSetting(Base):
    """Single-row key/value store for risk and system configuration."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)


class SimulatorState(Base):
    __tablename__ = "simulator_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    state: Mapped[str] = mapped_column(String(16), default="stopped", nullable=False)  # running|paused|stopped
    scenario: Mapped[str] = mapped_column(String(32), default="NORMAL", nullable=False)
    interval_seconds: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    intensity: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    time_acceleration: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    seed: Mapped[int] = mapped_column(Integer, default=42, nullable=False)
    tick: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sim_elapsed_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_event_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    driver: Mapped[str] = mapped_column(String(16), default="none", nullable=False)  # embedded|external|none
    driver_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)

from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.core.timeutil import utcnow
from app.models import Alert, Station, User
from app.services import audit_service
from app.services.risk_engine import LEVEL_HIGH, LEVEL_LOW, LEVEL_MEDIUM, RiskResult

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2}
ACTIVE_STATUSES = ("new", "acknowledged")


def get_alert(db: Session, alert_id: int) -> Alert:
    a = db.get(Alert, alert_id)
    if a is None:
        raise NotFoundError(f"Предупреждение {alert_id} не найдено", code="alert_not_found")
    return a


def active_alert(db: Session, station_id: int) -> Optional[Alert]:
    return (
        db.query(Alert)
        .filter(Alert.station_id == station_id, Alert.status.in_(ACTIVE_STATUSES))
        .order_by(Alert.created_at.desc())
        .first()
    )


def _title(st: Station, severity: str) -> str:
    if severity == LEVEL_HIGH:
        return f"Высокий риск подтопления: {st.name}"
    return f"Повышенный риск подтопления: {st.name}"


def evaluate_alerts(
    db: Session,
    st: Station,
    result: RiskResult,
    previous_level: Optional[str],
    alert_settings: Dict[str, Any],
) -> Tuple[Optional[Alert], Optional[str]]:
    """Create / escalate alerts for a new assessment.

    Rules (documented in docs/ALGORITHM.md):
      * HIGH risk            -> alert of severity high.
      * LOW/None -> MEDIUM   -> alert of severity medium (if alert_on_medium).
      * An active alert (new/acknowledged) for the station is reused:
        - higher severity than the active one -> escalate (update severity, title, factors, escalation_count+1)
        - same or lower severity -> no-op (deduplicated).
      * After an alert is resolved, the same severity is suppressed for `suppression_minutes`
        (a higher severity bypasses suppression).
    Returns (alert, action) where action ∈ {created, escalated, None}.
    """
    if not result.is_actionable:
        return None, None
    level = result.level
    wants: Optional[str] = None
    if level == LEVEL_HIGH:
        wants = LEVEL_HIGH
    elif level == LEVEL_MEDIUM and alert_settings.get("alert_on_medium", True) and previous_level in (None, LEVEL_LOW, "insufficient_data", "stale"):
        wants = LEVEL_MEDIUM
    elif level == LEVEL_MEDIUM and previous_level == LEVEL_HIGH:
        wants = None  # de-escalation: keep existing alert, operator resolves
    if wants is None:
        return None, None

    factors = {
        "score": None if result.score is None else round(result.score, 1),
        "risk_level": level,
        "previous_level": previous_level,
        "factors": [f.to_dict() for f in result.factors],
        "explanation": {"ru": result.explanation_ru, "kk": result.explanation_kk},
        "algorithm_version": result.algorithm_version,
        "synthetic": st.source_type == "simulator",
    }

    active = active_alert(db, st.id)
    if active is not None:
        if SEVERITY_RANK[wants] > SEVERITY_RANK.get(active.severity, 0):
            active.severity = wants
            active.title = _title(st, wants)
            active.description = result.explanation_ru
            tf = dict(active.trigger_factors or {})
            history = list(tf.get("escalations", []))
            history.append({"at": utcnow().isoformat(), "from": tf.get("risk_level"), "to": level, "score": factors["score"]})
            factors["escalations"] = history
            active.trigger_factors = factors
            active.escalation_count += 1
            active.updated_at = utcnow()
            audit_service.record(db, actor=None, action="alert.escalated", entity_type="alert", entity_id=active.id,
                                 details={"station_id": st.id, "severity": wants, "score": factors["score"]})
            db.flush()
            return active, "escalated"
        return None, None

    # suppression window after a resolved alert of >= severity
    supp = int(alert_settings.get("suppression_minutes", 10) or 0)
    if supp > 0:
        recent = (
            db.query(Alert)
            .filter(Alert.station_id == st.id, Alert.status == "resolved", Alert.resolved_at >= utcnow() - timedelta(minutes=supp))
            .order_by(Alert.resolved_at.desc())
            .first()
        )
        if recent is not None and SEVERITY_RANK.get(recent.severity, 0) >= SEVERITY_RANK[wants]:
            return None, None

    alert = Alert(
        station_id=st.id,
        severity=wants,
        event_type="risk_threshold",
        title=_title(st, wants),
        description=result.explanation_ru,
        trigger_factors=factors,
        status="new",
    )
    db.add(alert)
    db.flush()
    audit_service.record(db, actor=None, action="alert.created", entity_type="alert", entity_id=alert.id,
                         details={"station_id": st.id, "severity": wants, "score": factors["score"]})
    return alert, "created"


def acknowledge(db: Session, alert: Alert, user: User) -> Tuple[Alert, bool]:
    """Idempotent: acknowledging an already acknowledged alert is a no-op."""
    if alert.status == "acknowledged":
        return alert, False
    if alert.status == "resolved":
        raise ConflictError("Предупреждение уже закрыто", code="alert_resolved")
    alert.status = "acknowledged"
    alert.acknowledged_by = user.id
    alert.acknowledged_at = utcnow()
    alert.updated_at = utcnow()
    audit_service.record(db, actor=user, action="alert.acknowledged", entity_type="alert", entity_id=alert.id,
                         details={"station_id": alert.station_id, "severity": alert.severity})
    db.flush()
    return alert, True


def resolve(db: Session, alert: Alert, user: User, note: str) -> Tuple[Alert, bool]:
    if alert.status == "resolved":
        return alert, False
    if alert.status == "new":
        alert.acknowledged_by = user.id
        alert.acknowledged_at = utcnow()
    alert.status = "resolved"
    alert.resolved_by = user.id
    alert.resolved_at = utcnow()
    alert.resolution_note = note or ""
    alert.updated_at = utcnow()
    audit_service.record(db, actor=user, action="alert.resolved", entity_type="alert", entity_id=alert.id,
                         details={"station_id": alert.station_id, "severity": alert.severity, "note": note})
    db.flush()
    return alert, True

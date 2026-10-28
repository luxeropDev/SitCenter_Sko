from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import AuditLog, User

SENSITIVE_KEYS = {"password", "password_hash", "token", "secret", "access_token", "api_key"}


def _scrub(d: Any) -> Any:
    if isinstance(d, dict):
        return {k: ("***" if k.lower() in SENSITIVE_KEYS else _scrub(v)) for k, v in d.items()}
    if isinstance(d, list):
        return [_scrub(x) for x in d]
    return d


def record(db: Session, *, actor: Optional[User], action: str, entity_type: str, entity_id: Any = None,
           details: Optional[Dict[str, Any]] = None) -> AuditLog:
    row = AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=actor.username if actor else "system",
        action=action,
        entity_type=entity_type,
        entity_id=None if entity_id is None else str(entity_id),
        details=_scrub(details or {}),
    )
    db.add(row)
    db.flush()
    return row

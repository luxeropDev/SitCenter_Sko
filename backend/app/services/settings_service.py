from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models import SystemSetting
from app.services.risk_engine import DEFAULT_RISK_SETTINGS, merge_settings

DEFAULT_ALERT_SETTINGS: Dict[str, Any] = {
    "suppression_minutes": 10,
    "alert_on_medium": True,
    "auto_resolve_after_minutes": 0,
}
DEFAULT_UI_REFRESH = 10


def _get(db: Session, key: str, default: Dict[str, Any]) -> Dict[str, Any]:
    row = db.get(SystemSetting, key)
    if row is None:
        return dict(default)
    out = dict(default)
    out.update(row.value or {})
    return out


def get_risk_settings(db: Session) -> Dict[str, Any]:
    return merge_settings(_get(db, "risk", DEFAULT_RISK_SETTINGS))


def get_alert_settings(db: Session) -> Dict[str, Any]:
    return _get(db, "alerts", DEFAULT_ALERT_SETTINGS)


def get_ui_settings(db: Session) -> Dict[str, Any]:
    return _get(db, "ui", {"refresh_seconds": DEFAULT_UI_REFRESH})


def set_setting(db: Session, key: str, value: Dict[str, Any]) -> SystemSetting:
    row = db.get(SystemSetting, key)
    if row is None:
        row = SystemSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.flush()
    return row


def settings_updated_at(db: Session):
    rows = db.query(SystemSetting).all()
    if not rows:
        return None
    return max(r.updated_at for r in rows)

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.errors import ConflictError, NotFoundError, ValidationFailed
from app.core.security import hash_password
from app.models import AuditLog, User
from app.schemas.admin import AuditOut, SystemSettingsIn, SystemSettingsOut
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.schemas.common import Page
from app.services import analytics_service, audit_service, settings_service
from app.services.risk_engine import ALGORITHM_VERSION, validate_risk_settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=Page[UserOut])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin), search: Optional[str] = None,
               page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200)):
    q = db.query(User)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(User.username.ilike(like), User.email.ilike(like), User.full_name.ilike(like)))
    total = q.count()
    items = q.order_by(User.id.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, -(-total // page_size)))


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.query(User).filter(or_(User.username == body.username, User.email == body.email.lower())).first():
        raise ConflictError("Пользователь с таким именем или email уже существует", code="user_exists")
    u = User(username=body.username, email=body.email.lower(), full_name=body.full_name, password_hash=hash_password(body.password),
             role=body.role, is_active=body.is_active)
    db.add(u)
    db.flush()
    audit_service.record(db, actor=admin, action="user.created", entity_type="user", entity_id=u.id, details={"username": u.username, "role": u.role})
    db.commit()
    return u


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if u is None:
        raise NotFoundError("Пользователь не найден", code="user_not_found")
    data = body.model_dump(exclude_unset=True)
    if u.id == admin.id and (data.get("role") not in (None, "admin") or data.get("is_active") is False):
        raise ValidationFailed("Нельзя понизить роль или заблокировать собственную учётную запись", code="self_lockout")
    if "role" in data and data["role"] != "admin" and u.role == "admin":
        admins = db.query(User).filter(User.role == "admin", User.is_active.is_(True), User.id != u.id).count()
        if admins == 0:
            raise ValidationFailed("Должен остаться хотя бы один активный администратор", code="last_admin")
    if "email" in data and data["email"]:
        data["email"] = data["email"].lower()
        if db.query(User).filter(User.email == data["email"], User.id != u.id).first():
            raise ConflictError("Email уже используется", code="user_exists")
    if data.get("password"):
        u.password_hash = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    for k, v in data.items():
        setattr(u, k, v)
    audit_service.record(db, actor=admin, action="user.updated", entity_type="user", entity_id=u.id, details={"changes": list(data.keys())})
    db.commit()
    return u


def _settings_out(db: Session) -> SystemSettingsOut:
    return SystemSettingsOut(risk=settings_service.get_risk_settings(db), alerts=settings_service.get_alert_settings(db),
                             ui_refresh_seconds=int(settings_service.get_ui_settings(db).get("refresh_seconds", 10)),
                             updated_at=settings_service.settings_updated_at(db), algorithm_version=ALGORITHM_VERSION)


@router.get("/settings", response_model=SystemSettingsOut)
def get_settings_(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return _settings_out(db)


@router.patch("/settings", response_model=SystemSettingsOut)
def patch_settings(body: SystemSettingsIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    changes = {}
    if body.risk is not None:
        current = settings_service.get_risk_settings(db)
        patch = body.risk.model_dump(exclude_unset=True, exclude_none=True)
        for k, v in patch.items():
            if isinstance(v, dict):
                current[k] = {**current.get(k, {}), **v}
            else:
                current[k] = v
        problems = validate_risk_settings(current)
        if problems:
            raise ValidationFailed("Некорректные параметры риска", code="invalid_risk_settings", details=problems)
        settings_service.set_setting(db, "risk", current)
        changes["risk"] = patch
    if body.alerts is not None:
        current = settings_service.get_alert_settings(db)
        patch = body.alerts.model_dump(exclude_unset=True, exclude_none=True)
        current.update(patch)
        settings_service.set_setting(db, "alerts", current)
        changes["alerts"] = patch
    if body.ui_refresh_seconds is not None:
        settings_service.set_setting(db, "ui", {"refresh_seconds": body.ui_refresh_seconds})
        changes["ui_refresh_seconds"] = body.ui_refresh_seconds
    audit_service.record(db, actor=admin, action="settings.updated", entity_type="settings", entity_id="system", details=changes)
    db.commit()
    return _settings_out(db)


@router.get("/health")
def system_health(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return analytics_service.system_health(db)


audit_router = APIRouter(tags=["audit"])


@audit_router.get("/audit-log", response_model=Page[AuditOut])
def audit_log(db: Session = Depends(get_db), admin: User = Depends(require_admin), action: Optional[str] = None,
              entity_type: Optional[str] = None, actor: Optional[str] = None,
              from_time: Optional[datetime] = Query(default=None, alias="from"), to_time: Optional[datetime] = Query(default=None, alias="to"),
              page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200)):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if actor:
        q = q.filter(AuditLog.actor_name.ilike(f"%{actor}%"))
    if from_time:
        q = q.filter(AuditLog.created_at >= from_time)
    if to_time:
        q = q.filter(AuditLog.created_at <= to_time)
    total = q.count()
    items = q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=max(1, -(-total // page_size)))

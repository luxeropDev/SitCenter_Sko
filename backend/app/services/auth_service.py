from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password
from app.core.timeutil import utcnow
from app.models import RevokedToken, User
from app.services import audit_service


def authenticate(db: Session, username: str, password: str) -> User:
    user = db.query(User).filter(or_(User.username == username, User.email == username.lower())).first()
    # Always run the hash verification to avoid trivial timing differences.
    ok = verify_password(password, user.password_hash if user else hash_password("x"))
    if not user or not ok:
        audit_service.record(db, actor=None, action="auth.login_failed", entity_type="user", entity_id=username, details={})
        db.commit()
        raise UnauthorizedError("Неверное имя пользователя или пароль", code="invalid_credentials")
    if not user.is_active:
        raise UnauthorizedError("Учётная запись заблокирована", code="user_inactive")
    user.last_login_at = utcnow()
    audit_service.record(db, actor=user, action="auth.login", entity_type="user", entity_id=user.id)
    db.commit()
    return user


def issue_token(user: User):
    return create_access_token(user.id, user.role)


def revoke(db: Session, jti: str, exp: int) -> None:
    if db.get(RevokedToken, jti) is None:
        db.add(RevokedToken(jti=jti, expires_at=datetime.fromtimestamp(exp, tz=timezone.utc)))
    # garbage collect expired entries
    db.query(RevokedToken).filter(RevokedToken.expires_at < utcnow()).delete()
    db.commit()


def is_revoked(db: Session, jti: str) -> bool:
    return db.get(RevokedToken, jti) is not None


def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)

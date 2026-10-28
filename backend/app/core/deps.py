from __future__ import annotations

from typing import Iterable, Optional

import jwt
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.models import User
from app.services import auth_service

bearer = HTTPBearer(auto_error=False)

ROLE_RANK = {"observer": 0, "operator": 1, "admin": 2}


def _user_from_token(db: Session, token: str) -> User:
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Срок действия сессии истёк", code="token_expired")
    except jwt.PyJWTError:
        raise UnauthorizedError("Недействительный токен", code="token_invalid")
    if auth_service.is_revoked(db, payload["jti"]):
        raise UnauthorizedError("Сессия завершена", code="token_revoked")
    user = auth_service.get_user(db, int(payload["sub"]))
    if user is None or not user.is_active:
        raise UnauthorizedError("Пользователь не найден или заблокирован", code="user_inactive")
    # Never trust the role inside the token blindly: re-read it from DB.
    return user


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise UnauthorizedError("Требуется аутентификация", code="not_authenticated")
    return _user_from_token(db, creds.credentials)


def get_optional_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if creds is None or not creds.credentials:
        return None
    try:
        return _user_from_token(db, creds.credentials)
    except UnauthorizedError:
        return None


def get_token_payload(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if creds is None:
        raise UnauthorizedError("Требуется аутентификация", code="not_authenticated")
    try:
        return decode_token(creds.credentials)
    except jwt.PyJWTError:
        raise UnauthorizedError("Недействительный токен", code="token_invalid")


def require_roles(*roles: str):
    allowed: Iterable[str] = roles

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise ForbiddenError("Недостаточно прав для выполнения действия", code="insufficient_role",
                                 details={"required": list(allowed), "role": user.role})
        return user

    return _dep


require_operator = require_roles("operator", "admin")
require_admin = require_roles("admin")


def ingest_auth(
    request: Request,
    x_ingest_key: Optional[str] = Header(default=None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> str:
    """Telemetry ingest accepts either the shared ingest key (devices/simulator) or an operator/admin token."""
    s = get_settings()
    if x_ingest_key and x_ingest_key == s.ingest_api_key:
        return "ingest_key"
    if creds and creds.credentials:
        user = _user_from_token(db, creds.credentials)
        if user.role in ("operator", "admin"):
            return f"user:{user.username}"
        raise ForbiddenError("Роль не позволяет отправлять телеметрию", code="insufficient_role")
    raise UnauthorizedError("Требуется X-Ingest-Key или токен оператора", code="not_authenticated")

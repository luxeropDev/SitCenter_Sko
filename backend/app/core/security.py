from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.core.config import get_settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: int, role: str, expires_minutes: Optional[int] = None) -> Dict[str, Any]:
    s = get_settings()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expires_minutes or s.access_token_minutes)
    jti = uuid.uuid4().hex
    payload = {"sub": str(user_id), "role": role, "iat": int(now.timestamp()), "exp": int(exp.timestamp()), "jti": jti}
    token = jwt.encode(payload, s.secret_key, algorithm=s.jwt_algorithm)
    return {"token": token, "expires_at": exp, "jti": jti}


def decode_token(token: str) -> Dict[str, Any]:
    s = get_settings()
    return jwt.decode(token, s.secret_key, algorithms=[s.jwt_algorithm], options={"require": ["exp", "sub", "jti"]})

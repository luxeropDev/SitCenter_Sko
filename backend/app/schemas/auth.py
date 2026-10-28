from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

EMAIL_RE = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"

from app.schemas.common import ORMModel

ROLES = ("observer", "operator", "admin")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class UserOut(ORMModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: str = Field(max_length=255, pattern=EMAIL_RE)
    full_name: str = Field(default="", max_length=128)
    password: str = Field(min_length=8, max_length=256)
    role: str = "observer"
    is_active: bool = True

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v


class UserUpdate(BaseModel):
    email: Optional[str] = Field(default=None, max_length=255, pattern=EMAIL_RE)
    full_name: Optional[str] = Field(default=None, max_length=128)
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)
    role: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v

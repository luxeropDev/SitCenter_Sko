from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_token_payload
from app.models import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.schemas.common import Message
from app.services import audit_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = auth_service.authenticate(db, body.username.strip(), body.password)
    tok = auth_service.issue_token(user)
    return TokenResponse(access_token=tok["token"], expires_at=tok["expires_at"], user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout", response_model=Message)
def logout(payload: dict = Depends(get_token_payload), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    auth_service.revoke(db, payload["jti"], int(payload["exp"]))
    audit_service.record(db, actor=user, action="auth.logout", entity_type="user", entity_id=user.id)
    db.commit()
    return Message(message="Сессия завершена")

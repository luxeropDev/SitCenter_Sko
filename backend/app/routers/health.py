from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import APP_VERSION, get_settings
from app.core.database import get_db
from app.core.timeutil import utcnow
from app.services.risk_engine import ALGORITHM_VERSION

router = APIRouter(tags=["health"])


def _db_ok(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """Liveness + basic info. Public; never exposes secrets."""
    db_ok = _db_ok(db)
    s = get_settings()
    return {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "error", "time": utcnow(),
            "app": s.app_name, "version": APP_VERSION, "algorithm_version": ALGORITHM_VERSION, "env": s.app_env,
            "simulator_mode": s.simulator_mode, "synthetic_data": True}


@router.get("/health/live")
def live():
    """Kubernetes/PaaS liveness probe: process is up."""
    return {"status": "ok"}


@router.get("/health/ready")
def ready(response: Response, db: Session = Depends(get_db)):
    """Readiness probe: database reachable and schema present. Returns 503 when not ready."""
    db_ok = _db_ok(db)
    schema_ok = False
    if db_ok:
        try:
            db.execute(text("SELECT 1 FROM stations LIMIT 1"))
            schema_ok = True
        except Exception:  # noqa: BLE001
            schema_ok = False
    ok = db_ok and schema_ok
    if not ok:
        response.status_code = 503
    return {"status": "ready" if ok else "not_ready", "database": db_ok, "schema": schema_ok}

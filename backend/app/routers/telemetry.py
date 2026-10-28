from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, ingest_auth
from app.models import User
from app.schemas.telemetry import IngestResult, TelemetryIngest
from app.services import telemetry_service

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/ingest", response_model=IngestResult)
def ingest(body: TelemetryIngest, source: str = Depends(ingest_auth), db: Session = Depends(get_db)):
    src = "simulator" if source == "ingest_key" else "device"
    return telemetry_service.ingest(db, body, source=src)


@router.post("/ingest/batch", response_model=List[IngestResult])
def ingest_batch(body: List[TelemetryIngest], source: str = Depends(ingest_auth), db: Session = Depends(get_db)):
    if len(body) > 50:
        from app.core.errors import ValidationFailed

        raise ValidationFailed("batch may contain at most 50 messages", code="batch_too_large")
    src = "simulator" if source == "ingest_key" else "device"
    return [telemetry_service.ingest(db, b, source=src) for b in body]


@router.get("/latest")
def latest(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"items": telemetry_service.latest_all(db), "synthetic": True}

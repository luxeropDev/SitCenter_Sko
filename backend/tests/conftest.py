import os
import tempfile

os.environ["APP_ENV"] = "test"
_tmp = tempfile.mkdtemp(prefix="urpaq-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["INGEST_API_KEY"] = "test-ingest-key"
os.environ["SIMULATOR_MODE"] = "off"
os.environ["SEED_ON_STARTUP"] = "false"

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine, init_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutil import utcnow  # noqa: E402
from app.main import app, login_limiter  # noqa: E402
from app.models import SimulatorState, Station, User  # noqa: E402
from app.services.risk_engine import PARAMETER_UNITS  # noqa: E402

PASSWORDS = {"admin": "Admin12345!", "operator": "Operator12345!", "observer": "Observer12345!"}


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    init_db()
    login_limiter.reset()
    with SessionLocal() as db:
        for role in ("admin", "operator", "observer"):
            db.add(User(username=role, email=f"{role}@test.local", full_name=role, password_hash=hash_password(PASSWORDS[role]), role=role))
        db.add(Station(code="TEST-01", name="Test station", latitude=54.87, longitude=69.16, source_type="simulator", scenario="NORMAL",
                       status="online", parameters=list(PARAMETER_UNITS.keys()), interval_seconds=10,
                       configuration={"thresholds": {"baseline_level_cm": 120, "warning_level_cm": 220, "critical_level_cm": 300,
                                                     "critical_rise_rate_cm_h": 30, "critical_rainfall_mm_h": 15, "soil_dry_pct": 20, "soil_saturated_pct": 85}}))
        db.add(SimulatorState(id=1, state="stopped", scenario="NORMAL", interval_seconds=5, intensity=1.0, time_acceleration=6.0, seed=42))
        db.commit()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _login(client, role):
    r = client.post("/api/auth/login", json={"username": role, "password": PASSWORDS[role]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_h(client):
    return _login(client, "admin")


@pytest.fixture
def operator_h(client):
    return _login(client, "operator")


@pytest.fixture
def observer_h(client):
    return _login(client, "observer")


@pytest.fixture
def ingest_h():
    return {"X-Ingest-Key": "test-ingest-key"}


def payload(station_id=1, level=150.0, rate=0.0, rain=0.5, soil=35.0, temp=10.0, measured_at=None, event_id=None, params=None):
    measured_at = measured_at or utcnow()
    readings = [
        {"parameter": "water_level_cm", "value": level},
        {"parameter": "water_level_rate_cm_h", "value": rate},
        {"parameter": "rainfall_mm_h", "value": rain},
        {"parameter": "soil_moisture_pct", "value": soil},
        {"parameter": "air_temperature_c", "value": temp},
    ]
    if params:
        readings = [r for r in readings if r["parameter"] in params]
    body = {"station_id": station_id, "measured_at": measured_at.isoformat(), "readings": readings}
    if event_id:
        body["event_id"] = event_id
    return body


def push_series(client, ingest_h, levels, step_minutes=10, station_id=1, **kw):
    """Send a chronological water-level series ending now (default 10-minute steps)."""
    now = utcnow()
    n = len(levels)
    last = None
    for i, lvl in enumerate(levels):
        at = now - timedelta(minutes=(n - 1 - i) * step_minutes)
        if "rate" in kw:
            rate = kw["rate"]
        else:
            rate = (levels[i] - levels[i - 1]) * 60.0 / step_minutes if i else 0.0
            rate = max(-500.0, min(500.0, rate))
        r = client.post("/api/telemetry/ingest", headers=ingest_h,
                        json=payload(station_id=station_id, level=lvl, rate=rate, rain=kw.get("rain", 0.5), soil=kw.get("soil", 35.0), measured_at=at))
        assert r.status_code == 200, r.text
        last = r.json()
    return last

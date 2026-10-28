"""Platform-level tests: health probes, events feed, rate limiting, analytics comparison, pagination, config safety, migrations."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile

import pytest

from app.core.config import Settings
from tests.conftest import push_series


def test_health_endpoints(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["version"] and h["algorithm_version"] and h["synthetic_data"] is True
    assert "secret" not in str(h).lower()
    assert client.get("/api/health/live").json() == {"status": "ok"}
    r = client.get("/api/health/ready")
    assert r.status_code == 200 and r.json()["status"] == "ready"


def test_security_headers_and_request_id(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Cache-Control"] == "no-store"
    assert r.headers["X-Request-ID"]
    r = client.get("/api/health", headers={"X-Request-ID": "abc123"})
    assert r.headers["X-Request-ID"] == "abc123"


def test_login_rate_limit(client):
    from app.main import login_limiter

    codes = []
    for _ in range(login_limiter.limit + 2):
        codes.append(client.post("/api/auth/login", json={"username": "nobody", "password": "wrong"}).status_code)
    assert codes[: login_limiter.limit] == [401] * login_limiter.limit
    assert codes[-1] == 429
    login_limiter.reset()
    assert client.post("/api/auth/login", json={"username": "nobody", "password": "wrong"}).status_code == 401


def test_events_feed_is_filtered_and_requires_auth(client, admin_h, observer_h, operator_h, ingest_h):
    assert client.get("/api/events/recent").status_code == 401
    # auth.login events must never leak through the public feed
    last = push_series(client, ingest_h, [150, 170, 200, 235, 270, 300], rain=20, soil=90)
    assert last["risk_level"] == "high"
    client.post("/api/simulator/start", headers=operator_h, json={"scenario": "NORMAL"})
    feed = client.get("/api/events/recent", headers=observer_h, params={"limit": 50}).json()
    assert feed and all(e["entity_type"] in ("alert", "simulator", "station") for e in feed)
    actions = {e["action"] for e in feed}
    assert "alert.created" in actions and "simulator.start" in actions
    assert not any(a.startswith("auth.") for a in actions)
    only_sim = client.get("/api/events/recent", headers=observer_h, params={"entity_type": "simulator"}).json()
    assert only_sim and all(e["entity_type"] == "simulator" for e in only_sim)
    assert client.get("/api/events/recent", headers=observer_h, params={"entity_type": "user"}).json() == []
    # full audit log stays admin-only
    assert client.get("/api/audit-log", headers=observer_h).status_code == 403
    assert client.get("/api/audit-log", headers=admin_h).status_code == 200


def test_analytics_compare_and_dashboard_freshness(client, admin_h, ingest_h):
    push_series(client, ingest_h, [150, 152, 154])
    d = client.get("/api/dashboard/summary", headers=admin_h).json()
    assert d["freshness"]["fresh"] == 1 and d["stale_after_seconds"] > 0
    a = client.get("/api/analytics/overview", headers=admin_h, params={"compare": "true"}).json()
    assert a["current_period"]["telemetry_count"] == 15 and a["previous_period"]["telemetry_count"] == 0
    assert a["current_period"]["max_score"] is not None
    b = client.get("/api/analytics/overview", headers=admin_h).json()
    assert b["current_period"] is None and b["previous_period"] is None


def test_pagination_bounds(client, admin_h):
    assert client.get("/api/stations", headers=admin_h, params={"page": 0}).status_code == 422
    assert client.get("/api/stations", headers=admin_h, params={"page_size": 1000}).status_code == 422
    p = client.get("/api/alerts", headers=admin_h, params={"page": 99, "page_size": 5}).json()
    assert p["items"] == [] and p["page"] == 99 and p["pages"] >= 1
    assert client.get("/api/stations/1/telemetry", headers=admin_h, params={"from": "2020-01-01T00:00:00Z", "to": "2026-01-01T00:00:00Z"}).status_code == 422


def test_production_config_refuses_insecure_defaults(monkeypatch):
    for k in ("SECRET_KEY", "INGEST_API_KEY", "CORS_ORIGINS", "DATABASE_URL"):
        monkeypatch.delenv(k, raising=False)
    s = Settings(app_env="production", _env_file=None)
    problems = s.production_problems()
    assert any("SECRET_KEY" in p for p in problems) and any("INGEST_API_KEY" in p for p in problems)
    assert any("CORS" in p for p in problems) and any("DATABASE_URL" in p for p in problems)
    good = Settings(app_env="production", secret_key="x" * 48, ingest_api_key="y" * 24, cors_origins="https://urpaq.example.com",
                    database_url="postgresql+psycopg://u:p@db/urpaq", _env_file=None)
    assert good.production_problems() == []
    assert good.docs_enabled is False  # docs off by default in production
    assert Settings(app_env="production", secret_key="x" * 48, ingest_api_key="y" * 24, cors_origins="https://a.b", database_url="sqlite:////data/u.db", enable_docs=True, _env_file=None).docs_enabled is True


def test_alembic_migration_creates_schema():
    """`alembic upgrade head` on an empty database must produce every table the models define."""
    tmp = tempfile.mkdtemp(prefix="urpaq-migr-")
    url = f"sqlite:///{tmp}/m.db"
    env = {**os.environ, "DATABASE_URL": url, "APP_ENV": "test", "SEED_ON_STARTUP": "false"}
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=root, env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    from sqlalchemy import create_engine, inspect

    from app.core.database import Base

    names = set(inspect(create_engine(url)).get_table_names())
    expected = set(Base.metadata.tables.keys())
    assert expected <= names, expected - names
    assert "alembic_version" in names
    # a second run is a no-op
    r2 = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=root, env=env, capture_output=True, text=True, timeout=120)
    assert r2.returncode == 0


@pytest.mark.parametrize("path", ["/api/admin/users", "/api/admin/settings", "/api/admin/health", "/api/audit-log"])
def test_admin_endpoints_reject_operator(client, operator_h, path):
    assert client.get(path, headers=operator_h).status_code == 403

from datetime import timedelta

from app.core.timeutil import utcnow
from tests.conftest import payload, push_series


def test_ingest_ok_and_latest(client, ingest_h, admin_h):
    r = client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(level=130))
    assert r.status_code == 200, r.text
    assert r.json()["accepted"] == 5 and r.json()["risk_level"] == "low"
    latest = client.get("/api/telemetry/latest", headers=admin_h).json()["items"]
    assert latest[0]["latest"][0]["freshness"] == "fresh"
    st = client.get("/api/stations/1", headers=admin_h).json()
    assert st["risk"]["risk_level"] == "low" and st["connection"] == "connected"


def test_ingest_requires_auth(client):
    assert client.post("/api/telemetry/ingest", json=payload()).status_code == 401
    assert client.post("/api/telemetry/ingest", headers={"X-Ingest-Key": "wrong"}, json=payload()).status_code == 401


def test_observer_cannot_ingest_but_operator_can(client, observer_h, operator_h):
    assert client.post("/api/telemetry/ingest", headers=observer_h, json=payload()).status_code == 403
    assert client.post("/api/telemetry/ingest", headers=operator_h, json=payload()).status_code == 200


def test_rejects_invalid_values(client, ingest_h):
    import json

    body = payload()
    raw = json.dumps(body).replace('"value": 150.0', '"value": NaN')
    r = client.post("/api/telemetry/ingest", headers={**ingest_h, "Content-Type": "application/json"}, content=raw)
    assert r.status_code == 422
    raw = json.dumps(body).replace('"value": 150.0', '"value": Infinity')
    assert client.post("/api/telemetry/ingest", headers={**ingest_h, "Content-Type": "application/json"}, content=raw).status_code == 422
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(level=99999)).status_code == 422
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(soil=120)).status_code == 422
    b = payload()
    b["readings"][0]["unit"] = "m"
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=b).status_code == 422
    b = payload()
    b["readings"][0]["parameter"] = "unknown_thing"
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=b).status_code == 422
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(measured_at=utcnow() + timedelta(hours=1))).status_code == 422
    b = payload()
    b["measured_at"] = "2024-01-01T00:00:00"  # naive timestamp
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=b).status_code == 422
    b = payload()
    b["readings"] = []
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=b).status_code == 422
    assert client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(station_id=42)).status_code == 404


def test_duplicate_event_id_is_idempotent(client, ingest_h, admin_h):
    r1 = client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(event_id="evt-1"))
    r2 = client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(event_id="evt-1", level=999))
    assert r1.json()["duplicate"] is False and r2.json()["duplicate"] is True and r2.json()["accepted"] == 0
    hist = client.get("/api/stations/1/telemetry", headers=admin_h, params={"parameter": "water_level_cm"}).json()
    assert hist["count_raw"] == 1


def test_offline_station_rejects_and_counts_error(client, ingest_h, admin_h):
    client.patch("/api/stations/1", headers=admin_h, json={"status": "offline"})
    r = client.post("/api/telemetry/ingest", headers=ingest_h, json=payload())
    assert r.status_code == 422 and r.json()["error"]["code"] == "station_not_online"
    assert client.get("/api/stations/1", headers=admin_h).json()["error_count"] == 1


def test_stale_risk_status(client, ingest_h, admin_h):
    old = utcnow() - timedelta(hours=2)
    client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(level=290, rate=40, rain=20, measured_at=old))
    r = client.get("/api/stations/1/risk", headers=admin_h).json()
    assert r["current"]["risk_level"] == "stale"
    assert r["current"]["score"] is None
    # ingest-time assessment also sees stale data -> no alert
    assert client.get("/api/alerts", headers=admin_h).json()["total"] == 0


def test_auto_alert_created_and_deduplicated(client, ingest_h, operator_h, admin_h):
    last = push_series(client, ingest_h, [150, 165, 185, 210, 240, 270, 295], rain=20, soil=90)
    assert last["risk_level"] == "high"
    alerts = client.get("/api/alerts", headers=operator_h).json()
    active = [a for a in alerts["items"] if a["status"] != "resolved"]
    assert len(active) == 1, [(a["severity"], a["status"]) for a in alerts["items"]]
    a = active[0]
    assert a["severity"] == "high" and a["status"] == "new"
    assert a["trigger_factors"]["synthetic"] is True
    # further high ticks do not create duplicates
    for _ in range(3):
        client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(level=298, rate=30, rain=20, soil=90))
    assert len([x for x in client.get("/api/alerts", headers=operator_h).json()["items"] if x["status"] != "resolved"]) == 1

    # escalation: medium -> high updates the same alert
    client2 = client
    client2.patch("/api/stations/1", headers=admin_h, json={"status": "online"})


def test_medium_then_high_escalates_same_alert(client, ingest_h, operator_h):
    last = push_series(client, ingest_h, [150, 152, 154, 156, 158, 160], rain=8, soil=60)
    assert last["risk_level"] == "medium"
    items = client.get("/api/alerts", headers=operator_h).json()["items"]
    assert len(items) == 1 and items[0]["severity"] == "medium"
    aid = items[0]["id"]
    client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(level=295, rate=45, rain=22, soil=90))
    items = client.get("/api/alerts", headers=operator_h).json()["items"]
    assert len(items) == 1 and items[0]["id"] == aid and items[0]["severity"] == "high" and items[0]["escalation_count"] == 1


def test_ack_resolve_audit_and_idempotency(client, ingest_h, operator_h, admin_h, observer_h):
    push_series(client, ingest_h, [150, 180, 215, 250, 285, 299], rain=20, soil=90)
    aid = client.get("/api/alerts", headers=operator_h).json()["items"][0]["id"]
    assert client.get(f"/api/alerts/{aid}", headers=observer_h).status_code == 200
    r = client.post(f"/api/alerts/{aid}/acknowledge", headers=operator_h)
    assert r.status_code == 200 and r.json()["status"] == "acknowledged" and r.json()["acknowledged_by_name"] == "operator"
    r2 = client.post(f"/api/alerts/{aid}/acknowledge", headers=operator_h)
    assert r2.status_code == 200 and r2.json()["acknowledged_at"] == r.json()["acknowledged_at"]
    r = client.post(f"/api/alerts/{aid}/resolve", headers=operator_h, json={"note": "Проверено на месте"})
    assert r.status_code == 200 and r.json()["status"] == "resolved" and r.json()["resolution_note"] == "Проверено на месте"
    assert client.post(f"/api/alerts/{aid}/resolve", headers=operator_h, json={"note": "again"}).json()["resolution_note"] == "Проверено на месте"
    assert client.post(f"/api/alerts/{aid}/acknowledge", headers=operator_h).status_code == 409
    assert client.post("/api/alerts/9999/resolve", headers=operator_h, json={}).status_code == 404
    log = client.get("/api/audit-log", headers=admin_h, params={"entity_type": "alert"}).json()
    actions = [e["action"] for e in log["items"]]
    assert "alert.created" in actions and "alert.acknowledged" in actions and "alert.resolved" in actions
    assert all(e["actor_name"] == "operator" for e in log["items"] if e["action"] in ("alert.acknowledged", "alert.resolved"))
    # suppression: immediately after resolve, same severity is suppressed
    client.post("/api/telemetry/ingest", headers=ingest_h, json=payload(level=299, rate=45, rain=20, soil=90))
    assert client.get("/api/alerts", headers=operator_h).json()["total"] == 1


def test_history_range_limits_and_bucketing(client, ingest_h, admin_h):
    push_series(client, ingest_h, [150 + i for i in range(10)])
    r = client.get("/api/stations/1/telemetry", headers=admin_h, params={"parameter": "water_level_cm", "bucket_seconds": 1800})
    assert r.status_code == 200 and r.json()["bucket_seconds"] == 1800 and 1 <= len(r.json()["points"]) <= 3
    r = client.get("/api/stations/1/telemetry", headers=admin_h, params={"from": (utcnow() - timedelta(days=60)).isoformat(), "to": utcnow().isoformat()})
    assert r.status_code == 422 and r.json()["error"]["code"] == "range_too_large"
    assert client.get("/api/stations/1/telemetry", headers=admin_h, params={"parameter": "nope"}).status_code == 422


def test_dashboard_and_analytics(client, ingest_h, admin_h):
    push_series(client, ingest_h, [150, 160, 170])
    d = client.get("/api/dashboard/summary", headers=admin_h).json()
    assert d["counts"]["stations_total"] == 1 and d["synthetic_data"] is True
    assert "water_level_cm" in d["series"]
    a = client.get("/api/analytics/overview", headers=admin_h).json()
    assert a["telemetry_count"] == 15 and a["top_stations"][0]["station_id"] == 1
    assert client.get("/api/health").json()["status"] == "ok"

from datetime import datetime, timezone

from app.simulator.scenarios import generate, StationProfile, preview
from tests.conftest import push_series


def test_settings_validation_and_effect(client, admin_h, ingest_h):
    assert client.get("/api/admin/settings", headers=admin_h).json()["risk"]["thresholds"]["high"] == 65
    bad = client.patch("/api/admin/settings", headers=admin_h, json={"risk": {"thresholds": {"medium": 80, "high": 20}}})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_risk_settings"
    assert client.patch("/api/admin/settings", headers=admin_h, json={"risk": {"weights": {"level": -1, "rise_rate": 1, "rainfall": 1, "soil": 1, "trend": 1}}}).status_code == 422
    assert client.patch("/api/admin/settings", headers=admin_h, json={"risk": {"stale_after_seconds": 5}}).status_code == 422

    last = push_series(client, ingest_h, [150, 152, 154, 156, 158, 160], rain=8, soil=60)
    assert last["risk_level"] == "medium"
    r = client.patch("/api/admin/settings", headers=admin_h, json={"risk": {"thresholds": {"medium": 10, "high": 30}}, "alerts": {"suppression_minutes": 0}, "ui_refresh_seconds": 5})
    assert r.status_code == 200 and r.json()["risk"]["thresholds"]["high"] == 30 and r.json()["ui_refresh_seconds"] == 5
    # next assessment uses the new thresholds
    risk = client.get("/api/stations/1/risk", headers=admin_h).json()
    assert risk["current"]["risk_level"] == "high"
    log = client.get("/api/audit-log", headers=admin_h, params={"action": "settings"}).json()
    assert log["total"] == 1


def test_simulator_control_and_rbac(client, operator_h, observer_h, admin_h):
    s = client.get("/api/simulator/status").json()
    assert s["state"] == "stopped" and s["synthetic"] is True
    assert client.post("/api/simulator/start", headers=observer_h).status_code == 403
    r = client.post("/api/simulator/start", headers=operator_h, json={"scenario": "RISING_WATER", "intensity": 1.5, "interval_seconds": 2})
    assert r.status_code == 200 and r.json()["state"] == "running" and r.json()["scenario"] == "RISING_WATER" and r.json()["intensity"] == 1.5
    assert client.get("/api/stations/1", headers=operator_h).json()["scenario"] == "RISING_WATER"
    assert client.post("/api/simulator/pause", headers=operator_h).json()["state"] == "paused"
    assert client.post("/api/simulator/scenario", headers=operator_h, json={"scenario": "RAPID_FLOOD", "station_ids": [1]}).json()["stations"][0]["scenario"] == "RAPID_FLOOD"
    assert client.post("/api/simulator/scenario", headers=operator_h, json={"scenario": "TSUNAMI"}).status_code == 422
    assert client.post("/api/simulator/stop", headers=operator_h).json()["state"] == "stopped"
    r = client.post("/api/simulator/reset", headers=operator_h).json()
    assert r["tick"] == 0 and r["sent_count"] == 0
    actions = {e["action"] for e in client.get("/api/audit-log", headers=admin_h).json()["items"]}
    assert {"simulator.start", "simulator.pause", "simulator.scenario", "simulator.stop", "simulator.reset"} <= actions


def test_simulator_tick_is_reproducible(client, operator_h, admin_h):
    from app.core.database import SessionLocal
    from app.simulator.engine import get_state, run_tick

    client.post("/api/simulator/start", headers=operator_h, json={"scenario": "RAPID_FLOOD", "seed": 7, "interval_seconds": 5, "time_acceleration": 60})
    with SessionLocal() as db:
        for _ in range(12):
            assert run_tick(db) == 1
        st = get_state(db)
        assert st.tick == 12 and st.sent_count == 12 and st.last_event_at is not None
    hist = client.get("/api/stations/1/telemetry", headers=admin_h, params={"parameter": "water_level_cm"}).json()
    levels = [p["v"] for p in hist["points"]]
    assert len(levels) == 12 and levels[-1] > levels[0]
    # same (scenario, t, seed, station) -> identical values
    p = StationProfile(baseline_level_cm=120, critical_level_cm=300)
    a = generate("RAPID_FLOOD", 600.0, 300.0, 1.0, p, 7, "TEST-01")
    b = generate("RAPID_FLOOD", 600.0, 300.0, 1.0, p, 7, "TEST-01")
    c = generate("RAPID_FLOOD", 600.0, 300.0, 1.0, p, 8, "TEST-01")
    assert a == b and a != c
    assert a["water_level_cm"] == levels[2]
    status = client.get("/api/simulator/status").json()
    assert status["tick"] == 12
    # the station should now be at high risk with an alert
    st = client.get("/api/stations/1", headers=admin_h).json()
    assert st["risk"]["risk_level"] == "high" and st["active_alerts"] == 1


def test_scenario_shapes():
    p = StationProfile()
    normal = preview("NORMAL", minutes=120)
    rising = preview("RISING_WATER", minutes=120)
    rapid = preview("RAPID_FLOOD", minutes=60)
    assert max(r["water_level_cm"] for r in normal) - min(r["water_level_cm"] for r in normal) < 20
    assert rising[-1]["water_level_cm"] > rising[0]["water_level_cm"] + 100
    assert rapid[-1]["water_level_cm"] >= p.critical_level_cm
    assert max(r["rainfall_mm_h"] for r in rapid) > 15
    assert all(r["soil_moisture_pct"] <= 100 for r in rapid)


def test_disabled_station_is_skipped_by_simulator(client, operator_h, admin_h):
    from app.core.database import SessionLocal
    from app.simulator.engine import run_tick

    client.patch("/api/stations/1", headers=admin_h, json={"status": "maintenance"})
    client.post("/api/simulator/start", headers=operator_h)
    with SessionLocal() as db:
        assert run_tick(db) == 0
    client.delete("/api/stations/1", headers=admin_h)
    with SessionLocal() as db:
        assert run_tick(db) == 0


def test_seed_is_idempotent():
    from app.core.database import SessionLocal
    from app.models import Station, Telemetry, User
    from app.seed import seed

    s1 = seed(verbose=False)
    s2 = seed(verbose=False)
    assert s1["telemetry_inserted"] > 0 and s2["telemetry_inserted"] == 0
    with SessionLocal() as db:
        assert db.query(Station).count() == 7 + 1  # 7 demo + conftest station
        assert db.query(User).filter(User.username == "admin").count() == 1
        levels = {s.code: s for s in db.query(Station).all()}
        from app.services import station_service

        r = station_service.latest_risk(db, levels["ESIL-SKO-03"].id)
        assert r.risk_level == "high"
        assert station_service.latest_risk(db, levels["ESIL-PTR-02"].id).risk_level == "medium"
        assert station_service.latest_risk(db, levels["ESIL-PTR-01"].id).risk_level == "low"

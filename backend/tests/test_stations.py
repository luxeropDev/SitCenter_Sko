def test_station_crud_and_validation(client, admin_h):
    body = {"name": "Новая станция", "description": "d", "latitude": 54.9, "longitude": 69.2, "source_type": "device",
            "interval_seconds": 30, "thresholds": {"baseline_level_cm": 100, "warning_level_cm": 200, "critical_level_cm": 300}}
    r = client.post("/api/stations", headers=admin_h, json=body)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["configuration"]["thresholds"]["critical_level_cm"] == 300
    assert r.json()["code"]

    assert client.post("/api/stations", headers=admin_h, json={**body, "latitude": 91}).status_code == 422
    assert client.post("/api/stations", headers=admin_h, json={**body, "longitude": -181}).status_code == 422
    assert client.post("/api/stations", headers=admin_h, json={**body, "interval_seconds": 0}).status_code == 422
    assert client.post("/api/stations", headers=admin_h, json={**body, "name": "x"}).status_code == 422
    bad_th = client.post("/api/stations", headers=admin_h, json={**body, "thresholds": {"baseline_level_cm": 300, "warning_level_cm": 200, "critical_level_cm": 100}})
    assert bad_th.status_code == 422
    assert client.post("/api/stations", headers=admin_h, json={**body, "parameters": ["rainfall_mm_h"]}).status_code == 422

    r = client.patch(f"/api/stations/{sid}", headers=admin_h, json={"name": "Переименована", "status": "maintenance", "latitude": 55.0})
    assert r.status_code == 200 and r.json()["name"] == "Переименована" and r.json()["status"] == "maintenance"
    assert client.patch(f"/api/stations/{sid}", headers=admin_h, json={"latitude": 200}).status_code == 422

    r = client.get("/api/stations", headers=admin_h, params={"search": "Переим"})
    assert r.status_code == 200 and r.json()["total"] == 1

    r = client.delete(f"/api/stations/{sid}", headers=admin_h)
    assert r.status_code == 200 and r.json()["details"]["mode"] == "soft"
    assert client.get(f"/api/stations/{sid}", headers=admin_h).json()["is_deleted"] is True
    r = client.get("/api/stations", headers=admin_h)
    assert all(s["id"] != sid for s in r.json()["items"])
    assert client.post(f"/api/stations/{sid}/restore", headers=admin_h).status_code == 200
    r = client.delete(f"/api/stations/{sid}", headers=admin_h, params={"hard": "true"})
    assert r.status_code == 200 and r.json()["details"]["mode"] == "hard"
    assert client.get(f"/api/stations/{sid}", headers=admin_h).status_code == 404

    log = client.get("/api/audit-log", headers=admin_h).json()
    actions = {e["action"] for e in log["items"]}
    assert {"station.created", "station.updated", "station.disabled", "station.deleted"} <= actions


def test_station_not_found(client, admin_h):
    r = client.get("/api/stations/999", headers=admin_h)
    assert r.status_code == 404 and r.json()["error"]["code"] == "station_not_found"

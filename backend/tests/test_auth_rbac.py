def test_login_ok_and_me(client):
    r = client.post("/api/auth/login", json={"username": "operator", "password": "Operator12345!"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "operator"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["username"] == "operator"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "operator", "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


def test_protected_requires_token(client):
    assert client.get("/api/stations").status_code == 401
    assert client.get("/api/stations", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_observer_cannot_admin(client, observer_h):
    assert client.get("/api/admin/users", headers=observer_h).status_code == 403
    assert client.post("/api/stations", headers=observer_h, json={"name": "X", "latitude": 1, "longitude": 1}).status_code == 403
    assert client.post("/api/simulator/start", headers=observer_h).status_code == 403
    assert client.get("/api/audit-log", headers=observer_h).status_code == 403
    assert client.post("/api/alerts/1/acknowledge", headers=observer_h).status_code == 403
    # observer may read
    assert client.get("/api/stations", headers=observer_h).status_code == 200
    assert client.get("/api/alerts", headers=observer_h).status_code == 200


def test_operator_cannot_manage_users_or_stations(client, operator_h):
    assert client.get("/api/admin/users", headers=operator_h).status_code == 403
    assert client.patch("/api/stations/1", headers=operator_h, json={"name": "Renamed"}).status_code == 403


def test_logout_revokes_token(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "Admin12345!"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.post("/api/auth/logout", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_expired_token_rejected(client):
    from app.core.security import create_access_token

    tok = create_access_token(1, "admin", expires_minutes=-1)["token"]
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "token_expired"


def test_admin_user_crud_and_role_guard(client, admin_h):
    r = client.post("/api/admin/users", headers=admin_h, json={"username": "newop", "email": "newop@test.local", "password": "Str0ngPass!", "role": "operator"})
    assert r.status_code == 201
    uid = r.json()["id"]
    r = client.post("/api/admin/users", headers=admin_h, json={"username": "newop", "email": "x@test.local", "password": "Str0ngPass!", "role": "operator"})
    assert r.status_code == 409
    r = client.patch(f"/api/admin/users/{uid}", headers=admin_h, json={"role": "admin", "is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    r = client.post("/api/auth/login", json={"username": "newop", "password": "Str0ngPass!"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "user_inactive"
    # cannot lock self out
    me = client.get("/api/auth/me", headers=admin_h).json()
    assert client.patch(f"/api/admin/users/{me['id']}", headers=admin_h, json={"role": "observer"}).status_code == 422
    assert client.post("/api/admin/users", headers=admin_h, json={"username": "bad", "email": "bad@test.local", "password": "Str0ngPass!", "role": "superuser"}).status_code == 422

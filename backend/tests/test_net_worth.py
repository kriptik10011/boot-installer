"""Net worth router tests — assets CRUD, net worth calculation, trend, forecast."""


# --- Assets CRUD ---

def test_create_asset(client):
    r = client.post("/api/net-worth/assets", json={
        "name": "Checking", "current_value": 5000.0, "type": "checking", "is_liquid": True,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Checking"
    assert data["current_value"] == 5000.0
    assert data["is_liquid"] is True


def test_list_assets(client):
    client.post("/api/net-worth/assets", json={"name": "A", "current_value": 100.0})
    client.post("/api/net-worth/assets", json={"name": "B", "current_value": 200.0})
    r = client.get("/api/net-worth/assets")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_update_asset(client):
    cr = client.post("/api/net-worth/assets", json={"name": "Car", "current_value": 15000.0, "type": "vehicle"})
    aid = cr.json()["id"]
    r = client.put(f"/api/net-worth/assets/{aid}", json={"current_value": 14000.0})
    assert r.status_code == 200
    assert r.json()["current_value"] == 14000.0


def test_update_asset_not_found(client):
    assert client.put("/api/net-worth/assets/9999", json={"name": "X"}).status_code == 404


def test_delete_asset(client):
    cr = client.post("/api/net-worth/assets", json={"name": "Temp", "current_value": 1.0})
    aid = cr.json()["id"]
    assert client.delete(f"/api/net-worth/assets/{aid}").status_code == 204
    assert client.put(f"/api/net-worth/assets/{aid}", json={"name": "X"}).status_code == 404


# --- Net Worth ---

def test_current_net_worth(client):
    client.post("/api/net-worth/assets", json={"name": "Savings", "current_value": 10000.0})
    r = client.get("/api/net-worth/current")
    assert r.status_code == 200
    data = r.json()
    assert data["total_assets"] >= 10000.0
    assert "net_worth" in data


def test_net_worth_empty(client):
    r = client.get("/api/net-worth/current")
    assert r.status_code == 200
    assert r.json()["net_worth"] == 0.0


def test_snapshot(client):
    client.post("/api/net-worth/assets", json={"name": "Cash", "current_value": 500.0})
    r = client.post("/api/net-worth/snapshot")
    assert r.status_code == 200
    assert "date" in r.json()


def test_trend(client):
    r = client.get("/api/net-worth/trend?months=3")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_milestones(client):
    r = client.get("/api/net-worth/milestones")
    assert r.status_code == 200


def test_forecast(client):
    r = client.get("/api/net-worth/forecast?days=14")
    assert r.status_code == 200
    data = r.json()
    assert "daily_projections" in data
    assert data["days"] == 14


def test_asset_history(client):
    cr = client.post("/api/net-worth/assets", json={"name": "House", "current_value": 300000.0})
    aid = cr.json()["id"]
    r = client.get(f"/api/net-worth/assets/{aid}/history")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- CentsType ---

def test_cents_precision_asset(client):
    cr = client.post("/api/net-worth/assets", json={"name": "Precise", "current_value": 12345.67})
    aid = cr.json()["id"]
    assert client.get(f"/api/net-worth/current").json()["total_assets"] >= 12345.67

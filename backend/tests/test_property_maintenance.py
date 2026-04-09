"""Property maintenance router tests — CRUD, filtering, open requests."""

from datetime import date


def _create_property(client):
    return client.post("/api/property/properties", json={
        "name": "Maint Property", "property_type": "single_family",
    })


def _create_unit(client, property_id):
    return client.post(f"/api/property/properties/{property_id}/units", json={
        "unit_number": "1A", "bedrooms": 2,
    })


def _create_request(client, property_id, unit_id, **overrides):
    data = {
        "property_id": property_id, "unit_id": unit_id,
        "description": "Leaky faucet", "priority": "medium",
        "created_date": str(date.today()), **overrides,
    }
    return client.post("/api/property/maintenance", json=data)


# --- CRUD ---

def test_create_maintenance_request(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    r = _create_request(client, pid, uid)
    assert r.status_code == 201
    assert r.json()["description"] == "Leaky faucet"
    assert r.json()["priority"] == "medium"


def test_list_maintenance_requests(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    _create_request(client, pid, uid)
    r = client.get("/api/property/maintenance")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_maintenance_request(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    mid = _create_request(client, pid, uid).json()["id"]
    r = client.get(f"/api/property/maintenance/{mid}")
    assert r.status_code == 200
    assert r.json()["description"] == "Leaky faucet"


def test_get_maintenance_not_found(client):
    assert client.get("/api/property/maintenance/9999").status_code == 404


def test_update_maintenance_request(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    mid = _create_request(client, pid, uid).json()["id"]
    r = client.put(f"/api/property/maintenance/{mid}", json={
        "status": "in_progress", "vendor_name": "FixIt Inc",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"
    assert r.json()["vendor_name"] == "FixIt Inc"


# --- Filtering ---

def test_filter_by_status(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    _create_request(client, pid, uid, status="open")
    _create_request(client, pid, uid, description="Broken window", status="completed")
    r = client.get("/api/property/maintenance?status=open")
    assert r.status_code == 200
    assert all(req["status"] == "open" for req in r.json())


def test_open_requests(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    _create_request(client, pid, uid, status="open")
    _create_request(client, pid, uid, description="Done", status="completed")
    r = client.get("/api/property/maintenance/open")
    assert r.status_code == 200
    assert all(req["status"] in ("open", "in_progress") for req in r.json())


def test_create_request_property_not_found(client):
    r = client.post("/api/property/maintenance", json={
        "property_id": 9999, "unit_id": 1,
        "description": "Test", "created_date": str(date.today()),
    })
    assert r.status_code == 404

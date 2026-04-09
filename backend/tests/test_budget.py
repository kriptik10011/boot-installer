"""Budget router tests — categories, allocations, status, safe-to-spend."""

from datetime import date


# --- Category CRUD ---

def test_create_category(client):
    r = client.post("/api/budget/categories", json={
        "name": "Groceries", "budget_amount": 500.0, "type": "need",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Groceries"
    assert data["budget_amount"] == 500.0
    assert data["is_active"] is True
    assert "id" in data


def test_list_categories(client):
    client.post("/api/budget/categories", json={"name": "A", "budget_amount": 100.0})
    client.post("/api/budget/categories", json={"name": "B", "budget_amount": 200.0})
    r = client.get("/api/budget/categories")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_category_by_id(client):
    cr = client.post("/api/budget/categories", json={"name": "Rent", "budget_amount": 1500.0})
    cid = cr.json()["id"]
    r = client.get(f"/api/budget/categories/{cid}")
    assert r.status_code == 200
    assert r.json()["name"] == "Rent"


def test_get_category_not_found(client):
    assert client.get("/api/budget/categories/9999").status_code == 404


def test_update_category(client):
    cr = client.post("/api/budget/categories", json={"name": "Food", "budget_amount": 300.0})
    cid = cr.json()["id"]
    r = client.put(f"/api/budget/categories/{cid}", json={"budget_amount": 400.0})
    assert r.status_code == 200
    assert r.json()["budget_amount"] == 400.0
    assert r.json()["name"] == "Food"  # unchanged


def test_delete_category(client):
    cr = client.post("/api/budget/categories", json={"name": "Temp", "budget_amount": 50.0})
    cid = cr.json()["id"]
    assert client.delete(f"/api/budget/categories/{cid}").status_code == 204


def test_create_category_zero_budget(client):
    r = client.post("/api/budget/categories", json={"name": "Unfunded", "budget_amount": 0.0})
    assert r.status_code == 201
    assert r.json()["budget_amount"] == 0.0


# --- Allocation ---

def test_allocate_budget(client):
    cr = client.post("/api/budget/categories", json={"name": "Utils", "budget_amount": 200.0})
    cid = cr.json()["id"]
    r = client.post("/api/budget/allocate", json={
        "category_id": cid, "amount": 200.0, "period_start": str(date.today()),
    })
    assert r.status_code in (200, 201)
    data = r.json()
    assert data["allocated_amount"] == 200.0
    assert data["category_id"] == cid


def test_allocate_nonexistent_category(client):
    r = client.post("/api/budget/allocate", json={
        "category_id": 9999, "amount": 100.0, "period_start": str(date.today()),
    })
    assert r.status_code == 404


# --- Status ---

def test_budget_status(client):
    r = client.get(f"/api/budget/status/{date.today()}")
    assert r.status_code == 200
    data = r.json()
    assert "categories" in data
    assert "total_income" in data


def test_safe_to_spend(client):
    r = client.get("/api/budget/safe-to-spend")
    assert r.status_code == 200
    data = r.json()
    assert "amount" in data
    assert "total_income" in data


# --- Rollover ---

def test_rollover_nonexistent_category(client):
    r = client.get(f"/api/budget/rollover/9999?period_start={date.today()}")
    assert r.status_code == 404


# --- CentsType round-trip ---

def test_cents_type_precision(client):
    """Verify $19.99 survives write-read cycle through CentsType."""
    cr = client.post("/api/budget/categories", json={
        "name": "Precision Test", "budget_amount": 19.99,
    })
    assert cr.status_code == 201
    cid = cr.json()["id"]
    r = client.get(f"/api/budget/categories/{cid}")
    assert r.json()["budget_amount"] == 19.99

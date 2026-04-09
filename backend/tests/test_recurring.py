"""Recurring transactions router tests — CRUD, upcoming, overdue, mark-paid."""

from datetime import date, timedelta


SAMPLE_RECURRING = {
    "description": "Netflix", "amount": 15.99, "frequency": "monthly",
    "is_subscription": True, "subscription_service": "Netflix",
    "next_due_date": str(date.today() + timedelta(days=5)),
}


# --- CRUD ---

def test_create_recurring(client):
    r = client.post("/api/recurring/", json=SAMPLE_RECURRING)
    assert r.status_code == 201
    data = r.json()
    assert data["description"] == "Netflix"
    assert data["amount"] == 15.99
    assert data["is_subscription"] is True


def test_list_recurring(client):
    client.post("/api/recurring/", json=SAMPLE_RECURRING)
    client.post("/api/recurring/", json={
        "description": "Rent", "amount": 1500.0, "frequency": "monthly",
        "next_due_date": str(date.today() + timedelta(days=1)),
    })
    r = client.get("/api/recurring/")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_recurring(client):
    cr = client.post("/api/recurring/", json=SAMPLE_RECURRING)
    rid = cr.json()["id"]
    r = client.get(f"/api/recurring/{rid}")
    assert r.status_code == 200
    assert r.json()["description"] == "Netflix"


def test_get_recurring_not_found(client):
    assert client.get("/api/recurring/9999").status_code == 404


def test_update_recurring(client):
    cr = client.post("/api/recurring/", json=SAMPLE_RECURRING)
    rid = cr.json()["id"]
    r = client.put(f"/api/recurring/{rid}", json={"amount": 17.99})
    assert r.status_code == 200
    assert r.json()["amount"] == 17.99


def test_delete_recurring(client):
    cr = client.post("/api/recurring/", json=SAMPLE_RECURRING)
    rid = cr.json()["id"]
    assert client.delete(f"/api/recurring/{rid}").status_code == 204


# --- Upcoming / Overdue ---

def test_upcoming(client):
    client.post("/api/recurring/", json=SAMPLE_RECURRING)
    r = client.get("/api/recurring/upcoming?days=30")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_overdue(client):
    client.post("/api/recurring/", json={
        "description": "Overdue Bill", "amount": 50.0, "frequency": "monthly",
        "next_due_date": str(date.today() - timedelta(days=3)),
    })
    r = client.get("/api/recurring/overdue")
    assert r.status_code == 200
    overdue = r.json()
    assert any(b["description"] == "Overdue Bill" for b in overdue)


# --- Subscriptions ---

def test_subscriptions_summary(client):
    client.post("/api/recurring/", json=SAMPLE_RECURRING)
    r = client.get("/api/recurring/subscriptions/summary")
    assert r.status_code == 200
    data = r.json()
    assert data["subscription_count"] >= 1
    assert data["monthly_total"] > 0


# --- Mark Paid ---

def test_mark_paid(client):
    cr = client.post("/api/recurring/", json=SAMPLE_RECURRING)
    rid = cr.json()["id"]
    r = client.post(f"/api/recurring/{rid}/mark-paid")
    assert r.status_code == 201
    tx = r.json()
    assert tx["amount"] == 15.99
    assert tx["is_recurring"] is True


def test_mark_paid_not_found(client):
    assert client.post("/api/recurring/9999/mark-paid").status_code == 404


# --- Filter ---

def test_filter_subscriptions_only(client):
    client.post("/api/recurring/", json=SAMPLE_RECURRING)
    client.post("/api/recurring/", json={
        "description": "Rent", "amount": 1500.0, "frequency": "monthly",
    })
    r = client.get("/api/recurring/?is_subscription=true")
    assert r.status_code == 200
    assert all(b["is_subscription"] is True for b in r.json())


# --- Query Param Filters (F4) ---

def test_list_with_status_overdue(client):
    client.post("/api/recurring/", json={
        "description": "Overdue Bill", "amount": 50.0, "frequency": "monthly",
        "next_due_date": str(date.today() - timedelta(days=3)),
    })
    r = client.get("/api/recurring/?status=overdue")
    assert r.status_code == 200
    assert any(b["description"] == "Overdue Bill" for b in r.json())


def test_list_with_status_upcoming(client):
    client.post("/api/recurring/", json=SAMPLE_RECURRING)
    r = client.get("/api/recurring/?status=upcoming&days=30")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

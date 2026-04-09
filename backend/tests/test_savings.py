"""Savings router tests — goals CRUD, contributions, projections, emergency fund."""

from datetime import date, timedelta


SAMPLE_GOAL = {
    "name": "Emergency Fund", "target_amount": 15000.0, "current_amount": 5000.0,
    "priority": 1, "category": "emergency_fund", "monthly_contribution": 500.0,
}


# --- Goal CRUD ---

def test_create_savings_goal(client):
    r = client.post("/api/savings/goals", json=SAMPLE_GOAL)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Emergency Fund"
    assert data["target_amount"] == 15000.0
    assert data["current_amount"] == 5000.0
    assert data["is_achieved"] is False
    assert abs(data["progress_pct"] - 33.33) < 0.1
    assert data["remaining"] == 10000.0


def test_list_savings_goals(client):
    client.post("/api/savings/goals", json=SAMPLE_GOAL)
    client.post("/api/savings/goals", json={
        "name": "Vacation", "target_amount": 3000.0, "monthly_contribution": 200.0,
    })
    r = client.get("/api/savings/goals")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_savings_goal(client):
    cr = client.post("/api/savings/goals", json=SAMPLE_GOAL)
    gid = cr.json()["id"]
    r = client.get(f"/api/savings/goals/{gid}")
    assert r.status_code == 200
    assert r.json()["name"] == "Emergency Fund"


def test_get_savings_goal_not_found(client):
    assert client.get("/api/savings/goals/9999").status_code == 404


def test_update_savings_goal(client):
    cr = client.post("/api/savings/goals", json=SAMPLE_GOAL)
    gid = cr.json()["id"]
    r = client.put(f"/api/savings/goals/{gid}", json={"monthly_contribution": 750.0})
    assert r.status_code == 200
    assert r.json()["monthly_contribution"] == 750.0


def test_delete_savings_goal(client):
    cr = client.post("/api/savings/goals", json=SAMPLE_GOAL)
    gid = cr.json()["id"]
    assert client.delete(f"/api/savings/goals/{gid}").status_code == 204
    assert client.get(f"/api/savings/goals/{gid}").status_code == 404


# --- Contributions ---

def test_contribute_to_goal(client):
    cr = client.post("/api/savings/goals", json=SAMPLE_GOAL)
    gid = cr.json()["id"]
    r = client.post(f"/api/savings/goals/{gid}/contribute", json={"amount": 500.0})
    assert r.status_code == 200
    assert r.json()["current_amount"] == 5500.0


def test_contribute_achieves_goal(client):
    cr = client.post("/api/savings/goals", json={
        "name": "Small Goal", "target_amount": 100.0, "current_amount": 90.0,
        "monthly_contribution": 10.0,
    })
    gid = cr.json()["id"]
    r = client.post(f"/api/savings/goals/{gid}/contribute", json={"amount": 20.0})
    assert r.status_code == 200
    data = r.json()
    assert data["current_amount"] == 110.0
    assert data["is_achieved"] is True


def test_contribute_nonexistent_goal(client):
    r = client.post("/api/savings/goals/9999/contribute", json={"amount": 100.0})
    assert r.status_code == 404


# --- Projections ---

def test_projections(client):
    client.post("/api/savings/goals", json=SAMPLE_GOAL)
    r = client.get("/api/savings/projections")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert data[0]["months_to_goal"] > 0


# --- Emergency Fund ---

def test_emergency_fund(client):
    r = client.get("/api/savings/emergency-fund")
    assert r.status_code == 200
    data = r.json()
    assert "monthly_expenses" in data
    assert "status" in data


# --- Milestones ---

def test_milestones(client):
    client.post("/api/savings/goals", json=SAMPLE_GOAL)
    r = client.get("/api/savings/milestones")
    assert r.status_code == 200


# --- CentsType ---

def test_cents_precision_savings(client):
    cr = client.post("/api/savings/goals", json={
        "name": "Precise", "target_amount": 9999.99, "current_amount": 1234.56,
        "monthly_contribution": 99.99,
    })
    gid = cr.json()["id"]
    data = client.get(f"/api/savings/goals/{gid}").json()
    assert data["target_amount"] == 9999.99
    assert data["current_amount"] == 1234.56
    assert data["monthly_contribution"] == 99.99

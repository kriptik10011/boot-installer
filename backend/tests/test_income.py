"""Income router tests — sources CRUD, income summary."""

from datetime import date


SAMPLE_SOURCE = {
    "name": "Primary Salary", "amount": 5000.0, "frequency": "monthly",
}


# --- Source CRUD ---

def test_create_income_source(client):
    r = client.post("/api/income/sources", json=SAMPLE_SOURCE)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Primary Salary"
    assert data["amount"] == 5000.0
    assert data["frequency"] == "monthly"
    assert data["is_active"] is True


def test_list_income_sources(client):
    client.post("/api/income/sources", json=SAMPLE_SOURCE)
    client.post("/api/income/sources", json={
        "name": "Freelance", "amount": 1000.0, "frequency": "irregular",
    })
    r = client.get("/api/income/sources")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_income_source(client):
    cr = client.post("/api/income/sources", json=SAMPLE_SOURCE)
    sid = cr.json()["id"]
    r = client.get(f"/api/income/sources/{sid}")
    assert r.status_code == 200
    assert r.json()["name"] == "Primary Salary"


def test_get_income_source_not_found(client):
    assert client.get("/api/income/sources/9999").status_code == 404


def test_update_income_source(client):
    cr = client.post("/api/income/sources", json=SAMPLE_SOURCE)
    sid = cr.json()["id"]
    r = client.put(f"/api/income/sources/{sid}", json={
        "amount": 5500.0, "frequency": "biweekly",
    })
    assert r.status_code == 200
    assert r.json()["amount"] == 5500.0
    assert r.json()["frequency"] == "biweekly"


def test_delete_income_source(client):
    cr = client.post("/api/income/sources", json=SAMPLE_SOURCE)
    sid = cr.json()["id"]
    assert client.delete(f"/api/income/sources/{sid}").status_code == 204


# --- Income Summary ---

def test_income_summary(client):
    client.post("/api/income/sources", json=SAMPLE_SOURCE)
    r = client.get(f"/api/income/summary/{date.today()}")
    assert r.status_code == 200
    data = r.json()
    assert "expected_income" in data
    assert "actual_income" in data
    assert data["expected_income"] >= 5000.0


# --- CentsType ---

def test_cents_precision_income(client):
    cr = client.post("/api/income/sources", json={
        "name": "Odd Pay", "amount": 3456.78, "frequency": "monthly",
    })
    sid = cr.json()["id"]
    assert client.get(f"/api/income/sources/{sid}").json()["amount"] == 3456.78

"""Debt router tests — accounts, payments, payoff plans, strategies."""

from datetime import date


SAMPLE_ACCOUNT = {
    "name": "Chase Card", "current_balance": 5000.0, "original_balance": 10000.0,
    "interest_rate": 18.5, "minimum_payment": 150.0, "type": "credit_card",
}


# --- Account CRUD ---

def test_create_debt_account(client):
    r = client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Chase Card"
    assert data["current_balance"] == 5000.0
    assert data["paid_off_pct"] == 50.0


def test_list_debt_accounts(client):
    client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    r = client.get("/api/debt/accounts")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_debt_account(client):
    cr = client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    aid = cr.json()["id"]
    r = client.get(f"/api/debt/accounts/{aid}")
    assert r.status_code == 200
    assert r.json()["interest_rate"] == 18.5


def test_get_debt_account_not_found(client):
    assert client.get("/api/debt/accounts/9999").status_code == 404


def test_update_debt_account(client):
    cr = client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    aid = cr.json()["id"]
    r = client.put(f"/api/debt/accounts/{aid}", json={"current_balance": 4500.0})
    assert r.status_code == 200
    assert r.json()["current_balance"] == 4500.0


def test_delete_debt_account(client):
    cr = client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    aid = cr.json()["id"]
    assert client.delete(f"/api/debt/accounts/{aid}").status_code == 204


# --- Payments ---

def test_record_payment(client):
    cr = client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    aid = cr.json()["id"]
    r = client.post(f"/api/debt/accounts/{aid}/payment", json={
        "date": str(date.today()), "amount": 500.0,
        "principal_portion": 450.0, "interest_portion": 50.0,
    })
    assert r.status_code == 201
    assert r.json()["amount"] == 500.0


def test_list_payments(client):
    cr = client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    aid = cr.json()["id"]
    client.post(f"/api/debt/accounts/{aid}/payment", json={
        "date": str(date.today()), "amount": 200.0,
    })
    r = client.get(f"/api/debt/accounts/{aid}/payments")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_payment_nonexistent_account(client):
    r = client.post("/api/debt/accounts/9999/payment", json={
        "date": str(date.today()), "amount": 100.0,
    })
    assert r.status_code == 404


# --- Summaries and Plans ---

def test_debt_summary(client):
    client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    r = client.get("/api/debt/summary")
    assert r.status_code == 200
    data = r.json()
    assert data["total_debt"] >= 5000.0
    assert data["debt_count"] >= 1


def test_payoff_plan(client):
    client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    r = client.get("/api/debt/payoff-plan?strategy=avalanche")
    assert r.status_code == 200
    data = r.json()
    assert data["strategy"] == "avalanche"
    assert data["total_months"] > 0


def test_compare_strategies(client):
    client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    r = client.get("/api/debt/compare-strategies")
    assert r.status_code == 200
    data = r.json()
    assert "snowball" in data
    assert "avalanche" in data


def test_what_if(client):
    client.post("/api/debt/accounts", json=SAMPLE_ACCOUNT)
    r = client.get("/api/debt/what-if?extra=200")
    assert r.status_code == 200
    data = r.json()
    assert data["extra_monthly"] == 200.0
    assert data["months_saved"] >= 0


# --- CentsType ---

def test_cents_precision_debt(client):
    cr = client.post("/api/debt/accounts", json={
        **SAMPLE_ACCOUNT, "current_balance": 1234.56, "original_balance": 9876.54,
    })
    aid = cr.json()["id"]
    data = client.get(f"/api/debt/accounts/{aid}").json()
    assert data["current_balance"] == 1234.56
    assert data["original_balance"] == 9876.54

"""Transactions router tests — CRUD, filtering, split, duplicate check, velocity."""

from datetime import date, timedelta


# --- CRUD ---

def test_create_transaction(client):
    r = client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 45.50,
        "description": "Grocery run", "merchant": "Whole Foods",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["amount"] == 45.50
    assert data["merchant"] == "Whole Foods"
    assert data["is_income"] is False


def test_get_transaction(client):
    cr = client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 20.0, "description": "Coffee",
    })
    tid = cr.json()["id"]
    r = client.get(f"/api/transactions/{tid}")
    assert r.status_code == 200
    assert r.json()["description"] == "Coffee"


def test_get_transaction_not_found(client):
    assert client.get("/api/transactions/9999").status_code == 404


def test_update_transaction(client):
    cr = client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 10.0, "description": "Snack",
    })
    tid = cr.json()["id"]
    r = client.put(f"/api/transactions/{tid}", json={"amount": 12.0})
    assert r.status_code == 200
    assert r.json()["amount"] == 12.0


def test_delete_transaction(client):
    cr = client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 5.0, "description": "Gum",
    })
    tid = cr.json()["id"]
    assert client.delete(f"/api/transactions/{tid}").status_code == 204
    assert client.get(f"/api/transactions/{tid}").status_code == 404


# --- Filtering ---

def test_list_with_date_range(client):
    today = date.today()
    client.post("/api/transactions/", json={
        "date": str(today), "amount": 10.0, "description": "Today",
    })
    client.post("/api/transactions/", json={
        "date": str(today - timedelta(days=30)), "amount": 20.0, "description": "Old",
    })
    r = client.get(f"/api/transactions/?start_date={today}&end_date={today}")
    assert r.status_code == 200
    assert all(t["date"] == str(today) for t in r.json())


def test_list_with_pagination(client):
    for i in range(5):
        client.post("/api/transactions/", json={
            "date": str(date.today()), "amount": float(i + 1), "description": f"Tx {i}",
        })
    r = client.get("/api/transactions/?limit=2&offset=0")
    assert len(r.json()) == 2
    r2 = client.get("/api/transactions/?limit=2&offset=2")
    assert len(r2.json()) == 2


def test_list_by_income(client):
    client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 100.0,
        "description": "Salary", "is_income": True,
    })
    client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 50.0, "description": "Expense",
    })
    r = client.get("/api/transactions/?is_income=true")
    assert all(t["is_income"] is True for t in r.json())


def test_merchant_search_escapes_wildcards(client):
    client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 10.0,
        "description": "Special", "merchant": "100% Natural",
    })
    r = client.get("/api/transactions/?merchant=100%25")
    assert r.status_code == 200


# --- By Category ---

def test_list_by_category(client):
    cat = client.post("/api/budget/categories", json={
        "name": "Test Cat", "budget_amount": 100.0,
    })
    cid = cat.json()["id"]
    client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 25.0,
        "description": "Categorized", "category_id": cid,
    })
    r = client.get(f"/api/transactions/?category_id={cid}")
    assert r.status_code == 200
    assert len(r.json()) >= 1


# --- Duplicate Check ---

def test_check_duplicate_no_match(client):
    r = client.get(f"/api/transactions/check-duplicate?amount=99.99&merchant=Nowhere&txn_date={date.today()}")
    assert r.status_code == 200
    assert r.json()["is_duplicate"] is False


# --- Spending Velocity ---

def test_spending_velocity(client):
    r = client.get("/api/transactions/spending-velocity")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- Split ---

def test_split_transaction(client):
    cat1 = client.post("/api/budget/categories", json={"name": "Cat1", "budget_amount": 100.0})
    cat2 = client.post("/api/budget/categories", json={"name": "Cat2", "budget_amount": 100.0})
    r = client.post("/api/transactions/split", json={
        "date": str(date.today()), "total_amount": 100.0,
        "description": "Split purchase",
        "splits": [
            {"category_id": cat1.json()["id"], "amount": 60.0},
            {"category_id": cat2.json()["id"], "amount": 40.0},
        ],
    })
    assert r.status_code == 201
    assert len(r.json()) == 2


# --- CentsType ---

def test_cents_precision(client):
    cr = client.post("/api/transactions/", json={
        "date": str(date.today()), "amount": 19.99, "description": "Precision",
    })
    tid = cr.json()["id"]
    assert client.get(f"/api/transactions/{tid}").json()["amount"] == 19.99

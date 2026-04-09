"""Property router tests — properties, units, tenants, leases, rent, expenses, deposits, mortgages, analytics."""

from datetime import date, timedelta


# --- Helpers ---

def _create_property(client, **overrides):
    data = {"name": "Test Property", "address": "123 Main St",
            "property_type": "single_family", "purchase_price": 250000.0,
            "current_value": 300000.0, **overrides}
    return client.post("/api/property/properties", json=data)


def _create_unit(client, property_id, **overrides):
    data = {"unit_number": "1A", "bedrooms": 2, "bathrooms": 1.0,
            "sqft": 900, "monthly_rent": 1200.0, **overrides}
    return client.post(f"/api/property/properties/{property_id}/units", json=data)


def _create_tenant(client, **overrides):
    data = {"name": "John Doe", "email": "john@test.com",
            "phone": "555-1234", **overrides}
    return client.post("/api/property/tenants", json=data)


def _create_lease(client, unit_id, tenant_id, **overrides):
    data = {"unit_id": unit_id, "tenant_id": tenant_id,
            "start_date": str(date.today()), "end_date": str(date.today() + timedelta(days=365)),
            "monthly_rent": 1200.0, "security_deposit": 1200.0, **overrides}
    return client.post("/api/property/leases", json=data)


# --- Properties CRUD ---

def test_create_property(client):
    r = _create_property(client)
    assert r.status_code == 201
    assert r.json()["name"] == "Test Property"


def test_list_properties(client):
    _create_property(client, name="Prop A")
    _create_property(client, name="Prop B")
    r = client.get("/api/property/properties")
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_get_property(client):
    pid = _create_property(client).json()["id"]
    r = client.get(f"/api/property/properties/{pid}")
    assert r.status_code == 200
    assert r.json()["name"] == "Test Property"


def test_get_property_not_found(client):
    assert client.get("/api/property/properties/9999").status_code == 404


def test_update_property(client):
    pid = _create_property(client).json()["id"]
    r = client.put(f"/api/property/properties/{pid}", json={"name": "Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"


def test_delete_property(client):
    pid = _create_property(client).json()["id"]
    assert client.delete(f"/api/property/properties/{pid}").status_code == 204


# --- Units ---

def test_create_unit(client):
    pid = _create_property(client).json()["id"]
    r = _create_unit(client, pid)
    assert r.status_code == 201
    assert r.json()["unit_number"] == "1A"


def test_list_units(client):
    pid = _create_property(client).json()["id"]
    _create_unit(client, pid, unit_number="1A")
    _create_unit(client, pid, unit_number="1B")
    r = client.get(f"/api/property/properties/{pid}/units")
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_update_unit(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    r = client.put(f"/api/property/units/{uid}", json={"monthly_rent": 1500.0})
    assert r.status_code == 200
    assert r.json()["monthly_rent"] == 1500.0


def test_delete_unit(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    assert client.delete(f"/api/property/units/{uid}").status_code == 204


# --- Tenants ---

def test_create_tenant(client):
    r = _create_tenant(client)
    assert r.status_code == 201
    assert r.json()["name"] == "John Doe"


def test_list_tenants(client):
    _create_tenant(client, name="Alice")
    _create_tenant(client, name="Bob")
    r = client.get("/api/property/tenants")
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_get_tenant(client):
    tid = _create_tenant(client).json()["id"]
    r = client.get(f"/api/property/tenants/{tid}")
    assert r.status_code == 200
    assert r.json()["name"] == "John Doe"


def test_get_tenant_not_found(client):
    assert client.get("/api/property/tenants/9999").status_code == 404


def test_update_tenant(client):
    tid = _create_tenant(client).json()["id"]
    r = client.put(f"/api/property/tenants/{tid}", json={"name": "Jane Doe"})
    assert r.status_code == 200
    assert r.json()["name"] == "Jane Doe"


def test_delete_tenant(client):
    tid = _create_tenant(client).json()["id"]
    assert client.delete(f"/api/property/tenants/{tid}").status_code == 204


# --- Leases ---

def test_create_lease(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    r = _create_lease(client, uid, tid)
    assert r.status_code == 201
    assert r.json()["monthly_rent"] == 1200.0


def test_list_leases(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    _create_lease(client, uid, tid)
    r = client.get("/api/property/leases")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_lease(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    lid = _create_lease(client, uid, tid).json()["id"]
    r = client.get(f"/api/property/leases/{lid}")
    assert r.status_code == 200


def test_update_lease(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    lid = _create_lease(client, uid, tid).json()["id"]
    r = client.put(f"/api/property/leases/{lid}", json={"monthly_rent": 1400.0})
    assert r.status_code == 200
    assert r.json()["monthly_rent"] == 1400.0


def test_expiring_leases(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    _create_lease(client, uid, tid, end_date=str(date.today() + timedelta(days=30)))
    r = client.get("/api/property/leases/expiring?days=90")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_renew_lease(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    lid = _create_lease(client, uid, tid).json()["id"]
    new_start = str(date.today() + timedelta(days=366))
    new_end = str(date.today() + timedelta(days=730))
    r = client.post(f"/api/property/leases/{lid}/renew", json={
        "unit_id": uid, "tenant_id": tid,
        "start_date": new_start, "end_date": new_end,
        "monthly_rent": 1300.0,
    })
    assert r.status_code == 201


# --- Rent Payments ---

def test_create_rent_payment(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    lid = _create_lease(client, uid, tid).json()["id"]
    r = client.post("/api/property/rent-payments", json={
        "lease_id": lid, "period_month": "2026-03",
        "amount_due": 1200.0, "amount_paid": 1200.0,
        "paid_date": str(date.today()), "status": "paid",
    })
    assert r.status_code == 201
    assert r.json()["amount_due"] == 1200.0


def test_list_rent_payments(client):
    r = client.get("/api/property/rent-payments")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_overdue_rent_payments(client):
    r = client.get("/api/property/rent-payments/overdue")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- Property Expenses ---

def test_create_expense(client):
    pid = _create_property(client).json()["id"]
    r = client.post("/api/property/expenses", json={
        "property_id": pid, "category": "repair",
        "amount": 500.0, "date": str(date.today()),
        "vendor": "HandyPro", "description": "Plumbing fix",
    })
    assert r.status_code == 201
    assert r.json()["amount"] == 500.0


def test_list_expenses(client):
    pid = _create_property(client).json()["id"]
    client.post("/api/property/expenses", json={
        "property_id": pid, "amount": 100.0, "date": str(date.today()),
    })
    r = client.get(f"/api/property/properties/{pid}/expenses")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_delete_expense(client):
    pid = _create_property(client).json()["id"]
    eid = client.post("/api/property/expenses", json={
        "property_id": pid, "amount": 100.0, "date": str(date.today()),
    }).json()["id"]
    assert client.delete(f"/api/property/expenses/{eid}").status_code == 204


# --- Security Deposits ---

def test_create_security_deposit(client):
    pid = _create_property(client).json()["id"]
    uid = _create_unit(client, pid).json()["id"]
    tid = _create_tenant(client).json()["id"]
    lid = _create_lease(client, uid, tid).json()["id"]
    r = client.post("/api/property/security-deposits", json={
        "lease_id": lid, "amount": 1200.0,
        "date_received": str(date.today()),
    })
    assert r.status_code == 201
    assert r.json()["amount"] == 1200.0


def test_list_security_deposits(client):
    r = client.get("/api/property/security-deposits")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- Mortgages ---

def test_create_mortgage(client):
    pid = _create_property(client).json()["id"]
    r = client.post("/api/property/mortgages", json={
        "property_id": pid, "lender": "Big Bank",
        "original_amount": 200000.0, "current_balance": 180000.0,
        "interest_rate": 4.5, "monthly_payment": 1200.0,
        "term_years": 30,
    })
    assert r.status_code == 201
    assert r.json()["lender"] == "Big Bank"


def test_list_mortgages(client):
    pid = _create_property(client).json()["id"]
    client.post("/api/property/mortgages", json={
        "property_id": pid, "original_amount": 200000.0,
        "current_balance": 180000.0, "interest_rate": 4.5,
        "monthly_payment": 1200.0,
    })
    r = client.get(f"/api/property/properties/{pid}/mortgages")
    assert r.status_code == 200
    assert len(r.json()) >= 1


# --- Analytics ---

def test_property_metrics(client):
    pid = _create_property(client).json()["id"]
    r = client.get(f"/api/property/properties/{pid}/metrics")
    assert r.status_code == 200
    data = r.json()
    assert "noi" in data
    assert "cash_flow" in data


def test_vacancies(client):
    r = client.get("/api/property/vacancies")
    assert r.status_code == 200
    data = r.json()
    assert "total_vacant_units" in data


# --- Intelligence ---

def test_property_intelligence(client):
    pid = _create_property(client).json()["id"]
    r = client.get(f"/api/property/properties/{pid}/intelligence")
    assert r.status_code == 200
    data = r.json()
    assert "vacancy" in data
    assert "maintenance" in data
    assert "insights" in data


def test_portfolio_score(client):
    r = client.get("/api/property/portfolio-score")
    assert r.status_code == 200
    data = r.json()
    assert "score" in data
    assert "property_count" in data


# --- Rent Roll & P&L ---

def test_rent_roll(client):
    pid = _create_property(client).json()["id"]
    r = client.get(f"/api/property/properties/{pid}/rent-roll")
    assert r.status_code == 200


def test_property_pnl(client):
    pid = _create_property(client).json()["id"]
    start = str(date.today() - timedelta(days=90))
    end = str(date.today())
    r = client.get(f"/api/property/properties/{pid}/pnl?start={start}&end={end}")
    assert r.status_code == 200

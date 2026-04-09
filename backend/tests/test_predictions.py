"""Predictions router tests — meal drafts, bill predictions, spending velocity."""

from datetime import date, timedelta


# --- Meal Drafts ---

def test_get_meal_drafts(client):
    monday = date.today() - timedelta(days=date.today().weekday())
    r = client.get(f"/api/predictions/meal-drafts/{monday}")
    assert r.status_code == 200
    data = r.json()
    assert "suggestions" in data
    assert "total_suggestions" in data


def test_apply_meal_drafts_empty(client):
    r = client.post("/api/predictions/meal-drafts/apply", json={
        "suggestions": [], "overwrite_existing": False,
    })
    assert r.status_code == 200
    assert r.json()["created"] == 0


# --- Bill Predictions ---

def test_get_bill_predictions(client):
    monday = date.today() - timedelta(days=date.today().weekday())
    r = client.get(f"/api/predictions/bill-predictions/{monday}?window_days=14")
    assert r.status_code == 200
    data = r.json()
    assert "predictions" in data
    assert data["window_days"] == 14


# --- Spending Velocity ---

def test_spending_velocity_predictions(client):
    r = client.get("/api/predictions/spending-velocity?days=30")
    assert r.status_code == 200
    data = r.json()
    assert "insights" in data
    assert data["period_days"] == 30

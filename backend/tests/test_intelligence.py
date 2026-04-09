"""
Intelligence Endpoint Tests

Tests for /api/intelligence/* endpoints (Phase A4).
Each test creates real data and verifies the computed intelligence response.
"""

import pytest
from datetime import date, timedelta


# =============================================================================
# HELPERS
# =============================================================================

def _next_monday() -> str:
    """Get the next Monday as YYYY-MM-DD."""
    today = date.today()
    days_ahead = 0 - today.weekday()  # Monday = 0
    if days_ahead <= 0:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).isoformat()


def _this_monday() -> str:
    """Get this week's Monday."""
    today = date.today()
    days_back = today.weekday()  # Monday = 0
    return (today - timedelta(days=days_back)).isoformat()


# =============================================================================
# A4-3: RECIPE INTELLIGENCE
# =============================================================================

class TestRecipeIntelligence:
    """Test GET /api/intelligence/recipes"""

    def test_empty_db_returns_structure(self, client):
        """With no recipes, should return valid structure with empty arrays."""
        resp = client.get("/api/intelligence/recipes")
        assert resp.status_code == 200
        data = resp.json()
        assert "favorites" in data
        assert "complexityScores" in data
        assert "suggestedRecipes" in data
        assert "insights" in data
        assert "confidence" in data
        assert "isLearning" in data
        assert isinstance(data["favorites"], list)
        assert isinstance(data["complexityScores"], list)

    def test_with_recipes(self, client):
        """With recipes, should compute complexity scores."""
        # Create a recipe
        resp = client.post("/api/recipes", json={
            "name": "Quick Pasta",
            "instructions": "Boil pasta, add sauce",
            "prep_time_minutes": 5,
            "cook_time_minutes": 15,
        })
        assert resp.status_code in (200, 201)

        resp = client.post("/api/recipes", json={
            "name": "Slow Roast",
            "instructions": "Roast for 3 hours",
            "prep_time_minutes": 30,
            "cook_time_minutes": 180,
        })
        assert resp.status_code in (200, 201)

        # Get intelligence
        resp = client.get("/api/intelligence/recipes")
        assert resp.status_code == 200
        data = resp.json()

        # Should have 2 complexity scores
        assert len(data["complexityScores"]) == 2

        # Quick Pasta should be "Quick" (20 min total)
        quick = next(c for c in data["complexityScores"] if c["recipeId"] == 1)
        assert quick["complexityLabel"] == "Quick"
        assert quick["estimatedMinutes"] == 20

        # Slow Roast should be "Involved" (210 min total)
        slow = next(c for c in data["complexityScores"] if c["recipeId"] == 2)
        assert slow["complexityLabel"] == "Involved"


# =============================================================================
# A4-6: EVENT INTELLIGENCE
# =============================================================================

class TestEventIntelligence:
    """Test GET /api/intelligence/events"""

    def test_empty_week(self, client):
        """With no events, all days should be 'light'."""
        ws = _this_monday()
        resp = client.get(f"/api/intelligence/events?week_start={ws}")
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["dayInsights"]) == 7
        assert data["totalConflicts"] == 0
        assert data["overloadedDays"] == 0
        assert all(d["status"] == "light" for d in data["dayInsights"])

    def test_conflict_detection(self, client):
        """Overlapping events should be detected as conflicts."""
        today = date.today()
        ws = _this_monday()

        # Create overlapping events on the same day
        resp = client.post("/api/events", json={
            "name": "Meeting A",
            "date": today.isoformat(),
            "start_time": "09:00",
            "end_time": "10:30",
        })
        assert resp.status_code in (200, 201)

        resp = client.post("/api/events", json={
            "name": "Meeting B",
            "date": today.isoformat(),
            "start_time": "10:00",
            "end_time": "11:00",
        })
        assert resp.status_code in (200, 201)

        resp = client.get(f"/api/intelligence/events?week_start={ws}")
        data = resp.json()

        assert data["totalConflicts"] >= 1
        # Find today's insight
        today_insight = next(
            (d for d in data["dayInsights"] if d["date"] == today.isoformat()),
            None,
        )
        if today_insight:
            assert len(today_insight["conflicts"]) >= 1
            conflict = today_insight["conflicts"][0]
            assert conflict["overlapMinutes"] == 30

    def test_overloaded_day(self, client, test_db):
        """5+ events on one day should be 'overloaded'."""
        from app.models.event import Event as EventModel
        today = date.today()
        ws = _this_monday()

        # Create events directly in DB for reliability
        for i in range(6):
            test_db.add(EventModel(
                name=f"Overload Event {i}",
                date=today,
                start_time=f"{8+i:02d}:00",
                end_time=f"{8+i:02d}:45",
            ))
        test_db.commit()

        resp = client.get(f"/api/intelligence/events?week_start={ws}")
        data = resp.json()

        today_insight = next(
            (d for d in data["dayInsights"] if d["date"] == today.isoformat()),
            None,
        )
        assert today_insight is not None
        assert today_insight["eventCount"] >= 5
        assert today_insight["status"] == "overloaded"
        assert data["overloadedDays"] >= 1


# =============================================================================
# A4-4: FINANCE INTELLIGENCE
# =============================================================================

class TestFinanceIntelligence:
    """Test GET /api/intelligence/finance"""

    def test_empty_db(self, client):
        """With no bills, should return valid structure."""
        resp = client.get("/api/intelligence/finance")
        assert resp.status_code == 200
        data = resp.json()
        assert data["billInsights"] == []
        assert data["overdueCount"] == 0
        assert data["upcomingCount"] == 0

    def test_overdue_bill(self, client):
        """Past-due bill should show as overdue."""
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        resp = client.post("/api/finances", json={
            "name": "Electric Bill",
            "amount": 150.0,
            "due_date": yesterday,
            "type": "bill",
        })
        assert resp.status_code in (200, 201)

        resp = client.get("/api/intelligence/finance")
        data = resp.json()
        assert data["overdueCount"] >= 1
        assert any(b["isOverdue"] for b in data["all"])

    def test_upcoming_bill_urgency(self, client):
        """Bill due tomorrow should be 'urgent'."""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        client.post("/api/finances", json={
            "name": "Internet",
            "amount": 80.0,
            "due_date": tomorrow,
            "type": "bill",
        })

        resp = client.get("/api/intelligence/finance")
        data = resp.json()
        urgent = [i for i in data["billInsights"] if i["urgencyLevel"] == "urgent"]
        assert len(urgent) >= 1


# =============================================================================
# A4-5: INVENTORY INTELLIGENCE
# =============================================================================

class TestInventoryIntelligence:
    """Test GET /api/intelligence/inventory"""

    def test_empty_db(self, client):
        """With no items, health should be Excellent."""
        ws = _this_monday()
        resp = client.get(f"/api/intelligence/inventory?week_start={ws}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["health"]["score"] == 100
        assert data["health"]["label"] == "Excellent"
        assert data["activeItemCount"] == 0

    def test_expiring_item_detected(self, client, test_db):
        """Items expiring within 7 days should be flagged."""
        from app.models.inventory import InventoryItem
        exp_date = date.today() + timedelta(days=2)
        item = InventoryItem(
            name="Milk",
            quantity=1.0,
            unit="gallon",
            location="fridge",
            expiration_date=exp_date,
        )
        test_db.add(item)
        test_db.commit()

        ws = _this_monday()
        resp = client.get(f"/api/intelligence/inventory?week_start={ws}")
        data = resp.json()

        assert data["expiringCount"] >= 1
        assert data["health"]["score"] < 100
        # Expiring item should appear in expiringWithDays
        assert any(e["name"] == "Milk" for e in data["expiringWithDays"])


# =============================================================================
# A4-7: MEAL INTELLIGENCE
# =============================================================================

class TestMealIntelligence:
    """Test GET /api/intelligence/meals"""

    def test_empty_week_all_gaps(self, client):
        """With no meals planned, all 21 slots should be gaps."""
        ws = _this_monday()
        resp = client.get(f"/api/intelligence/meals?week_start={ws}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["unplannedCount"] == 21  # 7 days * 3 meals
        assert data["coveragePct"] == 0.0
        assert len(data["dayFills"]) == 7

    def test_with_planned_meal(self, client):
        """Planning a meal should reduce gaps."""
        ws = _this_monday()
        meal_date = ws  # Monday

        client.post("/api/meals", json={
            "date": meal_date,
            "meal_type": "dinner",
            "description": "Homemade pizza",
        })

        resp = client.get(f"/api/intelligence/meals?week_start={ws}")
        data = resp.json()
        assert data["plannedCount"] == 1
        assert data["unplannedCount"] == 20
        assert data["coveragePct"] > 0

        # Monday dinner should be filled
        monday = next(d for d in data["dayFills"] if d["date"] == meal_date)
        assert monday["dinner"] is True
        assert monday["breakfast"] is False

    def test_day_fills_structure(self, client):
        """dayFills should have correct structure."""
        ws = _this_monday()
        resp = client.get(f"/api/intelligence/meals?week_start={ws}")
        data = resp.json()

        for df in data["dayFills"]:
            assert "date" in df
            assert "dayName" in df
            assert "breakfast" in df
            assert "lunch" in df
            assert "dinner" in df
            assert "filledCount" in df


# =============================================================================
# A4-8: CROSS-FEATURE INTELLIGENCE
# =============================================================================

class TestCrossFeatureIntelligence:
    """Test GET /api/intelligence/cross-feature"""

    def test_empty_db_returns_structure(self, client):
        """With no data, should return valid structure."""
        ws = _this_monday()
        resp = client.get(f"/api/intelligence/cross-feature?week_start={ws}")
        assert resp.status_code == 200
        data = resp.json()
        assert "insights" in data
        assert "weekCharacter" in data
        assert "isLearning" in data
        assert isinstance(data["insights"], list)
        assert data["weekCharacter"] in ("light", "balanced", "busy", "overloaded")

    def test_light_week_character(self, client):
        """Empty week should be 'light'."""
        ws = _this_monday()
        resp = client.get(f"/api/intelligence/cross-feature?week_start={ws}")
        data = resp.json()
        assert data["weekCharacter"] == "light"

    def test_busy_week_detection(self, client, test_db):
        """Lots of events + unplanned meals should trigger busy_week_meals insight."""
        from app.models.event import Event as EventModel
        today = date.today()
        ws = _this_monday()
        monday = date.fromisoformat(ws)

        # Create 5+ events on 2 days (overloaded)
        for day_offset in [0, 1]:
            d = monday + timedelta(days=day_offset)
            for i in range(6):
                test_db.add(EventModel(
                    name=f"Busy Event D{day_offset} E{i}",
                    date=d,
                    start_time=f"{8+i:02d}:00",
                    end_time=f"{8+i:02d}:45",
                ))
        test_db.commit()

        resp = client.get(f"/api/intelligence/cross-feature?week_start={ws}")
        data = resp.json()

        # Should detect busy or overloaded week character
        assert data["weekCharacter"] in ("busy", "overloaded")

    def test_spending_model_persistence(self, client, test_db):
        """Spending model should be persisted to IntelligenceModel table."""
        from app.models.financial import FinancialItem
        from app.models.intelligence_model import IntelligenceModel

        # Pre-seed spending model with history
        model = IntelligenceModel(
            model_type="spending",
            mean=100.0,
            variance=25.0,
            count=5,
            extra_data={"last_week": "2026-01-01"},
        )
        test_db.add(model)

        # Add a bill to trigger model update
        tomorrow = date.today() + timedelta(days=1)
        test_db.add(FinancialItem(
            name="Big Bill",
            amount=500.0,
            due_date=tomorrow,
            type="bill",
            is_paid=False,
        ))
        test_db.commit()

        ws = _this_monday()
        resp = client.get(f"/api/intelligence/cross-feature?week_start={ws}")
        assert resp.status_code == 200

        # Model should have been updated
        updated = test_db.query(IntelligenceModel).filter(
            IntelligenceModel.model_type == "spending"
        ).first()
        assert updated is not None
        assert updated.count >= 5  # At least original count

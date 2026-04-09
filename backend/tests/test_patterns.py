"""
Tests for Patterns API endpoints.

Tests intelligence/pattern endpoints with empty DB to ensure
graceful defaults and valid response structures.
"""

import pytest
from datetime import date, timedelta


class TestTemporalPatterns:
    """Test temporal pattern endpoints."""

    def test_get_temporal_patterns_empty_db(self, client):
        """Temporal patterns on empty DB returns valid defaults."""
        response = client.get("/api/patterns/temporal")
        assert response.status_code == 200
        data = response.json()
        assert "planning_time" in data
        assert "peak_hours" in data
        assert isinstance(data["peak_hours"], list)
        assert "events_by_day" in data
        assert "events_by_hour" in data


class TestBehavioralPatterns:
    """Test behavioral pattern endpoints."""

    def test_get_behavioral_patterns_empty_db(self, client):
        """Behavioral patterns on empty DB returns valid defaults."""
        response = client.get("/api/patterns/behavioral")
        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert "view_preferences" in data
        assert isinstance(data["view_preferences"], list)
        assert "action_frequency" in data
        assert isinstance(data["action_frequency"], list)


class TestDomainPatterns:
    """Test domain-specific pattern endpoints."""

    def test_day_health_empty_db(self, client):
        """Day health on empty DB returns valid structure."""
        today = str(date.today())
        response = client.get(f"/api/patterns/day-health/{today}")
        assert response.status_code == 200
        data = response.json()
        assert "score" in data
        assert 0 <= data["score"] <= 100
        assert "status" in data
        assert data["status"] in ("light", "balanced", "busy", "overloaded")
        assert "event_count" in data
        assert "has_conflicts" in data

    def test_week_summary_empty_db(self, client):
        """Week summary on empty DB returns valid structure."""
        ws = date.today() - timedelta(days=date.today().weekday())
        response = client.get(f"/api/patterns/week-summary/{ws}")
        assert response.status_code == 200
        data = response.json()
        assert "week_start" in data
        assert "week_end" in data
        assert "busy_days" in data
        assert "total_bills_due" in data
        assert "summary_sentence" in data

    def test_conflicts_empty_db(self, client):
        """Conflicts on empty DB returns empty list."""
        ws = date.today() - timedelta(days=date.today().weekday())
        response = client.get(f"/api/patterns/conflicts/{ws}")
        assert response.status_code == 200
        assert response.json() == []

    def test_spending_trends_empty_db(self, client):
        """Spending trends on empty DB returns valid structure."""
        response = client.get("/api/patterns/spending-trends")
        assert response.status_code == 200
        data = response.json()
        assert "current_week" in data
        assert "four_week_average" in data
        assert "trend" in data

    def test_meal_gaps_empty_db(self, client):
        """Meal gaps on empty DB returns unplanned slots."""
        ws = date.today() - timedelta(days=date.today().weekday())
        response = client.get(f"/api/patterns/meal-gaps/{ws}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Empty DB means all slots are unplanned
        assert len(data) > 0


class TestDomainIntelligenceEndpoints:
    """Test Phase 4B-2 domain intelligence endpoints."""

    def test_recurring_meals_empty_db(self, client):
        """Recurring meals on empty DB returns empty list."""
        response = client.get("/api/patterns/recurring-meals")
        assert response.status_code == 200
        assert response.json() == []

    def test_ingredient_variety_empty_db(self, client):
        """Ingredient variety on empty DB returns neutral score."""
        ws = date.today() - timedelta(days=date.today().weekday())
        response = client.get(f"/api/patterns/ingredient-variety/{ws}")
        assert response.status_code == 200
        data = response.json()
        assert "variety_score" in data
        assert "repeated_ingredients" in data
        assert data["variety_score"] == 1.0  # No meals = perfect variety

    def test_restocking_predictions_empty_db(self, client):
        """Restocking predictions on empty DB returns empty list."""
        response = client.get("/api/patterns/restocking-predictions")
        assert response.status_code == 200
        assert response.json() == []

    def test_low_stock_meals_empty_db(self, client):
        """Low stock meals on empty DB returns empty list."""
        ws = date.today() - timedelta(days=date.today().weekday())
        response = client.get(f"/api/patterns/low-stock-meals/{ws}")
        assert response.status_code == 200
        assert response.json() == []

    def test_tracking_suggestions_empty_db(self, client):
        """Tracking suggestions on empty DB returns empty list."""
        response = client.get("/api/patterns/tracking-suggestions")
        assert response.status_code == 200
        assert response.json() == []


class TestCombinedPatterns:
    """Test combined pattern endpoints."""

    def test_get_all_patterns_empty_db(self, client):
        """All patterns on empty DB returns valid combined structure."""
        response = client.get("/api/patterns/all")
        assert response.status_code == 200
        data = response.json()
        assert "temporal" in data
        assert "behavioral" in data
        assert "week_summary" in data
        assert "day_healths" in data
        assert "conflicts" in data
        assert "spending_trend" in data
        assert "meal_gaps" in data

    def test_get_insights_empty_db(self, client):
        """Insights on empty DB returns valid list."""
        response = client.get("/api/patterns/insights")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestConfidenceEndpoint:
    """Test confidence scoring endpoint."""

    def test_confidence_empty_db(self, client):
        """Confidence on empty DB returns valid structure."""
        response = client.get("/api/patterns/confidence")
        assert response.status_code == 200
        data = response.json()
        assert "temporal" in data
        assert "behavioral" in data
        assert "overall" in data
        assert "ready_for_surfacing" in data
        assert isinstance(data["temporal"], (int, float))
        assert isinstance(data["behavioral"], (int, float))
        assert isinstance(data["overall"], (int, float))
        assert isinstance(data["ready_for_surfacing"], bool)
        # On empty DB, should indicate cold start
        assert "is_cold_start" in data
        assert "session_count" in data


class TestHabitEndpoints:
    """Test habit streak endpoints."""

    def test_get_all_habits_empty(self, client):
        """Get all habits when none exist returns empty list."""
        response = client.get("/api/patterns/habits")
        assert response.status_code == 200
        assert response.json() == []

    def test_get_habit_summary_empty(self, client):
        """Get habit summary when none exist returns valid empty structure."""
        response = client.get("/api/patterns/habits/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["has_data"] is False
        assert data["habits_tracked"] == 0

    def test_get_habit_creates_if_missing(self, client):
        """Get a habit by name creates it if it doesn't exist."""
        response = client.get("/api/patterns/habits/meal_prep")
        assert response.status_code == 200
        data = response.json()
        assert data["habit_name"] == "meal_prep"
        assert data["current_streak"] == 0
        assert "display" in data

    def test_record_habit_occurrence(self, client):
        """Record a habit occurrence increments streak."""
        # First, create the habit
        client.get("/api/patterns/habits/exercise")

        # Record occurrence
        response = client.post("/api/patterns/habits/exercise/record", json={
            "occurred": True,
        })
        assert response.status_code == 201
        data = response.json()
        assert data["habit"] == "exercise"
        assert data["action"] == "increment"
        assert "display" in data

    def test_record_habit_not_occurred_uses_token(self, client):
        """Record a non-occurrence uses forgiveness token."""
        # Create habit (will have default 2 tokens)
        client.get("/api/patterns/habits/reading")

        # Record non-occurrence
        response = client.post("/api/patterns/habits/reading/record", json={
            "occurred": False,
        })
        assert response.status_code == 201
        data = response.json()
        assert data["action"] == "token_used"

    def test_habit_name_too_long(self, client):
        """Habit name longer than 100 chars returns 422."""
        long_name = "a" * 101
        response = client.get(f"/api/patterns/habits/{long_name}")
        assert response.status_code == 422


class TestRecipePatterns:
    """Test recipe pattern endpoints."""

    def test_cooking_history_empty(self, client, sample_recipe):
        """Get cooking history for recipe with no history returns empty list."""
        create_resp = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_resp.json()["id"]

        response = client.get(f"/api/patterns/recipes/{recipe_id}/cooking-history")
        assert response.status_code == 200
        assert response.json() == []

    def test_duration_estimate_no_history(self, client, sample_recipe):
        """Duration estimate with no cooking history falls back to recipe defaults."""
        create_resp = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_resp.json()["id"]

        response = client.get(f"/api/patterns/recipes/{recipe_id}/duration-estimate")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "recipe"
        assert data["confidence"] == 0.0

    def test_chef_notes_empty(self, client, sample_recipe):
        """Chef notes for recipe with no history returns empty list."""
        create_resp = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_resp.json()["id"]

        response = client.get(f"/api/patterns/recipes/{recipe_id}/chef-notes")
        assert response.status_code == 200
        assert response.json() == []

    def test_recipe_insights_valid_structure(self, client, sample_recipe):
        """Recipe insights returns valid combined structure."""
        create_resp = client.post("/api/recipes", json=sample_recipe)
        recipe_id = create_resp.json()["id"]

        response = client.get(f"/api/patterns/recipes/{recipe_id}/insights")
        assert response.status_code == 200
        data = response.json()
        assert data["recipe_id"] == recipe_id
        assert "duration_estimate" in data
        assert "chef_notes" in data

    def test_all_time_suggestions_empty(self, client):
        """All time suggestions with no data returns empty list."""
        response = client.get("/api/patterns/recipes/time-suggestions")
        assert response.status_code == 200
        assert response.json() == []

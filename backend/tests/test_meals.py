"""
Tests for Meals API endpoints.
"""

import pytest
from datetime import date, timedelta


class TestMealsAPI:
    """Test Meal Plan CRUD operations."""

    def test_list_meals_empty(self, client):
        """Test listing meals when none exist."""
        response = client.get("/api/meals")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_meal(self, client, sample_meal):
        """Test creating a new meal plan entry."""
        response = client.post("/api/meals", json=sample_meal)
        assert response.status_code == 201
        data = response.json()
        assert data["date"] == sample_meal["date"]
        assert data["meal_type"] == sample_meal["meal_type"]
        assert data["description"] == sample_meal["description"]
        assert "id" in data

    def test_list_meals_after_create(self, client, sample_meal):
        """Test listing meals after creating one."""
        client.post("/api/meals", json=sample_meal)
        response = client.get("/api/meals")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_get_meal_by_id(self, client, sample_meal):
        """Test getting a single meal by ID."""
        create_response = client.post("/api/meals", json=sample_meal)
        meal_id = create_response.json()["id"]

        response = client.get(f"/api/meals/{meal_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == meal_id

    def test_get_meal_not_found(self, client):
        """Test getting a non-existent meal."""
        response = client.get("/api/meals/9999")
        assert response.status_code == 404

    def test_update_meal(self, client, sample_meal):
        """Test updating a meal plan entry."""
        create_response = client.post("/api/meals", json=sample_meal)
        meal_id = create_response.json()["id"]

        update_data = {"description": "Updated description"}
        response = client.put(f"/api/meals/{meal_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "Updated description"

    def test_update_meal_not_found(self, client):
        """Test updating a non-existent meal."""
        response = client.put("/api/meals/9999", json={"description": "Test"})
        assert response.status_code == 404

    def test_delete_meal(self, client, sample_meal):
        """Test deleting a meal plan entry."""
        create_response = client.post("/api/meals", json=sample_meal)
        meal_id = create_response.json()["id"]

        response = client.delete(f"/api/meals/{meal_id}")
        assert response.status_code == 204

        # Verify deleted
        get_response = client.get(f"/api/meals/{meal_id}")
        assert get_response.status_code == 404

    def test_delete_meal_not_found(self, client):
        """Test deleting a non-existent meal."""
        response = client.delete("/api/meals/9999")
        assert response.status_code == 404

    def test_get_meals_for_week(self, client, week_start):
        """Test getting meals for a specific week."""
        # Create meals for different days in the week
        for i in range(3):
            meal_date = week_start + timedelta(days=i)
            client.post("/api/meals", json={
                "date": str(meal_date),
                "meal_type": "dinner",
                "description": f"Dinner {i}"
            })

        # Create a meal outside the week
        outside_date = week_start + timedelta(days=10)
        client.post("/api/meals", json={
            "date": str(outside_date),
            "meal_type": "dinner",
            "description": "Outside week"
        })

        response = client.get(f"/api/meals/week/{week_start}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_create_meal_updates_existing(self, client, sample_meal):
        """Test that creating a meal for existing date/meal_type updates it."""
        # Create initial meal
        response1 = client.post("/api/meals", json=sample_meal)
        first_id = response1.json()["id"]

        # Create same date/meal_type with different description
        updated_meal = {**sample_meal, "description": "New description"}
        response2 = client.post("/api/meals", json=updated_meal)

        # Should return same ID with updated content
        assert response2.json()["id"] == first_id
        assert response2.json()["description"] == "New description"

        # Should only have one entry
        all_meals = client.get("/api/meals").json()
        assert len(all_meals) == 1

    def test_multiple_meal_types_same_day(self, client):
        """Test creating multiple meal types for the same day."""
        today = str(date.today())

        client.post("/api/meals", json={
            "date": today,
            "meal_type": "breakfast",
            "description": "Eggs"
        })
        client.post("/api/meals", json={
            "date": today,
            "meal_type": "lunch",
            "description": "Sandwich"
        })
        client.post("/api/meals", json={
            "date": today,
            "meal_type": "dinner",
            "description": "Pasta"
        })

        response = client.get("/api/meals")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

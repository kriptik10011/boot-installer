"""
Tests for Categories API endpoints.
"""

import pytest
from datetime import date


class TestEventCategoriesAPI:
    """Test Event Category CRUD operations."""

    def test_list_event_categories_empty(self, client):
        """List event categories when none exist returns empty list."""
        response = client.get("/api/categories/events")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_event_category(self, client):
        """Create a new event category."""
        response = client.post("/api/categories/events", json={"name": "Work"})
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Work"
        assert "id" in data
        assert "created_at" in data

    def test_list_event_categories_after_create(self, client):
        """List event categories after creating one."""
        client.post("/api/categories/events", json={"name": "Personal"})
        response = client.get("/api/categories/events")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Personal"

    def test_create_event_category_validation(self, client):
        """Create event category with empty name returns 422."""
        response = client.post("/api/categories/events", json={"name": ""})
        assert response.status_code == 422


class TestRecipeCategoriesAPI:
    """Test Recipe Category CRUD operations."""

    def test_list_recipe_categories_empty(self, client):
        """List recipe categories when DB is seeded returns seeded categories."""
        response = client.get("/api/categories/recipes")
        assert response.status_code == 200
        # May have seeded categories or empty list
        assert isinstance(response.json(), list)

    def test_create_recipe_category(self, client):
        """Create a new recipe category."""
        response = client.post("/api/categories/recipes", json={"name": "Italian"})
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Italian"
        assert "id" in data

    def test_create_recipe_category_validation(self, client):
        """Create recipe category with empty name returns 422."""
        response = client.post("/api/categories/recipes", json={"name": ""})
        assert response.status_code == 422


class TestFinancialCategoriesAPI:
    """Test Financial Category CRUD operations."""

    def test_list_financial_categories_empty(self, client):
        """List financial categories when none exist returns empty list."""
        response = client.get("/api/categories/finances")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_create_financial_category(self, client):
        """Create a new financial category."""
        response = client.post("/api/categories/finances", json={"name": "Utilities"})
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Utilities"
        assert "id" in data

    def test_create_financial_category_validation(self, client):
        """Create financial category with empty name returns 422."""
        response = client.post("/api/categories/finances", json={"name": ""})
        assert response.status_code == 422

    def test_multiple_financial_categories(self, client):
        """Create multiple financial categories and list them."""
        client.post("/api/categories/finances", json={"name": "Utilities"})
        client.post("/api/categories/finances", json={"name": "Subscriptions"})
        response = client.get("/api/categories/finances")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2

"""
Tests for Inventory API endpoints.

Tests the inventory router CRUD operations directly
(complement to test_inventory_pipeline.py which tests the full data flow).
"""

import pytest
from datetime import date, timedelta


class TestInventoryCategoryAPI:
    """Test inventory category CRUD operations."""

    def test_list_categories_seeded(self, client):
        """List inventory categories returns seeded defaults."""
        response = client.get("/api/inventory/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_create_category(self, client):
        """Create a new inventory category."""
        response = client.post("/api/inventory/categories", json={"name": "Spices"})
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Spices"
        assert "id" in data

    def test_create_duplicate_category(self, client):
        """Creating a duplicate category returns 400."""
        client.post("/api/inventory/categories", json={"name": "TestCat"})
        response = client.post("/api/inventory/categories", json={"name": "TestCat"})
        assert response.status_code == 400

    def test_delete_category(self, client):
        """Delete an inventory category."""
        create_resp = client.post("/api/inventory/categories", json={"name": "TempCat"})
        cat_id = create_resp.json()["id"]

        response = client.delete(f"/api/inventory/categories/{cat_id}")
        assert response.status_code == 204

    def test_delete_category_not_found(self, client):
        """Delete non-existent category returns 404."""
        response = client.delete("/api/inventory/categories/9999")
        assert response.status_code == 404

    def test_create_category_validation_empty_name(self, client):
        """Create category with empty name returns 422."""
        response = client.post("/api/inventory/categories", json={"name": ""})
        assert response.status_code == 422


class TestInventoryItemAPI:
    """Test inventory item CRUD operations."""

    def test_list_items_empty(self, client):
        """List items when none exist returns empty list."""
        response = client.get("/api/inventory/items")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_item(self, client):
        """Create a new inventory item."""
        item_data = {
            "name": "Chicken Breast",
            "quantity": 2.0,
            "unit": "pound",
            "location": "fridge",
        }
        response = client.post("/api/inventory/items", json=item_data)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Chicken Breast"
        assert data["quantity"] == 2.0
        assert data["unit"] == "pound"
        assert data["location"] == "fridge"
        assert "id" in data
        # Expiration should be auto-filled
        assert data["expiration_date"] is not None
        assert data["expiration_auto_filled"] is True
        # ingredient_id should be set
        assert data["ingredient_id"] is not None

    def test_get_item_by_id(self, client):
        """Get a single inventory item by ID."""
        create_resp = client.post("/api/inventory/items", json={
            "name": "Rice",
            "quantity": 5.0,
            "unit": "cup",
            "location": "pantry",
        })
        item_id = create_resp.json()["id"]

        response = client.get(f"/api/inventory/items/{item_id}")
        assert response.status_code == 200
        assert response.json()["id"] == item_id
        assert response.json()["name"] == "Rice"

    def test_get_item_not_found(self, client):
        """Get non-existent item returns 404."""
        response = client.get("/api/inventory/items/9999")
        assert response.status_code == 404

    def test_update_item(self, client):
        """Update an inventory item."""
        create_resp = client.post("/api/inventory/items", json={
            "name": "Flour",
            "quantity": 3.0,
            "unit": "cup",
            "location": "pantry",
        })
        item_id = create_resp.json()["id"]

        response = client.put(f"/api/inventory/items/{item_id}", json={
            "quantity": 1.5,
            "notes": "Running low",
        })
        assert response.status_code == 200
        assert response.json()["quantity"] == 1.5
        assert response.json()["notes"] == "Running low"

    def test_update_item_not_found(self, client):
        """Update non-existent item returns 404."""
        response = client.put("/api/inventory/items/9999", json={"quantity": 1.0})
        assert response.status_code == 404

    def test_delete_item(self, client):
        """Delete an inventory item."""
        create_resp = client.post("/api/inventory/items", json={
            "name": "Butter",
            "quantity": 1.0,
            "unit": "stick",
            "location": "fridge",
        })
        item_id = create_resp.json()["id"]

        response = client.delete(f"/api/inventory/items/{item_id}")
        assert response.status_code == 204

        # Verify deleted
        get_resp = client.get(f"/api/inventory/items/{item_id}")
        assert get_resp.status_code == 404

    def test_delete_item_not_found(self, client):
        """Delete non-existent item returns 404."""
        response = client.delete("/api/inventory/items/9999")
        assert response.status_code == 404

    def test_create_item_validation_empty_name(self, client):
        """Create item with empty name returns 422."""
        response = client.post("/api/inventory/items", json={
            "name": "",
            "quantity": 1.0,
            "location": "pantry",
        })
        assert response.status_code == 422

    def test_create_item_validation_negative_quantity(self, client):
        """Create item with negative quantity returns 422."""
        response = client.post("/api/inventory/items", json={
            "name": "Sugar",
            "quantity": -1.0,
            "location": "pantry",
        })
        assert response.status_code == 422


class TestInventoryQuantityAdjust:
    """Test quantity adjustment endpoint."""

    def test_adjust_quantity_positive(self, client):
        """Adjust quantity up."""
        create_resp = client.post("/api/inventory/items", json={
            "name": "Eggs",
            "quantity": 6.0,
            "location": "fridge",
        })
        item_id = create_resp.json()["id"]

        response = client.patch(f"/api/inventory/items/{item_id}/quantity", json={
            "adjustment": 6.0,
        })
        assert response.status_code == 200
        assert response.json()["quantity"] == 12.0

    def test_adjust_quantity_negative(self, client):
        """Adjust quantity down."""
        create_resp = client.post("/api/inventory/items", json={
            "name": "Onions",
            "quantity": 5.0,
            "location": "pantry",
        })
        item_id = create_resp.json()["id"]

        response = client.patch(f"/api/inventory/items/{item_id}/quantity", json={
            "adjustment": -2.0,
        })
        assert response.status_code == 200
        assert response.json()["quantity"] == 3.0

    def test_adjust_quantity_below_zero_rejected(self, client):
        """Adjust quantity below zero returns 400 (strict API)."""
        create_resp = client.post("/api/inventory/items", json={
            "name": "Garlic",
            "quantity": 1.0,
            "location": "pantry",
        })
        item_id = create_resp.json()["id"]

        response = client.patch(f"/api/inventory/items/{item_id}/quantity", json={
            "adjustment": -5.0,
        })
        assert response.status_code == 400

    def test_adjust_quantity_not_found(self, client):
        """Adjust quantity on non-existent item returns 404."""
        response = client.patch("/api/inventory/items/9999/quantity", json={
            "adjustment": 1.0,
        })
        assert response.status_code == 404


class TestInventoryFilters:
    """Test inventory filtering endpoints."""

    def test_filter_by_location(self, client):
        """Filter items by storage location."""
        client.post("/api/inventory/items", json={
            "name": "Milk",
            "quantity": 1.0,
            "unit": "gallon",
            "location": "fridge",
        })
        client.post("/api/inventory/items", json={
            "name": "Pasta",
            "quantity": 2.0,
            "unit": "box",
            "location": "pantry",
        })

        fridge_resp = client.get("/api/inventory/items?location=fridge")
        assert fridge_resp.status_code == 200
        fridge_items = fridge_resp.json()
        assert all(item["location"] == "fridge" for item in fridge_items)

        pantry_resp = client.get("/api/inventory/items?location=pantry")
        assert pantry_resp.status_code == 200
        pantry_items = pantry_resp.json()
        assert all(item["location"] == "pantry" for item in pantry_items)

    def test_expiring_items_empty(self, client):
        """Expiring items with no items returns empty list."""
        response = client.get("/api/inventory/items/expiring?days=7")
        assert response.status_code == 200
        assert response.json() == []

    def test_low_stock_items_empty(self, client):
        """Low stock items with no items returns empty list."""
        response = client.get("/api/inventory/items/low-stock")
        assert response.status_code == 200
        assert response.json() == []


class TestLeftovers:
    """Test leftover-related endpoints."""

    def test_recent_meals_for_leftover_empty(self, client):
        """Recent meals for leftover when none exist returns empty list."""
        response = client.get("/api/inventory/leftovers/recent-meals")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_leftovers_empty(self, client):
        """List leftovers when none exist returns empty list."""
        response = client.get("/api/inventory/items/leftovers")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_leftover_meal_not_found(self, client):
        """Create leftover for non-existent meal returns 404."""
        response = client.post("/api/inventory/leftovers", json={
            "meal_id": 9999,
            "quantity": 1,
            "location": "fridge",
        })
        assert response.status_code == 404

    def test_create_leftover_from_meal(self, client):
        """Create a leftover from an existing meal."""
        # First create a meal
        meal_resp = client.post("/api/meals", json={
            "date": str(date.today()),
            "meal_type": "dinner",
            "description": "Chicken Stir Fry",
        })
        meal_id = meal_resp.json()["id"]

        # Create leftover
        response = client.post("/api/inventory/leftovers", json={
            "meal_id": meal_id,
            "quantity": 2,
            "location": "fridge",
        })
        assert response.status_code == 201
        data = response.json()
        assert "Leftover" in data["name"]
        assert data["source"] == "leftover"
        assert data["linked_meal_id"] == meal_id
        assert data["expiration_date"] is not None


class TestExpirationFeedback:
    """Test expiration feedback endpoints."""

    def test_list_expiration_feedback_empty(self, client):
        """List expiration feedback when none exist returns empty list."""
        response = client.get("/api/inventory/expiration-feedback")
        assert response.status_code == 200
        assert response.json() == []

    def test_record_expiration_feedback_item_not_found(self, client):
        """Record feedback for non-existent item returns 404."""
        response = client.post("/api/inventory/items/9999/expiration-feedback", json={
            "item_id": 9999,
            "feedback_type": "spoiled_early",
            "actual_days": 3,
        })
        assert response.status_code == 404

    def test_record_expiration_feedback(self, client):
        """Record expiration feedback for existing item."""
        # Create an item
        create_resp = client.post("/api/inventory/items", json={
            "name": "Yogurt",
            "quantity": 1.0,
            "unit": "cup",
            "location": "fridge",
        })
        item_id = create_resp.json()["id"]

        response = client.post(f"/api/inventory/items/{item_id}/expiration-feedback", json={
            "item_id": item_id,
            "feedback_type": "spoiled_early",
            "actual_days": 3,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["item_name"] == "Yogurt"
        assert data["feedback_type"] == "spoiled_early"
        assert data["actual_days"] == 3

"""
Tests for Shopping List API endpoints.
"""

import pytest
from datetime import date, timedelta


class TestShoppingListAPI:
    """Test Shopping List CRUD operations."""

    def _week_start(self):
        """Get the Monday of the current week."""
        today = date.today()
        return today - timedelta(days=today.weekday())

    def test_get_shopping_list_empty(self, client):
        """Getting shopping list for a week with no items returns empty list."""
        ws = self._week_start()
        response = client.get(f"/api/shopping-list/week/{ws}")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_shopping_list_item(self, client):
        """Create a new shopping list item."""
        ws = self._week_start()
        item_data = {
            "name": "Milk",
            "quantity": "1 gallon",
            "category": "Dairy",
            "week_start": str(ws),
        }
        response = client.post("/api/shopping-list", json=item_data)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Milk"
        assert data["quantity"] == "1 gallon"
        assert data["category"] == "Dairy"
        assert data["is_checked"] is False
        assert "id" in data

    def test_get_shopping_list_item_by_id(self, client):
        """Get a single shopping list item by ID."""
        ws = self._week_start()
        create_resp = client.post("/api/shopping-list", json={
            "name": "Eggs",
            "quantity": "1 dozen",
            "week_start": str(ws),
        })
        item_id = create_resp.json()["id"]
        response = client.get(f"/api/shopping-list/{item_id}")
        assert response.status_code == 200
        assert response.json()["id"] == item_id
        assert response.json()["name"] == "Eggs"

    def test_get_shopping_list_item_not_found(self, client):
        """Get a non-existent shopping list item returns 404."""
        response = client.get("/api/shopping-list/9999")
        assert response.status_code == 404

    def test_update_shopping_list_item(self, client):
        """Update a shopping list item."""
        ws = self._week_start()
        create_resp = client.post("/api/shopping-list", json={
            "name": "Bread",
            "quantity": "1 loaf",
            "week_start": str(ws),
        })
        item_id = create_resp.json()["id"]
        response = client.put(f"/api/shopping-list/{item_id}", json={
            "name": "Whole Wheat Bread",
            "quantity": "2 loaves",
        })
        assert response.status_code == 200
        assert response.json()["name"] == "Whole Wheat Bread"
        assert response.json()["quantity"] == "2 loaves"

    def test_update_shopping_list_item_not_found(self, client):
        """Update a non-existent shopping list item returns 404."""
        response = client.put("/api/shopping-list/9999", json={"name": "Test"})
        assert response.status_code == 404

    def test_toggle_shopping_list_item(self, client):
        """Toggle a shopping list item check status."""
        ws = self._week_start()
        create_resp = client.post("/api/shopping-list", json={
            "name": "Butter",
            "week_start": str(ws),
        })
        item_id = create_resp.json()["id"]
        assert create_resp.json()["is_checked"] is False

        # Toggle to checked
        toggle_resp = client.post(f"/api/shopping-list/{item_id}/toggle")
        assert toggle_resp.status_code == 200
        assert toggle_resp.json()["is_checked"] is True

        # Toggle back to unchecked
        toggle_resp2 = client.post(f"/api/shopping-list/{item_id}/toggle")
        assert toggle_resp2.status_code == 200
        assert toggle_resp2.json()["is_checked"] is False

    def test_toggle_not_found(self, client):
        """Toggle a non-existent item returns 404."""
        response = client.post("/api/shopping-list/9999/toggle")
        assert response.status_code == 404

    def test_delete_shopping_list_item(self, client):
        """Delete a shopping list item."""
        ws = self._week_start()
        create_resp = client.post("/api/shopping-list", json={
            "name": "Cheese",
            "week_start": str(ws),
        })
        item_id = create_resp.json()["id"]
        response = client.delete(f"/api/shopping-list/{item_id}")
        assert response.status_code == 204

        # Verify deleted
        get_resp = client.get(f"/api/shopping-list/{item_id}")
        assert get_resp.status_code == 404

    def test_delete_not_found(self, client):
        """Delete a non-existent item returns 404."""
        response = client.delete("/api/shopping-list/9999")
        assert response.status_code == 404

    def test_clear_shopping_list_for_week(self, client):
        """Clear all items for a specific week."""
        ws = self._week_start()
        # Create two items
        client.post("/api/shopping-list", json={
            "name": "Item 1",
            "week_start": str(ws),
        })
        client.post("/api/shopping-list", json={
            "name": "Item 2",
            "week_start": str(ws),
        })

        # Verify they exist
        list_resp = client.get(f"/api/shopping-list/week/{ws}")
        assert len(list_resp.json()) == 2

        # Clear
        clear_resp = client.delete(f"/api/shopping-list/week/{ws}/clear")
        assert clear_resp.status_code == 204

        # Verify empty
        list_resp2 = client.get(f"/api/shopping-list/week/{ws}")
        assert list_resp2.json() == []

    def test_generate_shopping_list_empty_week(self, client):
        """Generate shopping list for a week with no meal plans."""
        ws = self._week_start()
        response = client.post(f"/api/shopping-list/generate/{ws}")
        assert response.status_code == 201
        data = response.json()
        assert data["items_created"] == 0
        assert data["recipes_processed"] == 0

    def test_create_item_validation_empty_name(self, client):
        """Creating item with empty name returns 422."""
        ws = self._week_start()
        response = client.post("/api/shopping-list", json={
            "name": "",
            "week_start": str(ws),
        })
        assert response.status_code == 422

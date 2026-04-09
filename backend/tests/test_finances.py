"""
Tests for Finances API endpoints.
"""

import pytest
from datetime import date, timedelta


class TestFinancesAPI:
    """Test Financial Items CRUD operations."""

    def test_list_finances_empty(self, client):
        """Test listing finances when none exist."""
        response = client.get("/api/finances")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_financial_item(self, client, sample_financial_item):
        """Test creating a new financial item."""
        response = client.post("/api/finances", json=sample_financial_item)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == sample_financial_item["name"]
        assert data["amount"] == sample_financial_item["amount"]
        assert data["type"] == sample_financial_item["type"]
        assert data["is_paid"] == False
        assert "id" in data

    def test_list_finances_after_create(self, client, sample_financial_item):
        """Test listing finances after creating one."""
        client.post("/api/finances", json=sample_financial_item)
        response = client.get("/api/finances")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_get_financial_item_by_id(self, client, sample_financial_item):
        """Test getting a single financial item by ID."""
        create_response = client.post("/api/finances", json=sample_financial_item)
        item_id = create_response.json()["id"]

        response = client.get(f"/api/finances/{item_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == item_id
        assert data["name"] == sample_financial_item["name"]

    def test_get_financial_item_not_found(self, client):
        """Test getting a non-existent financial item."""
        response = client.get("/api/finances/9999")
        assert response.status_code == 404

    def test_update_financial_item(self, client, sample_financial_item):
        """Test updating a financial item."""
        create_response = client.post("/api/finances", json=sample_financial_item)
        item_id = create_response.json()["id"]

        update_data = {"name": "Updated Bill", "amount": 200.00}
        response = client.put(f"/api/finances/{item_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Bill"
        assert data["amount"] == 200.00

    def test_update_financial_item_not_found(self, client):
        """Test updating a non-existent financial item."""
        response = client.put("/api/finances/9999", json={"name": "Test"})
        assert response.status_code == 404

    def test_delete_financial_item(self, client, sample_financial_item):
        """Test deleting a financial item."""
        create_response = client.post("/api/finances", json=sample_financial_item)
        item_id = create_response.json()["id"]

        response = client.delete(f"/api/finances/{item_id}")
        assert response.status_code == 204

        # Verify deleted
        get_response = client.get(f"/api/finances/{item_id}")
        assert get_response.status_code == 404

    def test_delete_financial_item_not_found(self, client):
        """Test deleting a non-existent financial item."""
        response = client.delete("/api/finances/9999")
        assert response.status_code == 404

    def test_mark_item_paid(self, client, sample_financial_item):
        """Test marking a financial item as paid."""
        create_response = client.post("/api/finances", json=sample_financial_item)
        item_id = create_response.json()["id"]

        response = client.post(f"/api/finances/{item_id}/mark-paid")
        assert response.status_code == 200
        data = response.json()
        assert data["is_paid"] == True
        assert data["paid_date"] is not None

    def test_mark_item_paid_not_found(self, client):
        """Test marking a non-existent item as paid."""
        response = client.post("/api/finances/9999/mark-paid")
        assert response.status_code == 404

    def test_get_overdue_items(self, client):
        """Test getting overdue financial items."""
        # Create an overdue item
        overdue_item = {
            "name": "Overdue Bill",
            "amount": 100.00,
            "due_date": str(date.today() - timedelta(days=5)),
            "type": "bill"
        }
        client.post("/api/finances", json=overdue_item)

        # Create a non-overdue item
        future_item = {
            "name": "Future Bill",
            "amount": 100.00,
            "due_date": str(date.today() + timedelta(days=5)),
            "type": "bill"
        }
        client.post("/api/finances", json=future_item)

        response = client.get("/api/finances/overdue")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Overdue Bill"

    def test_get_upcoming_items(self, client):
        """Test getting upcoming financial items."""
        # Create items at different future dates
        for i in [3, 10, 20, 40]:
            client.post("/api/finances", json={
                "name": f"Bill in {i} days",
                "amount": 100.00,
                "due_date": str(date.today() + timedelta(days=i)),
                "type": "bill"
            })

        # Default is 30 days
        response = client.get("/api/finances/upcoming")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3  # 3, 10, and 20 days

        # Custom range
        response = client.get("/api/finances/upcoming?days=7")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1  # Only 3 days

    def test_filter_by_type(self, client):
        """Test filtering financial items by type."""
        client.post("/api/finances", json={
            "name": "Electric Bill",
            "amount": 100.00,
            "due_date": str(date.today()),
            "type": "bill"
        })
        client.post("/api/finances", json={
            "name": "Salary",
            "amount": 5000.00,
            "due_date": str(date.today()),
            "type": "income"
        })

        response = client.get("/api/finances?type=bill")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "bill"

    def test_filter_by_is_paid(self, client, sample_financial_item):
        """Test filtering financial items by is_paid status."""
        # Create and mark one as paid
        response1 = client.post("/api/finances", json=sample_financial_item)
        item_id = response1.json()["id"]
        client.post(f"/api/finances/{item_id}/mark-paid")

        # Create unpaid item
        client.post("/api/finances", json={**sample_financial_item, "name": "Unpaid Bill"})

        response = client.get("/api/finances?is_paid=false")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Unpaid Bill"

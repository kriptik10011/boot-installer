"""
Phase 0 TDD tests: Computed fields on API responses.

Tests that FinancialItemResponse includes days_until_due and is_overdue,
and that ItemResponse includes days_until_expiration.

These fields are computed server-side to eliminate frontend inconsistencies
(Math.ceil vs Math.floor bug).
"""

import pytest
from datetime import date, timedelta


class TestFinancialItemComputedFields:
    """Test days_until_due and is_overdue on GET /api/finances responses."""

    def _create_item(self, client, due_date: date, is_paid: bool = False):
        """Helper: create a financial item with a specific due date."""
        resp = client.post("/api/finances", json={
            "name": "Test Bill",
            "amount": 100.00,
            "due_date": str(due_date),
            "type": "bill",
        })
        assert resp.status_code == 201
        item = resp.json()
        if is_paid:
            client.post(f"/api/finances/{item['id']}/mark-paid")
        return item

    def test_due_today_days_until_due_is_zero(self, client):
        """Bill due today: days_until_due = 0."""
        self._create_item(client, date.today())
        items = client.get("/api/finances").json()
        assert items[0]["days_until_due"] == 0

    def test_due_today_is_not_overdue(self, client):
        """Bill due today is NOT overdue (strict < today)."""
        self._create_item(client, date.today())
        items = client.get("/api/finances").json()
        assert items[0]["is_overdue"] is False

    def test_due_tomorrow_days_until_due_is_one(self, client):
        """Bill due tomorrow: days_until_due = 1."""
        self._create_item(client, date.today() + timedelta(days=1))
        items = client.get("/api/finances").json()
        assert items[0]["days_until_due"] == 1

    def test_due_in_seven_days(self, client):
        """Bill due in 7 days: days_until_due = 7."""
        self._create_item(client, date.today() + timedelta(days=7))
        items = client.get("/api/finances").json()
        assert items[0]["days_until_due"] == 7

    def test_overdue_by_one_day(self, client):
        """Bill due yesterday: days_until_due = -1, is_overdue = True."""
        self._create_item(client, date.today() - timedelta(days=1))
        items = client.get("/api/finances").json()
        assert items[0]["days_until_due"] == -1
        assert items[0]["is_overdue"] is True

    def test_overdue_by_thirty_days(self, client):
        """Bill due 30 days ago: days_until_due = -30, is_overdue = True."""
        self._create_item(client, date.today() - timedelta(days=30))
        items = client.get("/api/finances").json()
        assert items[0]["days_until_due"] == -30
        assert items[0]["is_overdue"] is True

    def test_paid_overdue_item_not_overdue(self, client):
        """Paid bill past due date: is_overdue = False (paid cancels overdue)."""
        self._create_item(client, date.today() - timedelta(days=5), is_paid=True)
        items = client.get("/api/finances").json()
        assert items[0]["is_overdue"] is False
        # days_until_due is still negative (reflects calendar distance)
        assert items[0]["days_until_due"] == -5

    def test_computed_fields_on_get_by_id(self, client):
        """Computed fields present on single-item GET."""
        item = self._create_item(client, date.today() + timedelta(days=3))
        resp = client.get(f"/api/finances/{item['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["days_until_due"] == 3
        assert data["is_overdue"] is False

    def test_computed_fields_on_overdue_endpoint(self, client):
        """Computed fields present on GET /api/finances/overdue."""
        self._create_item(client, date.today() - timedelta(days=2))
        resp = client.get("/api/finances/overdue")
        items = resp.json()
        assert len(items) >= 1
        assert items[0]["days_until_due"] == -2
        assert items[0]["is_overdue"] is True

    def test_computed_fields_on_create_response(self, client):
        """Computed fields present on POST response."""
        resp = client.post("/api/finances", json={
            "name": "New Bill",
            "amount": 50.00,
            "due_date": str(date.today() + timedelta(days=10)),
            "type": "bill",
        })
        data = resp.json()
        assert data["days_until_due"] == 10
        assert data["is_overdue"] is False

    def test_computed_fields_on_upcoming_endpoint(self, client):
        """Computed fields inherited by FinancialItemOccurrenceResponse."""
        self._create_item(client, date.today() + timedelta(days=2))
        resp = client.get("/api/finances/upcoming?days=7")
        items = resp.json()
        matching = [i for i in items if i["name"] == "Test Bill"]
        assert len(matching) >= 1
        assert matching[0]["days_until_due"] == 2
        assert matching[0]["is_overdue"] is False


class TestInventoryItemComputedFields:
    """Test days_until_expiration on GET /api/inventory/items responses."""

    def _create_item(self, client, expiration_date=None):
        """Helper: create an inventory item with optional expiration."""
        payload = {
            "name": "Test Item",
            "quantity": 5,
            "unit": "pcs",
            "location": "pantry",
        }
        if expiration_date is not None:
            payload["expiration_date"] = str(expiration_date)
        resp = client.post("/api/inventory/items", json=payload)
        assert resp.status_code == 201
        return resp.json()

    def test_no_expiration_returns_null(self, client):
        """Item with no expiration_date: days_until_expiration = null.

        Note: Backend auto-fills expiration_date via shelf-life for food items.
        We verify by checking: if expiration_date is null in response, computed field is null.
        If auto-filled, computed field must be an int (not null).
        """
        item = self._create_item(client)
        items = client.get("/api/inventory/items").json()
        matching = [i for i in items if i["name"] == "Test Item"]
        if matching[0]["expiration_date"] is None:
            assert matching[0]["days_until_expiration"] is None
        else:
            # Backend auto-filled expiration -- computed field should be an int
            assert isinstance(matching[0]["days_until_expiration"], int)

    def test_expires_today_is_zero(self, client):
        """Item expiring today: days_until_expiration = 0."""
        self._create_item(client, date.today())
        items = client.get("/api/inventory/items").json()
        matching = [i for i in items if i["name"] == "Test Item"]
        assert matching[0]["days_until_expiration"] == 0

    def test_expires_tomorrow(self, client):
        """Item expiring tomorrow: days_until_expiration = 1."""
        self._create_item(client, date.today() + timedelta(days=1))
        items = client.get("/api/inventory/items").json()
        matching = [i for i in items if i["name"] == "Test Item"]
        assert matching[0]["days_until_expiration"] == 1

    def test_expires_in_seven_days(self, client):
        """Item expiring in 7 days: days_until_expiration = 7."""
        self._create_item(client, date.today() + timedelta(days=7))
        items = client.get("/api/inventory/items").json()
        matching = [i for i in items if i["name"] == "Test Item"]
        assert matching[0]["days_until_expiration"] == 7

    def test_expired_yesterday(self, client):
        """Item expired yesterday: days_until_expiration = -1."""
        self._create_item(client, date.today() - timedelta(days=1))
        items = client.get("/api/inventory/items").json()
        matching = [i for i in items if i["name"] == "Test Item"]
        assert matching[0]["days_until_expiration"] == -1

    def test_computed_field_on_create_response(self, client):
        """Computed field present on POST response."""
        resp = client.post("/api/inventory/items", json={
            "name": "Fresh Milk",
            "quantity": 2,
            "unit": "liters",
            "location": "fridge",
            "expiration_date": str(date.today() + timedelta(days=5)),
        })
        data = resp.json()
        assert data["days_until_expiration"] == 5

    def test_computed_field_on_expiring_endpoint(self, client):
        """Computed field present on GET /api/inventory/items/expiring."""
        self._create_item(client, date.today() + timedelta(days=3))
        resp = client.get("/api/inventory/items/expiring?days=7")
        items = resp.json()
        matching = [i for i in items if i["name"] == "Test Item"]
        assert len(matching) >= 1
        assert matching[0]["days_until_expiration"] == 3

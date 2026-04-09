"""
Tests for Recurrence Rules API endpoints.
"""

import pytest
from datetime import date, timedelta


class TestRecurrenceAPI:
    """Test Recurrence Rules CRUD operations."""

    def test_create_recurrence_rule(self, client):
        """Create a new recurrence rule."""
        rule_data = {
            "frequency": "weekly",
            "interval": 1,
            "day_of_week": 0,
            "end_type": "never",
        }
        response = client.post("/api/recurrence", json=rule_data)
        assert response.status_code == 201
        data = response.json()
        assert data["frequency"] == "weekly"
        assert data["interval"] == 1
        assert data["day_of_week"] == 0
        assert data["end_type"] == "never"
        assert "id" in data

    def test_get_recurrence_rule_by_id(self, client):
        """Get a single recurrence rule by ID."""
        create_resp = client.post("/api/recurrence", json={
            "frequency": "daily",
            "interval": 1,
        })
        rule_id = create_resp.json()["id"]

        response = client.get(f"/api/recurrence/{rule_id}")
        assert response.status_code == 200
        assert response.json()["id"] == rule_id
        assert response.json()["frequency"] == "daily"

    def test_get_recurrence_rule_not_found(self, client):
        """Get a non-existent recurrence rule returns 404."""
        response = client.get("/api/recurrence/9999")
        assert response.status_code == 404

    def test_delete_recurrence_rule(self, client):
        """Delete a recurrence rule."""
        create_resp = client.post("/api/recurrence", json={
            "frequency": "daily",
            "interval": 1,
        })
        rule_id = create_resp.json()["id"]

        response = client.delete(f"/api/recurrence/{rule_id}")
        assert response.status_code == 204

        # Verify deleted
        get_resp = client.get(f"/api/recurrence/{rule_id}")
        assert get_resp.status_code == 404

    def test_delete_recurrence_rule_not_found(self, client):
        """Delete a non-existent recurrence rule returns 404."""
        response = client.delete("/api/recurrence/9999")
        assert response.status_code == 404

    def test_create_with_end_count(self, client):
        """Create recurrence rule with end_type=count."""
        rule_data = {
            "frequency": "weekly",
            "interval": 1,
            "end_type": "count",
            "end_count": 10,
        }
        response = client.post("/api/recurrence", json=rule_data)
        assert response.status_code == 201
        data = response.json()
        assert data["end_type"] == "count"
        assert data["end_count"] == 10

    def test_create_with_end_date(self, client):
        """Create recurrence rule with end_type=date."""
        end = str(date.today() + timedelta(days=90))
        rule_data = {
            "frequency": "monthly",
            "interval": 1,
            "end_type": "date",
            "end_date": end,
        }
        response = client.post("/api/recurrence", json=rule_data)
        assert response.status_code == 201
        data = response.json()
        assert data["end_type"] == "date"
        assert data["end_date"] == end

    def test_create_validation_invalid_frequency(self, client):
        """Create with invalid frequency returns 422."""
        response = client.post("/api/recurrence", json={
            "frequency": "hourly",
            "interval": 1,
        })
        assert response.status_code == 422

    def test_create_validation_invalid_interval(self, client):
        """Create with interval < 1 returns 422."""
        response = client.post("/api/recurrence", json={
            "frequency": "daily",
            "interval": 0,
        })
        assert response.status_code == 422

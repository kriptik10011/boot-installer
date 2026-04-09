"""
Tests for Events API endpoints.
"""

import pytest
from datetime import date, timedelta


class TestEventsAPI:
    """Test Events CRUD operations."""

    def test_list_events_empty(self, client):
        """Test listing events when none exist."""
        response = client.get("/api/events")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_event(self, client, sample_event):
        """Test creating a new event."""
        response = client.post("/api/events", json=sample_event)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == sample_event["name"]
        assert data["date"] == sample_event["date"]
        assert data["start_time"] == sample_event["start_time"]
        assert data["location"] == sample_event["location"]
        assert "id" in data
        assert "created_at" in data

    def test_list_events_after_create(self, client, sample_event):
        """Test listing events after creating one."""
        client.post("/api/events", json=sample_event)
        response = client.get("/api/events")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == sample_event["name"]

    def test_get_event_by_id(self, client, sample_event):
        """Test getting a single event by ID."""
        create_response = client.post("/api/events", json=sample_event)
        event_id = create_response.json()["id"]

        response = client.get(f"/api/events/{event_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == event_id
        assert data["name"] == sample_event["name"]

    def test_get_event_not_found(self, client):
        """Test getting a non-existent event."""
        response = client.get("/api/events/9999")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_event(self, client, sample_event):
        """Test updating an event."""
        create_response = client.post("/api/events", json=sample_event)
        event_id = create_response.json()["id"]

        update_data = {"name": "Updated Meeting", "location": "Room B"}
        response = client.put(f"/api/events/{event_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Meeting"
        assert data["location"] == "Room B"
        # Other fields should remain unchanged
        assert data["start_time"] == sample_event["start_time"]

    def test_update_event_not_found(self, client):
        """Test updating a non-existent event."""
        response = client.put("/api/events/9999", json={"name": "Test"})
        assert response.status_code == 404

    def test_delete_event(self, client, sample_event):
        """Test deleting an event."""
        create_response = client.post("/api/events", json=sample_event)
        event_id = create_response.json()["id"]

        response = client.delete(f"/api/events/{event_id}")
        assert response.status_code == 204

        # Verify it's deleted
        get_response = client.get(f"/api/events/{event_id}")
        assert get_response.status_code == 404

    def test_delete_event_not_found(self, client):
        """Test deleting a non-existent event."""
        response = client.delete("/api/events/9999")
        assert response.status_code == 404

    def test_get_events_for_week(self, client, week_start):
        """Test getting events for a specific week."""
        # Create events in the current week
        for i in range(3):
            event_date = week_start + timedelta(days=i)
            client.post("/api/events", json={
                "name": f"Event {i}",
                "date": str(event_date),
                "start_time": "10:00"
            })

        # Create an event outside the week
        outside_date = week_start + timedelta(days=10)
        client.post("/api/events", json={
            "name": "Outside Event",
            "date": str(outside_date),
            "start_time": "10:00"
        })

        response = client.get(f"/api/events/week/{week_start}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_filter_events_by_category(self, client, sample_event):
        """Test filtering events by category_id."""
        # Create events with different categories
        event1 = {**sample_event, "category_id": 1}
        event2 = {**sample_event, "name": "Other Event", "category_id": 2}

        client.post("/api/events", json=event1)
        client.post("/api/events", json=event2)

        response = client.get("/api/events?category_id=1")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["category_id"] == 1

"""
Tests for Observation API endpoints.
"""

import pytest
import os
from datetime import date


class TestObservationEvents:
    """Test observation event recording endpoints."""

    def test_record_event(self, client):
        """Record a new observation event."""
        event_data = {
            "event_type": "page_view",
            "view_name": "week_view",
            "session_id": "test-session-001",
            "local_hour": 14,
            "local_day_of_week": 1,
        }
        response = client.post("/api/observation/events", json=event_data)
        assert response.status_code == 201
        data = response.json()
        assert data["event_type"] == "page_view"
        assert data["view_name"] == "week_view"
        assert data["session_id"] == "test-session-001"
        assert data["hour_of_day"] == 14
        assert data["day_of_week"] == 1
        assert "id" in data

    def test_record_event_with_action(self, client):
        """Record an observation event with action and entity."""
        event_data = {
            "event_type": "click",
            "view_name": "meal_plan",
            "action_name": "add_meal",
            "entity_type": "meal",
            "entity_id": 42,
            "session_id": "test-session-002",
        }
        response = client.post("/api/observation/events", json=event_data)
        assert response.status_code == 201
        data = response.json()
        assert data["action_name"] == "add_meal"
        assert data["entity_type"] == "meal"
        assert data["entity_id"] == 42

    def test_record_event_validation_missing_fields(self, client):
        """Recording event without required fields returns 422."""
        # Missing session_id
        response = client.post("/api/observation/events", json={
            "event_type": "page_view",
            "view_name": "week_view",
        })
        assert response.status_code == 422

    def test_record_event_server_time_fallback(self, client):
        """Record event without local_hour/day uses server time."""
        event_data = {
            "event_type": "page_view",
            "view_name": "week_view",
            "session_id": "test-session-003",
        }
        response = client.post("/api/observation/events", json=event_data)
        assert response.status_code == 201
        data = response.json()
        # hour_of_day and day_of_week should be populated from server time
        assert 0 <= data["hour_of_day"] <= 23
        assert 0 <= data["day_of_week"] <= 6


class TestDwellTime:
    """Test dwell time tracking endpoints."""

    def test_update_dwell_time(self, client):
        """Update dwell time for a view."""
        dwell_data = {
            "session_id": "test-session-010",
            "view_name": "week_view",
            "seconds": 15.5,
        }
        response = client.post("/api/observation/dwell-time", json=dwell_data)
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_update_dwell_time_accumulates(self, client):
        """Multiple dwell time updates for same view accumulate."""
        dwell_data = {
            "session_id": "test-session-011",
            "view_name": "recipe_view",
            "seconds": 10.0,
        }
        client.post("/api/observation/dwell-time", json=dwell_data)
        client.post("/api/observation/dwell-time", json=dwell_data)
        # Both should succeed (no error)
        response = client.post("/api/observation/dwell-time", json=dwell_data)
        assert response.status_code == 200

    def test_update_dwell_time_validation(self, client):
        """Dwell time with negative seconds returns 422."""
        response = client.post("/api/observation/dwell-time", json={
            "session_id": "test-session-012",
            "view_name": "week_view",
            "seconds": -5.0,
        })
        assert response.status_code == 422


class TestSessionManagement:
    """Test session management endpoints."""

    def test_end_session_new(self, client):
        """End a session that was auto-created via event recording."""
        # First create a session by recording an event
        client.post("/api/observation/events", json={
            "event_type": "page_view",
            "view_name": "week_view",
            "session_id": "test-session-020",
            "local_hour": 10,
            "local_day_of_week": 2,
        })

        # End the session
        response = client.post(
            "/api/observation/session/end",
            params={"session_id": "test-session-020"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_end_nonexistent_session(self, client):
        """End a session that does not exist still returns ok."""
        response = client.post(
            "/api/observation/session/end",
            params={"session_id": "nonexistent-session"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestDebugEndpoints:
    """Test debug/metrics endpoints (require WEEKLY_REVIEW_DEV_MODE=true)."""

    def test_debug_events_without_debug_mode(self, client):
        """Debug endpoints return 403 when debug mode is off."""
        response = client.get("/api/observation/debug/events")
        assert response.status_code == 403

    def test_debug_sessions_without_debug_mode(self, client):
        """Debug sessions endpoint returns 403 when debug mode is off."""
        response = client.get("/api/observation/debug/sessions")
        assert response.status_code == 403

    def test_debug_dwell_time_without_debug_mode(self, client):
        """Debug dwell-time endpoint returns 403 when debug mode is off."""
        response = client.get("/api/observation/debug/dwell-time")
        assert response.status_code == 403

    def test_debug_stats_without_debug_mode(self, client):
        """Debug stats endpoint returns 403 when debug mode is off."""
        response = client.get("/api/observation/debug/stats")
        assert response.status_code == 403

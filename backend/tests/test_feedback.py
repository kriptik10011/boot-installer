"""
Tests for Feedback API endpoints.
"""

import pytest
from datetime import date


class TestFeedbackAPI:
    """Test feedback submission and stats endpoints."""

    def test_get_usage_stats_empty_db(self, client):
        """Get usage stats on empty DB returns valid structure with zeros."""
        response = client.get("/api/feedback/feedback/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total_events_created"] == 0
        assert data["total_meals_planned"] == 0
        assert data["total_bills_tracked"] == 0
        assert data["total_recipes_saved"] == 0
        assert data["total_observation_sessions"] == 0
        assert data["intelligence_mode_used"] is False
        assert data["days_since_install"] == 0

    def test_get_usage_stats_with_data(self, client, sample_event, sample_meal):
        """Get usage stats after creating some data."""
        client.post("/api/events", json=sample_event)
        client.post("/api/meals", json=sample_meal)

        response = client.get("/api/feedback/feedback/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total_events_created"] == 1
        assert data["total_meals_planned"] == 1

    def test_submit_feedback(self, client):
        """Submit feedback with ratings and comments."""
        feedback_data = {
            "ratings": {
                "events": 4,
                "meals": 5,
                "finances": 3,
            },
            "working_well": "The meal planning feature is great.",
            "could_be_better": "Would like more recipe sources.",
        }
        response = client.post("/api/feedback/feedback", json=feedback_data)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "success"
        assert "feedback_id" in data
        assert "filename" in data

    def test_submit_feedback_minimal(self, client):
        """Submit feedback with just ratings (no comments)."""
        feedback_data = {
            "ratings": {"events": 3},
        }
        response = client.post("/api/feedback/feedback", json=feedback_data)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "success"

    def test_submit_feedback_validation_invalid_rating(self, client):
        """Submit feedback with invalid rating value returns 422."""
        response = client.post("/api/feedback/feedback", json={
            "ratings": {"events": 10},  # Max is 5
        })
        assert response.status_code == 422

    def test_submit_feedback_validation_missing_ratings(self, client):
        """Submit feedback without ratings returns 422."""
        response = client.post("/api/feedback/feedback", json={
            "working_well": "Great app!",
        })
        assert response.status_code == 422

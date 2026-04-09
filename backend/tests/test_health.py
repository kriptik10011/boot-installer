"""
Tests for health check endpoints.
"""

import pytest


class TestHealthEndpoints:
    """Test health check endpoints."""

    def test_root_endpoint_removed(self, client):
        """The root route was removed; only /api/health responds."""
        response = client.get("/")
        assert response.status_code == 404

    def test_health_check_endpoint(self, client):
        """Test the /api/health endpoint."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

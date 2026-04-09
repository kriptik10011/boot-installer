"""
Tests for BearerAuthMiddleware in backend/app/main.py

The middleware validates Authorization: Bearer <token> on all requests
except:
- /health, /api/health, / (health endpoints)
- OPTIONS requests (CORS preflight)
- When no token is configured (dev mode)
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


def _make_client_with_db(monkeypatch, auth_token):
    """Create a TestClient with DB override and specified AUTH_TOKEN."""
    monkeypatch.setattr("app.main.AUTH_TOKEN", auth_token)

    from app.main import app
    from app.database import Base, get_db

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    _Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = _Session()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    return client, db, app


def test_no_token_configured_allows_all_requests(monkeypatch):
    """Dev mode: No token configured, all requests pass through."""
    client, db, app = _make_client_with_db(monkeypatch, None)

    # All endpoints should work without Authorization header
    response = client.get("/api/events")
    assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"

    response = client.get("/api/health")
    assert response.status_code == 200

    # Root route was removed; confirm unknown path 404s (not 401) in dev mode
    response = client.get("/")
    assert response.status_code == 404

    from app.database import get_db
    app.dependency_overrides.clear()
    db.close()


def test_health_exempt_from_auth(monkeypatch):
    """With token set, GET /api/health without header returns 200."""
    monkeypatch.setattr("app.main.AUTH_TOKEN", "test-secret-token")

    from app.main import app
    client = TestClient(app)

    # /api/health should NOT require auth
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_root_requires_auth_after_route_removal(monkeypatch):
    """Root route was removed; with token set, GET / now requires auth
    (path is no longer in EXEMPT_PATHS, middleware returns 401 before routing).
    """
    monkeypatch.setattr("app.main.AUTH_TOKEN", "test-secret-token")

    from app.main import app
    client = TestClient(app)

    response = client.get("/")
    assert response.status_code == 401


def test_unauthorized_request_returns_401(monkeypatch):
    """With token set, GET /api/events without header returns 401."""
    monkeypatch.setattr("app.main.AUTH_TOKEN", "test-secret-token")

    from app.main import app
    client = TestClient(app)

    # Protected endpoint without auth should return 401
    response = client.get("/api/events")
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_wrong_token_returns_401(monkeypatch):
    """With token set, GET /api/events with wrong Bearer token returns 401."""
    monkeypatch.setattr("app.main.AUTH_TOKEN", "test-secret-token")

    from app.main import app
    client = TestClient(app)

    # Wrong token should return 401
    response = client.get(
        "/api/events",
        headers={"Authorization": "Bearer wrong-token"}
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_authorized_request_succeeds(monkeypatch):
    """With token set, GET /api/events with correct Bearer token succeeds."""
    client, db, app = _make_client_with_db(monkeypatch, "test-secret-token")

    # Correct token should allow request through
    response = client.get(
        "/api/events",
        headers={"Authorization": "Bearer test-secret-token"}
    )
    # Should NOT be 401 (may be 200 with empty list or other valid response)
    assert response.status_code != 401

    from app.database import get_db
    app.dependency_overrides.clear()
    db.close()


def test_options_exempt_from_auth(monkeypatch):
    """With token set, OPTIONS /api/events without header passes through."""
    monkeypatch.setattr("app.main.AUTH_TOKEN", "test-secret-token")

    from app.main import app
    client = TestClient(app)

    # OPTIONS (CORS preflight) should NOT require auth
    response = client.options("/api/events")
    # OPTIONS should pass through to CORS handler (200 or 405)
    assert response.status_code != 401

"""
Security tests — Tauri IPC and sidecar authentication.

Proves:
1. Bearer token middleware blocks unauthenticated requests
2. Bearer token middleware allows authenticated requests
3. Health endpoints are exempt from auth
4. OPTIONS (CORS preflight) is exempt from auth
5. Trusted host middleware blocks DNS rebinding
"""

import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def auth_client():
    """TestClient with a fake auth token configured."""
    with patch.dict(os.environ, {
        "WEEKLY_REVIEW_AUTH_TOKEN": "test-secret-token-1234",
        "WEEKLY_REVIEW_TEST_MODE": "true",  # bypass DBInjection middleware
    }):
        import app.main as main_mod
        original_token = main_mod.AUTH_TOKEN
        main_mod.AUTH_TOKEN = "test-secret-token-1234"
        try:
            with TestClient(app, raise_server_exceptions=False) as c:
                yield c
        finally:
            main_mod.AUTH_TOKEN = original_token


@pytest.fixture
def noauth_client():
    """TestClient with no auth token configured (dev mode)."""
    import app.main as main_mod
    original_token = main_mod.AUTH_TOKEN
    main_mod.AUTH_TOKEN = None
    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    finally:
        main_mod.AUTH_TOKEN = original_token


class TestBearerAuthMiddleware:
    """Bearer token must be validated when configured."""

    def test_no_token_returns_401(self, auth_client):
        """Requests without Authorization header get 401."""
        resp = auth_client.get("/api/events/")
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Unauthorized"

    def test_wrong_token_returns_401(self, auth_client):
        """Requests with wrong token get 401."""
        resp = auth_client.get(
            "/api/events/",
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert resp.status_code == 401

    def test_correct_token_allowed(self, auth_client):
        """Requests with correct token are allowed through."""
        resp = auth_client.get(
            "/api/events/",
            headers={"Authorization": "Bearer test-secret-token-1234"},
        )
        # May get 422 or other error due to missing DB, but NOT 401
        assert resp.status_code != 401

    def test_health_exempt(self, auth_client):
        """Health endpoints don't require auth."""
        resp = auth_client.get("/api/health")
        assert resp.status_code == 200

    def test_root_route_removed(self, auth_client):
        """Root route was removed; requires auth like any unknown path."""
        resp = auth_client.get("/")
        assert resp.status_code == 401

    def test_options_exempt(self, auth_client):
        """OPTIONS requests (CORS preflight) don't require auth."""
        resp = auth_client.options("/api/events/")
        assert resp.status_code != 401


class TestDevModeNoAuth:
    """When no auth token is configured, all requests pass through."""

    def test_no_auth_required(self, noauth_client):
        """Without AUTH_TOKEN set, requests are not blocked."""
        resp = noauth_client.get("/api/health")
        assert resp.status_code == 200


class TestTrustedHost:
    """TrustedHostMiddleware must block DNS rebinding attacks."""

    def test_localhost_allowed(self):
        """Requests to localhost are allowed."""
        with TestClient(app, raise_server_exceptions=False) as c:
            resp = c.get("/api/health")
            assert resp.status_code == 200

    def test_unknown_host_blocked(self):
        """Requests to unknown hosts are blocked."""
        with TestClient(app, raise_server_exceptions=False) as c:
            resp = c.get(
                "/api/health",
                headers={"Host": "evil.attacker.com"},
            )
            assert resp.status_code == 400


class TestCSPConfig:
    """CSP configuration in tauri.conf.json (static analysis)."""

    def test_csp_pins_backend_port(self):
        """CSP connect-src must pin to backend port 8000 (no wildcard).

        Wildcard ports broaden the attack surface to any local listener; the
        backend always binds 8000, so the CSP can be narrowed accordingly.
        """
        import json
        from pathlib import Path

        conf_path = Path(__file__).parent.parent.parent.parent / "src-tauri" / "tauri.conf.json"
        if not conf_path.exists():
            pytest.skip("tauri.conf.json not found (running outside project root)")

        conf = json.loads(conf_path.read_text())
        csp = conf["app"]["security"]["csp"]

        # Must pin to backend port 8000
        assert "127.0.0.1:8000" in csp
        assert "localhost:8000" in csp

        # Must NOT use wildcard ports (broadens attack surface)
        assert "127.0.0.1:*" not in csp
        assert "localhost:*" not in csp

        # Must include defense-in-depth directives
        assert "form-action 'self'" in csp
        assert "frame-ancestors 'none'" in csp

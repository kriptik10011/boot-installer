"""
Auth endpoint tests — covers POST/DELETE /api/auth/users and partial /login coverage.

Tests the portions of app/routers/auth.py that do not require an on-disk
SQLCipher database. The full login flow (including key derivation, rekey, and
encrypted DB initialization) is exercised by tests/security/test_rekey_safety.py.

Test mode setup:
- WEEKLY_REVIEW_TEST_MODE=true (set by root conftest before app.main import)
- auth_database.py uses in-memory SQLite for the auth DB
- App DB initialization is bypassed by the test mode guard in main.py
- Auth router rate limiter is disabled by the autouse fixture below
"""

import atexit
import os
import shutil
import tempfile

import pytest
from fastapi.testclient import TestClient


# CRITICAL: redirect DATABASE_PATH to a temp file BEFORE importing app.main.
# The delete_user endpoint calls wipe_encrypted_database() which resolves the
# real encrypted DB path via get_database_path() — without this redirect, any
# test that exercises the delete-user flow would unlink the developer's real
# weekly_review.db file. We use a path inside a tempdir that we never write
# to, so the wipe is a no-op (file does not exist => nothing removed).
_TEST_DB_DIR = tempfile.mkdtemp(prefix="weekly_review_test_db_")
atexit.register(shutil.rmtree, _TEST_DB_DIR, ignore_errors=True)
os.environ["DATABASE_PATH"] = os.path.join(_TEST_DB_DIR, "weekly_review.db")

from app.main import app  # noqa: E402
from app.db.auth_database import auth_engine, AuthBase  # noqa: E402
from app.models.user import User  # noqa: F401, E402 — registers model on AuthBase.metadata
from app.auth.pin import CURRENT_KDF_VERSION  # noqa: E402


# Autouse fixture: disable the auth router's rate limiter so rapid-fire test
# calls do not hit the 5/min login or 10/min create-user thresholds. The root
# conftest disable loop covers many routers but not auth.
@pytest.fixture(autouse=True)
def _disable_auth_limiter():
    from app.routers import auth as auth_router_module
    original = None
    if hasattr(auth_router_module, "limiter"):
        original = auth_router_module.limiter.enabled
        auth_router_module.limiter.enabled = False
    yield
    if original is not None:
        auth_router_module.limiter.enabled = original


# Autouse fixture: ensure the in-memory auth DB has the users table and is
# empty before each test. The single-user create endpoint refuses creation
# when any user already exists, so cross-test isolation is mandatory.
@pytest.fixture(autouse=True)
def _fresh_auth_db():
    AuthBase.metadata.create_all(bind=auth_engine)
    with auth_engine.connect() as conn:
        from sqlalchemy import text
        conn.execute(text("DELETE FROM users"))
        conn.commit()
    # Also reset the in-process lockout dict so failure counts from prior
    # tests do not bleed into the next.
    from app.routers import auth as auth_router_module
    if hasattr(auth_router_module, "_attempts"):
        with auth_router_module._attempts_lock:
            auth_router_module._attempts.clear()
    yield


@pytest.fixture
def client():
    """TestClient bound to the FastAPI app."""
    with TestClient(app) as c:
        yield c


def _create_user(client: TestClient, username: str = "alice", pin: str = "111111"):
    return client.post("/api/auth/users", json={"username": username, "pin": pin})


# =============================================================================
# Create-user
# =============================================================================

class TestCreateUser:
    def test_create_user_with_valid_6_digit_pin_succeeds(self, client):
        response = _create_user(client, "alice", "111111")
        assert response.status_code == 201
        body = response.json()
        assert body["username"] == "alice"
        assert "id" in body and len(body["id"]) > 0

    def test_create_user_with_5_digit_pin_returns_400(self, client):
        response = _create_user(client, "alice", "12345")
        assert response.status_code == 400
        assert "6" in response.json()["detail"]

    def test_create_user_with_non_digit_pin_returns_400(self, client):
        response = _create_user(client, "alice", "abc123")
        assert response.status_code == 400
        assert "digit" in response.json()["detail"].lower()

    def test_create_user_when_one_already_exists_returns_409(self, client):
        first = _create_user(client, "alice", "111111")
        assert first.status_code == 201
        second = _create_user(client, "bob", "222222")
        assert second.status_code == 409
        assert "exists" in second.json()["detail"].lower()

    def test_create_user_has_current_kdf_version(self, client):
        """New users must default to the current KDF version (no rekey on first login)."""
        response = _create_user(client, "alice", "111111")
        assert response.status_code == 201

        with auth_engine.connect() as conn:
            from sqlalchemy import text
            row = conn.execute(text("SELECT kdf_version FROM users LIMIT 1")).fetchone()
        assert row is not None
        assert row[0] == CURRENT_KDF_VERSION


# =============================================================================
# List users
# =============================================================================

class TestListUsers:
    def test_list_users_returns_created_user(self, client):
        _create_user(client, "alice", "111111")
        response = client.get("/api/auth/users")
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) == 1
        assert users[0]["username"] == "alice"

    def test_list_users_empty_returns_empty_list(self, client):
        response = client.get("/api/auth/users")
        assert response.status_code == 200
        assert response.json() == []


# =============================================================================
# Delete user
# =============================================================================

class TestDeleteUser:
    def test_delete_user_requires_correct_pin(self, client):
        created = _create_user(client, "alice", "111111").json()
        user_id = created["id"]

        response = client.request(
            "DELETE",
            f"/api/auth/users/{user_id}",
            json={"user_id": user_id, "pin": "999999"},
        )
        assert response.status_code == 401
        assert "credentials" in response.json()["detail"].lower()

    def test_delete_user_with_correct_pin_succeeds(self, client):
        created = _create_user(client, "alice", "111111").json()
        user_id = created["id"]

        response = client.request(
            "DELETE",
            f"/api/auth/users/{user_id}",
            json={"user_id": user_id, "pin": "111111"},
        )
        assert response.status_code == 204

        # User must be gone
        list_response = client.get("/api/auth/users")
        assert list_response.json() == []

    def test_delete_user_then_create_new_succeeds(self, client):
        first = _create_user(client, "alice", "111111").json()
        client.request(
            "DELETE",
            f"/api/auth/users/{first['id']}",
            json={"user_id": first["id"], "pin": "111111"},
        )

        second = _create_user(client, "bob", "222222")
        assert second.status_code == 201
        assert second.json()["username"] == "bob"


# =============================================================================
# Login endpoint smoke
# =============================================================================

class TestLoginSmoke:
    def test_login_endpoint_rejects_nonexistent_user_with_401(self, client):
        """The login endpoint must return 401 (not 404 or 500) when called
        with a nonexistent user. The user lookup happens before any DB path
        manipulation, so this path does not require an on-disk SQLCipher DB.
        """
        response = client.post(
            "/api/auth/login",
            json={"user_id": "nonexistent", "pin": "111111"},
        )
        assert response.status_code == 401
        assert "credentials" in response.json()["detail"].lower()

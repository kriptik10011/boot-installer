"""
Shared fixtures for security tests — SQLCipher temp DBs, key derivation,
stale-WAL simulation for rekey crash recovery testing.

Scoped to backend/tests/security/. Does not modify the root conftest.py.
"""

import os
import tempfile

import pytest

from app.auth.pin import derive_encryption_key


# -----------------------------------------------------------------------------
# Auth router rate-limiter disable (autouse)
# -----------------------------------------------------------------------------
# The root conftest.py disables limiters for many routers but NOT auth. Without
# this fixture, security tests that hit auth endpoints in rapid succession
# would trigger 429 errors from the 5/min and 10/min thresholds.
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


# -----------------------------------------------------------------------------
# Temp directory and key fixtures
# -----------------------------------------------------------------------------
@pytest.fixture
def temp_db_dir():
    """Provide a temp directory cleaned up after each test.

    `ignore_cleanup_errors=True` is required on Windows because sqlcipher3
    file handles can linger briefly after close, causing rmtree to fail.
    """
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        yield d


# Salt is a 32-character hex string (16 bytes once decoded). The values are
# arbitrary but deterministic so test runs are reproducible.
_SALT_A = "a" * 32
_SALT_B = "b" * 32
_TEST_PIN = "111111"


@pytest.fixture
def key_v1() -> bytes:
    """A deterministic 32-byte key derived using KDF version 1 (legacy params)."""
    return derive_encryption_key(_TEST_PIN, _SALT_A, version=1)


@pytest.fixture
def key_v2() -> bytes:
    """A deterministic 32-byte key derived using KDF version 2 (current params)."""
    return derive_encryption_key(_TEST_PIN, _SALT_A, version=2)


@pytest.fixture
def key_other_v1() -> bytes:
    """A different KDF v1 key (different salt) for cross-test isolation."""
    return derive_encryption_key(_TEST_PIN, _SALT_B, version=1)


# -----------------------------------------------------------------------------
# SQLCipher DB fixtures
# -----------------------------------------------------------------------------
def _create_sqlcipher_db(db_path: str, key: bytes) -> None:
    """Create a minimal valid SQLCipher database with one table and one row.

    The row is needed so the file is not empty and so verification queries
    have something to count.
    """
    from sqlcipher3 import dbapi2 as sqlcipher

    parent = os.path.dirname(db_path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)

    conn = sqlcipher.connect(db_path)
    try:
        conn.execute(f"PRAGMA key = \"x'{key.hex()}'\";")
        conn.execute("CREATE TABLE IF NOT EXISTS marker (id INTEGER PRIMARY KEY, value TEXT);")
        conn.execute("INSERT INTO marker (value) VALUES (?);", ("initial",))
        conn.commit()
    finally:
        conn.close()


@pytest.fixture
def encrypted_db_path(temp_db_dir, key_v1) -> str:
    """Create a minimal valid SQLCipher DB with key_v1 and return its path."""
    db_path = os.path.join(temp_db_dir, "test.db")
    _create_sqlcipher_db(db_path, key_v1)
    return db_path


# Note: a "stale_wal_db" fixture was considered here but cannot be realized
# with a plain pytest process. The genuine failure mode (old-key WAL frames
# persisting across a main-file swap) requires simulating a crash between
# commit and checkpoint — SQLite auto-checkpoints and removes the WAL sidecar
# on every clean connection close. The file-existence cleanup tests in
# test_rekey_safety.py cover the production contract; the HMAC cascade itself
# is documented in backend/app/db/rekey.py and verified by code review rather
# than by runtime simulation.

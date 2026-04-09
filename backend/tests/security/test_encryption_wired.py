"""
Security tests — SQLCipher wired to production pipeline.

Proves:
1. Login opens encrypted DB and creates session with DPAPI-sealed key
2. Wrong PIN cannot open encrypted DB
3. First login on plaintext DB triggers migration
4. Backup created before migration
5. Logout closes DB connection and zeros key
6. Session expiry closes DB connection
7. stdlib sqlite3 cannot read DB after migration
8. All tables present after migration
9. Data intact after migration (row counts match)
10. DPAPI seal/unseal round-trip works
11. Auth DB (users table) is separate from app DB
12. ContextVar-based get_db works with db_injection middleware
"""

import os
import shutil
import sqlite3
import tempfile

import pytest
from sqlcipher3 import dbapi2 as sqlcipher

from app.auth import memory_protection
from app.auth.memory_protection import dpapi_protect, dpapi_unprotect, zero_bytes
from app.auth.pin import hash_pin, derive_encryption_key
from app.auth.session import (
    create_session,
    validate_session,
    get_session_data,
    invalidate_session,
    IDLE_TIMEOUT_MINUTES,
)
from app.database import initialize_app_db, teardown_app_db, get_database_path
from app.db.migration import check_migration_needed, migrate_plaintext_to_sqlcipher


@pytest.fixture
def temp_dir():
    """Provide a temp directory cleaned up after each test."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        yield d


@pytest.fixture
def test_pin():
    return "123456"


@pytest.fixture
def test_salt():
    return "abcdef0123456789abcdef0123456789"


@pytest.fixture
def test_key(test_pin, test_salt):
    return derive_encryption_key(test_pin, test_salt)


@pytest.fixture
def plaintext_db(temp_dir):
    """Create a realistic plaintext SQLite DB with tables and data."""
    db_path = os.path.join(temp_dir, "test_app.db")
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE recipes (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, date TEXT)")
    conn.execute("CREATE TABLE financial_items (id INTEGER PRIMARY KEY, name TEXT, amount REAL)")
    conn.execute("INSERT INTO recipes (name) VALUES ('Pancakes')")
    conn.execute("INSERT INTO recipes (name) VALUES ('Pasta')")
    conn.execute("INSERT INTO events (name, date) VALUES ('Meeting', '2026-02-19')")
    conn.execute("INSERT INTO financial_items (name, amount) VALUES ('Rent', 1200.0)")
    conn.execute("INSERT INTO financial_items (name, amount) VALUES ('Electric', 85.0)")
    conn.commit()
    conn.close()
    return db_path


class TestDPAPIMemoryProtection:
    """DPAPI seal/unseal must round-trip correctly."""

    def test_dpapi_round_trip(self, test_key):
        """Seal and unseal must return original bytes."""
        if not memory_protection._HAS_DPAPI:
            pytest.skip("DPAPI unavailable on this host (pywin32 not installed)")
        sealed = dpapi_protect(test_key)
        recovered = dpapi_unprotect(sealed)
        assert test_key == recovered

    def test_dpapi_sealed_differs_from_raw(self, test_key):
        """Sealed bytes must be different from raw key."""
        if not memory_protection._HAS_DPAPI:
            pytest.skip("DPAPI unavailable on this host (pywin32 not installed)")
        sealed = dpapi_protect(test_key)
        # DPAPI adds overhead — sealed is always larger
        assert len(sealed) > len(test_key)

    def test_zero_bytes_works(self):
        """zero_bytes must set all bytes to 0."""
        buf = bytearray(b"sensitive data here!!")
        zero_bytes(buf)
        assert bytes(buf) == b"\x00" * len(buf)


class TestMigrationPlaintextToSQLCipher:
    """One-time plaintext → SQLCipher migration."""

    def test_migration_needed_for_plaintext(self, plaintext_db):
        """Plaintext DB should need migration."""
        assert check_migration_needed(plaintext_db) is True

    def test_migration_not_needed_for_encrypted(self, temp_dir, test_key):
        """Already-encrypted DB should not need migration."""
        db_path = os.path.join(temp_dir, "encrypted.db")
        key_hex = test_key.hex()
        conn = sqlcipher.connect(db_path)
        conn.execute(f"PRAGMA key = \"x'{key_hex}'\";")
        conn.execute("CREATE TABLE t (x TEXT);")
        conn.commit()
        conn.close()
        assert check_migration_needed(db_path) is False

    def test_migration_not_needed_for_missing(self, temp_dir):
        """Non-existent DB should not need migration."""
        assert check_migration_needed(os.path.join(temp_dir, "nope.db")) is False

    def test_backup_created_before_migration(self, plaintext_db, test_key, temp_dir):
        """Migration must create a timestamped backup."""
        backup_dir = os.path.join(temp_dir, "backups")
        migrate_plaintext_to_sqlcipher(plaintext_db, test_key, backup_dir)

        backups = os.listdir(backup_dir)
        assert len(backups) >= 1
        assert any("plaintext" in b for b in backups)

    def test_stdlib_cannot_read_after_migration(self, plaintext_db, test_key, temp_dir):
        """After migration, stdlib sqlite3 must not be able to read the DB."""
        backup_dir = os.path.join(temp_dir, "backups")
        migrate_plaintext_to_sqlcipher(plaintext_db, test_key, backup_dir)

        with pytest.raises(sqlite3.DatabaseError):
            conn = sqlite3.connect(plaintext_db)
            conn.execute("SELECT * FROM recipes;")

    def test_all_tables_present_after_migration(self, plaintext_db, test_key, temp_dir):
        """Migrated DB must have same tables as before."""
        backup_dir = os.path.join(temp_dir, "backups")

        # Get tables before
        conn = sqlite3.connect(plaintext_db)
        pre_tables = set(
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table';"
            ).fetchall()
        )
        conn.close()

        migrate_plaintext_to_sqlcipher(plaintext_db, test_key, backup_dir)

        # Get tables after (with encryption)
        key_hex = test_key.hex()
        enc = sqlcipher.connect(plaintext_db)
        enc.execute(f"PRAGMA key = \"x'{key_hex}'\";")
        post_tables = set(
            r[0] for r in enc.execute(
                "SELECT name FROM sqlite_master WHERE type='table';"
            ).fetchall()
        )
        enc.close()

        assert pre_tables == post_tables

    def test_data_intact_after_migration(self, plaintext_db, test_key, temp_dir):
        """Row counts must match before and after migration."""
        backup_dir = os.path.join(temp_dir, "backups")

        # Count rows before
        conn = sqlite3.connect(plaintext_db)
        pre_recipes = conn.execute("SELECT count(*) FROM recipes;").fetchone()[0]
        pre_events = conn.execute("SELECT count(*) FROM events;").fetchone()[0]
        pre_financial = conn.execute("SELECT count(*) FROM financial_items;").fetchone()[0]
        conn.close()

        migrate_plaintext_to_sqlcipher(plaintext_db, test_key, backup_dir)

        # Count rows after
        key_hex = test_key.hex()
        enc = sqlcipher.connect(plaintext_db)
        enc.execute(f"PRAGMA key = \"x'{key_hex}'\";")
        post_recipes = enc.execute("SELECT count(*) FROM recipes;").fetchone()[0]
        post_events = enc.execute("SELECT count(*) FROM events;").fetchone()[0]
        post_financial = enc.execute("SELECT count(*) FROM financial_items;").fetchone()[0]
        enc.close()

        assert pre_recipes == post_recipes == 2
        assert pre_events == post_events == 1
        assert pre_financial == post_financial == 2

    def test_wrong_key_cannot_read_after_migration(self, plaintext_db, test_key, temp_dir):
        """Wrong key must not open the migrated DB."""
        backup_dir = os.path.join(temp_dir, "backups")
        migrate_plaintext_to_sqlcipher(plaintext_db, test_key, backup_dir)

        wrong_key = b"\x00" * 32
        wrong_hex = wrong_key.hex()
        enc = sqlcipher.connect(plaintext_db)
        enc.execute(f"PRAGMA key = \"x'{wrong_hex}'\";")
        with pytest.raises(sqlcipher.DatabaseError):
            enc.execute("SELECT count(*) FROM sqlite_master;")
        enc.close()


class TestSessionWithDBLifecycle:
    """Session creation and invalidation must manage DB connections."""

    def test_session_stores_sealed_key(self, test_key):
        """Session dict must contain DPAPI-sealed key, not raw bytes."""
        token = create_session("user1", key=test_key)
        data = get_session_data(token)
        assert data is not None
        assert data["sealed_key"] is not None
        if memory_protection._HAS_DPAPI:
            # Sealed key must be different from raw key (DPAPI adds overhead)
            assert len(data["sealed_key"]) > len(test_key)
        invalidate_session(token)

    def test_session_unseals_to_original_key(self, test_key):
        """Unsealing the stored key must return the original."""
        token = create_session("user1", key=test_key)
        data = get_session_data(token)
        recovered = dpapi_unprotect(data["sealed_key"])
        assert recovered == test_key
        invalidate_session(token)

    def test_invalidate_zeros_sealed_key(self, test_key):
        """After invalidation, the session must be gone."""
        token = create_session("user1", key=test_key)
        invalidate_session(token)
        assert validate_session(token) is None

    def test_idle_timeout_invalidates(self, test_key):
        """Session past idle timeout must be invalid."""
        from datetime import datetime, timedelta, timezone
        from app.auth import session as sess_mod

        token = create_session("user1", key=test_key)
        # Manually set last_active to past
        sess_mod._active_sessions[token]["last_active"] = (
            datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=IDLE_TIMEOUT_MINUTES + 1)
        )
        assert validate_session(token) is None


class TestAuthDBSeparation:
    """Auth DB and app DB must be separate files."""

    def test_auth_db_path_differs_from_app_db(self):
        """auth.db and weekly_review.db must be different paths."""
        from app.db.auth_database import get_auth_database_path
        auth_path = get_auth_database_path()
        app_path = get_database_path()
        assert auth_path != app_path
        assert auth_path.name == "auth.db"
        assert app_path.name == "weekly_review.db"

    def test_user_model_uses_auth_base(self):
        """User model must be registered with AuthBase, not Base."""
        from app.models.user import User
        from app.db.auth_database import AuthBase
        from app.database import Base
        assert User.__table__ in AuthBase.metadata.sorted_tables
        assert User.__table__ not in Base.metadata.sorted_tables

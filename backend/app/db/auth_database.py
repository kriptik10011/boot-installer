"""
Auth database — separate plaintext SQLite for user authentication.

Contains ONLY the users table (PIN hashes, salts, metadata).
No financial, meal, recipe, or other app data.

This DB must be readable WITHOUT an encryption key so the login
flow can verify a PIN before deriving the encryption key.
"""

import os
from pathlib import Path

from platformdirs import user_data_dir
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool

AuthBase = declarative_base()

_IS_TEST_MODE = os.environ.get("WEEKLY_REVIEW_TEST_MODE") == "true"


def get_auth_database_path() -> Path:
    """Get path for the plaintext auth database."""
    if custom_path := os.getenv("AUTH_DATABASE_PATH"):
        return Path(custom_path)

    app_data = Path(user_data_dir("WeeklyReview", False))
    app_data.mkdir(parents=True, exist_ok=True)
    return app_data / "auth.db"


def _create_auth_engine():
    """Create the auth DB engine.

    In test mode, uses in-memory SQLite to avoid opening the real auth.db file.
    On Windows, two processes with SQLAlchemy engines pointed at the same SQLite
    file causes file handle conflicts that can kill the running backend.
    """
    if _IS_TEST_MODE:
        return create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False,
        )

    db_path = get_auth_database_path()
    return create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        echo=False,
    )


auth_engine = _create_auth_engine()


@event.listens_for(auth_engine, "connect")
def _set_auth_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


AuthSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=auth_engine)


def get_auth_db():
    """Dependency that provides an auth database session (plaintext, always available)."""
    db = AuthSessionLocal()
    try:
        yield db
    finally:
        db.close()


def initialize_auth_db():
    """Create auth tables. Safe to call on every startup."""
    AuthBase.metadata.create_all(bind=auth_engine)
    _migrate_auth_schema()
    _check_orphan_encrypted_db()
    _enforce_single_user_invariants()


def _check_orphan_encrypted_db():
    """Detect and recover from orphaned encrypted DB state.

    Invariant: auth.db (user records) and weekly_review.db (encrypted user
    data) are a unit. If the user list is empty but the encrypted DB exists,
    no key in the system can ever decrypt that file — its owning account is
    gone. Continuing to ship that orphan around is purely a footgun.

    Recovery: delete the orphaned encrypted DB plus its WAL/SHM sidecars so
    the next account creation gets a clean slate.

    Skipped in test mode (in-memory auth.db has no real on-disk state).
    """
    if _IS_TEST_MODE:
        return

    import logging
    import os
    log = logging.getLogger("weekly_review")

    # Avoid an import cycle — get_database_path lives in app.database which
    # imports from this module via models elsewhere.
    from app.database import get_database_path

    db_path = str(get_database_path())
    sidecars = [db_path, f"{db_path}-shm", f"{db_path}-wal"]
    encrypted_present = any(os.path.exists(p) for p in sidecars)

    if not encrypted_present:
        return

    # Cheap user count via raw SQL — avoids importing the User model here.
    with auth_engine.connect() as conn:
        result = conn.execute(__import__("sqlalchemy").text("SELECT count(*) FROM users"))
        user_count = result.scalar() or 0

    if user_count > 0:
        # Healthy state: users exist, encrypted DB exists, login will verify.
        return

    log.error(
        "ORPHAN ENCRYPTED DB DETECTED: auth.db has 0 users but %s exists. "
        "No key in the system can decrypt this file. Removing orphan to "
        "restore a consistent first-run state.",
        os.path.basename(db_path),
    )
    for path in sidecars:
        if os.path.exists(path):
            try:
                os.remove(path)
                log.warning("Removed orphan: %s", os.path.basename(path))
            except OSError as e:
                log.error(
                    "Failed to remove orphan %s: %s. Manual cleanup required.",
                    os.path.basename(path),
                    e,
                )


def _enforce_single_user_invariants() -> None:
    """Enforce single-user-per-machine invariants at startup.

    This build is single-user. The schema permits multiple rows, but the app
    and the encryption model (one DPAPI-sealed key, one encrypted DB) can only
    operate correctly with zero or one user records.

    Cases handled:
    1. user_count > 1: Data corruption. Refuse startup with a clear recovery
       hint. Silently picking one user could open the wrong encrypted DB.
    2. user_count == 1 + encrypted DB absent: The user record is an orphan
       (the encrypted DB was deleted externally). Delete the record so the
       next launch can create a fresh account. The data is unrecoverable.

    Skipped in test mode (in-memory auth.db has no real on-disk state).
    """
    if _IS_TEST_MODE:
        return

    import logging

    log = logging.getLogger("weekly_review")

    # Local import to avoid circular import (app.database may import models
    # that import from this module).
    from app.database import get_database_path

    import sqlalchemy

    with auth_engine.connect() as conn:
        result = conn.execute(sqlalchemy.text("SELECT count(*) FROM users"))
        user_count = result.scalar() or 0

    if user_count > 1:
        auth_db_path = get_auth_database_path()
        raise RuntimeError(
            f"INVARIANT VIOLATION: auth.db contains {user_count} user records. "
            "This build is single-user-per-machine. "
            f"Recovery: delete {auth_db_path} and restart."
        )

    if user_count == 1:
        db_path = str(get_database_path())
        # The question here is "does the user have a working encrypted DB?"
        # Only the main file answers it. A lone WAL/SHM without the main file
        # is unreadable garbage and must not count as "present". Any remaining
        # sidecars are self-healed by _check_orphan_encrypted_db on the next
        # startup after this branch deletes the user record.
        if not os.path.exists(db_path):
            log.error(
                "STARTUP INVARIANT: user record exists but encrypted DB is absent "
                "at %s. The encrypted DB was deleted externally. Removing orphan "
                "user record to allow account re-creation.",
                os.path.basename(db_path),
            )
            with auth_engine.connect() as conn:
                conn.execute(sqlalchemy.text("DELETE FROM users"))
                conn.commit()


def _migrate_auth_schema():
    """Add columns that didn't exist in earlier versions."""
    import logging
    log = logging.getLogger("weekly_review")
    with auth_engine.connect() as conn:
        # Check if kdf_version column exists
        result = conn.execute(
            __import__("sqlalchemy").text("PRAGMA table_info(users)")
        )
        columns = {row[1] for row in result.fetchall()}
        if "kdf_version" not in columns:
            conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE users ADD COLUMN kdf_version INTEGER NOT NULL DEFAULT 1"
                )
            )
            conn.commit()
            log.info("Added kdf_version column to users table")

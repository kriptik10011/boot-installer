"""
In-memory session management.

Session tokens live in a Python dict — never written to SQLite or disk.
App restart = all sessions invalidated = user must re-enter PIN.

Each session stores:
- user_id, timestamps
- sealed_key: DPAPI-sealed encryption key (never raw bytes in dict)
- db_session: open SQLAlchemy session to encrypted DB
- db_engine: engine reference for cleanup on logout
"""

import logging
import os
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.auth.memory_protection import dpapi_protect, dpapi_unprotect, zero_bytes

log = logging.getLogger("weekly_review")

# In-memory session store — never persisted
_active_sessions: dict[str, dict] = {}
_session_lock = threading.Lock()

SESSION_TTL_HOURS = 8
IDLE_TIMEOUT_MINUTES = 60 if os.environ.get("WEEKLY_REVIEW_DEV_MODE") == "true" else 5


def create_session(
    user_id: str,
    db_session=None,
    db_engine=None,
    db_session_factory=None,
    key: Optional[bytes] = None,
) -> str:
    """
    Create a new session token.

    Args:
        user_id: The authenticated user's ID.
        db_session: Open SQLAlchemy session to the encrypted app DB (legacy, kept for cleanup).
        db_engine: Engine reference for disposal on logout.
        db_session_factory: sessionmaker bound to the encrypted engine — used to
            create per-request sessions (thread-safe concurrent access).
        key: Raw encryption key — will be DPAPI-sealed and the raw zeroed.
    """
    token = secrets.token_urlsafe(32)

    # Seal key with DPAPI, zero raw bytes immediately
    sealed_key = None
    if key is not None:
        sealed_key = dpapi_protect(key)
        # Zero the raw key — caller should also zero their copy
        key_mut = bytearray(key)
        zero_bytes(key_mut)
        del key_mut

    with _session_lock:
        _active_sessions[token] = {
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=SESSION_TTL_HOURS),
            "last_active": datetime.now(timezone.utc).replace(tzinfo=None),
            "sealed_key": sealed_key,
            "db_session": db_session,
            "db_engine": db_engine,
            "db_session_factory": db_session_factory,
        }
    return token


def validate_session(token: str) -> Optional[str]:
    """Returns user_id if session is valid, None if invalid/expired/idle."""
    with _session_lock:
        session = _active_sessions.get(token)
        if not session:
            return None

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Check absolute expiry
        if now > session["expires_at"]:
            log.info("Session expired (TTL) for user %s", session["user_id"])
            # Inline removal under same lock to avoid deadlock
            _active_sessions.pop(token, None)
            return None

        # Check idle timeout
        idle_delta = now - session["last_active"]
        if idle_delta > timedelta(minutes=IDLE_TIMEOUT_MINUTES):
            log.info("Session expired (idle %s) for user %s", idle_delta, session["user_id"])
            _active_sessions.pop(token, None)
            return None

        # Update last_active
        session["last_active"] = now
        return session["user_id"]


def get_session_data(token: str) -> Optional[dict]:
    """Get full session dict (including db_session) if valid. Does NOT update last_active."""
    with _session_lock:
        session = _active_sessions.get(token)
        if not session:
            return None

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if now > session["expires_at"]:
            _active_sessions.pop(token, None)
            return None

        idle_delta = now - session["last_active"]
        if idle_delta > timedelta(minutes=IDLE_TIMEOUT_MINUTES):
            _active_sessions.pop(token, None)
            return None

        return session


def invalidate_session(token: str) -> None:
    """Remove session, zero key, close DB connection and engine."""
    with _session_lock:
        session = _active_sessions.pop(token, None)
    if not session:
        return

    user_id = session.get("user_id", "unknown")
    log.info("Invalidating session for user %s", user_id)

    # Zero sealed key
    if session.get("sealed_key") is not None:
        sealed = bytearray(session["sealed_key"])
        zero_bytes(sealed)
        del session["sealed_key"]

    # Close DB session
    if session.get("db_session") is not None:
        try:
            session["db_session"].close()
        except Exception as e:
            log.debug("DB session close failed during session teardown for user %s: %s", user_id, e)

    # Dispose engine
    if session.get("db_engine") is not None:
        try:
            session["db_engine"].dispose()
        except Exception as e:
            log.debug("DB engine dispose failed during session teardown for user %s: %s", user_id, e)

    # Teardown global engine reference
    from app.database import teardown_app_db
    teardown_app_db()


def invalidate_all_sessions(user_id: str) -> None:
    """Remove all sessions for a given user."""
    with _session_lock:
        to_remove = [t for t, s in _active_sessions.items() if s["user_id"] == user_id]
    for token in to_remove:
        invalidate_session(token)


# =============================================================================
# Background session sweep — daemon thread, 60s interval
# =============================================================================

IDLE_TIMEOUT_SECONDS = IDLE_TIMEOUT_MINUTES * 60


def _sweep_expired_sessions_once() -> list:
    """Sweep expired and idle sessions. Returns list of invalidated tokens."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with _session_lock:
        expired = [
            token for token, data in list(_active_sessions.items())
            if now > data["expires_at"]
            or (now - data["last_active"]).total_seconds() > IDLE_TIMEOUT_SECONDS
        ]
    for token in expired:
        log.info("Session sweep: invalidating %s...", token[:8])
        invalidate_session(token)
    return expired


def _sweep_loop():
    """Background loop — runs every 60s until process exits."""
    while True:
        try:
            _sweep_expired_sessions_once()
        except Exception as e:
            log.warning("Session sweep error: %s", e)
        threading.Event().wait(60)


# Daemon thread — dies with the process, no cleanup needed
_sweep_thread = threading.Thread(target=_sweep_loop, daemon=True, name="session-sweep")
_sweep_thread.start()

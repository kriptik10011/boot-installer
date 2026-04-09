"""
DB injection middleware — injects the encrypted DB session into each request.

After the user logs in, their session holds an open SQLAlchemy session
to the encrypted app DB. This middleware validates the session token
and sets the ContextVar so get_db() works for all routers.

Exempt routes (auth, health) skip injection.
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

import os

from app.auth.session import get_session_data
from app.database import set_request_db

log = logging.getLogger("weekly_review")

# Exact exempt paths (mirrors BearerAuthMiddleware.EXEMPT_PATHS)
_EXEMPT_EXACT = {"/health", "/api/health"}


class DBInjectionMiddleware(BaseHTTPMiddleware):
    """
    Validates session token and injects the encrypted DB session
    into the request-scoped ContextVar for get_db().

    Token sources (checked in order):
    1. X-Session-Token header
    2. Authorization: Bearer <token> header (after sidecar token)
    """

    async def dispatch(self, request: Request, call_next):
        # Skip DB injection in test mode — tests override get_db() directly
        if os.environ.get("WEEKLY_REVIEW_TEST_MODE") == "true":
            return await call_next(request)

        path = request.url.path

        # Exempt: exact matches
        if path in _EXEMPT_EXACT:
            return await call_next(request)

        # Exempt: auth prefix (login/logout/users/status)
        if path.startswith("/api/auth"):
            return await call_next(request)

        # Exempt: OPTIONS (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Extract session token
        token = (
            request.headers.get("X-Session-Token")
            or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        )

        if not token:
            return JSONResponse(
                {"detail": "Authentication required"},
                status_code=401,
            )

        # Validate session and get DB session
        session_data = get_session_data(token)
        if not session_data:
            return JSONResponse(
                {"detail": "Session expired or invalid"},
                status_code=401,
            )

        # Create a fresh session per request to avoid thread-safety issues.
        # The old pattern shared ONE session across concurrent requests, causing
        # "can't checkout a detached connection fairy" under load.
        factory = session_data.get("db_session_factory")
        if factory is not None:
            db_session = factory()
        else:
            # Fallback for sessions created before this fix (pre-existing login)
            db_session = session_data.get("db_session")
            if db_session is None:
                return JSONResponse(
                    {"detail": "Database not available"},
                    status_code=503,
                )
            # Legacy path: recover from PendingRollbackError on shared session
            if not db_session.is_active:
                try:
                    db_session.rollback()
                except Exception as rollback_exc:
                    log.warning(
                        "Pre-request rollback failed for %s %s: %s",
                        request.method, path, rollback_exc,
                    )

        # Inject into ContextVar — get_db() will read this
        set_request_db(db_session)
        request.state.user_id = session_data["user_id"]

        # Update last_active timestamp (under session lock for thread-safety)
        from datetime import datetime, timezone
        from app.auth.session import _session_lock
        with _session_lock:
            session_data["last_active"] = datetime.now(timezone.utc).replace(tzinfo=None)

        try:
            response = await call_next(request)
        finally:
            # Close per-request session so connections return to the pool.
            # For the legacy shared-session path, rollback instead of close.
            if factory is not None:
                try:
                    db_session.close()
                except Exception as e:
                    log.debug("Per-request DB session close failed for %s %s: %s", request.method, path, e)
            else:
                try:
                    db_session.rollback()
                except Exception as e:
                    log.debug("Legacy DB session rollback failed for %s %s: %s", request.method, path, e)

        return response

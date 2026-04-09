"""
Origin validation middleware — strip dev-only origins in production.

In production (Tauri sidecar), only tauri:// and localhost origins are valid.
Dev origins (Vite ports) are allowed when WEEKLY_REVIEW_DEV_MODE is set.
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Origins always allowed (Tauri production + loopback)
_PRODUCTION_ORIGINS = {
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
}

# Additional origins allowed only in dev mode
_DEV_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
}


# Cached at module load — env var cannot change at runtime
_IS_DEV_MODE: bool = os.environ.get("WEEKLY_REVIEW_DEV_MODE") == "true"
if _IS_DEV_MODE:
    import logging
    logging.getLogger("weekly_review").warning("Dev mode active: dev origins allowed")


def _is_dev_mode() -> bool:
    """Return whether the backend is running in development mode.

    Value is resolved from WEEKLY_REVIEW_DEV_MODE at module load and cached
    in _IS_DEV_MODE. The environment variable cannot change at runtime. Dev
    mode requires explicit opt-in to prevent accidental fail-open in
    production when auth token is missing.
    """
    return _IS_DEV_MODE


_EXEMPT_PATHS = {"/health", "/api/health"}


class OriginValidationMiddleware(BaseHTTPMiddleware):
    """Reject requests from unexpected origins in production.

    - Health endpoints: always allowed (needed for startup health polling)
    - No Origin header: allowed (same-origin requests, health checks)
    - Tauri origins: always allowed
    - Dev origins: only in dev mode
    - Everything else: rejected with 403
    """

    async def dispatch(self, request: Request, call_next):
        # Health endpoints must be reachable regardless of origin
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        origin = request.headers.get("origin")

        # No origin header = same-origin or non-browser request — allow
        if not origin:
            return await call_next(request)

        # Always allow production (Tauri) origins
        if origin in _PRODUCTION_ORIGINS:
            return await call_next(request)

        # In dev mode, allow dev origins too
        if _is_dev_mode() and origin in _DEV_ORIGINS:
            return await call_next(request)

        # Reject unknown origins
        return JSONResponse(
            {"detail": "Forbidden"},
            status_code=403,
        )

"""
Generic error handler — strip stack traces from 500 responses.

In production, internal errors return a generic message.
Stack traces are logged to the backend log file, never sent to the client.
"""

import logging
import traceback

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.database import _db_context

log = logging.getLogger("weekly_review")


class GenericErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catch unhandled exceptions and return a generic 500 response.

    - Logs the full traceback to the log file for debugging
    - Returns a sanitized error message to the client
    - Never exposes internal paths, stack traces, or module names
    - Rolls back the DB session to prevent PendingRollbackError cascades
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            log.error(
                "Unhandled exception on %s %s:\n%s",
                request.method,
                request.url.path,
                traceback.format_exc(),
            )
            # Rollback the DB session so subsequent requests don't hit
            # PendingRollbackError from this failed transaction
            try:
                db = _db_context.get()
                if db is not None:
                    db.rollback()
            except Exception as rollback_exc:
                log.warning(
                    "DB rollback failed in error handler for %s %s: %s",
                    request.method, request.url.path, rollback_exc,
                )
            return JSONResponse(
                {"detail": "Internal server error"},
                status_code=500,
            )

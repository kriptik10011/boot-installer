"""Domain exception classes and FastAPI exception handler.

Flat structure (no hierarchy). Each exception maps to an HTTP status code.
Routers raise domain exceptions; the handler converts to JSON responses.

Usage:
    from app.exceptions import NotFoundError, ValidationError
    raise NotFoundError("Recipe", recipe_id)
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.requests import Request


class NotFoundError(Exception):
    """Resource not found (404)."""
    def __init__(self, resource: str, identifier=None):
        self.resource = resource
        self.identifier = identifier
        detail = f"{resource} not found"
        if identifier is not None:
            detail = f"{resource} {identifier} not found"
        super().__init__(detail)


class ValidationError(Exception):
    """Invalid input (422)."""
    def __init__(self, detail: str):
        super().__init__(detail)


class ConflictError(Exception):
    """Duplicate or conflicting state (409)."""
    def __init__(self, detail: str):
        super().__init__(detail)


class AuthorizationError(Exception):
    """Not authorized (403)."""
    def __init__(self, detail: str = "Not authorized"):
        super().__init__(detail)


_STATUS_MAP = {
    NotFoundError: 404,
    ValidationError: 422,
    ConflictError: 409,
    AuthorizationError: 403,
}


def register_exception_handlers(app: FastAPI):
    """Register all domain exception handlers on the app."""
    for exc_class, status_code in _STATUS_MAP.items():
        def _make_handler(sc):
            async def handler(request: Request, exc: Exception):
                return JSONResponse({"detail": str(exc)}, status_code=sc)
            return handler
        app.add_exception_handler(exc_class, _make_handler(status_code))

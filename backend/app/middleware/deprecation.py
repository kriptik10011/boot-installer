"""Deprecation header middleware — signals deprecated endpoints to clients."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Paths that are deprecated with their sunset date and replacement
DEPRECATED_PATHS = {
    "/api/finances/overdue": {
        "sunset": "2026-07-01",
        "link": "/api/finances?status=overdue",
    },
    "/api/finances/upcoming": {
        "sunset": "2026-07-01",
        "link": "/api/finances?status=upcoming&days=30",
    },
    "/api/recurring/overdue": {
        "sunset": "2026-07-01",
        "link": "/api/recurring?status=overdue",
    },
    "/api/recurring/upcoming": {
        "sunset": "2026-07-01",
        "link": "/api/recurring?status=upcoming&days=30",
    },
    "/api/calendar/import": {
        "sunset": "2026-07-01",
        "link": "/api/events/import/import",
    },
    "/api/calendar/preview": {
        "sunset": "2026-07-01",
        "link": "/api/events/import/preview",
    },
    "/api/calendar/upload": {
        "sunset": "2026-07-01",
        "link": "/api/events/import/upload",
    },
}


class DeprecationHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path in DEPRECATED_PATHS:
            info = DEPRECATED_PATHS[path]
            response.headers["Deprecation"] = "true"
            response.headers["Sunset"] = info["sunset"]
            response.headers["Link"] = f'<{info["link"]}>; rel="successor-version"'
        return response

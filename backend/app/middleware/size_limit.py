"""
Request body size limit middleware (pure ASGI).

Protects against oversized payloads that could exhaust memory, including
chunked transfer-encoding that bypasses Content-Length checks.

Default limit: 1 MB. Exempt: multipart uploads (handled by framework limits).
"""

import json

MAX_BODY_SIZE = 1_048_576  # 1 MB

_EXEMPT_METHODS = {b"GET", b"HEAD", b"OPTIONS"}


class RequestSizeLimitMiddleware:
    """Pure ASGI middleware that rejects oversized request bodies.

    - Fast-path rejection via Content-Length header
    - Streaming byte-count via receive() wrapper for chunked encoding
    - Exempt: GET, HEAD, OPTIONS (no body expected)
    - Exempt: multipart/form-data (file uploads have their own limits)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").encode() if isinstance(scope.get("method"), str) else scope.get("method", b"GET")
        if method in _EXEMPT_METHODS:
            await self.app(scope, receive, send)
            return

        # Extract headers (ASGI headers are list of [name, value] byte tuples)
        headers = dict(scope.get("headers", []))
        content_type = headers.get(b"content-type", b"").decode("latin-1", errors="replace")

        # Skip multipart uploads
        if "multipart/form-data" in content_type:
            await self.app(scope, receive, send)
            return

        # Fast-path: check Content-Length header
        content_length_raw = headers.get(b"content-length")
        if content_length_raw is not None:
            try:
                content_length = int(content_length_raw)
            except (ValueError, TypeError):
                await self._send_error(send, 400, "Invalid Content-Length header")
                return
            if content_length > MAX_BODY_SIZE:
                await self._send_error(send, 413, "Request body too large")
                return

        # Wrap receive() to count actual bytes (catches chunked encoding)
        bytes_received = 0

        async def counting_receive():
            nonlocal bytes_received
            message = await receive()
            if message.get("type") == "http.request":
                body = message.get("body", b"")
                bytes_received += len(body)
                if bytes_received > MAX_BODY_SIZE:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, counting_receive, send)
        except _BodyTooLarge:
            await self._send_error(send, 413, "Request body too large")

    @staticmethod
    async def _send_error(send, status_code: int, detail: str):
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status_code,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode()],
            ],
        })
        await send({
            "type": "http.response.body",
            "body": body,
        })


class _BodyTooLarge(Exception):
    """Internal signal that body exceeded MAX_BODY_SIZE."""
    pass

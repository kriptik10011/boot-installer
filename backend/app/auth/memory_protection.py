"""
Memory protection for encryption keys.

Windows: DPAPI seals key bytes — tied to current Windows user account.
Non-Windows: graceful fallback to raw bytes with warning logged.
"""

import logging
import sys

log = logging.getLogger("weekly_review")

_HAS_DPAPI = False

if sys.platform == "win32":
    try:
        import win32crypt
        _HAS_DPAPI = True
    except ImportError:
        log.warning("pywin32 not available — DPAPI memory protection disabled")


def dpapi_protect(data: bytes) -> bytes:
    """Seal bytes with Windows DPAPI. Falls back to raw bytes on non-Windows."""
    if _HAS_DPAPI:
        return win32crypt.CryptProtectData(data, "wr_key", None, None, None, 0)
    log.warning("DPAPI unavailable — key stored unprotected in memory")
    return data


def dpapi_unprotect(sealed: bytes) -> bytes:
    """Unseal DPAPI-protected bytes. Falls back to identity on non-Windows."""
    if _HAS_DPAPI:
        _desc, raw = win32crypt.CryptUnprotectData(sealed, None, None, None, 0)
        return raw
    return sealed


def zero_bytes(b: bytearray) -> None:
    """Explicitly zero a bytearray in memory."""
    for i in range(len(b)):
        b[i] = 0

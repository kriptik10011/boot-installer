"""
PIN hashing and verification.

The PIN is never stored in plaintext. The encryption key is derived
separately from the hash verification salt.
"""

import hashlib
import logging
import secrets

log = logging.getLogger("weekly_review")

from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher(
    time_cost=4,
    memory_cost=131072,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    encoding="utf-8",
    type=Type.ID,
)


def hash_pin(pin: str) -> tuple[str, str]:
    """Hash a PIN with Argon2id. Returns (hash, salt)."""
    salt = secrets.token_hex(16)
    pin_with_salt = f"{salt}:{pin}"
    hashed = _hasher.hash(pin_with_salt)
    return hashed, salt


def verify_pin(pin: str, stored_hash: str, stored_salt: str) -> bool:
    """Verify a PIN against stored hash. Constant-time via Argon2."""
    try:
        pin_with_salt = f"{stored_salt}:{pin}"
        return _hasher.verify(stored_hash, pin_with_salt)
    except VerifyMismatchError:
        return False
    except Exception as e:
        log.debug("PIN verification failed unexpectedly: %s", e)
        return False


# KDF version parameters — never remove old versions (existing users need them).
KDF_PARAMS = {
    1: {"n": 2**14, "r": 8, "p": 1, "dklen": 32, "maxmem": 32 * 1024 * 1024},
    2: {"n": 2**17, "r": 8, "p": 1, "dklen": 32, "maxmem": 256 * 1024 * 1024},
}

CURRENT_KDF_VERSION = 2


def derive_encryption_key(pin: str, salt: str, version: int = 1) -> bytes:
    """
    Derive 32-byte encryption key from PIN using versioned scrypt params.

    Never stored — must be re-derived on each unlock.

    Args:
        pin: The user's PIN.
        salt: Hex-encoded salt string.
        version: KDF parameter version (1 = legacy, 2 = current).
    """
    params = KDF_PARAMS.get(version)
    if params is None:
        raise ValueError(f"Unknown KDF version: {version}")

    return hashlib.scrypt(
        pin.encode(),
        salt=bytes.fromhex(salt),
        **params,
    )

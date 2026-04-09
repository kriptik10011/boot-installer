"""
Auth API endpoints — user creation, PIN login, logout, session status.

Security: PIN hashed with Argon2id. No plaintext PIN storage.
Sessions are in-memory only. Key sealed with DPAPI on Windows.
Auth DB is a separate plaintext file. App DB is encrypted.
"""

import logging
import os
import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.auth.memory_protection import zero_bytes
from app.auth.pin import hash_pin, verify_pin, derive_encryption_key, CURRENT_KDF_VERSION
from app.auth.session import create_session, invalidate_session, validate_session
from app.database import (
    get_database_path,
    initialize_app_db,
    run_seeds_and_migrations,
    teardown_app_db,
    wipe_encrypted_database,
)
from app.db.auth_database import get_auth_db
from app.db.migration import check_migration_needed, cleanup_old_plaintext_backups, migrate_plaintext_to_sqlcipher
from app.models.user import User
from app.schemas.auth import CreateUserRequest, UserResponse, LoginRequest, LoginResponse, SessionStatusResponse

log = logging.getLogger("weekly_review")


# Login attempt throttling.


@dataclass
class _LoginAttemptRecord:
    count: int = 0
    first_attempt: float = 0.0
    locked_until: float = 0.0


_LOCKOUT_SCHEDULE = [
    (5, 30),
    (10, 300),
    (15, 1800),
    (20, 3600),
]

_attempts: dict[str, _LoginAttemptRecord] = {}
_attempts_lock = threading.Lock()
_ATTEMPTS_MAX_ENTRIES = 10000
_ATTEMPTS_MAX_AGE = 3600.0  # evict records older than 1 hour


def _get_lockout_seconds(failure_count: int) -> int:
    """Return lockout duration in seconds for a given failure count."""
    lockout = 0
    for threshold, duration in _LOCKOUT_SCHEDULE:
        if failure_count >= threshold:
            lockout = duration
    return lockout


def _check_lockout(user_id: str) -> Optional[int]:
    """Check if user is locked out. Returns remaining seconds, or None if not locked."""
    now = time.monotonic()
    with _attempts_lock:
        rec = _attempts.get(user_id)
        if rec is None:
            return None
        if rec.locked_until > now:
            return int(rec.locked_until - now) + 1
        return None


def _record_failure(user_id: str) -> tuple[int, int]:
    """Record a failed attempt. Returns (lockout_seconds, failure_count)."""
    now = time.monotonic()
    with _attempts_lock:
        rec = _attempts.get(user_id)
        if rec is None:
            rec = _LoginAttemptRecord(count=0, first_attempt=now)
            _attempts[user_id] = rec
        rec.count += 1
        lockout = _get_lockout_seconds(rec.count)
        if lockout > 0:
            rec.locked_until = now + lockout
        # Evict stale entries to prevent unbounded memory growth
        if len(_attempts) > _ATTEMPTS_MAX_ENTRIES:
            stale = [uid for uid, r in _attempts.items() if now - r.first_attempt > _ATTEMPTS_MAX_AGE]
            for uid in stale:
                del _attempts[uid]
        return lockout, rec.count


def _clear_failures(user_id: str) -> None:
    """Clear failure record on successful login."""
    with _attempts_lock:
        _attempts.pop(user_id, None)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)



# =============================================================================
# Helpers
# =============================================================================

_PIN_MIN_LENGTH = 6


def _validate_pin_format(pin: str) -> None:
    """Validate PIN format — digits only. Used by login (lenient on length).

    Length is NOT enforced here so that users with PINs created under older
    minimum-length policies can still authenticate. Length enforcement lives
    in _validate_pin_strength, which is only called when setting a new PIN.
    """
    if not pin.isdigit():
        raise HTTPException(400, detail="PIN must contain digits only")
    if len(pin) < 1:
        raise HTTPException(400, detail="PIN cannot be empty")


def _validate_pin_strength(pin: str) -> None:
    """Validate PIN strength. Digits only and meets length minimum."""
    _validate_pin_format(pin)
    if len(pin) < _PIN_MIN_LENGTH:
        raise HTTPException(
            400,
            detail=f"PIN must be at least {_PIN_MIN_LENGTH} digits",
        )


# Backward-compat alias — older callers/tests reference _validate_pin.
# Treats the call as a STRENGTH validation (the historical behavior).
_validate_pin = _validate_pin_strength


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/users", response_model=UserResponse, status_code=201)
@limiter.limit("10/minute")
def create_user(req: CreateUserRequest, request: Request, db: Session = Depends(get_auth_db)):
    """Create a new user with PIN authentication.

    Single-user enforcement: this build is single-account-per-machine. The
    encrypted user database (weekly_review.db) is keyed off ONE user's PIN,
    so creating a second user without first deleting the first would leave
    an unrecoverable orphan. Refuse to create when any user already exists —
    the caller must DELETE the existing user (which atomically wipes the
    encrypted DB) before a new account can take its place.
    """
    _validate_pin_strength(req.pin)

    existing_count = db.query(User).count()
    if existing_count > 0:
        raise HTTPException(
            409,
            "An account already exists on this device. Delete it before creating a new one.",
        )

    existing = db.query(User).filter(User.username == req.username.strip()).first()
    if existing:
        raise HTTPException(409, "Username already taken")

    pin_hash, pin_salt = hash_pin(req.pin)
    user_id = secrets.token_hex(16)

    user = User(
        id=user_id,
        username=req.username.strip(),
        pin_hash=pin_hash,
        pin_salt=pin_salt,
    )
    db.add(user)
    db.commit()

    return UserResponse(id=user_id, username=user.username)


@router.delete("/users/{user_id}", status_code=204)
@limiter.limit("5/minute")
def delete_user(
    user_id: str,
    req: LoginRequest,
    request: Request,
    db: Session = Depends(get_auth_db),
):
    """Atomically delete a user AND their encrypted database.

    Requires PIN re-verification (passed in the request body) so that a
    leaked or stolen session token alone cannot wipe the account. The user
    record and the encrypted DB file are removed as a unit so we never
    leave the system in a half-deleted state.

    The account-creation endpoint refuses to create a new user while one
    already exists, so this is the ONLY supported path to "start over" with
    a different PIN.
    """
    _validate_pin_format(req.pin)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user_id != req.user_id:
        raise HTTPException(400, "User ID mismatch")

    if not verify_pin(req.pin, user.pin_hash, user.pin_salt):
        # Share login's throttle so this endpoint is rate-limited on failure.
        lockout, failures = _record_failure(user_id)
        log.warning(
            "Failed PIN attempt %d for delete_user %s, lockout %ds",
            failures, user_id, lockout,
        )
        if lockout > 0:
            raise HTTPException(429, "Too many failed attempts", headers={"Retry-After": str(lockout)})
        raise HTTPException(401, "Invalid credentials")

    _clear_failures(user_id)

    # Tear down the encrypted engine FIRST so the file handle is released
    # before we try to unlink the file (Windows would otherwise PermissionError).
    try:
        teardown_app_db()
    except Exception as e:
        log.warning("teardown_app_db before user delete returned: %s", e)

    # Wipe the encrypted DB and its WAL/SHM sidecars.
    try:
        wipe_encrypted_database()
    except Exception as e:
        log.exception("Failed to wipe encrypted DB during user delete")
        raise HTTPException(500, "Account deletion failed — could not remove encrypted database")

    # Now remove the auth.db record. If this fails after wiping the encrypted
    # DB, the orphan-detection bootstrap will catch it next startup and clean
    # up the inconsistency without losing more state.
    db.delete(user)
    db.commit()
    log.info("User %s deleted (account + encrypted DB removed atomically)", user_id)


@router.get("/users", response_model=List[UserResponse])
@limiter.limit("30/minute")
def list_users(request: Request, db: Session = Depends(get_auth_db)):
    """List accounts on this device. Never returns hashes or salts.

    Single-user mode: this endpoint returns exactly 0 or 1 entries in normal
    operation. The create-user handler refuses a second account with 409, and
    initialize_auth_db() refuses startup on user_count > 1. The list shape is
    retained so the frontend can distinguish "first launch" (0) from "login"
    (1) without a separate endpoint.
    """
    users = db.query(User).order_by(User.created_at).limit(1000).all()
    return [UserResponse(id=u.id, username=u.username) for u in users]


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_auth_db)):
    """
    Verify PIN, derive encryption key, open encrypted DB, create session.

    On first login after update: migrates plaintext DB to SQLCipher.
    """
    _validate_pin_format(req.pin)

    # Check lockout BEFORE any credential verification (prevent timing attacks)
    remaining = _check_lockout(req.user_id)
    if remaining is not None:
        log.warning("User %s is locked out for %ds", req.user_id, remaining)
        raise HTTPException(429, "Too many failed attempts", headers={"Retry-After": str(remaining)})

    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(401, "Invalid credentials")

    if not verify_pin(req.pin, user.pin_hash, user.pin_salt):
        lockout, failures = _record_failure(req.user_id)
        log.warning("Failed PIN attempt %d for user %s, lockout %ds", failures, req.user_id, lockout)
        if lockout > 0:
            raise HTTPException(429, "Too many failed attempts", headers={"Retry-After": str(lockout)})
        raise HTTPException(401, "Invalid credentials")

    # Reset on success
    _clear_failures(req.user_id)

    # Derive encryption key using user's current KDF version
    user_kdf_version = getattr(user, "kdf_version", 1) or 1
    key = derive_encryption_key(req.pin, user.pin_salt, version=user_kdf_version)
    key_mutable = bytearray(key)

    try:
        db_path = str(get_database_path())
        backup_dir = os.path.join(os.path.dirname(db_path), "backups")

        # Crash recovery: if a previous rekey was interrupted, clean up artifacts.
        # The sentinel means rekey started but kdf_version wasn't updated, so the
        # old key (derived above) is still correct. Clean artifacts and retry upgrade.
        from app.db.rekey import check_rekey_pending, cleanup_rekey_artifacts
        if check_rekey_pending(db_path):
            log.warning("Interrupted rekey detected at %s — cleaning up artifacts", db_path)
            cleanup_rekey_artifacts(db_path)

        # One-time migration: plaintext → SQLCipher
        if check_migration_needed(db_path):
            log.info("Migrating plaintext DB to SQLCipher for user %s...", user.id)
            try:
                migrate_plaintext_to_sqlcipher(db_path, bytes(key_mutable), backup_dir)
                log.info("Migration complete")
            except Exception as e:
                log.exception("Migration failed")
                raise HTTPException(500, "Database migration failed")

        # Clean up expired plaintext backups (30 day retention)
        cleanup_old_plaintext_backups(backup_dir, days_to_keep=30)

        # Initialize encrypted app DB engine
        try:
            app_engine, app_session_factory = initialize_app_db(bytes(key_mutable))
        except ImportError as e:
            log.exception("Missing encryption module")
            raise HTTPException(500, "Server misconfigured")
        except Exception as e:
            msg = str(e).lower()  # classify error type only -- not exposed to client
            if "file is not a database" in msg or "hmac" in msg:
                # PIN matched the auth.db hash but the derived key doesn't open
                # the encrypted DB. The auth.db user record and the encrypted DB
                # file have drifted apart — almost always a leftover encrypted
                # DB from a previous (now-deleted) account. The bootstrap orphan
                # detector handles the "no users" case at startup; this branch
                # catches the "wrong owner" case where users do exist but the
                # encrypted DB was created by a different user_id/salt.
                log.error(
                    "Encrypted DB key mismatch for user %s. "
                    "PIN verified against auth.db but the encrypted DB appears "
                    "to belong to a different account (orphan from prior user). "
                    "Recovery: DELETE this user via /api/auth/users/{id} (which "
                    "atomically removes the encrypted DB) and create a fresh "
                    "account with the desired PIN.",
                    user.id,
                )
                raise HTTPException(
                    401,
                    "Encrypted database belongs to a different account. "
                    "Delete this account to start fresh.",
                )
            log.exception("Failed to open encrypted DB")
            raise HTTPException(500, "Database unavailable")

        # KDF version upgrade: re-encrypt DB with stronger key derivation
        if user_kdf_version < CURRENT_KDF_VERSION:
            try:
                from app.db.rekey import rekey_database
                from app.database import teardown_app_db

                new_key = derive_encryption_key(req.pin, user.pin_salt, version=CURRENT_KDF_VERSION)
                new_key_mutable = bytearray(new_key)

                try:
                    # Must dispose engine before re-encrypting the file
                    teardown_app_db()

                    rekey_database(db_path, bytes(key_mutable), bytes(new_key_mutable))

                    # Re-initialize with new key
                    app_engine, app_session_factory = initialize_app_db(bytes(new_key_mutable))

                    # Update user's KDF version in auth DB
                    user.kdf_version = CURRENT_KDF_VERSION
                    db.commit()

                    # Switch to new key for session creation
                    zero_bytes(key_mutable)
                    key_mutable[:] = new_key_mutable

                    log.info("KDF version upgraded from %d to %d for user %s",
                             user_kdf_version, CURRENT_KDF_VERSION, user.id)
                finally:
                    zero_bytes(new_key_mutable)
                    del new_key_mutable

            except Exception as e:
                log.warning("KDF upgrade failed (non-fatal, will retry next login): %s", e)
                # Re-initialize with old key if upgrade failed
                try:
                    app_engine, app_session_factory = initialize_app_db(bytes(key_mutable))
                except Exception:
                    log.exception("Failed to re-initialize DB after KDF upgrade failure")
                    raise HTTPException(500, "Database unavailable")

        # Run schema migrations and seeds on the encrypted DB.
        # migrate_schema() failure is FATAL — operating on incomplete schema
        # causes cascading 500s. Seed failures are non-fatal (handled internally).
        try:
            run_seeds_and_migrations()
        except Exception as e:
            log.exception("Schema migration failed on encrypted DB")
            raise HTTPException(500, "Database schema migration failed — cannot start session")

        # Create auth session (DPAPI seals the key internally)
        # Per-request sessions are created from the factory by DBInjectionMiddleware.
        token = create_session(
            user_id=user.id,
            db_session=None,
            db_engine=app_engine,
            db_session_factory=app_session_factory,
            key=bytes(key_mutable),
        )

        # Update last_login in auth DB
        user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()

        return LoginResponse(token=token, user_id=user.id, username=user.username)
    finally:
        # Zero the local key copy no matter what
        zero_bytes(key_mutable)
        del key_mutable


@router.post("/logout", status_code=204)
@limiter.limit("30/minute")
def logout(request: Request):
    """Invalidate a session token — zeros key, closes DB."""
    token = request.headers.get("X-Session-Token", "")
    if token:
        invalidate_session(token)


@router.get("/session/status", response_model=SessionStatusResponse)
@limiter.limit("60/minute")
def session_status(request: Request):
    """
    Check if the current session is valid.

    Frontend polls this every 30s. Returns 200 if valid, 401 if expired/locked.
    Token read from X-Session-Token header or Authorization: Bearer header.
    """
    token = (
        request.headers.get("X-Session-Token")
        or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    )
    if not token:
        raise HTTPException(401, "No session token")

    user_id = validate_session(token)
    if user_id is None:
        raise HTTPException(401, "Session expired or invalid")

    return {"status": "active", "user_id": user_id}

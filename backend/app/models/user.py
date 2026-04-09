"""
User model — PIN-authenticated local users.

PIN hash is stored via Argon2id. The raw PIN is never persisted.
Session tokens live in memory only.
"""

from sqlalchemy import Column, Text, DateTime, Integer, func
from app.auth.pin import CURRENT_KDF_VERSION
from app.db.auth_database import AuthBase


class User(AuthBase):
    __tablename__ = "users"

    id = Column(Text, primary_key=True)
    username = Column(Text, nullable=False, unique=True)
    pin_hash = Column(Text, nullable=False)
    pin_salt = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    last_login = Column(DateTime, nullable=True)
    # New users are created at the current KDF version — no rekey on first login.
    # Existing users upgraded in place via _migrate_auth_schema() ALTER TABLE still
    # default to version 1, which triggers an intended one-time rekey on next login.
    kdf_version = Column(
        Integer,
        nullable=False,
        default=CURRENT_KDF_VERSION,
        server_default=str(CURRENT_KDF_VERSION),
    )

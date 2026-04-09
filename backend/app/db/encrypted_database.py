"""
EncryptedDatabase — standalone SQLCipher wrapper (no SQLAlchemy dependency).

Uses sqlcipher3 to create/open/verify encrypted SQLite databases.
Key is a 32-byte value derived from user PIN via scrypt.
This module proves the encryption layer works in isolation.

Future: integrate into the SQLAlchemy engine for per-user DB routing.
"""

import os
from typing import Optional

from sqlcipher3 import dbapi2 as sqlcipher


class EncryptedDatabase:
    """Manage a single SQLCipher-encrypted database file."""

    def __init__(self, db_path: str, key: bytes):
        if len(key) != 32:
            raise ValueError("Encryption key must be exactly 32 bytes")
        self._path = db_path
        self._key = bytearray(key)  # mutable for zeroing
        self._conn: Optional[sqlcipher.Connection] = None

    @property
    def is_connected(self) -> bool:
        return self._conn is not None

    def connect(self) -> None:
        """Open the encrypted database. Creates file + directory if needed."""
        if self._conn is not None:
            return

        os.makedirs(os.path.dirname(self._path), exist_ok=True)

        conn = sqlcipher.connect(self._path)
        hex_key = bytes(self._key).hex()
        conn.execute(f"PRAGMA key = \"x'{hex_key}'\";")
        del hex_key  # Eligible for GC immediately

        # All subsequent PRAGMAs and queries will fail if the key is wrong.
        # SQLCipher detects wrong key on first page read (e.g. WAL pragma).
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("SELECT count(*) FROM sqlite_master;")
        except sqlcipher.DatabaseError as e:
            conn.close()
            raise ValueError(f"Failed to open encrypted database (wrong key?): {e}")

        self._conn = conn

    def disconnect(self) -> None:
        """Close connection and zero out key material in memory."""
        if self._conn:
            self._conn.close()
            self._conn = None
        # Zero out key bytes
        for i in range(len(self._key)):
            self._key[i] = 0

    def execute(self, sql: str, params: tuple = ()) -> sqlcipher.Cursor:
        """Execute a SQL statement on the encrypted database."""
        if not self._conn:
            raise RuntimeError("Database not connected — call connect() first")
        return self._conn.execute(sql, params)

    def executemany(self, sql: str, params_list: list) -> sqlcipher.Cursor:
        """Execute a SQL statement for each set of parameters."""
        if not self._conn:
            raise RuntimeError("Database not connected — call connect() first")
        return self._conn.executemany(sql, params_list)

    def commit(self) -> None:
        """Commit current transaction."""
        if self._conn:
            self._conn.commit()

    def rollback(self) -> None:
        """Rollback current transaction."""
        if self._conn:
            self._conn.rollback()


def create_sqlalchemy_engine_with_cipher(db_path: str, key: bytes):
    """
    Create a SQLAlchemy engine that uses SQLCipher for encryption.

    This uses the sqlcipher3 DBAPI and sets the PRAGMA key on every connection
    via a SQLAlchemy event listener.

    Args:
        db_path: Path to the encrypted database file.
        key: 32-byte encryption key.

    Returns:
        A SQLAlchemy Engine configured for SQLCipher.
    """
    from sqlalchemy import create_engine, event

    if len(key) != 32:
        raise ValueError("Encryption key must be exactly 32 bytes")

    # Capture raw key bytes — derive hex inline at point of use
    _key_bytes = bytes(key)

    # Use sqlcipher3's dbapi2 module as the DBAPI
    engine = create_engine(
        f"sqlite:///{db_path}",
        module=sqlcipher,
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def _set_cipher_key(dbapi_conn, connection_record):
        hex_key = _key_bytes.hex()
        dbapi_conn.execute(f"PRAGMA key = \"x'{hex_key}'\";")
        del hex_key  # Eligible for GC immediately
        dbapi_conn.execute("PRAGMA journal_mode = WAL;")
        dbapi_conn.execute("PRAGMA foreign_keys = ON;")

    return engine

"""
Security tests — SQLCipher encryption layer.

Proves:
1. Encrypted DB is created and usable with correct key
2. Wrong key is rejected
3. Standard sqlite3 cannot open the encrypted file
4. Different keys produce independent databases
5. Key zeroing works after disconnect
6. SQLAlchemy engine integration works with SQLCipher
"""

import os
import secrets
import sqlite3
import tempfile

import pytest
from sqlcipher3 import dbapi2 as sqlcipher

from app.db.encrypted_database import EncryptedDatabase, create_sqlalchemy_engine_with_cipher
from app.auth.pin import derive_encryption_key


@pytest.fixture
def temp_dir():
    """Provide a temp directory cleaned up after each test."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        yield d


@pytest.fixture
def key_a() -> bytes:
    """A deterministic 32-byte test key."""
    return derive_encryption_key("123456", "a" * 32)


@pytest.fixture
def key_b() -> bytes:
    """A different deterministic 32-byte test key."""
    return derive_encryption_key("654321", "b" * 32)


class TestEncryptedDatabaseBasic:
    """Core encrypt/decrypt functionality."""

    def test_create_and_read(self, temp_dir, key_a):
        """Create encrypted DB, write data, close, reopen, read data."""
        db_path = os.path.join(temp_dir, "user1", "test.db")

        # Create and write
        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);")
        db.execute("INSERT INTO items (name) VALUES (?);", ("secret data",))
        db.commit()
        db.disconnect()

        # Reopen with same key and read
        db2 = EncryptedDatabase(db_path, key_a)
        db2.connect()
        rows = db2.execute("SELECT name FROM items;").fetchall()
        db2.disconnect()

        assert len(rows) == 1
        assert rows[0][0] == "secret data"

    def test_file_created(self, temp_dir, key_a):
        """Encrypted DB file must exist on disk after connect."""
        db_path = os.path.join(temp_dir, "test.db")
        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.disconnect()
        assert os.path.exists(db_path)

    def test_creates_parent_directory(self, temp_dir, key_a):
        """connect() must create parent dirs if they don't exist."""
        db_path = os.path.join(temp_dir, "deep", "nested", "test.db")
        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.disconnect()
        assert os.path.exists(db_path)


class TestWrongKeyRejected:
    """Attempting to open with wrong key must fail."""

    def test_wrong_key_raises(self, temp_dir, key_a, key_b):
        """Opening an encrypted DB with the wrong key must raise ValueError."""
        db_path = os.path.join(temp_dir, "test.db")

        # Create with key_a
        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.execute("CREATE TABLE t (x TEXT);")
        db.commit()
        db.disconnect()

        # Attempt open with key_b
        db_wrong = EncryptedDatabase(db_path, key_b)
        with pytest.raises(ValueError, match="wrong key"):
            db_wrong.connect()

    def test_random_key_rejected(self, temp_dir, key_a):
        """A random 32-byte key must not open the database."""
        db_path = os.path.join(temp_dir, "test.db")

        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.execute("CREATE TABLE t (x TEXT);")
        db.commit()
        db.disconnect()

        random_key = secrets.token_bytes(32)
        db_rand = EncryptedDatabase(db_path, random_key)
        with pytest.raises(ValueError, match="wrong key"):
            db_rand.connect()


class TestStandardSqliteRejected:
    """Standard sqlite3 must not be able to read encrypted files."""

    def test_sqlite3_cannot_read(self, temp_dir, key_a):
        """Opening encrypted DB with stdlib sqlite3 must fail."""
        db_path = os.path.join(temp_dir, "test.db")

        # Create encrypted DB with data
        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.execute("CREATE TABLE secrets (data TEXT);")
        db.execute("INSERT INTO secrets (data) VALUES (?);", ("top secret",))
        db.commit()
        db.disconnect()

        # Attempt with standard sqlite3
        conn = sqlite3.connect(db_path)
        with pytest.raises(sqlite3.DatabaseError):
            conn.execute("SELECT * FROM secrets;")
        conn.close()

    def test_file_bytes_not_plaintext(self, temp_dir, key_a):
        """The raw DB file must not contain the plaintext data string."""
        db_path = os.path.join(temp_dir, "test.db")

        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.execute("CREATE TABLE t (data TEXT);")
        db.execute("INSERT INTO t (data) VALUES (?);", ("FINDME_PLAINTEXT_MARKER",))
        db.commit()
        db.disconnect()

        with open(db_path, "rb") as f:
            raw_bytes = f.read()

        assert b"FINDME_PLAINTEXT_MARKER" not in raw_bytes


class TestDifferentKeysIsolated:
    """Different keys must produce independent, incompatible databases."""

    def test_two_users_isolated(self, temp_dir, key_a, key_b):
        """User A's key cannot open User B's database and vice versa."""
        path_a = os.path.join(temp_dir, "user_a.db")
        path_b = os.path.join(temp_dir, "user_b.db")

        # Create User A DB
        db_a = EncryptedDatabase(path_a, key_a)
        db_a.connect()
        db_a.execute("CREATE TABLE t (owner TEXT);")
        db_a.execute("INSERT INTO t (owner) VALUES ('user_a');")
        db_a.commit()
        db_a.disconnect()

        # Create User B DB
        db_b = EncryptedDatabase(path_b, key_b)
        db_b.connect()
        db_b.execute("CREATE TABLE t (owner TEXT);")
        db_b.execute("INSERT INTO t (owner) VALUES ('user_b');")
        db_b.commit()
        db_b.disconnect()

        # Key A must not open B's DB
        db_cross = EncryptedDatabase(path_b, key_a)
        with pytest.raises(ValueError, match="wrong key"):
            db_cross.connect()

        # Key B must not open A's DB
        db_cross2 = EncryptedDatabase(path_a, key_b)
        with pytest.raises(ValueError, match="wrong key"):
            db_cross2.connect()


class TestKeyZeroing:
    """Key material must be zeroed after disconnect."""

    def test_key_zeroed_after_disconnect(self, temp_dir, key_a):
        """After disconnect, internal key bytes must all be zero."""
        db_path = os.path.join(temp_dir, "test.db")
        db = EncryptedDatabase(db_path, key_a)
        db.connect()
        db.disconnect()

        # Internal key must be zeroed
        assert bytes(db._key) == b"\x00" * 32

    def test_invalid_key_length_rejected(self, temp_dir):
        """Keys that are not exactly 32 bytes must be rejected."""
        db_path = os.path.join(temp_dir, "test.db")
        with pytest.raises(ValueError, match="32 bytes"):
            EncryptedDatabase(db_path, b"short")

        with pytest.raises(ValueError, match="32 bytes"):
            EncryptedDatabase(db_path, b"x" * 64)


class TestKeyDerivation:
    """Verify PIN → key derivation produces consistent results."""

    def test_same_pin_same_salt_same_key(self):
        """Same PIN + salt must always produce the same key."""
        salt = "abcdef0123456789abcdef0123456789"
        k1 = derive_encryption_key("123456", salt)
        k2 = derive_encryption_key("123456", salt)
        assert k1 == k2
        assert len(k1) == 32

    def test_different_pin_different_key(self):
        """Different PINs must produce different keys."""
        salt = "abcdef0123456789abcdef0123456789"
        k1 = derive_encryption_key("123456", salt)
        k2 = derive_encryption_key("654321", salt)
        assert k1 != k2

    def test_different_salt_different_key(self):
        """Different salts must produce different keys."""
        k1 = derive_encryption_key("123456", "a" * 32)
        k2 = derive_encryption_key("123456", "b" * 32)
        assert k1 != k2


class TestSQLAlchemyIntegration:
    """SQLAlchemy engine with SQLCipher backend."""

    def test_engine_creates_and_reads(self, temp_dir, key_a):
        """SQLAlchemy engine must be able to create tables and read data."""
        from sqlalchemy import text
        from sqlalchemy.orm import sessionmaker

        db_path = os.path.join(temp_dir, "sa_test.db")
        engine = create_sqlalchemy_engine_with_cipher(db_path, key_a)

        # Create table and insert via SQLAlchemy
        with engine.connect() as conn:
            conn.execute(text("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);"))
            conn.execute(text("INSERT INTO items (name) VALUES (:name);"), {"name": "sa_data"})
            conn.commit()

        # Read back
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT name FROM items;")).fetchall()

        assert len(rows) == 1
        assert rows[0][0] == "sa_data"
        engine.dispose()

    def test_engine_wrong_key_fails(self, temp_dir, key_a, key_b):
        """Engine with wrong key must fail when executing queries."""
        from sqlalchemy import text

        db_path = os.path.join(temp_dir, "sa_test.db")

        # Create with key_a
        engine_a = create_sqlalchemy_engine_with_cipher(db_path, key_a)
        with engine_a.connect() as conn:
            conn.execute(text("CREATE TABLE t (x TEXT);"))
            conn.commit()
        engine_a.dispose()

        # Attempt read with key_b
        engine_b = create_sqlalchemy_engine_with_cipher(db_path, key_b)
        with pytest.raises(Exception):
            with engine_b.connect() as conn:
                conn.execute(text("SELECT * FROM t;"))
        engine_b.dispose()

    def test_engine_invalid_key_length(self, temp_dir):
        """Engine creation with wrong key length must raise."""
        db_path = os.path.join(temp_dir, "test.db")
        with pytest.raises(ValueError, match="32 bytes"):
            create_sqlalchemy_engine_with_cipher(db_path, b"short")

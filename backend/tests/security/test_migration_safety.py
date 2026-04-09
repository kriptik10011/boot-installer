"""
Migration safety tests — verify the plaintext-to-SQLCipher migration:
1. Removes the plaintext WAL sidecar after the swap (privacy: WAL contains
   recent plaintext writes)
2. Preserves all rows from the source database
3. Produces a file that the standard library sqlite3 module cannot read
"""

import os
import sqlite3 as plain_sqlite

import pytest
from sqlcipher3 import dbapi2 as sqlcipher

from app.db.migration import migrate_plaintext_to_sqlcipher


def _create_plaintext_db_with_wal(db_path: str) -> None:
    """Create a plaintext SQLite DB and force a stale -wal sidecar to exist.

    Note on the manual -wal creation:
    SQLite auto-checkpoints and removes the WAL sidecar on the last clean
    close, even when journal_mode=WAL is set. The migration code's contract
    is to remove db_path + '-wal' / '-shm' if they exist, regardless of
    content. A synthetic file is sufficient to prove the cleanup ran.
    """
    parent = os.path.dirname(db_path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)

    conn = plain_sqlite.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("CREATE TABLE marker (id INTEGER PRIMARY KEY, value TEXT);")
        conn.execute("INSERT INTO marker (value) VALUES (?);", ("plain_one",))
        conn.execute("INSERT INTO marker (value) VALUES (?);", ("plain_two",))
        conn.commit()
    finally:
        conn.close()

    # Synthesize the stale sidecar files. SQLite removed them on close;
    # the migration cleanup contract is "remove these paths if present".
    if not os.path.exists(db_path + "-wal"):
        with open(db_path + "-wal", "wb") as f:
            f.write(b"stale-plaintext-wal-placeholder")
    if not os.path.exists(db_path + "-shm"):
        with open(db_path + "-shm", "wb") as f:
            f.write(b"stale-plaintext-shm-placeholder")


def test_migration_removes_plaintext_wal_after_swap(temp_db_dir, key_v2):
    """The migration must delete the plaintext -wal sidecar at the live
    location after replacing the main file with the encrypted copy. The
    backup directory keeps a copy of the original WAL, but the live WAL
    must not remain on disk because it contains plaintext.
    """
    db_path = os.path.join(temp_db_dir, "plain.db")
    backup_dir = os.path.join(temp_db_dir, "backups")
    _create_plaintext_db_with_wal(db_path)

    # Sanity: a WAL existed before migration
    assert os.path.exists(db_path + "-wal")

    result = migrate_plaintext_to_sqlcipher(db_path, key_v2, backup_dir)
    assert result is True

    assert not os.path.exists(db_path + "-wal"), \
        "Live plaintext WAL must be removed after migration (privacy)"


def test_migration_data_intact_after_encryption(temp_db_dir, key_v2):
    """Migration must preserve all rows. Open the result with the new key
    and verify the row contents match the original plaintext.
    """
    db_path = os.path.join(temp_db_dir, "intact.db")
    backup_dir = os.path.join(temp_db_dir, "backups")
    _create_plaintext_db_with_wal(db_path)

    migrate_plaintext_to_sqlcipher(db_path, key_v2, backup_dir)

    conn = sqlcipher.connect(db_path)
    try:
        conn.execute(f"PRAGMA key = \"x'{key_v2.hex()}'\";")
        rows = conn.execute("SELECT value FROM marker ORDER BY id;").fetchall()
    finally:
        conn.close()

    assert [r[0] for r in rows] == ["plain_one", "plain_two"]


def test_stdlib_cannot_read_migrated_db(temp_db_dir, key_v2):
    """After migration, the standard library sqlite3 module must NOT be able
    to read the file. This proves the migration produced a real SQLCipher
    database and not a plaintext copy.
    """
    db_path = os.path.join(temp_db_dir, "encrypted.db")
    backup_dir = os.path.join(temp_db_dir, "backups")
    _create_plaintext_db_with_wal(db_path)

    migrate_plaintext_to_sqlcipher(db_path, key_v2, backup_dir)

    conn = plain_sqlite.connect(db_path)
    try:
        with pytest.raises(plain_sqlite.DatabaseError):
            conn.execute("SELECT count(*) FROM sqlite_master;").fetchone()
    finally:
        conn.close()

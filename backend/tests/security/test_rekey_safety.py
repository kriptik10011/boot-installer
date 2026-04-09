"""
Rekey safety tests — verify the rekey pipeline does not leave the encrypted
database in a state that fails to open on the next login.

The cascade this guards against:
1. rekey_database() swaps the main file with a copy encrypted under the new key
2. The pre-existing -wal sidecar still contains old-key frames
3. The next sqlcipher open with the new key applies those frames
4. SQLCipher reports "file is not a database" because the HMAC check fails
5. The user is locked out of their data even though the main file is valid

The fix is to delete the stale -wal/-shm sidecars at the end of rekey_database()
and again from cleanup_rekey_artifacts() when crash recovery sees the swap
marker. These tests prove both code paths.
"""

import os

import pytest
from sqlcipher3 import dbapi2 as sqlcipher

from app.db.rekey import rekey_database, cleanup_rekey_artifacts


def _open_with_key(db_path: str, key: bytes):
    """Open a SQLCipher DB and verify the key works by reading sqlite_master.

    Returns the connection on success. Caller must close.
    Raises sqlcipher.DatabaseError if the key is wrong or the WAL is stale.
    """
    conn = sqlcipher.connect(db_path)
    conn.execute(f"PRAGMA key = \"x'{key.hex()}'\";")
    conn.execute("SELECT count(*) FROM sqlite_master;")
    return conn


def _create_v1_db_with_wal(db_path: str, key_v1: bytes) -> None:
    """Create a key_v1-encrypted DB and force a stale -wal sidecar to exist.

    Note on the manual -wal creation:
    SQLite auto-checkpoints and removes the WAL sidecar on the last clean
    close, even when journal_mode=WAL is set. To exercise the cleanup code
    deterministically, we touch a synthetic -wal/-shm file after closing.
    The cleanup logic in rekey_database() and cleanup_rekey_artifacts() only
    cares whether the sidecar files EXIST at the path — content is not
    inspected. A synthetic file is sufficient to prove the cleanup ran.
    """
    parent = os.path.dirname(db_path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)

    conn = sqlcipher.connect(db_path)
    try:
        conn.execute(f"PRAGMA key = \"x'{key_v1.hex()}'\";")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("CREATE TABLE marker (id INTEGER PRIMARY KEY, value TEXT);")
        conn.execute("INSERT INTO marker (value) VALUES (?);", ("before_rekey",))
        conn.commit()
        conn.execute("INSERT INTO marker (value) VALUES (?);", ("more_data",))
        conn.commit()
    finally:
        conn.close()

    # Synthesize the stale sidecar files. SQLite removed them on close;
    # the cleanup code's contract is "remove these paths if present".
    if not os.path.exists(db_path + "-wal"):
        with open(db_path + "-wal", "wb") as f:
            f.write(b"stale-wal-placeholder")
    if not os.path.exists(db_path + "-shm"):
        with open(db_path + "-shm", "wb") as f:
            f.write(b"stale-shm-placeholder")


# =============================================================================
# Happy-path rekey
# =============================================================================

def test_rekey_database_with_new_key_succeeds(temp_db_dir, key_v1, key_v2):
    """rekey_database returns True and the new key opens the result."""
    db_path = os.path.join(temp_db_dir, "happy.db")
    _create_v1_db_with_wal(db_path, key_v1)

    result = rekey_database(db_path, key_v1, key_v2)
    assert result is True

    # New key opens cleanly
    conn = _open_with_key(db_path, key_v2)
    try:
        rows = conn.execute("SELECT value FROM marker ORDER BY id;").fetchall()
    finally:
        conn.close()

    assert len(rows) == 2
    assert rows[0][0] == "before_rekey"
    assert rows[1][0] == "more_data"


def test_rekey_removes_stale_wal_after_swap(temp_db_dir, key_v1, key_v2):
    """After rekey, db_path-wal must NOT exist (it would be stale)."""
    db_path = os.path.join(temp_db_dir, "wal_check.db")
    _create_v1_db_with_wal(db_path, key_v1)

    # Sanity: a WAL existed before rekey
    assert os.path.exists(db_path + "-wal")

    rekey_database(db_path, key_v1, key_v2)

    assert not os.path.exists(db_path + "-wal"), "Stale -wal sidecar must be removed by rekey"


def test_rekey_removes_stale_shm_after_swap(temp_db_dir, key_v1, key_v2):
    """After rekey, db_path-shm must NOT exist (it would be stale)."""
    db_path = os.path.join(temp_db_dir, "shm_check.db")
    _create_v1_db_with_wal(db_path, key_v1)

    rekey_database(db_path, key_v1, key_v2)

    assert not os.path.exists(db_path + "-shm"), "Stale -shm sidecar must be removed by rekey"


# =============================================================================
# Primary regression: subsequent open with new key
# =============================================================================

def test_subsequent_open_with_new_key_succeeds(temp_db_dir, key_v1, key_v2):
    """Subsequent open after rekey must succeed and return the original rows.

    Exercises the end-to-end happy path through rekey_database() with a DB
    that had WAL mode enabled before the rekey. This proves the rekey
    completes and data integrity is preserved.
    """
    db_path = os.path.join(temp_db_dir, "regression.db")
    _create_v1_db_with_wal(db_path, key_v1)

    # Confirm pre-rekey state has a WAL
    assert os.path.exists(db_path + "-wal")

    # Run the post-fix rekey
    assert rekey_database(db_path, key_v1, key_v2) is True

    # The next open with the new key must succeed and see the data
    conn = _open_with_key(db_path, key_v2)
    try:
        rows = conn.execute("SELECT value FROM marker ORDER BY id;").fetchall()
    finally:
        conn.close()

    assert [r[0] for r in rows] == ["before_rekey", "more_data"]


# Note: reproducing a genuine HMAC-failure cascade (stale WAL frames encrypted
# with the old key being applied by a new-key open) requires simulating a crash
# between commit and checkpoint. SQLite auto-checkpoints and removes the WAL
# sidecar on every clean close, so the failure mode cannot be triggered from a
# normal pytest process. The tests above prove the fix's file-level contract:
# rekey_database() and cleanup_rekey_artifacts() remove the sidecar paths when
# they exist. The production code comment in rekey.py:155-166 documents the
# cascade that motivates the cleanup. Together these are the durable regression
# gate.


# =============================================================================
# cleanup_rekey_artifacts: crash recovery paths
# =============================================================================

def test_cleanup_rekey_artifacts_includes_wal(temp_db_dir):
    """When the swap marker is present, cleanup must remove db_path-wal/-shm.

    This is the 'crash happened post-swap' branch of cleanup_rekey_artifacts.
    The marker tells the cleanup code that the main file is the new-key
    content and any lingering -wal/-shm are stale.
    """
    db_path = os.path.join(temp_db_dir, "cleanup.db")

    # Create the main file as a placeholder (cleanup_rekey_artifacts only
    # checks for sentinel/marker/sidecar files, not the main file content).
    with open(db_path, "wb") as f:
        f.write(b"placeholder")

    # Create the artifacts the cleanup function looks for
    with open(db_path + ".rekey_pending", "w") as f:
        f.write("started")
    with open(db_path + ".rekey_swapped", "w") as f:
        f.write("swapped")
    with open(db_path + "-wal", "wb") as f:
        f.write(b"stale wal frames")
    with open(db_path + "-shm", "wb") as f:
        f.write(b"stale shm")

    cleanup_rekey_artifacts(db_path)

    assert not os.path.exists(db_path + ".rekey_pending")
    assert not os.path.exists(db_path + ".rekey_swapped")
    assert not os.path.exists(db_path + "-wal"), "Post-swap WAL must be removed"
    assert not os.path.exists(db_path + "-shm"), "Post-swap SHM must be removed"


def test_rekey_artifacts_preserve_wal_when_swap_did_not_complete(temp_db_dir):
    """When the swap marker is ABSENT, cleanup must NOT remove db_path-wal/-shm.

    This is the 'crash happened pre-swap' branch. The main file is still the
    original old-key content and its WAL contains valid old-key data that
    the next login needs. Removing it would discard user writes.
    """
    db_path = os.path.join(temp_db_dir, "preserve.db")

    with open(db_path, "wb") as f:
        f.write(b"original main file")

    # Sentinel only — NO swap marker
    with open(db_path + ".rekey_pending", "w") as f:
        f.write("started")
    with open(db_path + "-wal", "wb") as f:
        f.write(b"valid old-key wal")
    with open(db_path + "-shm", "wb") as f:
        f.write(b"valid shm")

    cleanup_rekey_artifacts(db_path)

    # Sentinel cleaned up
    assert not os.path.exists(db_path + ".rekey_pending")
    # WAL/SHM PRESERVED — they still belong to the pre-rekey state
    assert os.path.exists(db_path + "-wal"), "Pre-swap WAL must be preserved"
    assert os.path.exists(db_path + "-shm"), "Pre-swap SHM must be preserved"

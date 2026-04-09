"""
One-time migration: plaintext SQLite → SQLCipher encrypted.

Safety:
1. Creates timestamped backup of plaintext DB first
2. Writes encrypted copy to temp file via sqlcipher_export
3. Verifies encrypted copy opens with correct key and has same tables
4. Only then replaces original
5. Plaintext backup retained indefinitely

Returns True if migration was performed, False if already encrypted or no DB.
"""

import gc
import logging
import os
import shutil
import sqlite3 as plain_sqlite
import sys
import time
from datetime import datetime

log = logging.getLogger("weekly_review")


def check_migration_needed(db_path: str) -> bool:
    """Returns True if DB exists and is plaintext (needs migration)."""
    if not os.path.exists(db_path):
        return False
    try:
        conn = plain_sqlite.connect(db_path)
        conn.execute("SELECT count(*) FROM sqlite_master;")
        conn.close()
        return True  # Opened with stdlib = plaintext
    except Exception as e:
        log.debug("DB at %s not plaintext (encrypted or corrupted): %s", db_path, e)
        return False  # Already encrypted or corrupted


def migrate_plaintext_to_sqlcipher(
    plaintext_path: str,
    key: bytes,
    backup_dir: str,
) -> bool:
    """
    One-time migration: converts existing plaintext SQLite to SQLCipher.

    Args:
        plaintext_path: Path to the existing plaintext DB.
        key: 32-byte encryption key.
        backup_dir: Directory for the plaintext backup.

    Returns True if migration performed, False if not needed.
    Raises RuntimeError on failure.
    """
    from sqlcipher3 import dbapi2 as sqlcipher

    if not os.path.exists(plaintext_path):
        return False

    # Check if already encrypted
    if not check_migration_needed(plaintext_path):
        log.info("DB already encrypted or does not exist — skipping migration")
        return False

    # Derive hex inline at each point of use — no long-lived hex string
    _key_bytes = bytes(key)

    # Step 1: Get pre-migration table count and row counts
    pre_conn = plain_sqlite.connect(plaintext_path)
    pre_tables = pre_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
    ).fetchall()
    pre_table_names = [t[0] for t in pre_tables]
    pre_row_counts = {}
    for tname in pre_table_names:
        try:
            count = pre_conn.execute(f"SELECT count(*) FROM [{tname}];").fetchone()[0]
            pre_row_counts[tname] = count
        except Exception as e:
            log.debug("Could not count rows in %s: %s", tname, e)
            pre_row_counts[tname] = -1
    pre_conn.close()

    log.info(
        "Pre-migration: %d tables, total rows: %d",
        len(pre_table_names),
        sum(v for v in pre_row_counts.values() if v >= 0),
    )

    # Step 2: Backup
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"weekly_review_plaintext_{timestamp}.db")
    shutil.copy2(plaintext_path, backup_path)
    log.info("Plaintext backup created: %s", backup_path)

    # Also backup WAL/SHM if present
    for suffix in ["-wal", "-shm"]:
        wal_path = plaintext_path + suffix
        if os.path.exists(wal_path):
            shutil.copy2(wal_path, backup_path + suffix)

    # Step 3: Encrypt to temp file using sqlcipher_export
    temp_path = plaintext_path + ".encrypting"
    # Clean up stale temp file from any previous failed attempt
    if os.path.exists(temp_path):
        os.remove(temp_path)
    try:
        # Open plaintext DB with sqlcipher3 — NO PRAGMA key (plaintext mode)
        src = sqlcipher.connect(plaintext_path)

        # Verify we can read it (no key needed for plaintext)
        src.execute("SELECT count(*) FROM sqlite_master;")

        # ATTACH encrypted destination
        src.execute(
            f"ATTACH DATABASE '{temp_path}' AS encrypted KEY \"x'{_key_bytes.hex()}'\""
        )
        src.execute("SELECT sqlcipher_export('encrypted');")
        src.execute("DETACH DATABASE encrypted;")
        src.close()
    except Exception as e:
        try:
            src.close()
        except Exception as close_err:
            log.debug("Failed to close src during encryption error cleanup: %s", close_err)
        if os.path.exists(temp_path):
            os.remove(temp_path)
        log.exception("Encryption export failed: %s", e)
        raise RuntimeError("Encryption export failed")

    # Step 4: Verify encrypted copy
    try:
        enc = sqlcipher.connect(temp_path)
        enc.execute(f"PRAGMA key = \"x'{_key_bytes.hex()}'\";")
        post_tables = enc.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
        ).fetchall()
        post_table_names = [t[0] for t in post_tables]

        # Verify same tables
        if set(pre_table_names) != set(post_table_names):
            log.error(
                "Table mismatch during encryption verification: pre=%s, post=%s",
                pre_table_names,
                post_table_names,
            )
            enc.close()
            os.remove(temp_path)
            raise RuntimeError("Encryption verification failed")

        # Verify row counts
        for tname in post_table_names:
            try:
                count = enc.execute(f"SELECT count(*) FROM [{tname}];").fetchone()[0]
                if pre_row_counts.get(tname, -1) >= 0 and count != pre_row_counts[tname]:
                    log.error(
                        "Row count mismatch during encryption verification for %s: pre=%s, post=%s",
                        tname,
                        pre_row_counts[tname],
                        count,
                    )
                    enc.close()
                    os.remove(temp_path)
                    raise RuntimeError("Encryption verification failed")
            except RuntimeError:
                raise
            except Exception as e:
                log.debug("Could not verify row count for %s: %s", tname, e)

        enc.close()
    except RuntimeError:
        raise
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        log.exception("Encryption verification failed: %s", e)
        raise RuntimeError("Encryption verification failed")

    # Step 5: Verify stdlib sqlite3 CANNOT read the encrypted file
    bad = None
    try:
        bad = plain_sqlite.connect(temp_path)
        bad.execute("SELECT count(*) FROM sqlite_master;")
        bad.close()
        bad = None
        # If we get here, encryption didn't work!
        os.remove(temp_path)
        raise RuntimeError("Encrypted DB is still readable with stdlib sqlite3!")
    except plain_sqlite.DatabaseError:
        pass  # Expected — encrypted file is unreadable
    finally:
        # Ensure connection is closed to release Windows file lock
        if bad is not None:
            try:
                bad.close()
            except Exception as e:
                log.debug("Failed to close verification connection: %s", e)

    # Step 6: Replace original with encrypted version
    # On Windows, sqlcipher file handles may linger even after close(), preventing
    # os.replace/os.rename. Use copy-write fallback: read encrypted bytes, overwrite
    # the original in-place, then delete the temp file.
    gc.collect()
    try:
        os.replace(temp_path, plaintext_path)
    except (PermissionError, OSError):
        log.warning("os.replace failed (Windows file lock), using copy fallback")
        with open(temp_path, "rb") as src_f:
            data = src_f.read()
        with open(plaintext_path, "wb") as dst_f:
            dst_f.write(data)
        # Clean up temp file (retry with backoff if locked)
        for attempt in range(3):
            try:
                os.remove(temp_path)
                break
            except PermissionError:
                gc.collect()
                time.sleep(1.0 * (attempt + 1))

    # Step 6b: Delete any lingering plaintext WAL/SHM sidecars alongside the
    # (now-encrypted) main file. These were backed up in Step 2 but their
    # originals still live next to plaintext_path. After the swap the main file
    # is encrypted; leaving plaintext WAL/SHM on disk is a privacy leak since
    # the WAL contains recent plaintext writes. Backup copies are retained.
    for suffix in ("-wal", "-shm"):
        wal_path = plaintext_path + suffix
        if os.path.exists(wal_path):
            try:
                os.remove(wal_path)
                log.info(
                    "Deleted plaintext WAL sidecar after migration: %s",
                    os.path.basename(wal_path),
                )
            except OSError as e:
                log.warning(
                    "Could not delete plaintext WAL sidecar %s: %s",
                    os.path.basename(wal_path),
                    e,
                )

    log.info(
        "Migration complete: %d tables, %d total rows. Backup at %s",
        len(post_table_names),
        sum(v for v in pre_row_counts.values() if v >= 0),
        backup_path,
    )
    return True


def cleanup_old_plaintext_backups(backup_dir: str, days_to_keep: int = 30) -> list:
    """
    Delete plaintext DB backups older than days_to_keep.
    Runs on every login — silently removes expired backups.
    """
    import glob
    from datetime import timedelta

    cutoff = datetime.now() - timedelta(days=days_to_keep)
    deleted = []

    pattern = os.path.join(backup_dir, "weekly_review_plaintext_*.db")
    for path in glob.glob(pattern):
        try:
            mtime = datetime.fromtimestamp(os.path.getmtime(path))
            if mtime < cutoff:
                os.remove(path)
                deleted.append(path)
                log.info("Deleted expired plaintext backup: %s", path)
        except Exception as e:
            log.warning("Could not delete backup %s: %s", path, e)

    return deleted

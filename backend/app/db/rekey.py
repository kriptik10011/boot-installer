"""
Database re-encryption engine for KDF version migration.

Re-encrypts the SQLCipher database with a new key derived from upgraded
KDF parameters. Uses sqlcipher_export() for atomic re-encryption.

Safety features:
- .rekey_pending sentinel file for crash recovery
- Original DB preserved as .backup until rekey confirmed
- Copy-write-delete pattern (Windows file handle safety)
"""

import gc
import logging
import os
import time

log = logging.getLogger("weekly_review")

# Sentinel filename (adjacent to DB file)
_SENTINEL_SUFFIX = ".rekey_pending"
_BACKUP_SUFFIX = ".rekey_backup"
# Marker written after the file swap completes. Its presence tells the
# crash-recovery path that the main file is now the NEW-key content, so any
# stale db_path-wal/shm must be purged. Its absence means the swap never
# happened and the live WAL is still valid old-key data — DO NOT delete it.
_SWAPPED_SUFFIX = ".rekey_swapped"


def rekey_database(db_path: str, old_key: bytes, new_key: bytes) -> bool:
    """
    Re-encrypt the database with a new key.

    Args:
        db_path: Path to the encrypted database file.
        old_key: Current 32-byte encryption key.
        new_key: New 32-byte encryption key.

    Returns:
        True if successful, False if no action needed.

    Raises:
        RuntimeError: If re-encryption fails.
        ValueError: If keys are invalid.
    """
    from sqlcipher3 import dbapi2 as sqlcipher

    if len(old_key) != 32 or len(new_key) != 32:
        raise ValueError("Keys must be exactly 32 bytes")

    if old_key == new_key:
        log.info("Old and new keys are identical — skipping rekey")
        return False

    if not os.path.exists(db_path):
        log.error("Database file not found: %s", db_path)
        raise RuntimeError("Database file not found")

    sentinel_path = db_path + _SENTINEL_SUFFIX
    backup_path = db_path + _BACKUP_SUFFIX
    temp_path = db_path + ".rekey_tmp"
    swapped_path = db_path + _SWAPPED_SUFFIX

    log.info("Starting database re-encryption (KDF version upgrade)")

    # Step 1: Write sentinel BEFORE any destructive operation
    with open(sentinel_path, "w") as f:
        f.write(f"rekey_started={time.time()}\n")

    src = None
    try:
        # Step 2: Open DB with old key (derive hex inline, no long-lived string)
        src = sqlcipher.connect(db_path)
        src.execute(f"PRAGMA key = \"x'{old_key.hex()}'\";")
        src.execute("SELECT count(*) FROM sqlite_master;")  # Verify old key works

        # Step 3: ATTACH new DB with new key and export
        src.execute(f"ATTACH DATABASE '{temp_path}' AS rekey_target KEY \"x'{new_key.hex()}'\"")
        src.execute("SELECT sqlcipher_export('rekey_target');")
        src.execute("DETACH DATABASE rekey_target;")
        src.close()
        src = None

        # Step 4: Verify the re-encrypted copy
        verify_conn = sqlcipher.connect(temp_path)
        verify_conn.execute(f"PRAGMA key = \"x'{new_key.hex()}'\";")
        table_count = verify_conn.execute("SELECT count(*) FROM sqlite_master;").fetchone()[0]
        verify_conn.close()
        verify_conn = None

        if table_count == 0:
            raise RuntimeError("Re-encrypted database has no tables")

        log.info("Re-encryption verified: %d objects in new DB", table_count)

    except Exception as e:
        if src is not None:
            try:
                src.close()
            except Exception:
                pass
        # Clean up temp file on failure
        gc.collect()
        time.sleep(0.1)
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                log.warning("Could not remove temp file: %s", temp_path)
        # Remove sentinel — no destructive action completed
        if os.path.exists(sentinel_path):
            try:
                os.remove(sentinel_path)
            except OSError:
                pass
        log.exception("Re-encryption failed: %s", e)
        raise RuntimeError("Re-encryption failed")

    # Step 5: Swap files (backup old, rename new)
    # Windows: must close all handles before rename. GC + sleep for safety.
    gc.collect()
    time.sleep(0.2)

    try:
        # Backup the original
        with open(db_path, "rb") as f_src:
            with open(backup_path, "wb") as f_dst:
                f_dst.write(f_src.read())

        # Replace original with re-encrypted
        with open(temp_path, "rb") as f_src:
            with open(db_path, "wb") as f_dst:
                f_dst.write(f_src.read())

        # Drop a marker the crash-recovery path can read: the main file is now
        # the new-key content, so any lingering db_path-wal is stale and safe
        # to delete. Must be written BEFORE we touch the sidecars, so a crash
        # between here and Step 5b still lets cleanup know the swap is real.
        with open(swapped_path, "w") as f:
            f.write(f"swapped_at={time.time()}\n")

    except Exception as e:
        log.exception("File swap failed during rekey: %s", e)
        # Try to restore from backup
        if os.path.exists(backup_path):
            try:
                with open(backup_path, "rb") as f_src:
                    with open(db_path, "wb") as f_dst:
                        f_dst.write(f_src.read())
                log.info("Restored original DB from backup after failed swap")
            except Exception as restore_err:
                log.error("CRITICAL: Could not restore backup: %s", restore_err)
        raise RuntimeError("File swap failed")

    # Step 5b: Drop the OLD WAL/SHM sidecars from the pre-rekey engine.
    # CRITICAL: SQLite WAL frames are encrypted page-by-page with the SAME
    # key that encrypts the main file. After we replace db_path with the
    # newly-keyed content, the old db_path-wal still has frames encrypted
    # with the OLD key. The next time SQLCipher opens db_path with the NEW
    # key, it sees the WAL, tries to apply those frames, fails the hmac
    # check, and reports "file is not a database" — even though the main
    # file is perfectly valid under the new key.
    #
    # Removing the old WAL/SHM here forces SQLite to start a fresh WAL on
    # the next open, which will be encrypted with the new key from the
    # very first frame.
    for sidecar_suffix in ("-wal", "-shm"):
        sidecar_path = db_path + sidecar_suffix
        if os.path.exists(sidecar_path):
            try:
                os.remove(sidecar_path)
                log.info("Removed stale WAL sidecar after rekey: %s", os.path.basename(sidecar_path))
            except OSError as e:
                log.error(
                    "Could not remove stale WAL sidecar %s: %s. "
                    "The next login will fail with hmac mismatch.",
                    os.path.basename(sidecar_path), e,
                )
                raise RuntimeError("Stale WAL sidecar cleanup failed")

    # Step 6: Cleanup — remove sentinel, swapped marker, temp, and backup
    for path in [sentinel_path, swapped_path, temp_path, backup_path]:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError as e:
            log.debug("Cleanup of %s failed: %s", path, e)

    log.info("Database re-encryption complete")
    return True


def check_rekey_pending(db_path: str) -> bool:
    """Check if a rekey operation was interrupted."""
    return os.path.exists(db_path + _SENTINEL_SUFFIX)


def cleanup_rekey_artifacts(db_path: str) -> None:
    """Remove leftover rekey artifacts from an interrupted rekey_database() run.

    Called during login crash recovery when check_rekey_pending(db_path) is true.

    WAL/SHM handling depends on whether the file swap completed:

    - Swap completed (``_SWAPPED_SUFFIX`` marker present): db_path now holds
      the NEW-key content, so any db_path-wal/-shm still on disk are stale
      old-key frames. Deleting them is mandatory — otherwise the next
      SQLCipher open with the new key applies those frames, fails the HMAC
      check, and reports "file is not a database".

    - Swap not started (marker absent): db_path is still the original old-key
      file and its live WAL/SHM contain valid old-key data (possibly
      committed-but-not-checkpointed). We MUST NOT delete them — doing so
      would discard user data the next login needs.

    Backup-side sidecars (``.rekey_backup-wal``, ``.rekey_backup-shm``) only
    exist if SQLCipher wrote WAL frames while the backup copy was live; they
    are not user data and are always safe to delete.
    """
    swapped_marker = db_path + _SWAPPED_SUFFIX
    swap_completed = os.path.exists(swapped_marker)

    # Always safe to clean up: rekey control files and anything tied to the
    # backup/temp copies.
    paths_to_remove = [
        db_path + _SENTINEL_SUFFIX,
        db_path + _SWAPPED_SUFFIX,
        db_path + _BACKUP_SUFFIX,
        db_path + ".rekey_tmp",
        db_path + _BACKUP_SUFFIX + "-wal",
        db_path + _BACKUP_SUFFIX + "-shm",
    ]

    # Gated on the swap marker: deleting these is data loss if the swap
    # never ran.
    if swap_completed:
        paths_to_remove.append(db_path + "-wal")
        paths_to_remove.append(db_path + "-shm")
        log.info(
            "Crash recovery: swap marker present, clearing stale WAL/SHM at %s",
            os.path.basename(db_path),
        )
    else:
        log.warning(
            "Crash recovery: no swap marker at %s — leaving db_path WAL/SHM "
            "intact (they still belong to the pre-rekey old-key state).",
            os.path.basename(db_path),
        )

    for path in paths_to_remove:
        if os.path.exists(path):
            try:
                os.remove(path)
                log.info("Cleaned up rekey artifact: %s", path)
            except OSError as e:
                log.warning("Could not clean up %s: %s", path, e)

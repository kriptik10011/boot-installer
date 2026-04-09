"""
Backup/Restore API endpoints.

Security: This module handles database backup/restore operations.
- File paths are sanitized and not exposed to clients
- Path traversal attacks are prevented
- Encrypted (SQLCipher) database files are accepted for restore
- Plaintext databases are rejected on export (safety check)
"""

import glob
import logging
import os
import shutil
import time
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from fastapi.responses import FileResponse
from platformdirs import user_data_dir
from slowapi import Limiter
from slowapi.util import get_remote_address

from sqlalchemy.orm import Session

from app.database import get_database_path, get_db
from app.db.auth_database import get_auth_db
from app.auth.pin import verify_pin
from app.schemas.backup import BackupInfo, ExportRequest, RestoreRequest, UploadResponse, RestoreResponse, DatabaseInfoResponse, DeleteRequest, DeleteResponse

_SQLITE_PLAINTEXT_HEADER = b"SQLite format 3\x00"
_MIN_DB_SIZE = 1024  # Minimum SQLCipher page size
_MAX_UPLOAD_FILES = 20  # Max files to keep in upload directory
_UPLOAD_MAX_AGE_DAYS = 7

logger = logging.getLogger("weekly_review")
limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


def _verify_pin_if_user_exists(auth_db: Session, pin: str) -> None:
    """Require PIN re-authentication for destructive ops when user exists."""
    from sqlalchemy.exc import OperationalError as SAOperationalError
    try:
        from app.models.user import User
        user = auth_db.query(User).first()
        if user and not verify_pin(pin, user.pin_hash, user.pin_salt):
            raise HTTPException(status_code=403, detail="PIN verification failed")
    except HTTPException:
        raise
    except SAOperationalError:
        if os.environ.get("WEEKLY_REVIEW_TEST_MODE") == "true":
            logger.debug("PIN verification skipped — test mode")
        else:
            logger.error("PIN verification failed — auth table not available")
            raise HTTPException(status_code=503, detail="Authentication unavailable")


def _cleanup_old_uploads():
    """Remove uploaded files older than _UPLOAD_MAX_AGE_DAYS. Keep at most _MAX_UPLOAD_FILES."""
    try:
        cutoff = time.time() - (_UPLOAD_MAX_AGE_DAYS * 86400)
        db_files = sorted(glob.glob(os.path.join(UPLOAD_DIR, "*.db")), key=os.path.getmtime)
        for f in db_files:
            if os.path.getmtime(f) < cutoff or len(db_files) > _MAX_UPLOAD_FILES:
                os.remove(f)
                db_files.remove(f)
                logger.debug("Cleaned up old upload: %s", os.path.basename(f))
    except Exception as e:
        logger.debug("Upload cleanup failed: %s", e)

# Get database path from central config
DATABASE_PATH = str(get_database_path())

# Private upload directory within app data
UPLOAD_DIR = os.path.join(user_data_dir("WeeklyReview", False), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)



# =============================================================================
# Endpoints
# =============================================================================

@router.post("/export", response_class=FileResponse)
@limiter.limit("5/minute")
def export_database(request: Request, body: ExportRequest, auth_db: Session = Depends(get_auth_db)):
    """
    Export the database file for backup.

    Requires PIN re-authentication. Returns the SQLite database file as a download.
    """
    _verify_pin_if_user_exists(auth_db, body.pin)
    logger.info("DATABASE EXPORT requested (PIN verified)")
    if not os.path.exists(DATABASE_PATH):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database file not found"
        )

    # Safety: verify file is encrypted (should NOT start with plaintext SQLite header)
    with open(DATABASE_PATH, "rb") as f:
        header = f.read(16)
    if header.startswith(_SQLITE_PLAINTEXT_HEADER):
        logger.error("SECURITY: Database file appears unencrypted — refusing export")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database integrity error — contact support"
        )

    # Generate backup filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"weekly_review_backup_{timestamp}.db"

    return FileResponse(
        path=DATABASE_PATH,
        filename=backup_filename,
        media_type="application/octet-stream"
    )


@router.post("/restore", response_model=RestoreResponse)
@limiter.limit("5/minute")
def restore_database(request: Request, body: RestoreRequest, auth_db: Session = Depends(get_auth_db)):
    """
    Restore the database from a backup file.

    WARNING: This will replace the current database.
    The file_id must correspond to a previously uploaded file.
    Requires PIN re-authentication when user exists.
    """
    # Re-authenticate before destructive operation
    _verify_pin_if_user_exists(auth_db, body.pin)
    logger.warning("DATABASE RESTORE requested from uploaded file")
    # Reconstruct path from file_id (which is just the filename)
    # This prevents clients from specifying arbitrary paths
    backup_path = os.path.join(UPLOAD_DIR, body.file_id)

    # Security: Use realpath to resolve symlinks and prevent symlink attacks
    real_backup_path = os.path.realpath(backup_path)
    allowed_dir = os.path.realpath(UPLOAD_DIR)

    # Reject symlinks explicitly
    if os.path.islink(backup_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Symbolic links are not allowed"
        )

    # Ensure the resolved path is within the allowed directory
    if not real_backup_path.startswith(allowed_dir + os.sep) and real_backup_path != allowed_dir:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid backup path: file must be within the upload directory"
        )

    if not os.path.exists(real_backup_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup file not found"
        )

    # Validate file is a database (encrypted or plaintext)
    file_size = os.path.getsize(real_backup_path)
    if file_size < _MIN_DB_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too small to be a valid database"
        )

    # Note: Schema validation with standard sqlite3 is impossible for encrypted
    # (SQLCipher) backups — the file is opaque without the encryption key.
    # The pre-restore backup below provides a safety net. After restore, the user
    # must re-login; login validates the key against the restored DB. If the key
    # doesn't match (wrong backup), login fails and user can restore from the
    # pre-restore backup.

    # Create backup of current database before restoring (save to temp dir, not CWD)
    if os.path.exists(DATABASE_PATH):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pre_restore_backup = os.path.join(UPLOAD_DIR, f"weekly_review_pre_restore_{timestamp}.db")
        shutil.copy2(DATABASE_PATH, pre_restore_backup)
        logger.info("Pre-restore backup saved: %s", os.path.basename(pre_restore_backup))

    # Restore: copy to temp then replace for best-effort atomicity
    # Note: os.replace may fail if sqlcipher3 has the file open; shutil.copy2 is
    # the fallback. Pre-restore backup provides recovery in either case.
    temp_restore = DATABASE_PATH + ".restore_tmp"
    try:
        shutil.copy2(real_backup_path, temp_restore)
        os.replace(temp_restore, DATABASE_PATH)
    except OSError:
        # os.replace failed (likely sqlcipher3 lock) — fall back to direct copy
        logger.warning("Atomic restore failed, falling back to direct copy")
        if os.path.exists(temp_restore):
            os.remove(temp_restore)
        shutil.copy2(real_backup_path, DATABASE_PATH)

    _cleanup_old_uploads()

    return {
        "status": "success",
        "message": "Database restored. Please re-login to activate."
    }


@router.get("/info", response_model=DatabaseInfoResponse)
@limiter.limit("30/minute")
def get_database_info(request: Request):
    """Get information about the current database."""
    if not os.path.exists(DATABASE_PATH):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database file not found"
        )

    stat = os.stat(DATABASE_PATH)

    return {
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


@router.delete("/database", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def delete_all_data(request: Request, body: DeleteRequest, db: Session = Depends(get_db), auth_db: Session = Depends(get_auth_db)):
    """
    Delete all data from the database (drops and recreates all tables).

    WARNING: This is a destructive operation that cannot be undone.
    The database file is preserved but all tables are recreated empty.
    Requires PIN re-authentication when user exists.
    """
    _verify_pin_if_user_exists(auth_db, body.pin)
    logger.warning("DATABASE WIPE requested")

    # Create safety backup before destructive wipe
    if os.path.exists(DATABASE_PATH):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pre_delete_backup = os.path.join(UPLOAD_DIR, f"weekly_review_pre_delete_{timestamp}.db")
        shutil.copy2(DATABASE_PATH, pre_delete_backup)
        logger.info("Pre-delete backup saved: %s", os.path.basename(pre_delete_backup))

    from app.database import Base

    try:
        # Get engine from the current session's bind (works with both
        # production engine and test in-memory engine)
        bound_engine = db.get_bind()

        # Get table count before deletion for reporting
        from sqlalchemy import inspect
        inspector = inspect(bound_engine)
        table_names = inspector.get_table_names()
        table_count = len(table_names)

        # Drop all tables
        Base.metadata.drop_all(bind=bound_engine)

        # Recreate all tables (empty)
        Base.metadata.create_all(bind=bound_engine)

        return None
    except Exception:
        logger.exception("Database deletion failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database deletion failed. Check server logs."
        )


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def upload_backup_file(request: Request, file: UploadFile = File(...)):
    """
    Upload a backup file for restoration.

    Returns the temporary path where the file was saved.
    """
    # Validate file extension
    if not file.filename or not file.filename.endswith('.db'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have .db extension"
        )

    # Read file content with bounded read to prevent OOM (DoS protection)
    MAX_BACKUP_SIZE = 100 * 1024 * 1024  # 100MB
    content = await file.read(MAX_BACKUP_SIZE + 1)
    if len(content) > MAX_BACKUP_SIZE:
        raise HTTPException(status_code=413, detail="Backup file exceeds 100MB limit")

    # Validate minimum size (encrypted DB has at least one page)
    if len(content) < _MIN_DB_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too small to be a valid database"
        )

    # Save to temporary location
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_filename = f"weekly_review_upload_{timestamp}.db"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)

    with open(temp_path, "wb") as f:
        f.write(content)

    return UploadResponse(
        file_id=temp_filename,  # Return opaque ID, not full path
        filename=file.filename,
        size_bytes=len(content)
    )

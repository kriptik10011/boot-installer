"""
Calendar import router — import events from .ics files (read-only).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.calendar_import import IcsImportRequest, ImportedEventItem, IcsImportResponse, IcsPreviewItem
from app.services.calendar_import import import_ics_events, parse_ics_content

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

MAX_ICS_SIZE = 5 * 1024 * 1024  # 5 MB


# --- Endpoints ---

@router.post("/import", response_model=IcsImportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def import_calendar(request: Request, data: IcsImportRequest, db: Session = Depends(get_db)):
    """
    Import events from raw .ics content.

    Pass the full .ics file content as a string.
    Events are created in the database with optional category assignment.
    Duplicate detection: skip events with matching title + date.
    """
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="Empty .ics content")

    if len(data.content) > MAX_ICS_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    if 'BEGIN:VCALENDAR' not in data.content:
        raise HTTPException(status_code=400, detail="Invalid .ics format: missing VCALENDAR")

    result = import_ics_events(
        db=db,
        content=data.content,
        category_id=data.category_id,
        skip_duplicates=data.skip_duplicates,
    )
    return result


@router.post("/preview", response_model=List[IcsPreviewItem])
@limiter.limit("20/minute")
def preview_calendar(request: Request, data: IcsImportRequest):
    """
    Preview events from .ics content without importing.

    Returns parsed events for user review before committing.
    """
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="Empty .ics content")

    if len(data.content) > MAX_ICS_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    parsed = parse_ics_content(data.content)

    return [
        IcsPreviewItem(
            title=e.get('title', ''),
            date=e.get('date', '').isoformat() if hasattr(e.get('date', ''), 'isoformat') else str(e.get('date', '')),
            start_time=e.get('start_time'),
            end_time=e.get('end_time'),
            notes=e.get('notes'),
            location=e.get('location'),
        )
        for e in parsed
    ]


@router.post("/upload", response_model=IcsImportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def upload_calendar_file(
    request: Request,
    file: UploadFile = File(...),
    category_id: Optional[int] = None,
    skip_duplicates: bool = True,
    db: Session = Depends(get_db),
):
    """
    Import events from an uploaded .ics file.

    Accepts multipart form data with file upload.
    """
    if not file.filename or not file.filename.endswith('.ics'):
        raise HTTPException(status_code=400, detail="File must be .ics format")

    content = await file.read(MAX_ICS_SIZE + 1)
    if len(content) > MAX_ICS_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")
    content_str = content.decode('utf-8', errors='replace')

    if 'BEGIN:VCALENDAR' not in content_str:
        raise HTTPException(status_code=400, detail="Invalid .ics format: missing VCALENDAR")

    result = import_ics_events(
        db=db,
        content=content_str,
        category_id=category_id,
        skip_duplicates=skip_duplicates,
    )
    return result

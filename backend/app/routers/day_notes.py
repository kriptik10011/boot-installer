"""
Day Notes API — freeform text notes attached to each day.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.day_note import DayNote
from app.schemas.day_notes import DayNoteCreate, DayNoteUpdate, DayNoteResponse
from app.utils.week_utils import get_week_range

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# Endpoints
@router.get("/week/{week_start}", response_model=List[DayNoteResponse])
@limiter.limit("100/minute")
def get_week_notes(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get all notes for a week (7 days starting from week_start)."""
    _, end = get_week_range(week_start)
    notes = db.query(DayNote).filter(
        DayNote.date >= week_start,
        DayNote.date < end,
    ).order_by(DayNote.date).limit(500).all()
    return notes


@router.get("/{note_date}", response_model=Optional[DayNoteResponse])
@limiter.limit("100/minute")
def get_day_note(request: Request, note_date: date, db: Session = Depends(get_db)):
    """Get note for a specific date. Returns null if no note exists."""
    note = db.query(DayNote).filter(DayNote.date == note_date).first()
    if not note:
        return None
    return note


@router.post("/", response_model=DayNoteResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_or_update_note(request: Request, data: DayNoteCreate, db: Session = Depends(get_db)):
    """Create or update a note for a date (upsert). One note per day."""
    existing = db.query(DayNote).filter(DayNote.date == data.date).first()
    if existing:
        existing.content = data.content
        if data.mood is not None:
            existing.mood = data.mood
        existing.is_pinned = data.is_pinned
        db.commit()
        db.refresh(existing)
        return existing

    note = DayNote(
        date=data.date,
        content=data.content,
        mood=data.mood,
        is_pinned=data.is_pinned,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.put("/{note_date}", response_model=DayNoteResponse)
@limiter.limit("30/minute")
def update_note(request: Request, note_date: date, data: DayNoteUpdate, db: Session = Depends(get_db)):
    """Update an existing note."""
    note = db.query(DayNote).filter(DayNote.date == note_date).first()
    if not note:
        raise HTTPException(status_code=404, detail="No note for this date")
    if data.content is not None:
        note.content = data.content
    if data.mood is not None:
        note.mood = data.mood
    if data.is_pinned is not None:
        note.is_pinned = data.is_pinned
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_date}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_note(request: Request, note_date: date, db: Session = Depends(get_db)):
    """Delete a note for a specific date."""
    note = db.query(DayNote).filter(DayNote.date == note_date).first()
    if not note:
        raise HTTPException(status_code=404, detail="No note for this date")
    db.delete(note)
    db.commit()
    return None

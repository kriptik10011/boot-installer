"""
Events API endpoints.
"""

import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import Event
from app.utils.week_utils import get_week_range
from app.services.recurrence_expander import expand_recurrence
from app.schemas.events import (
    EventCreate, EventUpdate, EventResponse, EventOccurrenceResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=List[EventResponse])
@limiter.limit("100/minute")
def list_events(
    request: Request,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List all events, optionally filtered by category."""
    query = db.query(Event)
    if category_id:
        query = query.filter(Event.category_id == category_id)
    return query.order_by(Event.date, Event.start_time).limit(1000).all()


@router.get("/week/{week_start}", response_model=List[EventOccurrenceResponse])
@limiter.limit("100/minute")
def get_events_for_week(
    request: Request,
    week_start: datetime.date,
    db: Session = Depends(get_db)
):
    """
    Get events for a specific week (7 days starting from week_start).

    Includes expanded occurrences of recurring events.
    Virtual occurrences have is_occurrence=True and master_id set.
    """
    _, week_end = get_week_range(week_start)

    # Get non-recurring events in the week range
    non_recurring = db.query(Event).filter(
        Event.date >= week_start,
        Event.date < week_end,
        Event.recurrence_rule_id.is_(None)
    ).limit(500).all()

    # Get all recurring events (they may have master dates outside this week)
    recurring_events = db.query(Event).options(
        joinedload(Event.recurrence_rule)
    ).filter(
        Event.recurrence_rule_id.isnot(None)
    ).limit(1000).all()

    # Build result list
    results: List[dict] = []

    # Add non-recurring events (not occurrences)
    for event in non_recurring:
        results.append({
            "id": event.id,
            "name": event.name,
            "date": event.date,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "location": event.location,
            "description": event.description,
            "category_id": event.category_id,
            "recurrence_rule_id": event.recurrence_rule_id,
            "created_at": event.created_at,
            "updated_at": event.updated_at,
            "is_occurrence": False,
            "master_id": None,
            "occurrence_date": None,
        })

    # Expand recurring events
    for event in recurring_events:
        rule = event.recurrence_rule
        if not rule:
            continue

        # Get all occurrence dates within this week
        occurrence_dates = expand_recurrence(
            rule=rule,
            start_date=week_start,
            end_date=week_end,
            master_date=event.date,
        )

        for occ_date in occurrence_dates:
            is_master = occ_date == event.date
            results.append({
                "id": event.id,
                "name": event.name,
                "date": occ_date,  # Use occurrence date, not master date
                "start_time": event.start_time,
                "end_time": event.end_time,
                "location": event.location,
                "description": event.description,
                "category_id": event.category_id,
                "recurrence_rule_id": event.recurrence_rule_id,
                "created_at": event.created_at,
                "updated_at": event.updated_at,
                "is_occurrence": not is_master,
                "master_id": event.id if not is_master else None,
                "occurrence_date": occ_date,
            })

    # Sort by date and start_time
    results.sort(key=lambda x: (x["date"], x["start_time"] or ""))

    return results


@router.get("/{event_id}", response_model=EventResponse)
@limiter.limit("100/minute")
def get_event(request: Request, event_id: int, db: Session = Depends(get_db)):
    """Get a single event by ID."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    return event


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_event(request: Request, event: EventCreate, db: Session = Depends(get_db)):
    """Create a new event."""
    db_event = Event(**event.model_dump())
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@router.put("/{event_id}", response_model=EventResponse)
@limiter.limit("30/minute")
def update_event(request: Request, event_id: int, event: EventUpdate, db: Session = Depends(get_db)):
    """Update an existing event."""
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    update_data = event.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_event, key, value)

    db.commit()
    db.refresh(db_event)
    return db_event


@router.delete("/{event_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_event(request: Request, event_id: int, db: Session = Depends(get_db)):
    """Delete an event."""
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    db.delete(db_event)
    db.commit()
    return None

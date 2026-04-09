"""
Batch Meal Prep API — schedule prep sessions and link meals.
"""

from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.batch_prep import BatchPrepSession, BatchPrepTask, BatchPrepMeal
from app.schemas.batch_prep import (
    PrepTaskCreate,
    PrepTaskResponse,
    PrepTaskToggleResponse,
    PrepMealLinkResponse,
    PrepSessionCreate,
    PrepSessionUpdate,
    PrepSessionResponse,
)
from app.utils.week_utils import get_week_range

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _build_response(session: BatchPrepSession) -> dict:
    """Build response dict from session model."""
    return {
        "id": session.id,
        "name": session.name,
        "prep_date": session.prep_date,
        "prep_start_time": session.prep_start_time,
        "estimated_duration_minutes": session.estimated_duration_minutes,
        "actual_duration_minutes": session.actual_duration_minutes,
        "description": session.description,
        "is_completed": session.is_completed,
        "completed_at": str(session.completed_at) if session.completed_at else None,
        "tasks": [
            {
                "id": t.id,
                "task_name": t.task_name,
                "is_completed": t.is_completed,
                "sort_order": t.sort_order,
                "estimated_minutes": t.estimated_minutes,
                "notes": t.notes,
            }
            for t in sorted(session.tasks, key=lambda t: t.sort_order)
        ],
        "meal_ids": [ml.meal_id for ml in session.meal_links if ml.meal_id is not None],
    }


# Endpoints
@router.get("/", response_model=List[PrepSessionResponse])
@limiter.limit("100/minute")
def list_sessions(request: Request, db: Session = Depends(get_db)):
    """List all prep sessions."""
    sessions = db.query(BatchPrepSession).order_by(
        BatchPrepSession.prep_date.desc()
    ).limit(1000).all()
    return [_build_response(s) for s in sessions]


@router.get("/week/{week_start}", response_model=List[PrepSessionResponse])
@limiter.limit("100/minute")
def get_week_sessions(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get prep sessions for a specific week."""
    _, end = get_week_range(week_start)
    sessions = db.query(BatchPrepSession).filter(
        BatchPrepSession.prep_date >= week_start,
        BatchPrepSession.prep_date < end,
    ).order_by(BatchPrepSession.prep_date).limit(500).all()
    return [_build_response(s) for s in sessions]


@router.get("/{session_id}", response_model=PrepSessionResponse)
@limiter.limit("100/minute")
def get_session(request: Request, session_id: int, db: Session = Depends(get_db)):
    """Get a specific prep session."""
    session = db.get(BatchPrepSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Prep session not found")
    return _build_response(session)


@router.post("/", response_model=PrepSessionResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_session(request: Request, data: PrepSessionCreate, db: Session = Depends(get_db)):
    """Create a new prep session with optional tasks and meal links."""
    session = BatchPrepSession(
        name=data.name,
        prep_date=data.prep_date,
        prep_start_time=data.prep_start_time,
        estimated_duration_minutes=data.estimated_duration_minutes,
        description=data.description,
    )
    db.add(session)
    db.flush()

    # Add tasks
    for i, task_data in enumerate(data.tasks):
        task = BatchPrepTask(
            session_id=session.id,
            task_name=task_data.task_name,
            sort_order=i,
            estimated_minutes=task_data.estimated_minutes,
            notes=task_data.notes,
        )
        db.add(task)

    # Link meals
    for meal_id in data.meal_ids:
        link = BatchPrepMeal(session_id=session.id, meal_id=meal_id)
        db.add(link)

    db.commit()
    db.refresh(session)
    return _build_response(session)


@router.put("/{session_id}", response_model=PrepSessionResponse)
@limiter.limit("30/minute")
def update_session(request: Request, session_id: int, data: PrepSessionUpdate, db: Session = Depends(get_db)):
    """Update a prep session."""
    session = db.get(BatchPrepSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Prep session not found")
    if data.name is not None:
        session.name = data.name
    if data.prep_date is not None:
        session.prep_date = data.prep_date
    if data.prep_start_time is not None:
        session.prep_start_time = data.prep_start_time
    if data.estimated_duration_minutes is not None:
        session.estimated_duration_minutes = data.estimated_duration_minutes
    if data.description is not None:
        session.description = data.description
    db.commit()
    db.refresh(session)
    return _build_response(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_session(request: Request, session_id: int, db: Session = Depends(get_db)):
    """Delete a prep session (cascades to tasks and meal links)."""
    session = db.get(BatchPrepSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Prep session not found")
    db.delete(session)
    db.commit()
    return None


@router.post("/{session_id}/complete", response_model=PrepSessionResponse)
@limiter.limit("30/minute")
def complete_session(
    request: Request,
    session_id: int,
    actual_duration_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Mark a prep session as completed."""
    session = db.get(BatchPrepSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Prep session not found")
    session.is_completed = True
    session.completed_at = datetime.now(timezone.utc)
    if actual_duration_minutes is not None:
        session.actual_duration_minutes = actual_duration_minutes
    db.commit()
    db.refresh(session)
    return _build_response(session)


@router.post("/{session_id}/tasks", response_model=PrepTaskResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def add_task(request: Request, session_id: int, data: PrepTaskCreate, db: Session = Depends(get_db)):
    """Add a task to a prep session."""
    session = db.get(BatchPrepSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Prep session not found")
    max_order = max((t.sort_order for t in session.tasks), default=-1)
    task = BatchPrepTask(
        session_id=session_id,
        task_name=data.task_name,
        sort_order=max_order + 1,
        estimated_minutes=data.estimated_minutes,
        notes=data.notes,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{session_id}/tasks/{task_id}", response_model=PrepTaskToggleResponse)
@limiter.limit("30/minute")
def toggle_task(request: Request, session_id: int, task_id: int, db: Session = Depends(get_db)):
    """Toggle a task's completion status."""
    task = db.get(BatchPrepTask, task_id)
    if not task or task.session_id != session_id:
        raise HTTPException(status_code=404, detail="Task not found")
    task.is_completed = not task.is_completed
    db.commit()
    db.refresh(task)
    return {"id": task.id, "is_completed": task.is_completed}


@router.post("/{session_id}/meals", response_model=PrepMealLinkResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def link_meals(request: Request, session_id: int, meal_ids: List[int], db: Session = Depends(get_db)):
    """Link meals to a prep session (replaces existing links)."""
    session = db.get(BatchPrepSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Prep session not found")

    # Remove existing links
    db.query(BatchPrepMeal).filter(
        BatchPrepMeal.session_id == session_id,
    ).delete()

    # Add new links
    for meal_id in meal_ids:
        db.add(BatchPrepMeal(session_id=session_id, meal_id=meal_id))

    db.commit()
    return {"linked_meals": len(meal_ids)}

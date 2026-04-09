"""
Recurrence Rules API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.recurrence import RecurrenceRule, RecurrenceFrequency, RecurrenceEndType
from app.schemas.recurrence import (
    RecurrenceRuleBase, RecurrenceRuleCreate, RecurrenceRuleResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Helper Functions
# =============================================================================

def validate_recurrence_rule(data: RecurrenceRuleBase) -> None:
    """Validate recurrence rule data."""
    # Validate frequency
    if hasattr(data, 'frequency') and data.frequency:
        valid_frequencies = [f.value for f in RecurrenceFrequency]
        if data.frequency not in valid_frequencies:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid frequency. Must be one of: {valid_frequencies}"
            )

    # Validate end_type
    if hasattr(data, 'end_type') and data.end_type:
        valid_end_types = [e.value for e in RecurrenceEndType]
        if data.end_type not in valid_end_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid end_type. Must be one of: {valid_end_types}"
            )

    # Validate interval
    if hasattr(data, 'interval') and data.interval is not None:
        if data.interval < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interval must be at least 1"
            )

    # Validate day_of_week
    if hasattr(data, 'day_of_week') and data.day_of_week is not None:
        if data.day_of_week < 0 or data.day_of_week > 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="day_of_week must be between 0 (Sunday) and 6 (Saturday)"
            )

    # Validate day_of_month
    if hasattr(data, 'day_of_month') and data.day_of_month is not None:
        if data.day_of_month < 1 or data.day_of_month > 31:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="day_of_month must be between 1 and 31"
            )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/{rule_id}", response_model=RecurrenceRuleResponse)
@limiter.limit("100/minute")
def get_recurrence_rule(request: Request, rule_id: int, db: Session = Depends(get_db)):
    """Get a single recurrence rule by ID."""
    rule = db.query(RecurrenceRule).filter(RecurrenceRule.id == rule_id).first()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurrence rule not found"
        )
    return rule


@router.post("", response_model=RecurrenceRuleResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_recurrence_rule(request: Request, rule: RecurrenceRuleCreate, db: Session = Depends(get_db)):
    """Create a new recurrence rule."""
    validate_recurrence_rule(rule)

    db_rule = RecurrenceRule(
        frequency=RecurrenceFrequency(rule.frequency),
        interval=rule.interval,
        day_of_week=rule.day_of_week,
        day_of_month=rule.day_of_month,
        end_type=RecurrenceEndType(rule.end_type),
        end_count=rule.end_count,
        end_date=rule.end_date,
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule


@router.delete("/{rule_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_recurrence_rule(request: Request, rule_id: int, db: Session = Depends(get_db)):
    """Delete a recurrence rule."""
    db_rule = db.query(RecurrenceRule).filter(RecurrenceRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurrence rule not found"
        )

    db.delete(db_rule)
    db.commit()
    return None

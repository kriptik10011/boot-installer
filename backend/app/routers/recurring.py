"""
Recurring transactions API router — bills and subscriptions.
"""

from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.schemas.budget import (
    TransactionRecurrenceCreate, TransactionRecurrenceUpdate,
    TransactionRecurrenceResponse, TransactionResponse,
    RecurringBillStatusResponse, SubscriptionSummaryResponse,
)
from app.services.transaction_service import (
    get_upcoming_recurring, get_subscription_summary,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/", response_model=List[TransactionRecurrenceResponse])
@limiter.limit("30/minute")
def list_recurring(
    request: Request,
    is_active: Optional[bool] = None,
    is_subscription: Optional[bool] = None,
    status: Optional[str] = Query(None, pattern="^(overdue|upcoming)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """List all recurring transaction templates.

    status=overdue: active items past due date
    status=upcoming: active items due within `days` days
    """
    query = db.query(TransactionRecurrence)
    if is_active is not None:
        query = query.filter(TransactionRecurrence.is_active == is_active)
    if is_subscription is not None:
        query = query.filter(TransactionRecurrence.is_subscription == is_subscription)
    if status == "overdue":
        today = date.today()
        query = query.filter(
            TransactionRecurrence.is_active == True,
            TransactionRecurrence.next_due_date != None,
            TransactionRecurrence.next_due_date < today,
        )
    elif status == "upcoming":
        today = date.today()
        query = query.filter(
            TransactionRecurrence.is_active == True,
            TransactionRecurrence.next_due_date != None,
            TransactionRecurrence.next_due_date >= today,
            TransactionRecurrence.next_due_date <= today + timedelta(days=days),
        )
    return query.order_by(TransactionRecurrence.next_due_date).limit(1000).all()


@router.get("/upcoming", response_model=List[RecurringBillStatusResponse])
@limiter.limit("30/minute")
def upcoming_bills(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Get recurring bills/subscriptions due within N days."""
    results = get_upcoming_recurring(db, days)
    return [
        RecurringBillStatusResponse(
            id=r.id,
            description=r.description,
            amount=r.amount,
            frequency=r.frequency,
            next_due_date=r.next_due_date,
            is_overdue=r.is_overdue,
            days_until_due=r.days_until_due,
            is_subscription=r.is_subscription,
            subscription_service=r.subscription_service,
        )
        for r in results
    ]


@router.get("/overdue", response_model=List[RecurringBillStatusResponse])
@limiter.limit("30/minute")
def overdue_bills(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get all overdue recurring bills."""
    today = date.today()
    recurrences = db.query(TransactionRecurrence).filter(
        TransactionRecurrence.is_active == True,
        TransactionRecurrence.next_due_date != None,
        TransactionRecurrence.next_due_date < today,
    ).order_by(TransactionRecurrence.next_due_date).limit(1000).all()

    return [
        RecurringBillStatusResponse(
            id=rec.id,
            description=rec.description,
            amount=rec.amount,
            frequency=rec.frequency,
            next_due_date=rec.next_due_date,
            is_overdue=True,
            days_until_due=(rec.next_due_date - today).days,
            is_subscription=rec.is_subscription,
            subscription_service=rec.subscription_service,
        )
        for rec in recurrences
    ]


@router.get("/subscriptions/summary", response_model=SubscriptionSummaryResponse)
@limiter.limit("30/minute")
def subscriptions_summary(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get subscription summary with monthly and annual totals."""
    return get_subscription_summary(db)


@router.get("/{recurrence_id}", response_model=TransactionRecurrenceResponse)
@limiter.limit("30/minute")
def get_recurring(request: Request, recurrence_id: int, db: Session = Depends(get_db)):
    """Get a single recurring transaction template."""
    rec = db.query(TransactionRecurrence).filter(TransactionRecurrence.id == recurrence_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    return rec


@router.post("/", response_model=TransactionRecurrenceResponse, status_code=201)
@limiter.limit("30/minute")
def create_recurring(
    request: Request, data: TransactionRecurrenceCreate, db: Session = Depends(get_db)
):
    """Create a new recurring transaction template (bill or subscription)."""
    rec = TransactionRecurrence(**data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/{recurrence_id}", response_model=TransactionRecurrenceResponse)
@limiter.limit("30/minute")
def update_recurring(
    request: Request, recurrence_id: int, data: TransactionRecurrenceUpdate,
    db: Session = Depends(get_db),
):
    """Update a recurring transaction template."""
    rec = db.query(TransactionRecurrence).filter(TransactionRecurrence.id == recurrence_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rec, field, value)

    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{recurrence_id}", status_code=204)
@limiter.limit("30/minute")
def deactivate_recurring(
    request: Request, recurrence_id: int, db: Session = Depends(get_db)
):
    """Deactivate a recurring transaction (soft delete)."""
    rec = db.query(TransactionRecurrence).filter(TransactionRecurrence.id == recurrence_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    rec.is_active = False
    db.commit()


@router.post("/{recurrence_id}/mark-paid", response_model=TransactionResponse, status_code=201)
@limiter.limit("30/minute")
def mark_recurring_paid(
    request: Request, recurrence_id: int, db: Session = Depends(get_db),
):
    """Record payment for a recurring bill. Creates a Transaction and advances next_due_date."""
    from dateutil.relativedelta import relativedelta

    rec = db.query(TransactionRecurrence).filter(TransactionRecurrence.id == recurrence_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")

    if not rec.is_active:
        raise HTTPException(status_code=400, detail="Cannot pay an inactive recurring bill")

    # Create the transaction
    txn = Transaction(
        date=date.today(),
        amount=rec.amount,
        description=rec.description,
        merchant=rec.merchant,
        category_id=rec.category_id,
        is_income=False,
        is_recurring=True,
        recurrence_id=rec.id,
    )
    db.add(txn)

    # Record payment date
    rec.last_paid_date = date.today()

    # Advance next_due_date based on frequency
    if rec.next_due_date:
        if rec.frequency == "weekly":
            rec.next_due_date = rec.next_due_date + relativedelta(weeks=1)
        elif rec.frequency == "biweekly":
            rec.next_due_date = rec.next_due_date + relativedelta(weeks=2)
        elif rec.frequency == "monthly":
            rec.next_due_date = rec.next_due_date + relativedelta(months=1)
        elif rec.frequency == "quarterly":
            rec.next_due_date = rec.next_due_date + relativedelta(months=3)
        elif rec.frequency == "annual":
            rec.next_due_date = rec.next_due_date + relativedelta(years=1)

    db.commit()
    db.refresh(txn)
    return txn

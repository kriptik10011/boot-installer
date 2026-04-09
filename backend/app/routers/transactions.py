"""
Transactions API router — expense and income tracking.
"""

from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.transaction import Transaction
from app.schemas.budget import (
    TransactionCreate, TransactionUpdate, TransactionResponse,
    DuplicateCheckResponse, MerchantCategorySuggestionResponse,
    SplitTransactionRequest, SpendingVelocityResponse,
)
from app.services.transaction_service import (
    check_duplicate, suggest_category_for_merchant,
    create_split_transaction, calculate_spending_velocity,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/", response_model=List[TransactionResponse])
@limiter.limit("30/minute")
def list_transactions(
    request: Request,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[int] = None,
    is_income: Optional[bool] = None,
    merchant: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """List transactions with filtering and pagination."""
    query = db.query(Transaction)

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if is_income is not None:
        query = query.filter(Transaction.is_income == is_income)
    if merchant:
        safe = merchant.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        query = query.filter(Transaction.merchant.ilike(f"%{safe}%", escape="\\"))

    return query.order_by(desc(Transaction.date), desc(Transaction.id)).offset(offset).limit(limit).all()


@router.get("/check-duplicate", response_model=DuplicateCheckResponse)
@limiter.limit("30/minute")
def check_duplicate_transaction(
    request: Request,
    amount: float = Query(..., gt=0, le=10_000_000),
    merchant: str = Query(..., min_length=1, max_length=200),
    txn_date: date = Query(...),
    db: Session = Depends(get_db),
):
    """Check if a similar transaction already exists (same merchant + amount within 24h)."""
    warning = check_duplicate(db, amount, merchant, txn_date)
    if warning:
        return DuplicateCheckResponse(
            is_duplicate=True,
            existing_id=warning.existing_id,
            existing_description=warning.existing_description,
            existing_date=warning.existing_date,
            existing_amount=warning.existing_amount,
            similarity_reason=warning.similarity_reason,
        )
    return DuplicateCheckResponse(is_duplicate=False)


@router.get("/suggest-category/{merchant}", response_model=MerchantCategorySuggestionResponse)
@limiter.limit("30/minute")
def suggest_category(
    request: Request,
    merchant: str,
    db: Session = Depends(get_db),
):
    """Suggest a budget category for a merchant based on past transaction history."""
    suggestion = suggest_category_for_merchant(db, merchant)
    if suggestion:
        return MerchantCategorySuggestionResponse(
            has_suggestion=True,
            category_id=suggestion.category_id,
            category_name=suggestion.category_name,
            confidence=suggestion.confidence,
            transaction_count=suggestion.transaction_count,
        )
    return MerchantCategorySuggestionResponse(has_suggestion=False)


@router.get("/spending-velocity", response_model=List[SpendingVelocityResponse])
@limiter.limit("30/minute")
def spending_velocity(
    request: Request,
    period_start: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get spending velocity (pacing) for each budget category in current period."""
    results = calculate_spending_velocity(db, period_start)
    return [
        SpendingVelocityResponse(
            category_id=v.category_id,
            category_name=v.category_name,
            budget_amount=v.budget_amount,
            spent_amount=v.spent_amount,
            pct_budget_used=v.pct_budget_used,
            pct_period_elapsed=v.pct_period_elapsed,
            velocity=v.velocity,
            status=v.status,
            days_remaining=v.days_remaining,
        )
        for v in results
    ]


@router.post("/split", response_model=List[TransactionResponse], status_code=201)
@limiter.limit("30/minute")
def split_transaction(
    request: Request,
    data: SplitTransactionRequest,
    db: Session = Depends(get_db),
):
    """Create a split transaction — one purchase across multiple budget categories."""
    splits = [(s.category_id, s.amount) for s in data.splits]
    try:
        transactions = create_split_transaction(
            db=db,
            txn_date=data.date,
            total_amount=data.total_amount,
            description=data.description,
            splits=splits,
            merchant=data.merchant,
            payment_method=data.payment_method,
            notes=data.notes,
        )
        db.commit()
        for txn in transactions:
            db.refresh(txn)
        return transactions
    except ValueError as e:
        raise HTTPException(status_code=422, detail="Transaction processing error")


@router.get("/{transaction_id}", response_model=TransactionResponse)
@limiter.limit("30/minute")
def get_transaction(request: Request, transaction_id: int, db: Session = Depends(get_db)):
    """Get a single transaction."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


@router.post("/", response_model=TransactionResponse, status_code=201)
@limiter.limit("60/minute")
def create_transaction(request: Request, data: TransactionCreate, db: Session = Depends(get_db)):
    """Create a new transaction (expense or income)."""
    txn = Transaction(**data.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.put("/{transaction_id}", response_model=TransactionResponse)
@limiter.limit("30/minute")
def update_transaction(
    request: Request, transaction_id: int, data: TransactionUpdate, db: Session = Depends(get_db)
):
    """Update a transaction."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(txn, field, value)

    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/{transaction_id}", status_code=204)
@limiter.limit("30/minute")
def delete_transaction(request: Request, transaction_id: int, db: Session = Depends(get_db)):
    """Delete a transaction."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()

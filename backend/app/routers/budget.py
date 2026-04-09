"""
Budget API router — zero-based envelope budgeting.

Endpoints for budget categories, status, safe-to-spend, and allocation.
"""

from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.budget import BudgetCategory
from app.schemas.budget import (
    BudgetCategoryCreate, BudgetCategoryUpdate, BudgetCategoryResponse,
    BudgetStatusResponse, CategoryStatusResponse,
    SafeToSpendResponse,
    AllocateBudgetRequest, BudgetAllocationResponse,
)
from app.services.budget_engine import (
    calculate_budget_status, safe_to_spend, allocate_budget, calculate_rollover,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# --- Budget Status ---

@router.get("/status/{period_start}", response_model=BudgetStatusResponse)
@limiter.limit("30/minute")
def get_budget_status(
    request: Request,
    period_start: date,
    db: Session = Depends(get_db),
):
    """Get full budget status for a period (category-by-category breakdown)."""
    status = calculate_budget_status(db, period_start)
    return BudgetStatusResponse(
        period_start=status.period_start,
        period_end=status.period_end,
        total_income=status.total_income,
        total_allocated=status.total_allocated,
        available_to_budget=status.available_to_budget,
        total_spent=status.total_spent,
        categories=[
            CategoryStatusResponse(
                category_id=c.category_id,
                name=c.name,
                type=c.type,
                color=c.color,
                budgeted=c.budgeted,
                spent=c.spent,
                remaining=c.remaining,
                rollover=c.rollover,
                pct_used=c.pct_used,
                sort_order=c.sort_order,
            )
            for c in status.categories
        ],
    )


@router.get("/safe-to-spend", response_model=SafeToSpendResponse)
@limiter.limit("60/minute")
def get_safe_to_spend(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get the hero number: how much can the user safely spend right now?"""
    result = safe_to_spend(db)
    return SafeToSpendResponse(
        amount=result.amount,
        total_income=result.total_income,
        upcoming_bills=result.upcoming_bills,
        budget_allocated=result.budget_allocated,
        already_spent=result.already_spent,
        savings_contributions=result.savings_contributions,
        breakdown=result.breakdown,
    )


# --- Budget Categories (CRUD) ---

@router.get("/categories", response_model=List[BudgetCategoryResponse])
@limiter.limit("30/minute")
def list_budget_categories(
    request: Request,
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    """List all budget categories."""
    query = db.query(BudgetCategory)
    if active_only:
        query = query.filter(BudgetCategory.is_active == True)
    return query.order_by(BudgetCategory.sort_order).limit(1000).all()


@router.post("/categories", response_model=BudgetCategoryResponse, status_code=201)
@limiter.limit("30/minute")
def create_budget_category(
    request: Request,
    data: BudgetCategoryCreate,
    db: Session = Depends(get_db),
):
    """Create a new budget category (envelope)."""
    category = BudgetCategory(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories/{category_id}", response_model=BudgetCategoryResponse)
@limiter.limit("30/minute")
def get_budget_category(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db),
):
    """Get a single budget category."""
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Budget category not found")
    return category


@router.put("/categories/{category_id}", response_model=BudgetCategoryResponse)
@limiter.limit("30/minute")
def update_budget_category(
    request: Request,
    category_id: int,
    data: BudgetCategoryUpdate,
    db: Session = Depends(get_db),
):
    """Update a budget category."""
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Budget category not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=204)
@limiter.limit("30/minute")
def delete_budget_category(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db),
):
    """Soft-delete a budget category (preserves transaction history)."""
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Budget category not found")
    category.is_active = False
    db.commit()


# --- Budget Allocation ---

@router.post("/allocate", response_model=BudgetAllocationResponse)
@limiter.limit("30/minute")
def allocate_budget_endpoint(
    request: Request,
    data: AllocateBudgetRequest,
    db: Session = Depends(get_db),
):
    """Allocate or reallocate budget for a category in a period."""
    category = db.query(BudgetCategory).filter(BudgetCategory.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Budget category not found")

    allocation = allocate_budget(
        db=db,
        category_id=data.category_id,
        period_start=data.period_start,
        amount=data.amount,
        note=data.note,
    )
    db.commit()
    db.refresh(allocation)

    return BudgetAllocationResponse(
        id=allocation.id,
        category_id=allocation.category_id,
        period_start=allocation.period_start,
        period_end=allocation.period_end,
        allocated_amount=allocation.allocated_amount,
        spent_amount=allocation.spent_amount,
        rolled_over_from=allocation.rolled_over_from,
        adjustment_note=allocation.adjustment_note,
        remaining=allocation.remaining,
        pct_used=allocation.pct_used,
    )


@router.get("/rollover/{category_id}", response_model=dict)
@limiter.limit("30/minute")
def get_rollover(
    request: Request,
    category_id: int,
    period_start: date = Query(...),
    db: Session = Depends(get_db),
):
    """Get rollover amount for a category from the previous period."""
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Budget category not found")

    rollover = calculate_rollover(db, category_id, period_start)
    return {
        "category_id": category_id,
        "category_name": category.name,
        "rollover_enabled": category.rollover_enabled,
        "rollover_cap": category.rollover_cap,
        "rollover_amount": rollover,
        "period_start": period_start.isoformat(),
    }

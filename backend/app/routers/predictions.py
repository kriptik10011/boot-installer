"""
Predictions Router — meal drafts, bill predictions, spending velocity.

All predictions require explicit user approval before creating records.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.services.meal_drafter import draft_week_meals
from app.services.bill_predictor import predict_upcoming_bills
from app.services.spending_insights import analyze_spending_velocity
from app.schemas.predictions import (
    DraftWeekResponse,
    ApplyDraftRequest,
    ApplyDraftResponse,
    BillPredictionsResponse,
    ApplyBillPredictionRequest,
    ApplyBillPredictionResponse,
    SpendingVelocityResponse,
)
from app.models.meal import MealPlanEntry
from app.models.transaction import Transaction


router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# MEAL DRAFTS
# =============================================================================

@router.get("/meal-drafts/{week_start}", response_model=DraftWeekResponse)
@limiter.limit("30/minute")
def get_meal_drafts(
    request: Request,
    week_start: str,
    db: Session = Depends(get_db),
):
    """Generate meal suggestions for a week. Does NOT create any records."""
    suggestions = draft_week_meals(db, week_start)
    return DraftWeekResponse(
        week_start=week_start,
        suggestions=suggestions,
        total_suggestions=len(suggestions),
    )


@router.post("/meal-drafts/apply", response_model=ApplyDraftResponse)
@limiter.limit("10/minute")
def apply_meal_drafts(
    request: Request,
    body: ApplyDraftRequest,
    db: Session = Depends(get_db),
):
    """Apply selected meal suggestions, creating MealPlanEntry records."""
    created = 0
    skipped = 0

    for suggestion in body.suggestions:
        # Check if slot already occupied
        existing = (
            db.query(MealPlanEntry)
            .filter(
                MealPlanEntry.date == suggestion.date,
                MealPlanEntry.meal_type == suggestion.meal_type,
            )
            .first()
        )

        if existing and not body.overwrite_existing:
            skipped += 1
            continue

        if existing and body.overwrite_existing:
            existing.recipe_id = suggestion.recipe_id
            existing.description = suggestion.description
        else:
            entry = MealPlanEntry(
                date=suggestion.date,
                meal_type=suggestion.meal_type,
                recipe_id=suggestion.recipe_id,
                description=suggestion.description,
            )
            db.add(entry)

        created += 1

    db.commit()

    return ApplyDraftResponse(
        created=created,
        skipped=skipped,
        message=f"Applied {created} meal suggestions, skipped {skipped} occupied slots.",
    )


# =============================================================================
# BILL PREDICTIONS
# =============================================================================

@router.get("/bill-predictions/{week_start}", response_model=BillPredictionsResponse)
@limiter.limit("30/minute")
def get_bill_predictions(
    request: Request,
    week_start: str,
    window_days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """Predict upcoming bills from recurrence patterns."""
    predictions = predict_upcoming_bills(db, week_start, window_days)
    return BillPredictionsResponse(
        predictions=predictions,
        window_days=window_days,
    )


@router.post("/bill-predictions/apply", response_model=ApplyBillPredictionResponse)
@limiter.limit("10/minute")
def apply_bill_prediction(
    request: Request,
    body: ApplyBillPredictionRequest,
    db: Session = Depends(get_db),
):
    """Create a transaction from a bill prediction."""
    from app.models.transaction_recurrence import TransactionRecurrence

    recurrence = (
        db.query(TransactionRecurrence)
        .filter(TransactionRecurrence.id == body.recurrence_id)
        .first()
    )

    if not recurrence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recurrence {body.recurrence_id} not found",
        )

    txn = Transaction(
        description=recurrence.description,
        amount=-abs(body.amount),  # Bills are negative (expense)
        date=body.date,
        budget_category_id=recurrence.budget_category_id,
        recurrence_id=recurrence.id,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return ApplyBillPredictionResponse(
        transaction_id=txn.id,
        message=f"Created transaction for {recurrence.description}: ${body.amount:.2f}",
    )


# =============================================================================
# SPENDING VELOCITY
# =============================================================================

@router.get("/spending-velocity", response_model=SpendingVelocityResponse)
@limiter.limit("30/minute")
def get_spending_velocity(
    request: Request,
    category_id: int | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Analyze spending velocity per budget category."""
    insights = analyze_spending_velocity(db, category_id, days)
    return SpendingVelocityResponse(
        insights=insights,
        period_days=days,
    )

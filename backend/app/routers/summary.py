"""
Summary API endpoints for the Home dashboard.
"""

from datetime import date
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.schemas.summary import WeekReviewResponse

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/review/{week_start}", response_model=WeekReviewResponse)
@limiter.limit("30/minute")
def get_weekly_review(
    request: Request,
    week_start: date,
    db: Session = Depends(get_db),
):
    """Get weekly review wizard summary for the guided close process."""
    from app.services.weekly_review_service import get_week_review
    summary = get_week_review(db, week_start.isoformat())
    return WeekReviewResponse(**{
        "week_start": summary.week_start,
        "week_end": summary.week_end,
        "meals_planned": summary.meals_planned,
        "meals_cooked": summary.meals_cooked,
        "meals_skipped": summary.meals_skipped,
        "top_recipes": summary.top_recipes,
        "events_total": summary.events_total,
        "events_completed": summary.events_completed,
        "total_income": summary.total_income,
        "total_expenses": summary.total_expenses,
        "bills_paid": summary.bills_paid,
        "bills_unpaid": summary.bills_unpaid,
        "budget_categories_over": summary.budget_categories_over,
        "savings_contributed": summary.savings_contributed,
        "low_stock_count": summary.low_stock_count,
        "expiring_soon_count": summary.expiring_soon_count,
        "shopping_items_completed": summary.shopping_items_completed,
        "shopping_items_total": summary.shopping_items_total,
    })

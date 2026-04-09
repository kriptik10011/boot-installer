"""
Intelligence Router

Unified intelligence endpoints that return FULLY COMPUTED responses.
Frontend hooks become thin useQuery wrappers.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.intelligence import (
    RecipeIntelligenceResponse,
    EventIntelligenceResponse,
    FinanceIntelligenceResponse,
    InventoryIntelligenceResponse,
    MealIntelligenceResponse,
    CrossFeatureIntelligenceResponse,
)
from app.services.intelligence_service import (
    compute_recipe_intelligence,
    compute_event_intelligence,
    compute_finance_intelligence,
    compute_inventory_intelligence,
    compute_meal_intelligence,
    compute_cross_feature_intelligence,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/recipes", response_model=RecipeIntelligenceResponse)
@limiter.limit("30/minute")
def get_recipe_intelligence(request: Request, db: Session = Depends(get_db)):
    """
    Get fully computed recipe intelligence.

    Returns favorites, complexity scores, suggestions, and insights.
    Replaces frontend useRecipeIntelligence hook computation.
    """
    return compute_recipe_intelligence(db)


@router.get("/events", response_model=EventIntelligenceResponse)
@limiter.limit("30/minute")
def get_event_intelligence(
    request: Request,
    week_start: str = Query(..., description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Get fully computed event intelligence for a week.

    Returns day insights, conflicts, overloaded days, and suggestions.
    Replaces frontend useEventIntelligence hook computation.
    """
    return compute_event_intelligence(db, week_start)


@router.get("/finance", response_model=FinanceIntelligenceResponse)
@limiter.limit("30/minute")
def get_finance_intelligence(
    request: Request,
    week_start: Optional[str] = Query(None, description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Get fully computed finance intelligence.

    Returns bill insights, budget pace, aggregates, and raw data subsets.
    Replaces frontend useFinanceIntelligence hook computation.
    """
    from datetime import date
    ws = week_start or date.today().isoformat()
    return compute_finance_intelligence(db, ws)


@router.get("/inventory", response_model=InventoryIntelligenceResponse)
@limiter.limit("30/minute")
def get_inventory_intelligence(
    request: Request,
    week_start: Optional[str] = Query(None, description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Get fully computed inventory intelligence.

    Returns health score, insights, location counts, category breakdown.
    Replaces frontend useInventoryIntelligence hook computation.
    """
    from datetime import date
    ws = week_start or date.today().isoformat()
    return compute_inventory_intelligence(db, ws)


@router.get("/meals", response_model=MealIntelligenceResponse)
@limiter.limit("30/minute")
def get_meal_intelligence(
    request: Request,
    week_start: str = Query(..., description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Get fully computed meal intelligence for a week.

    Returns gaps, suggestions, coverage, and day fills.
    Replaces frontend useMealIntelligence hook computation.
    """
    return compute_meal_intelligence(db, week_start)


@router.get("/cross-feature", response_model=CrossFeatureIntelligenceResponse)
@limiter.limit("30/minute")
def get_cross_feature_intelligence(
    request: Request,
    week_start: Optional[str] = Query(None, description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Get fully computed cross-feature intelligence.

    Detects patterns spanning events + meals + finance + property.
    Includes Bayesian Surprise spending anomaly detection.
    Replaces frontend useCrossFeatureIntelligence hook computation.
    """
    from datetime import date
    ws = week_start or date.today().isoformat()
    return compute_cross_feature_intelligence(db, ws)

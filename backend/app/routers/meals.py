"""
Meals API endpoints.
"""

from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import MealPlanEntry
from app.schemas.meals import (
    MealPlanCreate,
    MealPlanUpdate,
    MealPlanResponse,
    CookingCompleteRequest,
    IngredientOverlapResponse,
    ReuseSuggestionResponse,
)
from app.utils.week_utils import get_week_range

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=List[MealPlanResponse])
@limiter.limit("100/minute")
def list_meal_plans(request: Request, db: Session = Depends(get_db)):
    """List all meal plan entries."""
    return db.query(MealPlanEntry).order_by(
        MealPlanEntry.date,
        MealPlanEntry.meal_type
    ).limit(1000).all()


@router.get("/week/{week_start}", response_model=List[MealPlanResponse])
@limiter.limit("100/minute")
def get_meals_for_week(
    request: Request,
    week_start: date,
    db: Session = Depends(get_db)
):
    """Get meal plan entries for a specific week."""
    _, week_end = get_week_range(week_start)
    return db.query(MealPlanEntry).filter(
        MealPlanEntry.date >= week_start,
        MealPlanEntry.date < week_end
    ).order_by(MealPlanEntry.date, MealPlanEntry.meal_type).limit(500).all()


@router.get("/{meal_id}", response_model=MealPlanResponse)
@limiter.limit("100/minute")
def get_meal_plan(request: Request, meal_id: int, db: Session = Depends(get_db)):
    """Get a single meal plan entry by ID."""
    meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == meal_id).first()
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan entry not found"
        )
    return meal


@router.post("", response_model=MealPlanResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_meal_plan(request: Request, meal: MealPlanCreate, db: Session = Depends(get_db)):
    """Create a new meal plan entry."""
    # Check if entry already exists for this date/meal_type
    existing = db.query(MealPlanEntry).filter(
        MealPlanEntry.date == meal.date,
        MealPlanEntry.meal_type == meal.meal_type
    ).first()

    if existing:
        # Update existing entry instead of creating duplicate
        existing.recipe_id = meal.recipe_id
        existing.description = meal.description
        existing.planned_servings = meal.planned_servings
        db.commit()
        db.refresh(existing)
        return existing

    db_meal = MealPlanEntry(**meal.model_dump())
    db.add(db_meal)
    db.commit()
    db.refresh(db_meal)
    return db_meal


@router.put("/{meal_id}", response_model=MealPlanResponse)
@limiter.limit("30/minute")
def update_meal_plan(request: Request, meal_id: int, meal: MealPlanUpdate, db: Session = Depends(get_db)):
    """Update an existing meal plan entry."""
    db_meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == meal_id).first()
    if not db_meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan entry not found"
        )

    update_data = meal.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_meal, key, value)

    db.commit()
    db.refresh(db_meal)
    return db_meal


@router.delete("/{meal_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_meal_plan(request: Request, meal_id: int, db: Session = Depends(get_db)):
    """Delete a meal plan entry."""
    db_meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == meal_id).first()
    if not db_meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan entry not found"
        )

    db.delete(db_meal)
    db.commit()
    return None


@router.post("/{meal_id}/cooking-complete", response_model=MealPlanResponse)
@limiter.limit("30/minute")
def complete_cooking(
    request: Request,
    meal_id: int,
    data: CookingCompleteRequest,
    db: Session = Depends(get_db)
):
    """
    Record cooking session completion for a meal.

    Updates the meal entry with actual cooking data (servings, times, notes).
    This data is used by the intelligence layer to learn user cooking patterns
    and provide personalized time estimates via Reference Class Forecasting.
    """
    db_meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == meal_id).first()
    if not db_meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan entry not found"
        )

    # Update cooking session data
    db_meal.actual_servings = data.actual_servings
    db_meal.actual_prep_minutes = data.actual_prep_minutes
    db_meal.actual_cook_minutes = data.actual_cook_minutes
    db_meal.cooked_at = datetime.now(timezone.utc)
    db_meal.cooking_notes = data.notes
    # Also update planned_servings to match actual, so the meal shows correct servings
    # when viewed later (user expectation: "I made 8 servings" should persist)
    db_meal.planned_servings = data.actual_servings

    # Note: inventory_depleted is set by the deplete-from-cooking endpoint
    # (inventory_service.py line 377), not here. This endpoint only records
    # cooking session data. The depletion is a separate step.

    db.commit()
    db.refresh(db_meal)
    return db_meal


# =============================================================================
# Smart Ingredient Reuse Suggestions
# =============================================================================

@router.get("/reuse-suggestions/{week_start}", response_model=List[ReuseSuggestionResponse])
@limiter.limit("30/minute")
def get_reuse_suggestions(
    request: Request,
    week_start: str,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """
    Suggest recipes that share ingredients with already-planned meals.
    Helps minimize waste and reduce shopping list size.
    """
    from app.services.ingredient_reuse import suggest_ingredient_reuse
    suggestions = suggest_ingredient_reuse(db, week_start, limit)
    return [
        ReuseSuggestionResponse(
            recipe_id=s.recipe_id,
            recipe_name=s.recipe_name,
            overlap_count=s.overlap_count,
            total_ingredients=s.total_ingredients,
            overlap_pct=s.overlap_pct,
            shared_ingredients=[
                IngredientOverlapResponse(
                    ingredient_id=si.ingredient_id,
                    ingredient_name=si.ingredient_name,
                    shared_with_recipes=si.shared_with_recipes,
                )
                for si in s.shared_ingredients
            ],
            unique_ingredients=s.unique_ingredients,
        )
        for s in suggestions
    ]

"""
Pattern Detection Router

API endpoints for accessing detected patterns.

Business logic is extracted to services/pattern_service.py.
Pattern engines live in services/pattern_detection/.
"""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.services.pattern_detection import PatternEngine
from app.services.pattern_detection.recipe_patterns import RecipePatternDetector
from app.services import pattern_service
from app.schemas.patterns import (
    TemporalPatterns,
    BehavioralPatterns,
    DayHealth,
    WeekSummary,
    EventConflict,
    SpendingTrend,
    MealGap,
    RecurringMealPattern,
    IngredientVariety,
    RestockingPrediction,
    LowStockMealAlert,
    TrackingModeSuggestion,
    Insight,
    ConfidenceScores,
    AllPatterns,
    HabitStreakResponse,
    HabitSummary,
    RecordOccurrenceRequest,
    RecordOccurrenceResponse,
    CookingHistoryItem,
    RecipeDurationEstimate,
    ChefNote,
    TimeSuggestion,
    RecipeFavorite,
    RecipeInsights,
)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


# =============================================================================
# TEMPORAL PATTERN ENDPOINTS
# =============================================================================

@router.get("/temporal", response_model=TemporalPatterns)
@limiter.limit("60/minute")
def get_temporal_patterns(request: Request, db: Session = Depends(get_db)):
    """Get detected temporal patterns (planning time, peak hours, busiest day)."""
    engine = PatternEngine(db)
    return engine.get_temporal_patterns()


# =============================================================================
# BEHAVIORAL PATTERN ENDPOINTS
# =============================================================================

@router.get("/behavioral", response_model=BehavioralPatterns)
@limiter.limit("60/minute")
def get_behavioral_patterns(request: Request, db: Session = Depends(get_db)):
    """Get detected behavioral patterns (sessions, views, actions, dismissals)."""
    engine = PatternEngine(db)
    return engine.get_behavioral_patterns()


# =============================================================================
# DOMAIN PATTERN ENDPOINTS
# =============================================================================

@router.get("/day-health/{target_date}", response_model=DayHealth)
@limiter.limit("60/minute")
def get_day_health(request: Request, target_date: date, db: Session = Depends(get_db)):
    """Get health score (0-100) for a specific day."""
    engine = PatternEngine(db)
    return engine.get_day_health(target_date.isoformat())


@router.get("/week-summary/{week_start}", response_model=WeekSummary)
@limiter.limit("60/minute")
def get_week_summary(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get comprehensive summary for a week (busy days, bills, gaps, conflicts)."""
    engine = PatternEngine(db)
    return engine.get_week_summary(week_start.isoformat())


@router.get("/conflicts/{week_start}", response_model=List[EventConflict])
@limiter.limit("60/minute")
def get_conflicts(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get event conflicts for a week."""
    engine = PatternEngine(db)
    return engine.get_conflicts(week_start.isoformat())


@router.get("/spending-trends", response_model=SpendingTrend)
@limiter.limit("60/minute")
def get_spending_trends(request: Request, db: Session = Depends(get_db)):
    """Get spending trend analysis (current week vs 4-week EWMA)."""
    engine = PatternEngine(db)
    return engine.get_spending_trend()


@router.get("/meal-gaps/{week_start}", response_model=List[MealGap])
@limiter.limit("60/minute")
def get_meal_gaps(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get unplanned meal slots for a week."""
    engine = PatternEngine(db)
    return engine.get_meal_gaps(week_start.isoformat())


# =============================================================================
# DOMAIN INTELLIGENCE ENDPOINTS
# =============================================================================

@router.get("/recurring-meals", response_model=List[RecurringMealPattern])
@limiter.limit("60/minute")
def get_recurring_meal_patterns(
    request: Request, weeks_back: int = Query(4, ge=2, le=12), db: Session = Depends(get_db),
):
    """Get recurring meal patterns (same recipe on same day-of-week)."""
    engine = PatternEngine(db)
    return engine.get_recurring_meal_patterns(weeks_back=weeks_back)


@router.get("/ingredient-variety/{week_start}", response_model=IngredientVariety)
@limiter.limit("60/minute")
def get_ingredient_variety(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get ingredient variety analysis for a week's meal plan."""
    engine = PatternEngine(db)
    return engine.get_ingredient_variety(week_start.isoformat())


@router.get("/restocking-predictions", response_model=List[RestockingPrediction])
@limiter.limit("60/minute")
def get_restocking_predictions(request: Request, db: Session = Depends(get_db)):
    """Get RCF-based restocking predictions."""
    engine = PatternEngine(db)
    return engine.get_restocking_predictions()


@router.get("/low-stock-meals/{week_start}", response_model=List[LowStockMealAlert])
@limiter.limit("60/minute")
def get_low_stock_meals(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Cross-reference low-stock inventory with upcoming meal plan."""
    engine = PatternEngine(db)
    return engine.get_low_stock_meals(week_start.isoformat())


@router.get("/tracking-suggestions", response_model=List[TrackingModeSuggestion])
@limiter.limit("60/minute")
def get_tracking_suggestions(request: Request, db: Session = Depends(get_db)):
    """Get LinUCB tracking mode suggestions for ingredients."""
    engine = PatternEngine(db)
    return engine.get_tracking_suggestions()


# =============================================================================
# COMBINED ENDPOINTS
# =============================================================================

@router.get("/all", response_model=AllPatterns)
@limiter.limit("30/minute")
def get_all_patterns(
    request: Request,
    week_start: Optional[str] = Query(None, description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Get all patterns in one call (main endpoint for frontend)."""
    engine = PatternEngine(db)
    return engine.get_all_patterns(week_start)


@router.get("/insights", response_model=List[Insight])
@limiter.limit("60/minute")
def get_insights(
    request: Request,
    week_start: Optional[str] = Query(None, description="Week start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Get actionable insights filtered by confidence and sorted by priority."""
    engine = PatternEngine(db)
    return engine.get_actionable_insights(week_start)


@router.get("/confidence", response_model=ConfidenceScores)
@limiter.limit("60/minute")
def get_confidence(request: Request, db: Session = Depends(get_db)):
    """Get pattern detection confidence scores with cold start support."""
    engine = PatternEngine(db)
    return engine.calculate_overall_confidence()


# =============================================================================
# HABIT STREAK ENDPOINTS
# =============================================================================

@router.get("/habits", response_model=List[HabitStreakResponse])
@limiter.limit("60/minute")
def get_all_habits(request: Request, db: Session = Depends(get_db)):
    """Get all tracked habit streaks with shame-free display format."""
    return pattern_service.get_all_habits(db)


@router.get("/habits/summary", response_model=HabitSummary)
@limiter.limit("60/minute")
def get_habit_summary(request: Request, db: Session = Depends(get_db)):
    """Get summary of all habits for the insights panel."""
    return pattern_service.get_habit_summary(db)


@router.get("/habits/{habit_name}", response_model=HabitStreakResponse)
@limiter.limit("60/minute")
def get_habit(request: Request, habit_name: str, db: Session = Depends(get_db)):
    """Get a specific habit streak (creates if doesn't exist)."""
    if len(habit_name) > 100:
        raise HTTPException(status_code=422, detail="Habit name must be 100 characters or fewer")
    return pattern_service.get_or_create_habit(db, habit_name)


@router.post("/habits/{habit_name}/record", response_model=RecordOccurrenceResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
def record_habit_occurrence(
    request: Request, habit_name: str, body: RecordOccurrenceRequest, db: Session = Depends(get_db),
):
    """Record whether a habit occurred this week."""
    if len(habit_name) > 100:
        raise HTTPException(status_code=422, detail="Habit name must be 100 characters or fewer")
    return pattern_service.record_habit_occurrence(db, habit_name, body.occurred)


# =============================================================================
# RECIPE PATTERN ENDPOINTS (intelligent cooking mode)
# =============================================================================

@router.get("/recipes/{recipe_id}/cooking-history", response_model=List[CookingHistoryItem])
@limiter.limit("60/minute")
def get_recipe_cooking_history(
    request: Request, recipe_id: int, limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db),
):
    """Get cooking history for a specific recipe."""
    detector = RecipePatternDetector(db)
    return detector.get_cooking_history(recipe_id, limit)


@router.get("/recipes/{recipe_id}/duration-estimate", response_model=RecipeDurationEstimate)
@limiter.limit("60/minute")
def get_recipe_duration_estimate(request: Request, recipe_id: int, db: Session = Depends(get_db)):
    """Get personalized duration estimate using Reference Class Forecasting."""
    detector = RecipePatternDetector(db)
    return detector.get_recipe_duration_estimate(recipe_id)


@router.get("/recipes/{recipe_id}/chef-notes", response_model=List[ChefNote])
@limiter.limit("60/minute")
def get_chef_notes(
    request: Request, recipe_id: int, limit: int = Query(5, ge=1, le=20), db: Session = Depends(get_db),
):
    """Get user's past cooking notes (RAG pattern for user's own words)."""
    detector = RecipePatternDetector(db)
    return detector.get_chef_notes(recipe_id, limit)


@router.get("/recipes/{recipe_id}/time-suggestion", response_model=Optional[TimeSuggestion])
@limiter.limit("60/minute")
def get_recipe_time_suggestion(request: Request, recipe_id: int, db: Session = Depends(get_db)):
    """Get time update suggestion if actual differs significantly from recipe."""
    detector = RecipePatternDetector(db)
    return detector.get_time_suggestion(recipe_id)


@router.get("/recipes/{recipe_id}/insights", response_model=RecipeInsights)
@limiter.limit("60/minute")
def get_recipe_insights(request: Request, recipe_id: int, db: Session = Depends(get_db)):
    """Get all intelligence insights for a recipe (duration, notes, suggestions)."""
    detector = RecipePatternDetector(db)
    return detector.get_recipe_insights(recipe_id)


@router.get("/recipes/favorites", response_model=List[RecipeFavorite])
@limiter.limit("30/minute")
def get_recipe_favorites(
    request: Request, limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db),
):
    """Get user's most-cooked recipes ranked by cook count."""
    detector = RecipePatternDetector(db)
    return detector.get_favorite_recipes(limit)


@router.get("/recipes/time-suggestions", response_model=List[TimeSuggestion])
@limiter.limit("30/minute")
def get_all_time_suggestions(request: Request, db: Session = Depends(get_db)):
    """Get all recipes that have time update suggestions."""
    detector = RecipePatternDetector(db)
    return detector.get_recipes_with_suggestions()

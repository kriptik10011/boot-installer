"""
Pattern Detection Response Schemas

All Pydantic schemas for the patterns router endpoints.
Extracted from routers/patterns.py to follow backend schema organization pattern.
"""

from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


# =============================================================================
# TEMPORAL PATTERNS
# =============================================================================

class PlanningTime(BaseModel):
    """Detected planning time pattern."""
    day: int  # 0-6 (Sunday-Saturday)
    hour: int  # 0-23
    confidence: float  # 0-1
    session_count: int = 0  # Optional for cold start templates
    total_planning_sessions: int = 0  # Optional for cold start templates


class TemporalPatterns(BaseModel):
    """All temporal pattern data."""
    planning_time: Optional[PlanningTime] = None
    peak_hours: List[int] = Field(default_factory=list)
    busiest_day: Optional[int] = None
    events_by_day: Dict[int, int] = Field(default_factory=dict)
    events_by_hour: Dict[int, int] = Field(default_factory=dict)
    weekly_pattern: Optional[Dict[str, Any]] = None


# =============================================================================
# BEHAVIORAL PATTERNS
# =============================================================================

class SessionAnalysis(BaseModel):
    """Session behavior analysis."""
    total_sessions: int
    median_duration_seconds: Optional[float] = None
    mean_duration_seconds: Optional[float] = None
    ewma_duration_seconds: Optional[float] = None
    duration_trend: Optional[str] = None
    planning_sessions: Optional[int] = None
    living_sessions: Optional[int] = None
    planning_ratio: Optional[float] = None
    sessions_per_day: Optional[float] = None
    insufficient_data: bool = False


class ViewPreference(BaseModel):
    """View preference data."""
    view: str
    total_seconds: float
    entries: int
    avg_seconds_per_visit: float
    time_share: float


class ActionFrequency(BaseModel):
    """Action frequency data."""
    action: str
    count: int
    frequency_share: float


class BehavioralPatterns(BaseModel):
    """All behavioral pattern data."""
    sessions: SessionAnalysis
    view_preferences: List[ViewPreference] = Field(default_factory=list)
    action_frequency: List[ActionFrequency] = Field(default_factory=list)
    preferred_start_view: Optional[str] = None
    dismissals: Dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# DOMAIN PATTERNS (DAY/WEEK HEALTH)
# =============================================================================

class DayHealth(BaseModel):
    """Health score for a specific day."""
    date: str
    score: int  # 0-100
    status: str  # "light" | "balanced" | "busy" | "overloaded"
    event_count: int
    has_conflicts: bool
    conflict_count: int = 0
    bills_due: int
    bills_amount: float
    overdue_bills: int = 0
    unplanned_meals: int


class WeekSummary(BaseModel):
    """Comprehensive week summary."""
    week_start: str
    week_end: str
    busy_days: int
    total_bills_due: float
    unpaid_bills: float = 0
    overdue_bills: int
    unplanned_meals: int
    event_conflicts: int
    summary_sentence: str
    day_healths: List[DayHealth] = Field(default_factory=list)


class EventConflict(BaseModel):
    """Event conflict details."""
    date: str
    event1_id: int
    event1_name: str
    event2_id: int
    event2_name: str
    overlap_minutes: int


class SpendingTrend(BaseModel):
    """Spending trend analysis."""
    current_week: float
    four_week_average: float
    percent_change: float
    trend: str  # "higher" | "lower" | "normal"
    weekly_history: List[float] = Field(default_factory=list)
    insufficient_data: bool = False


class MealGap(BaseModel):
    """Unplanned meal slot."""
    date: str
    meal_type: str
    day_name: str


# =============================================================================
# DOMAIN INTELLIGENCE
# =============================================================================

class RecurringMealPattern(BaseModel):
    """Recurring meal pattern detected from cooking history."""
    recipe_id: int
    recipe_name: str
    day_of_week: int  # 0=Monday, 6=Sunday
    meal_type: str
    occurrences: int


class IngredientRepeat(BaseModel):
    """A repeated ingredient across the week's meals."""
    ingredient_id: int
    ingredient_name: str
    count: int
    recipe_names: List[str] = Field(default_factory=list)


class IngredientVariety(BaseModel):
    """Ingredient variety analysis for a week."""
    variety_score: float  # 0.0-1.0
    repeated_ingredients: List[IngredientRepeat] = Field(default_factory=list)
    total_unique: int
    total_uses: int


class RestockingPrediction(BaseModel):
    """Item predicted to need restocking."""
    item_id: int
    item_name: str
    ingredient_id: Optional[int] = None
    tracking_mode: str
    needs_restock: bool
    percent_full: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    predicted_depletion_days: Optional[int] = None


class LowStockMealAlert(BaseModel):
    """Alert for a low/missing ingredient needed for an upcoming meal."""
    ingredient_id: int
    ingredient_name: str
    recipe_name: str
    meal_date: str
    reason: str  # "not_in_inventory" | "low_stock"


class TrackingModeSuggestion(BaseModel):
    """LinUCB tracking mode suggestion for an ingredient."""
    ingredient_id: int
    ingredient_name: str
    suggested_mode: str  # "count" | "percentage"
    current_mode: str
    count_interactions: int
    percentage_interactions: int


# =============================================================================
# INSIGHTS & CONFIDENCE
# =============================================================================

class InsightEvidence(BaseModel):
    """Evidence backing an insight (Glass Box: 'Why am I seeing this?')."""
    observation_count: Optional[int] = None
    pattern_strength: Optional[float] = None  # 0.0-1.0
    last_observed: Optional[str] = None  # ISO date
    context: Optional[str] = None  # Human-readable explanation


class Insight(BaseModel):
    """Actionable insight with cold start support and evidence."""
    type: str
    message: str
    priority: int
    confidence: float
    evidence: Optional[InsightEvidence] = None
    # Cold start fields
    is_template: bool = False
    learning_message: Optional[str] = None
    learning_features: Optional[List[str]] = None
    next_ready: Optional[str] = None
    next_ready_progress: Optional[int] = None


class FeatureLearningStatus(BaseModel):
    """Learning status for a single feature."""
    status: str  # "learning" | "ready"
    progress: int  # 0-100
    message: Optional[str] = None
    estimated_ready: Optional[str] = None


class LearningProgress(BaseModel):
    """Learning progress across all features."""
    planning_time: Optional[FeatureLearningStatus] = None
    busy_days: Optional[FeatureLearningStatus] = None
    spending_trends: Optional[FeatureLearningStatus] = None
    habit_patterns: Optional[FeatureLearningStatus] = None


class ConfidenceScores(BaseModel):
    """Pattern detection confidence scores with cold start support."""
    temporal: float
    behavioral: float
    overall: float
    ready_for_surfacing: bool
    # Cold start fields
    raw_overall: Optional[float] = None
    is_cold_start: bool = False
    session_count: int = 0
    learning_progress: Optional[Dict[str, Any]] = None
    feature_readiness: Optional[Dict[str, bool]] = None


class LearningStatus(BaseModel):
    """Comprehensive learning status for the UI."""
    is_cold_start: bool
    session_count: int
    overall_progress: int  # 0-100
    features: Dict[str, Any]
    feature_readiness: Dict[str, bool]
    next_milestone: Optional[Dict[str, Any]] = None


# =============================================================================
# COMBINED PATTERNS
# =============================================================================

class AllPatterns(BaseModel):
    """Combined pattern data."""
    temporal: TemporalPatterns
    behavioral: BehavioralPatterns
    week_summary: WeekSummary
    day_healths: List[DayHealth]
    conflicts: List[EventConflict]
    spending_trend: SpendingTrend
    meal_gaps: List[MealGap]
    week_start: str


# =============================================================================
# HABIT STREAK SCHEMAS
# =============================================================================

class HabitStreakDisplay(BaseModel):
    """Shame-free habit streak display."""
    streak: int
    trend_score: float
    best_of_y: str
    trend_label: str
    saves_remaining: int
    saves_text: str
    total_weeks: int
    total_occurrences: int
    display_text: str
    trend_text: str
    recorded_this_week: Optional[bool] = None


class HabitStreakResponse(BaseModel):
    """Full habit streak data."""
    id: int
    habit_name: str
    current_streak: int
    forgiveness_tokens: int
    trend_score: float
    total_occurrences: int
    tracking_weeks: int
    last_occurrence: Optional[str] = None
    tokens_used: int
    max_tokens: int
    display: HabitStreakDisplay


class HabitSummary(BaseModel):
    """Summary of all habits."""
    has_data: bool
    habits_tracked: int = 0
    overall_health: float = 0.0
    strongest_habit: Optional[Dict[str, Any]] = None
    weakest_habit: Optional[Dict[str, Any]] = None
    habits: List[HabitStreakResponse] = Field(default_factory=list)


class RecordOccurrenceRequest(BaseModel):
    """Request to record habit occurrence."""
    occurred: bool = True


class RecordOccurrenceResponse(BaseModel):
    """Response after recording occurrence."""
    habit: str
    action: str
    message: str
    display: HabitStreakDisplay


# =============================================================================
# RECIPE PATTERN SCHEMAS (intelligent cooking mode)
# =============================================================================

class CookingHistoryItem(BaseModel):
    """A single cooking session record."""
    meal_id: int
    date: str
    cooked_at: Optional[str] = None
    actual_servings: Optional[int] = None
    actual_prep_minutes: Optional[int] = None
    actual_cook_minutes: Optional[int] = None
    total_minutes: int
    notes: Optional[str] = None


class RecipeDurationEstimate(BaseModel):
    """Personalized duration estimate using Reference Class Forecasting."""
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    total_minutes: Optional[int] = None
    source: str  # "recipe" | "personalized"
    confidence: float
    sample_count: int
    recipe_prep_minutes: Optional[int] = None
    recipe_cook_minutes: Optional[int] = None
    message: Optional[str] = None


class ChefNote(BaseModel):
    """User's cooking note for a recipe."""
    note: str
    date: str
    cooked_at: Optional[str] = None
    servings: Optional[int] = None


class TimeSuggestion(BaseModel):
    """Time update suggestion based on cooking history."""
    recipe_id: int
    recipe_name: Optional[str] = None
    suggestion_type: str
    direction: str  # "longer" | "shorter"
    message: str
    recipe_total_minutes: int
    actual_total_minutes: int
    suggested_prep_minutes: int
    suggested_cook_minutes: int
    variance_percent: float
    confidence: float
    sample_count: int


class RecipeFavorite(BaseModel):
    """A frequently-cooked recipe."""
    recipe_id: int
    recipe_name: str
    cook_count: int
    last_cooked: Optional[str] = None


class RecipeInsights(BaseModel):
    """All intelligence insights for a recipe."""
    recipe_id: int
    duration_estimate: RecipeDurationEstimate
    chef_notes: List[ChefNote]
    time_suggestion: Optional[TimeSuggestion] = None


# =============================================================================
# MODEL PERSISTENCE SCHEMAS
# =============================================================================

class ModelData(BaseModel):
    """Model data for persistence."""
    mean: float = Field(..., ge=-1e9, le=1e9)
    variance: float = Field(..., ge=0, le=1e9)
    count: int = Field(..., ge=0, le=1000000)
    extra_data: Optional[Dict[str, Any]] = None

"""
Prediction schemas — meal drafts, bill predictions, spending velocity.

All predictions require explicit user approval before creating records.
"""

from pydantic import BaseModel, Field
from datetime import date
from typing import Optional, List


# =============================================================================
# MEAL DRAFTS
# =============================================================================

class DraftMealSuggestion(BaseModel):
    """Single meal suggestion from the drafter."""
    date: date
    meal_type: str  # breakfast, lunch, dinner
    recipe_id: Optional[int] = None
    recipe_name: Optional[str] = None
    description: Optional[str] = None
    confidence: float = Field(ge=0, le=1, description="How confident the suggestion is")
    reason: str = Field(default="", description="Why this was suggested")


class DraftWeekResponse(BaseModel):
    """Full week of meal draft suggestions."""
    week_start: str
    suggestions: List[DraftMealSuggestion] = Field(default_factory=list)
    total_suggestions: int = 0


class ApplyDraftRequest(BaseModel):
    """Request to apply specific meal drafts."""
    suggestions: List[DraftMealSuggestion]
    overwrite_existing: bool = False


class ApplyDraftResponse(BaseModel):
    """Result of applying meal drafts."""
    created: int = 0
    skipped: int = 0
    message: str = ""


# =============================================================================
# BILL PREDICTIONS
# =============================================================================

class PredictedBill(BaseModel):
    """Predicted upcoming bill from recurrence patterns."""
    recurrence_id: int
    description: str
    predicted_amount: float = Field(ge=0)
    predicted_date: date
    confidence: float = Field(ge=0, le=1)
    category: Optional[str] = None
    last_3_amounts: List[float] = Field(default_factory=list)


class BillPredictionsResponse(BaseModel):
    """List of predicted bills for a time window."""
    predictions: List[PredictedBill] = Field(default_factory=list)
    window_days: int = 14


class ApplyBillPredictionRequest(BaseModel):
    """Apply a single bill prediction as a transaction."""
    recurrence_id: int
    amount: float = Field(gt=0)
    date: date


class ApplyBillPredictionResponse(BaseModel):
    """Result of applying a bill prediction."""
    transaction_id: Optional[int] = None
    message: str = ""


# =============================================================================
# SPENDING VELOCITY
# =============================================================================

class SpendingVelocityInsight(BaseModel):
    """Spending rate analysis for a budget category."""
    category_id: int
    category_name: str
    daily_rate: float = Field(ge=0, description="Average daily spending in dollars")
    period_days: int = Field(default=30, description="Analysis window")
    total_spent: float = Field(ge=0)
    budget_amount: Optional[float] = None
    projected_total: Optional[float] = None
    projected_depletion_date: Optional[date] = None
    pace_ratio: float = Field(default=1.0, description="Ratio vs expected pace (>1 = over)")
    confidence: float = Field(ge=0, le=1)
    recommendation: str = ""


class SpendingVelocityResponse(BaseModel):
    """All spending velocity insights."""
    insights: List[SpendingVelocityInsight] = Field(default_factory=list)
    period_days: int = 30

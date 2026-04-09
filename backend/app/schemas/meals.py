"""
Pydantic schemas for Meals API.
"""

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

from datetime import date


class MealPlanBase(BaseModel):
    date: date
    meal_type: Literal["breakfast", "lunch", "dinner"]
    recipe_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    planned_servings: Optional[int] = Field(None, ge=1, le=100, description="Planned serving size for portion scaling")


class MealPlanCreate(MealPlanBase):
    pass


class MealPlanUpdate(BaseModel):
    recipe_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)
    planned_servings: Optional[int] = Field(None, ge=1, le=100, description="Planned serving size for portion scaling")


class CookingCompleteRequest(BaseModel):
    """Request body for completing a cooking session."""
    actual_servings: int = Field(..., ge=1, le=100, description="Number of servings made")
    actual_prep_minutes: int = Field(..., ge=0, le=1440, description="Actual prep time in minutes")
    actual_cook_minutes: int = Field(..., ge=0, le=1440, description="Actual cook time in minutes")
    notes: Optional[str] = Field(None, max_length=500, description="User notes from cooking")


class MealPlanResponse(MealPlanBase):
    id: int
    created_at: datetime
    updated_at: datetime
    # planned_servings is inherited from MealPlanBase
    # Cooking session data
    actual_servings: Optional[int] = None
    actual_prep_minutes: Optional[int] = None
    actual_cook_minutes: Optional[int] = None
    cooked_at: Optional[datetime] = None
    cooking_notes: Optional[str] = None
    # Idempotency guard: True if inventory was already depleted for this meal
    inventory_depleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class IngredientOverlapResponse(BaseModel):
    ingredient_id: int
    ingredient_name: str
    shared_with_recipes: List[str]


class ReuseSuggestionResponse(BaseModel):
    recipe_id: int
    recipe_name: str
    overlap_count: int
    total_ingredients: int
    overlap_pct: float
    shared_ingredients: List[IngredientOverlapResponse] = []
    unique_ingredients: int = 0

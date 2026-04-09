"""
Recipes Schemas

Pydantic models for recipe CRUD operations, pantry suggestions, and coverage checks.

Note: Import-related schemas live in app.schemas.recipe_import (not here).
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RecipeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: Optional[int] = None
    instructions: str = Field(..., min_length=1, max_length=50000)
    prep_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    cook_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    servings: Optional[int] = Field(None, ge=1, le=100)
    source: Optional[str] = Field(None, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=10000)
    cuisine_type: Optional[str] = Field(None, max_length=100)


class RecipeCreate(RecipeBase):
    pass


class RecipeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category_id: Optional[int] = None
    instructions: Optional[str] = Field(None, min_length=1, max_length=50000)
    prep_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    cook_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    servings: Optional[int] = Field(None, ge=1, le=100)
    source: Optional[str] = Field(None, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=10000)
    cuisine_type: Optional[str] = Field(None, max_length=100)


class RecipeResponse(RecipeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecipeIngredientResponse(BaseModel):
    """Ingredient data for a recipe."""
    ingredient_id: int
    ingredient_name: str
    quantity: Optional[str] = None
    unit: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RecipeTagResponse(BaseModel):
    """Tag data for a recipe."""
    id: int
    name: str
    color: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RecipeWithIngredientsResponse(RecipeBase):
    """Recipe response with ingredients and tags included."""
    id: int
    created_at: datetime
    updated_at: datetime
    ingredients: List[RecipeIngredientResponse] = []
    tags: List[RecipeTagResponse] = []

    model_config = ConfigDict(from_attributes=True)


class IngredientMatchSchema(BaseModel):
    ingredient_id: int
    ingredient_name: str
    in_stock: bool
    stock_note: Optional[str] = None


class PantrySuggestionSchema(BaseModel):
    recipe_id: int
    recipe_name: str
    total_ingredients: int
    matching_ingredients: int
    missing_ingredients: int
    match_pct: float
    matches: List[IngredientMatchSchema] = []
    missing: List[IngredientMatchSchema] = []


class CoverageCheckRequest(BaseModel):
    ingredient_names: List[str]


class IngredientStatusSchema(BaseModel):
    name: str
    in_stock: bool
    stock_note: Optional[str] = None
    food_category: Optional[str] = None
    alternatives: List[str] = []


class CoverageCheckResponse(BaseModel):
    coverage_pct: float
    total_ingredients: int
    in_stock_count: int
    missing_count: int
    ingredients: List[IngredientStatusSchema]

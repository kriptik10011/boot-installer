"""
Recipe Import Schemas.

Defines Pydantic models for recipe import preview and confirmation.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class ExtractedIngredientSchema(BaseModel):
    """A single extracted ingredient."""
    name: str = Field(..., description="Ingredient name")
    quantity: Optional[str] = Field(None, description="Amount (e.g., '2', '1/2')")
    unit: Optional[str] = Field(None, description="Unit (e.g., 'cups', 'tsp')")
    notes: Optional[str] = Field(None, description="Additional notes")
    raw_text: str = Field("", description="Original text from recipe")


class ExtractedRecipeSchema(BaseModel):
    """Structured recipe data extracted from a URL."""
    name: str = Field(..., description="Recipe name/title")
    instructions: str = Field(..., description="Cooking instructions")
    ingredients: List[ExtractedIngredientSchema] = Field(
        default_factory=list,
        description="List of ingredients"
    )
    prep_time_minutes: Optional[int] = Field(None, ge=0, description="Prep time in minutes")
    cook_time_minutes: Optional[int] = Field(None, ge=0, description="Cook time in minutes")
    total_time_minutes: Optional[int] = Field(None, ge=0, description="Total time in minutes")
    servings: Optional[int] = Field(None, ge=1, description="Number of servings")
    source_url: str = Field(..., description="Source URL")
    source_site: str = Field("", description="Source website name")
    image_url: Optional[str] = Field(None, description="Recipe image URL")
    cuisine_type: Optional[str] = Field(None, max_length=100, description="Cuisine type (e.g., Italian, Mexican)")
    notes: Optional[str] = Field(None, max_length=5000, description="Recipe notes")
    confidence: float = Field(1.0, ge=0, le=1, description="Extraction confidence (0-1)")
    extraction_method: str = Field("manual", description="How the recipe was extracted")


class ImportPreviewRequest(BaseModel):
    """Request to preview a recipe import from URL."""
    url: str = Field(..., max_length=2000, description="URL to scrape recipe from")


class ImportPreviewResponse(BaseModel):
    """Response containing extracted recipe or fallback info."""
    success: bool = Field(..., description="Whether extraction succeeded")
    recipe: Optional[ExtractedRecipeSchema] = Field(None, description="Extracted recipe data")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    ai_prompt: Optional[str] = Field(None, description="AI extraction prompt for fallback")
    source_url: str = Field(..., description="Final URL after redirects")


class IngredientConfirm(BaseModel):
    """Ingredient data for import confirmation."""
    name: str = Field(..., min_length=1, max_length=200)
    quantity: Optional[str] = Field(None, max_length=50)
    unit: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=500)


class ImportConfirmRequest(BaseModel):
    """Request to confirm and save a recipe import."""
    name: str = Field(..., min_length=1, max_length=200, description="Recipe name")
    instructions: str = Field(..., min_length=1, max_length=50000, description="Instructions")
    ingredients: List[IngredientConfirm] = Field(
        default_factory=list,
        description="Ingredients to add"
    )
    prep_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    cook_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    servings: Optional[int] = Field(None, ge=1, le=100)
    source_url: str = Field(..., max_length=1000, description="Source URL")
    image_url: Optional[str] = Field(None, max_length=2000, description="Recipe image URL")
    cuisine_type: Optional[str] = Field(None, max_length=100, description="Cuisine type")
    notes: Optional[str] = Field(None, max_length=5000, description="Recipe notes")
    category_id: Optional[int] = Field(None, description="Recipe category ID")


class AIPasteRequest(BaseModel):
    """Request containing AI-generated JSON to parse."""
    json_text: str = Field(..., max_length=500000, description="JSON text pasted from AI")
    source_url: Optional[str] = Field(None, max_length=2000, description="Original URL")

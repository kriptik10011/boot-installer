"""
Pydantic schemas for Dietary Restrictions API.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class DietaryRestrictionResponse(BaseModel):
    id: int
    name: str
    icon: Optional[str] = None
    description: Optional[str] = None
    is_system: bool = False

    model_config = {"from_attributes": True}


class DietaryRestrictionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)


class RecipeRestrictionUpdate(BaseModel):
    restriction_ids: List[int]


class RecipeWithRestrictionsResponse(BaseModel):
    recipe_id: int
    recipe_name: str
    restrictions: List[DietaryRestrictionResponse]

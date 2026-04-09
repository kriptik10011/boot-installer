"""
Pydantic schemas for Recipe Tags API.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')


class TagResponse(TagBase):
    id: int
    created_at: datetime
    recipe_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class TagWithRecipes(TagResponse):
    recipe_ids: List[int] = []


class RecipeTagsUpdate(BaseModel):
    """Request to update tags for a recipe."""
    tag_ids: List[int] = Field(default_factory=list)


class TagSuggestion(BaseModel):
    """An AI-suggested tag for a recipe."""
    tag: TagResponse
    confidence: float = Field(ge=0, le=1)
    reasoning: str

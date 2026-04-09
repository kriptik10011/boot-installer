"""Pydantic schemas for the categories API."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class CategoryDomain(str, Enum):
    events = "events"
    recipes = "recipes"
    finances = "finances"


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

"""Pydantic schemas for the batch prep API."""

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PrepTaskCreate(BaseModel):
    task_name: str = Field(..., min_length=1, max_length=200)
    estimated_minutes: Optional[int] = Field(None, ge=0, le=1440)
    notes: Optional[str] = Field(None, max_length=1000)


class PrepTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_name: str
    is_completed: bool = False
    sort_order: int = 0
    estimated_minutes: Optional[int] = None
    notes: Optional[str] = None


class PrepSessionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    prep_date: date
    prep_start_time: Optional[str] = Field(None, max_length=50)
    estimated_duration_minutes: Optional[int] = Field(None, ge=0, le=1440)
    description: Optional[str] = Field(None, max_length=1000)
    meal_ids: List[int] = []
    tasks: List[PrepTaskCreate] = []


class PrepSessionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    prep_date: Optional[date] = None
    prep_start_time: Optional[str] = Field(None, max_length=50)
    estimated_duration_minutes: Optional[int] = Field(None, ge=0, le=1440)
    description: Optional[str] = Field(None, max_length=1000)


class PrepSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prep_date: date
    prep_start_time: Optional[str] = None
    estimated_duration_minutes: Optional[int] = None
    actual_duration_minutes: Optional[int] = None
    description: Optional[str] = None
    is_completed: bool = False
    completed_at: Optional[str] = None
    tasks: List[PrepTaskResponse] = []
    meal_ids: List[int] = []


class PrepTaskToggleResponse(BaseModel):
    """Response for toggling a task's completion status."""
    id: int
    is_completed: bool


class PrepMealLinkResponse(BaseModel):
    """Response for linking meals to a prep session."""
    linked_meals: int

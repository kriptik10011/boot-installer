"""Pydantic schemas for the day notes API."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DayNoteCreate(BaseModel):
    date: date
    content: str = Field(..., min_length=1, max_length=10000)
    mood: Optional[str] = Field(None, max_length=100)
    is_pinned: bool = False


class DayNoteUpdate(BaseModel):
    content: Optional[str] = Field(None, min_length=1, max_length=10000)
    mood: Optional[str] = Field(None, max_length=100)
    is_pinned: Optional[bool] = None


class DayNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    content: str
    mood: Optional[str] = None
    is_pinned: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

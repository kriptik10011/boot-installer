"""
Pydantic schemas for Events API.
"""

import datetime
import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Time format regex: HH:MM (24-hour format)
TIME_PATTERN = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')


class EventBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    date: datetime.date
    start_time: Optional[str] = Field(None, max_length=10)
    end_time: Optional[str] = Field(None, max_length=10)
    location: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    category_id: Optional[int] = None
    recurrence_rule_id: Optional[int] = None

    @field_validator('start_time', 'end_time')
    @classmethod
    def validate_time_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not TIME_PATTERN.match(v):
            raise ValueError('Time must be in HH:MM format (24-hour)')
        return v


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    date: Optional[datetime.date] = None
    start_time: Optional[str] = Field(None, max_length=10)
    end_time: Optional[str] = Field(None, max_length=10)
    location: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    category_id: Optional[int] = None
    recurrence_rule_id: Optional[int] = None

    @field_validator('start_time', 'end_time')
    @classmethod
    def validate_time_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not TIME_PATTERN.match(v):
            raise ValueError('Time must be in HH:MM format (24-hour)')
        return v


class EventResponse(EventBase):
    id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class EventOccurrenceResponse(EventResponse):
    """Event response with occurrence metadata for recurring events."""
    is_occurrence: bool = False  # True if this is a virtual occurrence, not the master
    master_id: Optional[int] = None  # ID of the master event (if is_occurrence=True)
    occurrence_date: Optional[datetime.date] = None  # The date of this specific occurrence

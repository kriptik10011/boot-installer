"""
Pydantic schemas for Recurrence Rules API.
"""

from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class RecurrenceRuleBase(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = Field(default=1, ge=1, le=365)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)  # 0-6 (Sunday-Saturday)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)  # 1-31
    end_type: Literal["never", "count", "date"] = "never"
    end_count: Optional[int] = Field(None, ge=1, le=1000)
    end_date: Optional[date] = None


class RecurrenceRuleCreate(RecurrenceRuleBase):
    pass


class RecurrenceRuleResponse(RecurrenceRuleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

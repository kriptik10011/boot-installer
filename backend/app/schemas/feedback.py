"""
Feedback Schemas

Schemas for user feedback submission.
"""

from typing import Dict, Optional
from pydantic import BaseModel, Field, field_validator


class FeedbackSubmission(BaseModel):
    """Feedback data submitted by user."""

    ratings: Dict[str, int] = Field(
        ...,
        description="Feature ratings (0-5 scale)",
        examples=[{"events": 4, "meals": 5, "finances": 3, "recipes": 4, "intelligence": 5}],
    )

    @field_validator('ratings')
    @classmethod
    def validate_ratings(cls, v):
        if len(v) > 20:
            raise ValueError('Too many rating categories (max 20)')
        for key, value in v.items():
            if len(key) > 100:
                raise ValueError('Rating key too long (max 100 chars)')
            if not 0 <= value <= 5:
                raise ValueError('Rating value must be 0-5')
        return v

    working_well: Optional[str] = Field(
        None,
        max_length=2000,
        description="What's working well (optional)",
    )
    could_be_better: Optional[str] = Field(
        None,
        max_length=2000,
        description="What could be better (optional)",
    )


class UsageStats(BaseModel):
    """Auto-collected usage statistics."""

    days_since_install: int = 0
    total_events_created: int = 0
    total_meals_planned: int = 0
    total_bills_tracked: int = 0
    total_recipes_saved: int = 0
    total_observation_sessions: int = 0
    intelligence_mode_used: bool = False


class FeedbackResponse(BaseModel):
    """Response after submitting feedback."""

    status: str
    message: str
    feedback_id: str
    filename: Optional[str] = Field(
        None,
        description="Human-readable feedback filename",
    )
    folder: Optional[str] = Field(
        None,
        description="Folder where feedback is saved",
    )

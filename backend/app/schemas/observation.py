"""
Observation Schemas

Pydantic models for the observation layer (events, sessions, dwell time, stats).

Note: EventCreate/EventResponse renamed to ObservationEventCreate/ObservationEventResponse
to avoid naming collisions with the events domain (app.schemas.events).
"""

import json
from datetime import datetime
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ObservationEventCreate(BaseModel):
    """Create an observation event. Renamed from EventCreate to avoid clash with events domain."""
    event_type: str = Field(..., max_length=100)
    view_name: str = Field(..., max_length=100)
    action_name: Optional[str] = Field(None, max_length=100)
    entity_type: Optional[str] = Field(None, max_length=100)
    entity_id: Optional[int] = None
    session_id: str = Field(..., max_length=100)
    metadata: Optional[Dict[str, Any]] = None

    @field_validator("metadata")
    @classmethod
    def validate_metadata_size(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None and len(json.dumps(v)) > 16384:
            raise ValueError("Metadata exceeds 16KB limit")
        return v

    # Client-provided local time (preferred over server time)
    local_hour: Optional[int] = Field(None, ge=0, le=23)  # 0-23
    local_day_of_week: Optional[int] = Field(None, ge=0, le=6)  # 0=Sunday (JavaScript convention)


class ObservationEventResponse(BaseModel):
    """Response for an observation event. Renamed from EventResponse to avoid clash with events domain."""
    id: int
    event_type: str
    view_name: Optional[str]
    action_name: Optional[str]
    entity_type: Optional[str]
    entity_id: Optional[int]
    metadata: Optional[Dict[str, Any]] = Field(default=None, validation_alias="event_metadata")
    session_id: str
    timestamp: datetime
    day_of_week: int
    hour_of_day: int

    model_config = ConfigDict(from_attributes=True)


class DwellTimeResponse(BaseModel):
    id: int
    session_id: str
    view_name: str
    total_seconds: float
    entry_count: int

    model_config = ConfigDict(from_attributes=True)


class SessionResponse(BaseModel):
    id: int
    session_id: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[float]
    day_of_week: int
    hour_started: int
    views_visited: List[str]
    actions_taken: List[str]
    is_planning_session: Optional[bool]

    model_config = ConfigDict(from_attributes=True)


class DwellTimeUpdate(BaseModel):
    session_id: str = Field(..., max_length=100)
    view_name: str = Field(..., max_length=100)
    seconds: float = Field(..., ge=0, le=86400)  # max 24 hours


class StatusOkResponse(BaseModel):
    status: str


class ViewPopularityItem(BaseModel):
    view: str
    seconds: float
    entries: int


class ObservationStatsResponse(BaseModel):
    total_events: int
    total_sessions: int
    events_by_type: Dict[str, int]
    events_by_day: Dict[int, int]
    events_by_hour: Dict[int, int]
    view_popularity: List[ViewPopularityItem]
    average_session_duration_seconds: Optional[float] = None
    planning_sessions: int
    living_sessions: int


class SeedTestDataResponse(BaseModel):
    status: str
    scenario: Optional[str] = None
    session_count: Optional[int] = None
    observation_events: Optional[int] = None
    exits_cold_start: Optional[bool] = None
    message: Optional[str] = None


class InsightDismissedRequest(BaseModel):
    insight_type: str = Field(..., min_length=1, max_length=100)
    context: str = Field(default="global", max_length=100)


class InsightActedRequest(BaseModel):
    insight_type: str = Field(..., min_length=1, max_length=100)
    action: str = Field(..., min_length=1, max_length=200)
    outcome: Optional[str] = Field(None, max_length=500)


class InsightDismissedResponse(BaseModel):
    """Response for insight dismissal."""
    count: int
    suppressed: bool


class InsightActedResponse(BaseModel):
    """Response for insight action."""
    confidence_boost: float


class SuppressedPatternsResponse(BaseModel):
    """Response for suppressed patterns query."""
    suppressed: List[str]

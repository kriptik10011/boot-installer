"""
Observation Layer Models

Passive observation tracking for learning user patterns.
All data stays local - never sent anywhere.
"""

import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from app.database import Base


class ObservationEventType(str, enum.Enum):
    app_open = "app_open"
    app_close = "app_close"
    view_enter = "view_enter"
    view_exit = "view_exit"
    action = "action"
    edit = "edit"
    dismissal = "dismissal"
    scroll = "scroll"
    idle_start = "idle_start"
    idle_end = "idle_end"


class ObservationEvent(Base):
    """Individual observation event record."""
    __tablename__ = "observation_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    view_name = Column(String(50), nullable=True, index=True)
    action_name = Column(String(100), nullable=True)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    event_metadata = Column(SQLiteJSON, nullable=True)
    session_id = Column(String(50), nullable=False, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    day_of_week = Column(Integer, nullable=False)  # 0=Sunday
    hour_of_day = Column(Integer, nullable=False)  # 0-23


class DwellTimeRecord(Base):
    """Aggregated dwell time per view per session."""
    __tablename__ = "dwell_time_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(50), nullable=False, index=True)
    view_name = Column(String(50), nullable=False, index=True)
    total_seconds = Column(Float, nullable=False, default=0)
    entry_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )


class SessionSummary(Base):
    """Summary of each app session."""
    __tablename__ = "session_summaries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(50), nullable=False, unique=True, index=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    day_of_week = Column(Integer, nullable=False)
    hour_started = Column(Integer, nullable=False)
    views_visited = Column(SQLiteJSON, nullable=False, default=list)
    actions_taken = Column(SQLiteJSON, nullable=False, default=list)
    is_planning_session = Column(Boolean, nullable=True)  # Inferred after session ends

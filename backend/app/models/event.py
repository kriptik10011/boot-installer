"""
Event and EventCategory models.

V2: EventTag + EventTagAssociation for flexible event labeling.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Date, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.database import Base


class EventCategory(Base):
    """Category for events (Meeting, Birthday, Appointment, etc.)."""

    __tablename__ = "event_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    events = relationship("Event", back_populates="category")


class Event(Base):
    """Calendar event."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(String(5), nullable=True)  # "HH:MM" format
    end_time = Column(String(5), nullable=True)
    location = Column(String(200), nullable=True)
    description = Column(String(1000), nullable=True)
    category_id = Column(Integer, ForeignKey("event_categories.id"), nullable=True)
    recurrence_rule_id = Column(Integer, ForeignKey("recurrence_rules.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("EventCategory", back_populates="events")
    recurrence_rule = relationship("RecurrenceRule")
    tags = relationship("EventTag", secondary="event_tag_associations", back_populates="events")


class EventTag(Base):
    """Tags for event organization and filtering (V2)."""

    __tablename__ = "event_tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), nullable=True)  # Hex color like #4A9EFF
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    events = relationship("Event", secondary="event_tag_associations", back_populates="tags")


class EventTagAssociation(Base):
    """Junction table for event-tag many-to-many relationship (V2)."""

    __tablename__ = "event_tag_associations"

    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("event_tags.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

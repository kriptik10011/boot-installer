"""
RecurrenceRule model.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Date, DateTime, Enum
import enum

from app.database import Base


class RecurrenceFrequency(str, enum.Enum):
    """Frequency of recurrence."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class RecurrenceEndType(str, enum.Enum):
    """How the recurrence ends."""
    NEVER = "never"
    COUNT = "count"
    DATE = "date"


class RecurrenceRule(Base):
    """
    Recurrence rule for events and financial items.

    Note: The data model is implemented; the UI for creating/editing
    recurrence rules is not yet exposed.
    """

    __tablename__ = "recurrence_rules"

    id = Column(Integer, primary_key=True, index=True)
    frequency = Column(Enum(RecurrenceFrequency), nullable=False)
    interval = Column(Integer, nullable=False, default=1)  # Every N days/weeks/months/years
    day_of_week = Column(Integer, nullable=True)  # 0-6 (Sunday-Saturday) for weekly
    day_of_month = Column(Integer, nullable=True)  # 1-31 for monthly
    end_type = Column(Enum(RecurrenceEndType), nullable=False, default=RecurrenceEndType.NEVER)
    end_count = Column(Integer, nullable=True)  # If end_type = "count"
    end_date = Column(Date, nullable=True)  # If end_type = "date"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

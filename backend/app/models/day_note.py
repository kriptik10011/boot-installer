"""
DayNote model — freeform text notes attached to each day.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Date, Text, String, Boolean, DateTime

from app.database import Base


class DayNote(Base):
    """Freeform journal note attached to a specific date."""

    __tablename__ = "day_notes"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    content = Column(Text, nullable=False, default="")
    mood = Column(String(50), nullable=True)  # Optional: "energized", "tired", etc.
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

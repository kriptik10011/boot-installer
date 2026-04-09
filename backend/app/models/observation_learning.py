"""
Observation Learning Models — Track insight dismissals and actions.

InsightDismissal: Count per insight type+context. 3+ dismissals = suppression.
InsightAction: Log what action was taken + outcome for confidence boosting.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime, timezone

from app.database import Base


class InsightDismissal(Base):
    """Tracks how many times a user dismisses a specific insight type in a context."""
    __tablename__ = "insight_dismissals"

    id = Column(Integer, primary_key=True, index=True)
    insight_type = Column(String(100), nullable=False, index=True)
    context = Column(String(200), nullable=False, default="global")
    count = Column(Integer, nullable=False, default=0)
    last_dismissed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class InsightAction(Base):
    """Logs actions taken on insights and their outcomes."""
    __tablename__ = "insight_actions"

    id = Column(Integer, primary_key=True, index=True)
    insight_type = Column(String(100), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    outcome = Column(String(100), nullable=True)
    confidence_boost = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

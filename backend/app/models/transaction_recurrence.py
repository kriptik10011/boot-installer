"""
TransactionRecurrence model — recurring transaction templates.

Bills, subscriptions, and any repeating financial event.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class RecurrenceFrequency(str, enum.Enum):
    """How often a recurring transaction repeats."""
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"


class TransactionRecurrence(Base):
    """
    Template for recurring financial transactions.

    Tracks bills, subscriptions, and auto-creates transaction instances
    when due (if auto_create is True).
    """

    __tablename__ = "transaction_recurrences"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String(300), nullable=False)
    amount = Column(CentsType, nullable=False)
    merchant = Column(String(200), nullable=True)
    category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=True)
    frequency = Column(String(20), nullable=False, default=RecurrenceFrequency.MONTHLY.value)
    next_due_date = Column(Date, nullable=True, index=True)
    last_paid_date = Column(Date, nullable=True)
    is_subscription = Column(Boolean, nullable=False, default=False)
    subscription_service = Column(String(200), nullable=True)
    auto_create = Column(Boolean, nullable=False, default=False)
    reminder_days_before = Column(Integer, nullable=False, default=3)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("BudgetCategory")

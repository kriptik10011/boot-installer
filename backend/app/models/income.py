"""
IncomeSource model — tracks all income streams.

Supports regular (salary, biweekly) and irregular (freelance, dividends) income.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class IncomeFrequency(str, enum.Enum):
    """How often income arrives."""
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    ANNUAL = "annual"
    IRREGULAR = "irregular"


class IncomeSource(Base):
    """
    Income stream.

    Tracks expected income amounts, frequency, and next expected date.
    Supports variable income mode (Month Ahead budgeting).
    """

    __tablename__ = "income_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    amount = Column(CentsType, nullable=False)
    frequency = Column(String(20), nullable=False, default=IncomeFrequency.MONTHLY.value)
    next_expected_date = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(String(500), nullable=True)
    color = Column(String(20), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

"""
FinancialItem and FinancialCategory models.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Date, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class FinancialItemType(str, enum.Enum):
    """Type of financial item."""
    BILL = "bill"
    INCOME = "income"


class FinancialCategory(Base):
    """Category for financial items (Utilities, Rent, Subscriptions, etc.)."""

    __tablename__ = "financial_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    items = relationship("FinancialItem", back_populates="category")


class FinancialItem(Base):
    """Bill or income item."""

    __tablename__ = "financial_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    amount = Column(CentsType, nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    type = Column(Enum(FinancialItemType), nullable=False, default=FinancialItemType.BILL)
    category_id = Column(Integer, ForeignKey("financial_categories.id"), nullable=True)
    is_paid = Column(Boolean, nullable=False, default=False)
    paid_date = Column(Date, nullable=True)
    notes = Column(String(1000), nullable=True)
    recurrence_rule_id = Column(Integer, ForeignKey("recurrence_rules.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # V2: Migration tracking
    budget_category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=True)
    is_migrated_to_transaction = Column(Boolean, nullable=False, default=False)

    # Relationships
    category = relationship("FinancialCategory", back_populates="items")
    recurrence_rule = relationship("RecurrenceRule")
    budget_category = relationship("BudgetCategory")

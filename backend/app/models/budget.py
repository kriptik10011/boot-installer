"""
Budget models: BudgetCategory and BudgetAllocation.

Zero-based envelope budgeting: every dollar gets a job.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, DateTime
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class BudgetCategoryType(str, enum.Enum):
    """50/30/20 rule-aligned category types."""
    NEED = "need"
    WANT = "want"
    SAVINGS = "savings"
    DEBT = "debt"


class BudgetPeriod(str, enum.Enum):
    """Budget period frequency."""
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class BudgetCategory(Base):
    """
    Budget envelope category.

    Each category gets an allocated amount per period.
    Supports rollover (optional) and hierarchical categories.
    """

    __tablename__ = "budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(20), nullable=True)
    icon = Column(String(50), nullable=True)
    type = Column(String(20), nullable=False, default=BudgetCategoryType.NEED.value)
    budget_amount = Column(CentsType, nullable=False, default=0.0)
    period = Column(String(20), nullable=False, default=BudgetPeriod.MONTHLY.value)
    rollover_enabled = Column(Boolean, nullable=False, default=False)
    rollover_cap = Column(CentsType, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    parent_category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    parent = relationship("BudgetCategory", remote_side="BudgetCategory.id", backref="subcategories")
    allocations = relationship("BudgetAllocation", back_populates="category")
    transactions = relationship("Transaction", back_populates="category")


class BudgetAllocation(Base):
    """
    Per-period budget tracking.

    Tracks allocated vs spent for each category in a specific period.
    Rollover amounts are tracked separately.
    """

    __tablename__ = "budget_allocations"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False, index=True)
    period_end = Column(Date, nullable=False)
    allocated_amount = Column(CentsType, nullable=False, default=0.0)
    spent_amount = Column(CentsType, nullable=False, default=0.0)
    rolled_over_from = Column(CentsType, nullable=False, default=0.0)
    adjustment_note = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("BudgetCategory", back_populates="allocations")

    @property
    def remaining(self) -> float:
        """Available budget = allocated + rollover - spent."""
        return self.allocated_amount + self.rolled_over_from - self.spent_amount

    @property
    def pct_used(self) -> float:
        """Percentage of budget used."""
        total = self.allocated_amount + self.rolled_over_from
        if total <= 0:
            return 0.0
        return min(100.0, (self.spent_amount / total) * 100.0)

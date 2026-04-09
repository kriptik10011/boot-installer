"""
SavingsGoal model — track progress toward financial goals.

Supports emergency fund, vacation, down payment, and custom goals.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class SavingsGoalCategory(str, enum.Enum):
    """Pre-defined goal types."""
    EMERGENCY_FUND = "emergency_fund"
    VACATION = "vacation"
    DOWN_PAYMENT = "down_payment"
    RETIREMENT = "retirement"
    EDUCATION = "education"
    CUSTOM = "custom"


class SavingsGoal(Base):
    """
    Financial savings goal.

    Tracks target amount, current progress, and projected completion.
    """

    __tablename__ = "savings_goals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    target_amount = Column(CentsType, nullable=False)
    current_amount = Column(CentsType, nullable=False, default=0.0)
    target_date = Column(Date, nullable=True)
    priority = Column(Integer, nullable=False, default=3)  # 1-5, 1 = highest
    category = Column(String(30), nullable=False, default=SavingsGoalCategory.CUSTOM.value)
    monthly_contribution = Column(CentsType, nullable=False, default=0.0)
    icon = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)
    is_achieved = Column(Boolean, nullable=False, default=False)
    achieved_date = Column(Date, nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def progress_pct(self) -> float:
        """Percentage of goal achieved."""
        if self.target_amount <= 0:
            return 100.0
        return min(100.0, (self.current_amount / self.target_amount) * 100.0)

    @property
    def remaining(self) -> float:
        """Amount still needed."""
        return max(0.0, self.target_amount - self.current_amount)

"""
Debt models: DebtAccount and DebtPayment.

Tracks debt balances, interest rates, and payment history.
Supports snowball (smallest balance first) and avalanche (highest interest first) strategies.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class DebtType(str, enum.Enum):
    """Types of debt accounts."""
    CREDIT_CARD = "credit_card"
    STUDENT_LOAN = "student_loan"
    AUTO_LOAN = "auto_loan"
    MORTGAGE = "mortgage"
    PERSONAL = "personal"
    MEDICAL = "medical"
    OTHER = "other"


class PayoffStrategy(str, enum.Enum):
    """Debt payoff strategies."""
    MINIMUM = "minimum"
    SNOWBALL = "snowball"
    AVALANCHE = "avalanche"
    CUSTOM = "custom"


class DebtAccount(Base):
    """
    Debt account with balance, interest rate, and payoff tracking.
    """

    __tablename__ = "debt_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    current_balance = Column(CentsType, nullable=False)
    original_balance = Column(CentsType, nullable=False)
    interest_rate = Column(Float, nullable=False, default=0.0)  # APR as percentage (NOT money)
    minimum_payment = Column(CentsType, nullable=False, default=0.0)
    due_day_of_month = Column(Integer, nullable=True)
    type = Column(String(30), nullable=False, default=DebtType.OTHER.value)
    lender = Column(String(200), nullable=True)
    account_last_four = Column(String(4), nullable=True)
    payoff_strategy = Column(String(20), nullable=False, default=PayoffStrategy.MINIMUM.value)
    extra_payment_amount = Column(CentsType, nullable=False, default=0.0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    payments = relationship("DebtPayment", back_populates="debt_account", order_by="DebtPayment.date.desc()")

    @property
    def paid_off_pct(self) -> float:
        """Percentage of original balance paid off."""
        if self.original_balance <= 0:
            return 100.0
        paid = self.original_balance - self.current_balance
        return min(100.0, max(0.0, (paid / self.original_balance) * 100.0))


class DebtPayment(Base):
    """
    Individual payment toward a debt account.

    Tracks principal vs interest portions for accurate payoff calculation.
    """

    __tablename__ = "debt_payments"

    id = Column(Integer, primary_key=True, index=True)
    debt_id = Column(Integer, ForeignKey("debt_accounts.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(CentsType, nullable=False)
    principal_portion = Column(CentsType, nullable=True)
    interest_portion = Column(CentsType, nullable=True)
    balance_after = Column(CentsType, nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    debt_account = relationship("DebtAccount", back_populates="payments")

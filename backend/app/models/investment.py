"""
Investment models: InvestmentAccount, InvestmentHolding, TargetAllocation, InvestmentContribution.

Manual-entry portfolio tracking. No bank APIs, no automatic price updates.
User enters current values when they want to update holdings.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class InvestmentAccountType(str, enum.Enum):
    """Types of investment accounts."""
    BROKERAGE = "brokerage"
    FOUR01K = "401k"
    IRA = "ira"
    ROTH_IRA = "roth_ira"
    HSA = "hsa"
    FIVE29 = "529"
    PENSION = "pension"
    OTHER = "other"


class AssetClass(str, enum.Enum):
    """Asset classes for allocation tracking."""
    US_STOCKS = "us_stocks"
    INTL_STOCKS = "intl_stocks"
    BONDS = "bonds"
    CASH = "cash"
    REAL_ESTATE = "real_estate"
    CRYPTO = "crypto"
    COMMODITIES = "commodities"
    OTHER = "other"


class InvestmentAccount(Base):
    """
    Investment account container (401k, IRA, brokerage, HSA, etc.).

    Each account holds multiple InvestmentHoldings and has TargetAllocations.
    """

    __tablename__ = "investment_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    type = Column(String(30), nullable=False, default=InvestmentAccountType.BROKERAGE.value)
    institution = Column(String(200), nullable=True)
    account_last_four = Column(String(4), nullable=True)
    is_tax_advantaged = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    holdings = relationship("InvestmentHolding", back_populates="account", order_by="InvestmentHolding.name")
    target_allocations = relationship("TargetAllocation", back_populates="account")
    contributions = relationship("InvestmentContribution", back_populates="account", order_by="InvestmentContribution.date.desc()")

    @property
    def total_value(self) -> float:
        """Sum of all holdings' current values."""
        return sum(h.current_value for h in self.holdings)

    @property
    def total_cost_basis(self) -> float:
        """Sum of all holdings' cost bases."""
        return sum(h.cost_basis for h in self.holdings)

    @property
    def total_gain_loss(self) -> float:
        """Total unrealized gain/loss across all holdings."""
        return self.total_value - self.total_cost_basis

    @property
    def total_gain_loss_pct(self) -> float:
        """Total unrealized gain/loss as percentage."""
        if self.total_cost_basis <= 0:
            return 0.0
        return round((self.total_gain_loss / self.total_cost_basis) * 100.0, 2)


class InvestmentHolding(Base):
    """
    Individual holding within an investment account.

    Tracks symbol, quantity, cost basis, and current value.
    All values manually entered by user.
    """

    __tablename__ = "investment_holdings"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("investment_accounts.id"), nullable=False, index=True)
    symbol = Column(String(20), nullable=True)  # Nullable for non-ticker holdings (e.g., "Target Date Fund")
    name = Column(String(200), nullable=False)
    asset_class = Column(String(30), nullable=False, default=AssetClass.US_STOCKS.value)
    quantity = Column(Float, nullable=False, default=0.0)  # Share count, NOT money
    cost_basis = Column(CentsType, nullable=False, default=0.0)
    current_price = Column(CentsType, nullable=False, default=0.0)
    current_value = Column(CentsType, nullable=False, default=0.0)
    last_updated = Column(Date, nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    account = relationship("InvestmentAccount", back_populates="holdings")

    @property
    def gain_loss(self) -> float:
        """Unrealized gain/loss for this holding."""
        return self.current_value - self.cost_basis

    @property
    def gain_loss_pct(self) -> float:
        """Unrealized gain/loss as percentage."""
        if self.cost_basis <= 0:
            return 0.0
        return round((self.gain_loss / self.cost_basis) * 100.0, 2)

    @property
    def cost_per_share(self) -> float:
        """Average cost per share."""
        if self.quantity <= 0:
            return 0.0
        return round(self.cost_basis / self.quantity, 4)


class TargetAllocation(Base):
    """
    Target allocation percentage for an asset class within an account.

    Used to calculate drift and generate rebalancing suggestions.
    Percentages should sum to 100 per account.
    """

    __tablename__ = "target_allocations"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("investment_accounts.id"), nullable=False, index=True)
    asset_class = Column(String(30), nullable=False)
    target_pct = Column(Float, nullable=False, default=0.0)  # 0-100
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    account = relationship("InvestmentAccount", back_populates="target_allocations")


class InvestmentContribution(Base):
    """
    Contribution (or withdrawal) to an investment account.

    Positive amount = contribution, negative = withdrawal.
    """

    __tablename__ = "investment_contributions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("investment_accounts.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(CentsType, nullable=False)
    note = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    account = relationship("InvestmentAccount", back_populates="contributions")

"""
Pydantic schemas for the investments API.

Covers: InvestmentAccount CRUD, Holdings, TargetAllocation,
        Contributions, Allocation, Performance, Rebalancing.
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# --- Investment Account ---

class InvestmentAccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(default="brokerage")
    institution: Optional[str] = Field(None, max_length=200)
    account_last_four: Optional[str] = Field(None, max_length=4)
    is_tax_advantaged: bool = False
    is_active: bool = True
    notes: Optional[str] = Field(None, max_length=500)


class InvestmentAccountCreate(InvestmentAccountBase):
    pass


class InvestmentAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[str] = None
    institution: Optional[str] = Field(None, max_length=200)
    account_last_four: Optional[str] = Field(None, max_length=4)
    is_tax_advantaged: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class InvestmentAccountResponse(InvestmentAccountBase):
    id: int
    total_value: float
    total_cost_basis: float
    total_gain_loss: float
    total_gain_loss_pct: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Investment Holding ---

class InvestmentHoldingBase(BaseModel):
    symbol: Optional[str] = Field(None, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)
    asset_class: str = Field(default="us_stocks")
    quantity: float = Field(default=0.0, ge=0)
    cost_basis: float = Field(default=0.0, ge=0)
    current_price: float = Field(default=0.0, ge=0)
    current_value: float = Field(default=0.0, ge=0)
    notes: Optional[str] = Field(None, max_length=500)


class InvestmentHoldingCreate(InvestmentHoldingBase):
    account_id: int


class InvestmentHoldingUpdate(BaseModel):
    symbol: Optional[str] = Field(None, max_length=20)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    asset_class: Optional[str] = None
    quantity: Optional[float] = Field(None, ge=0)
    cost_basis: Optional[float] = Field(None, ge=0)
    current_price: Optional[float] = Field(None, ge=0)
    current_value: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=500)


class InvestmentHoldingResponse(InvestmentHoldingBase):
    id: int
    account_id: int
    gain_loss: float
    gain_loss_pct: float
    cost_per_share: float
    last_updated: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Target Allocation ---

class TargetAllocationBase(BaseModel):
    asset_class: str = Field(..., min_length=1, max_length=30)
    target_pct: float = Field(..., ge=0, le=100)


class TargetAllocationCreate(TargetAllocationBase):
    pass


class TargetAllocationUpdate(BaseModel):
    target_pct: Optional[float] = Field(None, ge=0, le=100)


class TargetAllocationResponse(TargetAllocationBase):
    id: int
    account_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Contribution ---

class InvestmentContributionBase(BaseModel):
    date: date
    amount: float  # Positive = contribution, negative = withdrawal
    note: Optional[str] = Field(None, max_length=300)


class InvestmentContributionCreate(InvestmentContributionBase):
    pass


class InvestmentContributionResponse(InvestmentContributionBase):
    id: int
    account_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Allocation Analysis ---

class AllocationEntry(BaseModel):
    asset_class: str
    current_value: float
    current_pct: float
    target_pct: Optional[float] = None
    drift_pct: Optional[float] = None  # current_pct - target_pct


class AllocationResponse(BaseModel):
    account_id: Optional[int] = None  # None = portfolio-wide
    total_value: float
    allocations: List[AllocationEntry]


# --- Performance ---

class HoldingPerformance(BaseModel):
    holding_id: int
    name: str
    symbol: Optional[str] = None
    asset_class: str
    quantity: float
    cost_basis: float
    current_value: float
    gain_loss: float
    gain_loss_pct: float
    weight_pct: float  # % of total portfolio


class PerformanceResponse(BaseModel):
    account_id: Optional[int] = None  # None = portfolio-wide
    total_cost_basis: float
    total_current_value: float
    total_gain_loss: float
    total_gain_loss_pct: float
    total_contributions: float
    holdings: List[HoldingPerformance]


# --- Rebalancing ---

class RebalanceTrade(BaseModel):
    asset_class: str
    current_value: float
    current_pct: float
    target_pct: float
    target_value: float
    trade_amount: float  # Positive = buy, negative = sell
    action: str  # "buy" or "sell"


class RebalancePreviewResponse(BaseModel):
    account_id: int
    total_value: float
    trades: List[RebalanceTrade]
    total_buys: float
    total_sells: float


# --- Account Summary ---

class InvestmentSummaryResponse(BaseModel):
    total_portfolio_value: float
    total_cost_basis: float
    total_gain_loss: float
    total_gain_loss_pct: float
    total_contributions: float
    account_count: int
    holding_count: int
    tax_advantaged_value: float
    taxable_value: float

"""
Pydantic schemas for the budget API.

Covers: BudgetCategory CRUD, BudgetAllocation, BudgetStatus, SafeToSpend,
        Income, Transaction, TransactionRecurrence, SavingsGoal, DebtAccount, Asset.
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# --- Budget Category ---

class BudgetCategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(default="need")  # need, want, savings, debt
    color: Optional[str] = None
    icon: Optional[str] = None
    budget_amount: float = Field(default=0.0, ge=0)
    period: str = Field(default="monthly")  # weekly, monthly
    rollover_enabled: bool = False
    rollover_cap: Optional[float] = None
    sort_order: int = 0
    is_active: bool = True
    parent_category_id: Optional[int] = None


class BudgetCategoryCreate(BudgetCategoryBase):
    pass


class BudgetCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    budget_amount: Optional[float] = Field(None, ge=0)
    period: Optional[str] = None
    rollover_enabled: Optional[bool] = None
    rollover_cap: Optional[float] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    parent_category_id: Optional[int] = None


class BudgetCategoryResponse(BudgetCategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Budget Status ---

class CategoryStatusResponse(BaseModel):
    category_id: int
    name: str
    type: str
    color: Optional[str] = None
    budgeted: float
    spent: float
    remaining: float
    rollover: float
    pct_used: float
    sort_order: int


class BudgetStatusResponse(BaseModel):
    period_start: date
    period_end: date
    total_income: float
    total_allocated: float
    available_to_budget: float
    total_spent: float
    categories: List[CategoryStatusResponse]


class SafeToSpendResponse(BaseModel):
    amount: float
    total_income: float
    upcoming_bills: float
    budget_allocated: float
    already_spent: float
    savings_contributions: float
    breakdown: dict


# --- Budget Allocation ---

class AllocateBudgetRequest(BaseModel):
    category_id: int
    amount: float = Field(..., ge=0)
    period_start: date
    note: Optional[str] = Field(None, max_length=500)


class BudgetAllocationResponse(BaseModel):
    id: int
    category_id: int
    period_start: date
    period_end: date
    allocated_amount: float
    spent_amount: float
    rolled_over_from: float
    adjustment_note: Optional[str] = None
    remaining: float
    pct_used: float

    model_config = {"from_attributes": True}


# --- Income Source ---

class IncomeSourceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    frequency: str = Field(default="monthly")
    next_expected_date: Optional[date] = None
    is_active: bool = True
    notes: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = None
    sort_order: int = 0


class IncomeSourceCreate(IncomeSourceBase):
    pass


class IncomeSourceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, gt=0)
    frequency: Optional[str] = None
    next_expected_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = None
    sort_order: Optional[int] = None


class IncomeSourceResponse(IncomeSourceBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IncomeSummaryResponse(BaseModel):
    period_start: date
    period_end: date
    expected_income: float
    actual_income: float
    difference: float
    sources: List


# --- Transaction ---

class TransactionBase(BaseModel):
    date: date
    amount: float = Field(..., gt=0)
    description: str = Field(..., min_length=1, max_length=300)
    merchant: Optional[str] = Field(None, max_length=200)
    category_id: Optional[int] = None
    payment_method: Optional[str] = Field(None, max_length=100)
    is_income: bool = False
    income_source_id: Optional[int] = None
    is_recurring: bool = False
    recurrence_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=1000)
    receipt_note: Optional[str] = Field(None, max_length=500)


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[float] = Field(None, gt=0)
    description: Optional[str] = Field(None, min_length=1, max_length=300)
    merchant: Optional[str] = Field(None, max_length=200)
    category_id: Optional[int] = None
    payment_method: Optional[str] = Field(None, max_length=100)
    is_income: Optional[bool] = None
    income_source_id: Optional[int] = None
    is_recurring: Optional[bool] = None
    recurrence_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=1000)
    receipt_note: Optional[str] = Field(None, max_length=500)


class TransactionResponse(TransactionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Transaction Recurrence ---

class TransactionRecurrenceBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=300)
    amount: float = Field(..., gt=0)
    merchant: Optional[str] = Field(None, max_length=200)
    category_id: Optional[int] = None
    frequency: str = Field(default="monthly")
    next_due_date: Optional[date] = None
    is_subscription: bool = False
    subscription_service: Optional[str] = Field(None, max_length=200)
    auto_create: bool = False
    reminder_days_before: int = Field(default=3, ge=0, le=30)
    is_active: bool = True


class TransactionRecurrenceCreate(TransactionRecurrenceBase):
    pass


class TransactionRecurrenceUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=300)
    amount: Optional[float] = Field(None, gt=0)
    merchant: Optional[str] = Field(None, max_length=200)
    category_id: Optional[int] = None
    frequency: Optional[str] = None
    next_due_date: Optional[date] = None
    last_paid_date: Optional[date] = None
    is_subscription: Optional[bool] = None
    subscription_service: Optional[str] = Field(None, max_length=200)
    auto_create: Optional[bool] = None
    reminder_days_before: Optional[int] = Field(None, ge=0, le=30)
    is_active: Optional[bool] = None


class TransactionRecurrenceResponse(TransactionRecurrenceBase):
    id: int
    last_paid_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Savings Goal ---

class SavingsGoalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    target_amount: float = Field(..., gt=0)
    current_amount: float = Field(default=0.0, ge=0)
    target_date: Optional[date] = None
    priority: int = Field(default=3, ge=1, le=5)
    category: str = Field(default="custom")
    monthly_contribution: float = Field(default=0.0, ge=0)
    icon: Optional[str] = None
    color: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)


class SavingsGoalCreate(SavingsGoalBase):
    pass


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    target_amount: Optional[float] = Field(None, gt=0)
    current_amount: Optional[float] = Field(None, ge=0)
    target_date: Optional[date] = None
    priority: Optional[int] = Field(None, ge=1, le=5)
    category: Optional[str] = None
    monthly_contribution: Optional[float] = Field(None, ge=0)
    icon: Optional[str] = None
    color: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)


class SavingsGoalResponse(SavingsGoalBase):
    id: int
    is_achieved: bool
    achieved_date: Optional[date] = None
    progress_pct: float
    remaining: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContributeRequest(BaseModel):
    amount: float = Field(..., gt=0)
    note: Optional[str] = Field(None, max_length=300)


# --- Debt Account ---

class DebtAccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    current_balance: float = Field(..., ge=0)
    original_balance: float = Field(..., gt=0)
    interest_rate: float = Field(default=0.0, ge=0, le=100)
    minimum_payment: float = Field(default=0.0, ge=0)
    due_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    type: str = Field(default="other")
    lender: Optional[str] = Field(None, max_length=200)
    account_last_four: Optional[str] = Field(None, max_length=4)
    payoff_strategy: str = Field(default="minimum")
    extra_payment_amount: float = Field(default=0.0, ge=0)
    is_active: bool = True


class DebtAccountCreate(DebtAccountBase):
    pass


class DebtAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    current_balance: Optional[float] = Field(None, ge=0)
    original_balance: Optional[float] = Field(None, gt=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    minimum_payment: Optional[float] = Field(None, ge=0)
    due_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    type: Optional[str] = None
    lender: Optional[str] = Field(None, max_length=200)
    account_last_four: Optional[str] = Field(None, max_length=4)
    payoff_strategy: Optional[str] = None
    extra_payment_amount: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class DebtAccountResponse(DebtAccountBase):
    id: int
    paid_off_pct: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DebtPaymentBase(BaseModel):
    date: date
    amount: float = Field(..., gt=0)
    principal_portion: Optional[float] = None
    interest_portion: Optional[float] = None
    balance_after: Optional[float] = None
    notes: Optional[str] = Field(None, max_length=500)


class DebtPaymentCreate(DebtPaymentBase):
    pass


class DebtPaymentResponse(DebtPaymentBase):
    id: int
    debt_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Asset ---

class AssetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    current_value: float = Field(default=0.0)
    type: str = Field(default="other")
    institution: Optional[str] = Field(None, max_length=200)
    account_last_four: Optional[str] = Field(None, max_length=4)
    is_liquid: bool = True
    notes: Optional[str] = Field(None, max_length=500)


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    current_value: Optional[float] = None
    type: Optional[str] = None
    institution: Optional[str] = Field(None, max_length=200)
    account_last_four: Optional[str] = Field(None, max_length=4)
    is_liquid: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class AssetResponse(AssetBase):
    id: int
    last_updated: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssetHistoryResponse(BaseModel):
    id: int
    asset_id: int
    date: date
    value: float
    change_amount: Optional[float] = None
    change_note: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Net Worth ---

class NetWorthResponse(BaseModel):
    total_assets: float
    total_liabilities: float
    net_worth: float
    liquid_assets: float
    illiquid_assets: float
    assets: List[AssetResponse]
    debts: List[DebtAccountResponse]


# --- Transaction Management (Session 7) ---

class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    existing_id: Optional[int] = None
    existing_description: Optional[str] = None
    existing_date: Optional[date] = None
    existing_amount: Optional[float] = None
    similarity_reason: Optional[str] = None


class MerchantCategorySuggestionResponse(BaseModel):
    has_suggestion: bool
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    confidence: Optional[float] = None
    transaction_count: Optional[int] = None


class SplitItem(BaseModel):
    category_id: int
    amount: float = Field(..., gt=0)


class SplitTransactionRequest(BaseModel):
    date: date
    total_amount: float = Field(..., gt=0)
    description: str = Field(..., min_length=1, max_length=300)
    splits: List[SplitItem] = Field(..., min_length=2)
    merchant: Optional[str] = Field(None, max_length=200)
    payment_method: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)


class SpendingVelocityResponse(BaseModel):
    category_id: int
    category_name: str
    budget_amount: float
    spent_amount: float
    pct_budget_used: float
    pct_period_elapsed: float
    velocity: float
    status: str  # "on_track", "ahead", "behind"
    days_remaining: int


class RecurringBillStatusResponse(BaseModel):
    id: int
    description: str
    amount: float
    frequency: str
    next_due_date: Optional[date] = None
    is_overdue: bool
    days_until_due: Optional[int] = None
    is_subscription: bool
    subscription_service: Optional[str] = None


class SubscriptionDetailEntry(BaseModel):
    id: int
    description: str
    service: Optional[str] = None
    amount: float
    frequency: str
    monthly_equivalent: float


class SubscriptionSummaryResponse(BaseModel):
    subscription_count: int
    monthly_total: float
    annual_total: float
    subscriptions: List[SubscriptionDetailEntry]


# --- Savings Projections (Session 8) ---

class GoalProjectionResponse(BaseModel):
    goal_id: int
    goal_name: str
    target_amount: float
    current_amount: float
    remaining: float
    monthly_contribution: float
    months_to_goal: Optional[int] = None
    projected_completion: Optional[date] = None
    on_track: bool
    required_monthly: Optional[float] = None


class EmergencyFundResponse(BaseModel):
    monthly_expenses: float
    three_month_target: float
    six_month_target: float
    current_emergency_fund: float
    months_covered: float
    status: str  # "none", "building", "partial", "adequate", "strong"
    shortfall_3mo: float
    shortfall_6mo: float


class GoalMilestoneResponse(BaseModel):
    goal_id: int
    goal_name: str
    milestone_pct: int
    amount_at_milestone: float
    target_amount: float


# --- Debt Payoff (Session 9) ---

class PayoffScheduleEntry(BaseModel):
    month: int
    debt_name: str
    payment: float
    principal: float
    interest: float
    balance_after: float


class PayoffPlanResponse(BaseModel):
    strategy: str
    total_months: int
    total_interest: float
    total_paid: float
    debt_free_date: Optional[date] = None
    schedule: List[PayoffScheduleEntry]


class StrategyComparisonResponse(BaseModel):
    snowball: PayoffPlanResponse
    avalanche: PayoffPlanResponse
    interest_savings: float  # avalanche saves this much vs snowball
    time_difference_months: int  # positive = snowball takes longer


class ExtraPaymentSimResponse(BaseModel):
    current_plan: PayoffPlanResponse
    extra_plan: PayoffPlanResponse
    months_saved: int
    interest_saved: float
    extra_monthly: float


class DebtSummaryResponse(BaseModel):
    total_debt: float
    total_minimum_payments: float
    weighted_avg_interest: float
    debt_count: int
    projected_debt_free_date: Optional[date] = None
    total_interest_remaining: float


# --- Net Worth & Cash Flow (Session 10) ---

class NetWorthSnapshotResponse(BaseModel):
    message: str
    date: date
    total_assets_snapshot: float
    total_debt_snapshot: float


class NetWorthTrendEntry(BaseModel):
    date: date
    total_assets: float
    total_liabilities: float
    net_worth: float


class NetWorthMilestoneResponse(BaseModel):
    amount: float
    label: str
    achieved: bool
    achieved_date: Optional[date] = None


class CashFlowDayEntry(BaseModel):
    date: date
    projected_balance: float
    income: float
    expenses: float
    bills: float
    net_change: float


class LowBalanceWarning(BaseModel):
    date: date
    projected_balance: float
    threshold: float
    message: str


class CashFlowForecastResponse(BaseModel):
    start_balance: float
    days: int
    daily_projections: List[CashFlowDayEntry]
    low_balance_warnings: List[LowBalanceWarning]
    min_projected_balance: float
    min_balance_date: Optional[date] = None

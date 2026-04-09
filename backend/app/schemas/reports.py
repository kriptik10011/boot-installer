"""
Financial reports Pydantic schemas.
"""

from datetime import date
from typing import Dict, List, Optional
from pydantic import BaseModel


class SpendingBreakdownEntry(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    category_type: Optional[str] = None
    total_spent: float
    pct_of_total: float
    transaction_count: int


class SpendingBreakdownResponse(BaseModel):
    period_start: date
    period_end: date
    total_spent: float
    categories: List[SpendingBreakdownEntry]


class IncomeVsExpensesEntry(BaseModel):
    period_label: str
    period_start: date
    period_end: date
    total_income: float
    total_expenses: float
    surplus: float


class IncomeVsExpensesResponse(BaseModel):
    months: int
    data: List[IncomeVsExpensesEntry]


class CategoryTrendEntry(BaseModel):
    category_id: int
    category_name: str
    monthly_amounts: List[Dict]


class CategoryTrendsResponse(BaseModel):
    months: int
    trends: List[CategoryTrendEntry]


class MerchantEntry(BaseModel):
    merchant: str
    total_spent: float
    transaction_count: int
    avg_amount: float
    last_transaction_date: Optional[date] = None
    most_common_category: Optional[str] = None


class MerchantAnalysisResponse(BaseModel):
    period_start: date
    period_end: date
    merchants: List[MerchantEntry]


class SavingsRateEntry(BaseModel):
    month: str
    income: float
    expenses: float
    saved: float
    savings_rate: float


class SavingsRateResponse(BaseModel):
    months: int
    data: List[SavingsRateEntry]


class HealthScoreResponse(BaseModel):
    total_score: float
    savings_rate_score: float
    bills_on_time_score: float
    budget_adherence_score: float
    emergency_fund_score: float
    debt_to_income_score: float
    details: Dict


class MonthlyCloseResponse(BaseModel):
    period_start: str
    period_end: str
    total_income: float
    total_expenses: float
    surplus_deficit: float
    savings_rate_pct: float
    transaction_count: int
    net_worth: float
    total_assets: float
    total_debt: float


class YearReviewResponse(BaseModel):
    year: int
    total_income: float
    total_expenses: float
    total_saved: float
    savings_rate_pct: float
    transaction_count: int
    monthly_breakdown: List[Dict]
    top_spending_categories: List[Dict]


class TransactionExportEntry(BaseModel):
    date: str
    amount: float
    description: str
    merchant: str
    category: str
    is_income: bool
    payment_method: str
    notes: str

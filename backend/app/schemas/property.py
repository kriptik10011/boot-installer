"""
Pydantic schemas for the property management API.

Covers: Property, Unit, Tenant, Lease, RentPayment, PropertyExpense,
MaintenanceRequest, SecurityDeposit, Mortgage, P&L, Metrics.
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# --- Property ---

class PropertyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    property_type: str = Field(default="single_family")
    purchase_price: Optional[float] = None
    purchase_date: Optional[date] = None
    current_value: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool = True


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    property_type: Optional[str] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[date] = None
    current_value: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class PropertyResponse(PropertyBase):
    id: int
    total_monthly_rent: float
    unit_count: int
    occupied_unit_count: int
    vacancy_rate: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Unit ---

class UnitBase(BaseModel):
    unit_number: str = Field(..., min_length=1, max_length=50)
    bedrooms: Optional[int] = Field(None, ge=0)
    bathrooms: Optional[float] = Field(None, ge=0)
    sqft: Optional[int] = Field(None, ge=0)
    monthly_rent: Optional[float] = Field(None, ge=0)


class UnitCreate(UnitBase):
    pass


class UnitUpdate(BaseModel):
    unit_number: Optional[str] = Field(None, min_length=1, max_length=50)
    bedrooms: Optional[int] = Field(None, ge=0)
    bathrooms: Optional[float] = Field(None, ge=0)
    sqft: Optional[int] = Field(None, ge=0)
    monthly_rent: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class UnitResponse(UnitBase):
    id: int
    property_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Tenant ---

class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    move_in_date: Optional[date] = None
    move_out_date: Optional[date] = None
    notes: Optional[str] = None
    is_active: bool = True


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    move_in_date: Optional[date] = None
    move_out_date: Optional[date] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class TenantResponse(TenantBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Lease ---

class LeaseBase(BaseModel):
    unit_id: int
    tenant_id: int
    start_date: date
    end_date: date
    monthly_rent: float = Field(..., gt=0)
    security_deposit: Optional[float] = Field(None, ge=0)
    terms_notes: Optional[str] = None
    status: str = Field(default="active")


class LeaseCreate(LeaseBase):
    pass


class LeaseUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    monthly_rent: Optional[float] = Field(None, gt=0)
    security_deposit: Optional[float] = Field(None, ge=0)
    terms_notes: Optional[str] = None
    status: Optional[str] = None


class LeaseResponse(LeaseBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Rent Payment ---

class RentPaymentBase(BaseModel):
    lease_id: int
    period_month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    amount_due: float = Field(..., gt=0)
    amount_paid: float = Field(default=0.0, ge=0)
    paid_date: Optional[date] = None
    status: str = Field(default="pending")
    late_fee: float = Field(default=0.0, ge=0)
    notes: Optional[str] = Field(None, max_length=500)


class RentPaymentCreate(RentPaymentBase):
    pass


class RentPaymentUpdate(BaseModel):
    amount_paid: Optional[float] = Field(None, ge=0)
    paid_date: Optional[date] = None
    status: Optional[str] = None
    late_fee: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=500)


class RentPaymentResponse(RentPaymentBase):
    id: int
    balance_due: float
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Property Expense ---

class PropertyExpenseBase(BaseModel):
    property_id: int
    unit_id: Optional[int] = None
    category: str = Field(default="other")
    amount: float = Field(..., gt=0)
    date: date
    vendor: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    is_capex: bool = False


class PropertyExpenseCreate(PropertyExpenseBase):
    pass


class PropertyExpenseUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    date: Optional[date] = None
    vendor: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    is_capex: Optional[bool] = None


class PropertyExpenseResponse(PropertyExpenseBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Maintenance Request ---

class MaintenanceRequestBase(BaseModel):
    property_id: int
    unit_id: int
    tenant_id: Optional[int] = None
    description: str = Field(..., min_length=1)
    priority: str = Field(default="medium")
    status: str = Field(default="open")
    created_date: date
    completed_date: Optional[date] = None
    vendor_name: Optional[str] = Field(None, max_length=200)
    cost: Optional[float] = Field(None, ge=0)


class MaintenanceRequestCreate(MaintenanceRequestBase):
    pass


class MaintenanceRequestUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1)
    priority: Optional[str] = None
    status: Optional[str] = None
    completed_date: Optional[date] = None
    vendor_name: Optional[str] = Field(None, max_length=200)
    cost: Optional[float] = Field(None, ge=0)


class MaintenanceRequestResponse(MaintenanceRequestBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Security Deposit ---

class SecurityDepositBase(BaseModel):
    lease_id: int
    amount: float = Field(..., gt=0)
    date_received: date
    interest_rate: float = Field(default=0.0, ge=0)
    deductions_json: Optional[str] = None
    refund_amount: Optional[float] = Field(None, ge=0)
    refund_date: Optional[date] = None


class SecurityDepositCreate(SecurityDepositBase):
    pass


class SecurityDepositUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    interest_rate: Optional[float] = Field(None, ge=0)
    deductions_json: Optional[str] = None
    refund_amount: Optional[float] = Field(None, ge=0)
    refund_date: Optional[date] = None


class SecurityDepositResponse(SecurityDepositBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Mortgage ---

class MortgageBase(BaseModel):
    property_id: int
    lender: Optional[str] = Field(None, max_length=200)
    original_amount: float = Field(..., gt=0)
    current_balance: float = Field(..., ge=0)
    interest_rate: float = Field(..., ge=0)
    monthly_payment: float = Field(..., gt=0)
    start_date: Optional[date] = None
    term_years: Optional[int] = Field(None, gt=0)
    is_active: bool = True


class MortgageCreate(MortgageBase):
    pass


class MortgageUpdate(BaseModel):
    lender: Optional[str] = Field(None, max_length=200)
    current_balance: Optional[float] = Field(None, ge=0)
    interest_rate: Optional[float] = Field(None, ge=0)
    monthly_payment: Optional[float] = Field(None, gt=0)
    is_active: Optional[bool] = None


class MortgageResponse(MortgageBase):
    id: int
    ltv_ratio: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Analytical Responses ---

class RentRollEntry(BaseModel):
    unit_id: int
    unit_number: str
    tenant_name: Optional[str] = None
    lease_id: Optional[int] = None
    monthly_rent: float
    status: str  # "occupied" | "vacant"
    lease_end: Optional[date] = None


class RentRollResponse(BaseModel):
    property_id: int
    property_name: str
    total_potential_rent: float
    total_collected: float
    entries: List[RentRollEntry]


class PropertyPNLResponse(BaseModel):
    property_id: int
    period_start: date
    period_end: date
    total_income: float
    total_expenses: float
    net_operating_income: float
    expense_breakdown: List["ExpenseBreakdownEntry"]


class ExpenseBreakdownEntry(BaseModel):
    category: str
    amount: float


class PropertyMetricsResponse(BaseModel):
    property_id: int
    noi: float  # Net Operating Income (annual)
    cash_flow: float  # NOI - mortgage payments (annual)
    cap_rate: Optional[float] = None  # NOI / current_value * 100
    cash_on_cash: Optional[float] = None  # cash_flow / total_cash_invested * 100
    ltv: Optional[float] = None  # mortgage_balance / current_value * 100
    dscr: Optional[float] = None  # NOI / annual_debt_service


class VacancyEntry(BaseModel):
    property_id: int
    property_name: str
    unit_id: int
    unit_number: str
    monthly_rent: float
    days_vacant: int
    lost_income: float


class VacancyResponse(BaseModel):
    total_vacant_units: int
    total_lost_income: float
    entries: List[VacancyEntry]


# --- Intelligence ---

class VacancyTrendResponse(BaseModel):
    property_id: int
    avg_vacancy_days: float = 0
    ewma_vacancy_days: float = 0
    trend: str  # increasing | decreasing | stable | insufficient_data
    sample_count: int = 0
    confidence: float = 0.0
    current_vacancy_rate: float = 0.0

class MaintenanceForecastResponse(BaseModel):
    property_id: int
    monthly_avg: float = 0
    ewma_monthly: float = 0
    current_month_spend: float = 0
    projected_month_spend: float = 0
    trend: str
    sample_count: int = 0
    confidence: float = 0.0

class PropertyInsightItem(BaseModel):
    type: str
    level: str  # info | warning | alert
    message: str
    reasoning: str

class CollectionHealthResponse(BaseModel):
    property_id: int
    on_time_rate: float = 0
    late_rate: float = 0
    total_payments: int = 0
    on_time_count: int = 0
    late_count: int = 0
    partial_count: int = 0
    confidence: float = 0.0

class PropertyIntelligenceResponse(BaseModel):
    property_id: int
    vacancy: VacancyTrendResponse
    maintenance: MaintenanceForecastResponse
    collection: CollectionHealthResponse
    insights: List[PropertyInsightItem]

class PortfolioScoreComponent(BaseModel):
    vacancy: float = 0
    collection: float = 0
    maintenance: float = 0
    noi: float = 0

class PortfolioScoreResponse(BaseModel):
    score: int = 0
    components: PortfolioScoreComponent
    property_count: int = 0
    avg_vacancy_rate: float = 0
    avg_collection_rate: float = 0
    confidence: float = 0.0

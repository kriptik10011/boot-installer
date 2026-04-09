"""
Property Management API router — properties, units, tenants, leases, rent, expenses.
"""

import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.property import (
    Property, PropertyUnit, Tenant, Lease, RentPayment, PropertyExpense,
    SecurityDeposit, Mortgage, LeaseStatus,
)
from app.schemas.property import (
    PropertyCreate, PropertyUpdate, PropertyResponse,
    UnitCreate, UnitUpdate, UnitResponse,
    TenantCreate, TenantUpdate, TenantResponse,
    LeaseCreate, LeaseUpdate, LeaseResponse,
    RentPaymentCreate, RentPaymentUpdate, RentPaymentResponse,
    PropertyExpenseCreate, PropertyExpenseUpdate, PropertyExpenseResponse,
    SecurityDepositCreate, SecurityDepositUpdate, SecurityDepositResponse,
    MortgageCreate, MortgageUpdate, MortgageResponse,
    RentRollResponse, PropertyPNLResponse, PropertyMetricsResponse, VacancyResponse,
    PropertyIntelligenceResponse, PortfolioScoreResponse,
    MaintenanceForecastResponse, VacancyTrendResponse,
)
from app.services.property_service import (
    generate_rent_roll, calculate_pnl, calculate_metrics, get_vacancies,
)
from app.services.pattern_detection.property_patterns import PropertyPatternEngine
from app.services.property_wiring import (
    wire_property_to_net_worth, wire_mortgage_to_debt,
    wire_lease_to_calendar, wire_rent_to_income, wire_expense_to_transaction,
)

log = logging.getLogger("weekly_review")

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# --- Properties ---

@router.get("/properties", response_model=List[PropertyResponse])
@limiter.limit("30/minute")
def list_properties(
    request: Request,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(Property)
    if active_only:
        query = query.filter(Property.is_active == True)  # noqa: E712
    return query.order_by(Property.name).limit(1000).all()


@router.post("/properties", response_model=PropertyResponse, status_code=201)
@limiter.limit("30/minute")
def create_property(request: Request, data: PropertyCreate, db: Session = Depends(get_db)):
    prop = Property(**data.model_dump())
    db.add(prop)
    db.flush()
    if prop.current_value:
        wire_property_to_net_worth(db, prop)
    db.commit()
    db.refresh(prop)
    return prop


@router.get("/properties/{property_id}", response_model=PropertyResponse)
@limiter.limit("30/minute")
def get_property(request: Request, property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.put("/properties/{property_id}", response_model=PropertyResponse)
@limiter.limit("30/minute")
def update_property(
    request: Request, property_id: int, data: PropertyUpdate, db: Session = Depends(get_db)
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    if prop.current_value is not None:
        wire_property_to_net_worth(db, prop)
    db.commit()
    db.refresh(prop)
    return prop


@router.delete("/properties/{property_id}", status_code=204)
@limiter.limit("30/minute")
def archive_property(request: Request, property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.is_active = False
    db.commit()


# --- Units ---

@router.post("/properties/{property_id}/units", response_model=UnitResponse, status_code=201)
@limiter.limit("30/minute")
def create_unit(
    request: Request, property_id: int, data: UnitCreate, db: Session = Depends(get_db)
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    unit = PropertyUnit(property_id=property_id, **data.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


@router.get("/properties/{property_id}/units", response_model=List[UnitResponse])
@limiter.limit("30/minute")
def list_units(request: Request, property_id: int, db: Session = Depends(get_db)):
    return db.query(PropertyUnit).filter(
        PropertyUnit.property_id == property_id, PropertyUnit.is_active == True  # noqa: E712
    ).order_by(PropertyUnit.unit_number).limit(1000).all()


@router.put("/units/{unit_id}", response_model=UnitResponse)
@limiter.limit("30/minute")
def update_unit(request: Request, unit_id: int, data: UnitUpdate, db: Session = Depends(get_db)):
    unit = db.query(PropertyUnit).filter(PropertyUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(unit, field, value)
    db.commit()
    db.refresh(unit)
    return unit


@router.delete("/units/{unit_id}", status_code=204)
@limiter.limit("30/minute")
def archive_unit(request: Request, unit_id: int, db: Session = Depends(get_db)):
    unit = db.query(PropertyUnit).filter(PropertyUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    unit.is_active = False
    db.commit()


# --- Tenants ---

@router.get("/tenants", response_model=List[TenantResponse])
@limiter.limit("30/minute")
def list_tenants(
    request: Request,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(Tenant)
    if active_only:
        query = query.filter(Tenant.is_active == True)  # noqa: E712
    return query.order_by(Tenant.name).limit(1000).all()


@router.post("/tenants", response_model=TenantResponse, status_code=201)
@limiter.limit("30/minute")
def create_tenant(request: Request, data: TenantCreate, db: Session = Depends(get_db)):
    tenant = Tenant(**data.model_dump())
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
@limiter.limit("30/minute")
def get_tenant(request: Request, tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
@limiter.limit("30/minute")
def update_tenant(
    request: Request, tenant_id: int, data: TenantUpdate, db: Session = Depends(get_db)
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/tenants/{tenant_id}", status_code=204)
@limiter.limit("30/minute")
def archive_tenant(request: Request, tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = False
    db.commit()


# --- Leases ---

@router.get("/leases", response_model=List[LeaseResponse])
@limiter.limit("30/minute")
def list_leases(
    request: Request,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Lease)
    if status:
        query = query.filter(Lease.status == status)
    return query.order_by(Lease.start_date.desc()).limit(1000).all()


@router.post("/leases", response_model=LeaseResponse, status_code=201)
@limiter.limit("30/minute")
def create_lease(request: Request, data: LeaseCreate, db: Session = Depends(get_db)):
    # Validate unit and tenant exist
    unit = db.query(PropertyUnit).filter(PropertyUnit.id == data.unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    tenant = db.query(Tenant).filter(Tenant.id == data.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    lease = Lease(**data.model_dump())
    db.add(lease)
    db.flush()
    wire_lease_to_calendar(db, lease)
    db.commit()
    db.refresh(lease)
    return lease


@router.get("/leases/expiring", response_model=List[LeaseResponse])
@limiter.limit("30/minute")
def get_expiring_leases(
    request: Request,
    days: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db),
):
    from datetime import date, timedelta
    cutoff = date.today() + timedelta(days=days)
    return db.query(Lease).filter(
        Lease.status == LeaseStatus.ACTIVE.value,
        Lease.end_date <= cutoff,
    ).order_by(Lease.end_date).limit(1000).all()


@router.get("/leases/{lease_id}", response_model=LeaseResponse)
@limiter.limit("30/minute")
def get_lease(request: Request, lease_id: int, db: Session = Depends(get_db)):
    lease = db.query(Lease).filter(Lease.id == lease_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    return lease


@router.put("/leases/{lease_id}", response_model=LeaseResponse)
@limiter.limit("30/minute")
def update_lease(
    request: Request, lease_id: int, data: LeaseUpdate, db: Session = Depends(get_db)
):
    lease = db.query(Lease).filter(Lease.id == lease_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lease, field, value)
    wire_lease_to_calendar(db, lease)
    db.commit()
    db.refresh(lease)
    return lease


@router.post("/leases/{lease_id}/renew", response_model=LeaseResponse, status_code=201)
@limiter.limit("30/minute")
def renew_lease(
    request: Request,
    lease_id: int,
    data: LeaseCreate,
    db: Session = Depends(get_db),
):
    """Expire old lease and create a new one."""
    old_lease = db.query(Lease).filter(Lease.id == lease_id).first()
    if not old_lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    old_lease.status = LeaseStatus.EXPIRED.value
    new_lease = Lease(**data.model_dump())
    db.add(new_lease)
    db.flush()
    wire_lease_to_calendar(db, new_lease)
    db.commit()
    db.refresh(new_lease)
    return new_lease


# --- Rent Payments ---

@router.post("/rent-payments", response_model=RentPaymentResponse, status_code=201)
@limiter.limit("30/minute")
def create_rent_payment(request: Request, data: RentPaymentCreate, db: Session = Depends(get_db)):
    lease = db.query(Lease).filter(Lease.id == data.lease_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    payment = RentPayment(**data.model_dump())
    db.add(payment)
    db.flush()
    if payment.amount_paid > 0:
        wire_rent_to_income(db, payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/rent-payments", response_model=List[RentPaymentResponse])
@limiter.limit("30/minute")
def list_rent_payments(
    request: Request,
    lease_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(RentPayment)
    if lease_id:
        query = query.filter(RentPayment.lease_id == lease_id)
    if status:
        query = query.filter(RentPayment.status == status)
    return query.order_by(RentPayment.period_month.desc()).limit(1000).all()


@router.get("/rent-payments/overdue", response_model=List[RentPaymentResponse])
@limiter.limit("30/minute")
def get_overdue_payments(request: Request, db: Session = Depends(get_db)):
    from app.models.property import RentStatus
    return db.query(RentPayment).filter(
        RentPayment.status.in_([RentStatus.PENDING.value, RentStatus.LATE.value]),
        RentPayment.amount_paid < RentPayment.amount_due,
    ).order_by(RentPayment.period_month).limit(1000).all()


@router.put("/rent-payments/{payment_id}", response_model=RentPaymentResponse)
@limiter.limit("30/minute")
def update_rent_payment(
    request: Request, payment_id: int, data: RentPaymentUpdate, db: Session = Depends(get_db)
):
    payment = db.query(RentPayment).filter(RentPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Rent payment not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)
    if payment.amount_paid > 0:
        wire_rent_to_income(db, payment)
    db.commit()
    db.refresh(payment)
    return payment


# --- Property Expenses ---

@router.post("/expenses", response_model=PropertyExpenseResponse, status_code=201)
@limiter.limit("30/minute")
def create_expense(request: Request, data: PropertyExpenseCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    expense = PropertyExpense(**data.model_dump())
    db.add(expense)
    db.flush()
    wire_expense_to_transaction(db, expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/properties/{property_id}/expenses", response_model=List[PropertyExpenseResponse])
@limiter.limit("30/minute")
def list_expenses(
    request: Request,
    property_id: int,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(PropertyExpense).filter(PropertyExpense.property_id == property_id)
    if category:
        query = query.filter(PropertyExpense.category == category)
    return query.order_by(PropertyExpense.date.desc()).limit(1000).all()


@router.put("/expenses/{expense_id}", response_model=PropertyExpenseResponse)
@limiter.limit("30/minute")
def update_expense(
    request: Request, expense_id: int, data: PropertyExpenseUpdate, db: Session = Depends(get_db)
):
    expense = db.query(PropertyExpense).filter(PropertyExpense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)
    wire_expense_to_transaction(db, expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/expenses/{expense_id}", status_code=204)
@limiter.limit("30/minute")
def delete_expense(request: Request, expense_id: int, db: Session = Depends(get_db)):
    expense = db.query(PropertyExpense).filter(PropertyExpense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()


# --- Security Deposits ---

@router.post("/security-deposits", response_model=SecurityDepositResponse, status_code=201)
@limiter.limit("30/minute")
def create_security_deposit(
    request: Request, data: SecurityDepositCreate, db: Session = Depends(get_db)
):
    lease = db.query(Lease).filter(Lease.id == data.lease_id).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    deposit = SecurityDeposit(**data.model_dump())
    db.add(deposit)
    db.commit()
    db.refresh(deposit)
    return deposit


@router.get("/security-deposits", response_model=List[SecurityDepositResponse])
@limiter.limit("30/minute")
def list_security_deposits(
    request: Request,
    lease_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(SecurityDeposit)
    if lease_id:
        query = query.filter(SecurityDeposit.lease_id == lease_id)
    return query.limit(1000).all()


@router.put("/security-deposits/{deposit_id}", response_model=SecurityDepositResponse)
@limiter.limit("30/minute")
def update_security_deposit(
    request: Request, deposit_id: int, data: SecurityDepositUpdate, db: Session = Depends(get_db)
):
    deposit = db.query(SecurityDeposit).filter(SecurityDeposit.id == deposit_id).first()
    if not deposit:
        raise HTTPException(status_code=404, detail="Security deposit not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(deposit, field, value)
    db.commit()
    db.refresh(deposit)
    return deposit


# --- Mortgages ---

@router.post("/mortgages", response_model=MortgageResponse, status_code=201)
@limiter.limit("30/minute")
def create_mortgage(request: Request, data: MortgageCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    mortgage = Mortgage(**data.model_dump())
    db.add(mortgage)
    db.flush()
    wire_mortgage_to_debt(db, mortgage)
    db.commit()
    db.refresh(mortgage)
    return mortgage


@router.get("/properties/{property_id}/mortgages", response_model=List[MortgageResponse])
@limiter.limit("30/minute")
def list_mortgages(request: Request, property_id: int, db: Session = Depends(get_db)):
    return db.query(Mortgage).filter(
        Mortgage.property_id == property_id, Mortgage.is_active == True  # noqa: E712
    ).limit(1000).all()


@router.put("/mortgages/{mortgage_id}", response_model=MortgageResponse)
@limiter.limit("30/minute")
def update_mortgage(
    request: Request, mortgage_id: int, data: MortgageUpdate, db: Session = Depends(get_db)
):
    mortgage = db.query(Mortgage).filter(Mortgage.id == mortgage_id).first()
    if not mortgage:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(mortgage, field, value)
    wire_mortgage_to_debt(db, mortgage)
    db.commit()
    db.refresh(mortgage)
    return mortgage


# --- Analytics ---

@router.get("/properties/{property_id}/rent-roll", response_model=RentRollResponse)
@limiter.limit("30/minute")
def get_rent_roll(request: Request, property_id: int, db: Session = Depends(get_db)):
    try:
        return generate_rent_roll(db, property_id)
    except ValueError as e:
        log.error("Rent roll generation failed for property %d: %s", property_id, e)
        raise HTTPException(status_code=404, detail="Property not found")


@router.get("/properties/{property_id}/pnl", response_model=PropertyPNLResponse)
@limiter.limit("30/minute")
def get_property_pnl(
    request: Request,
    property_id: int,
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return calculate_pnl(db, property_id, start, end)


@router.get("/properties/{property_id}/metrics", response_model=PropertyMetricsResponse)
@limiter.limit("30/minute")
def get_property_metrics(request: Request, property_id: int, db: Session = Depends(get_db)):
    try:
        return calculate_metrics(db, property_id)
    except ValueError as e:
        log.error("Property metrics calculation failed for property %d: %s", property_id, e)
        raise HTTPException(status_code=404, detail="Property not found")


@router.get("/vacancies", response_model=VacancyResponse)
@limiter.limit("30/minute")
def get_vacancy_report(request: Request, db: Session = Depends(get_db)):
    return get_vacancies(db)


# --- Intelligence ---

@router.get("/properties/{property_id}/intelligence", response_model=PropertyIntelligenceResponse)
@limiter.limit("20/minute")
def get_property_intelligence(
    request: Request, property_id: int, db: Session = Depends(get_db),
):
    engine = PropertyPatternEngine(db)
    result = engine.get_property_intelligence(property_id)
    if "error" in result.get("vacancy", {}):
        raise HTTPException(status_code=404, detail="Property not found")
    return result


@router.get("/properties/{property_id}/vacancy-trend", response_model=VacancyTrendResponse)
@limiter.limit("20/minute")
def get_vacancy_trend(
    request: Request, property_id: int, db: Session = Depends(get_db),
):
    engine = PropertyPatternEngine(db)
    result = engine.get_vacancy_trend(property_id)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/properties/{property_id}/maintenance-forecast", response_model=MaintenanceForecastResponse)
@limiter.limit("20/minute")
def get_maintenance_forecast(
    request: Request, property_id: int, db: Session = Depends(get_db),
):
    engine = PropertyPatternEngine(db)
    return engine.get_maintenance_forecast(property_id)


@router.get("/portfolio-score", response_model=PortfolioScoreResponse)
@limiter.limit("10/minute")
def get_portfolio_score(request: Request, db: Session = Depends(get_db)):
    engine = PropertyPatternEngine(db)
    return engine.get_portfolio_score()

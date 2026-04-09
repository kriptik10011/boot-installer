"""
Property management service — rent roll, P&L, metrics, vacancy analysis.
"""

from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

from app.models.property import (
    Property, PropertyUnit, Lease, RentPayment, PropertyExpense, Mortgage,
    LeaseStatus, RentStatus,
)
from app.schemas.property import (
    RentRollEntry, RentRollResponse,
    PropertyPNLResponse, ExpenseBreakdownEntry,
    PropertyMetricsResponse,
    VacancyEntry, VacancyResponse,
)


def generate_rent_roll(db: Session, property_id: int) -> RentRollResponse:
    """Build rent roll showing each unit's occupancy and rent status."""
    prop = db.query(Property).options(
        joinedload(Property.units)
        .joinedload(PropertyUnit.leases)
        .joinedload(Lease.tenant),
    ).filter(Property.id == property_id).first()
    if not prop:
        raise ValueError("Property not found")

    entries: List[RentRollEntry] = []
    total_potential = 0.0
    total_collected = 0.0

    for unit in prop.units:
        if not unit.is_active:
            continue
        rent = unit.monthly_rent or 0.0
        total_potential += rent

        active_lease = next(
            (l for l in unit.leases if l.status == LeaseStatus.ACTIVE.value), None
        )

        if active_lease:
            tenant = active_lease.tenant
            entries.append(RentRollEntry(
                unit_id=unit.id,
                unit_number=unit.unit_number,
                tenant_name=tenant.name if tenant else None,
                lease_id=active_lease.id,
                monthly_rent=active_lease.monthly_rent,
                status="occupied",
                lease_end=active_lease.end_date,
            ))
            total_collected += active_lease.monthly_rent
        else:
            entries.append(RentRollEntry(
                unit_id=unit.id,
                unit_number=unit.unit_number,
                monthly_rent=rent,
                status="vacant",
            ))

    return RentRollResponse(
        property_id=property_id,
        property_name=prop.name,
        total_potential_rent=total_potential,
        total_collected=total_collected,
        entries=entries,
    )


def calculate_pnl(
    db: Session, property_id: int, period_start: date, period_end: date
) -> PropertyPNLResponse:
    """Calculate P&L for a property over a date range."""
    # Income: rent payments in the period
    rent_payments = db.query(RentPayment).join(Lease).join(PropertyUnit).filter(
        PropertyUnit.property_id == property_id,
        RentPayment.paid_date >= period_start,
        RentPayment.paid_date <= period_end,
    ).all()
    total_income = sum(p.amount_paid for p in rent_payments)

    # Expenses in the period
    expenses = db.query(PropertyExpense).filter(
        PropertyExpense.property_id == property_id,
        PropertyExpense.date >= period_start,
        PropertyExpense.date <= period_end,
    ).all()
    total_expenses = sum(e.amount for e in expenses)

    # Breakdown by category
    breakdown_map: dict[str, float] = {}
    for e in expenses:
        breakdown_map[e.category] = breakdown_map.get(e.category, 0.0) + e.amount
    breakdown = [
        ExpenseBreakdownEntry(category=cat, amount=amt)
        for cat, amt in sorted(breakdown_map.items(), key=lambda x: -x[1])
    ]

    return PropertyPNLResponse(
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        total_income=total_income,
        total_expenses=total_expenses,
        net_operating_income=total_income - total_expenses,
        expense_breakdown=breakdown,
    )


def calculate_metrics(db: Session, property_id: int) -> PropertyMetricsResponse:
    """Calculate key property investment metrics."""
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise ValueError("Property not found")

    # Annual income estimate from rent roll
    annual_income = prop.total_monthly_rent * 12

    # Annual expenses (last 12 months)
    year_ago = date.today() - timedelta(days=365)
    expenses = db.query(PropertyExpense).filter(
        PropertyExpense.property_id == property_id,
        PropertyExpense.date >= year_ago,
    ).all()
    annual_expenses = sum(e.amount for e in expenses)

    noi = annual_income - annual_expenses

    # Mortgage payments
    mortgages = db.query(Mortgage).filter(
        Mortgage.property_id == property_id,
        Mortgage.is_active == True,  # noqa: E712
    ).all()
    annual_debt_service = sum(m.monthly_payment * 12 for m in mortgages)
    total_mortgage_balance = sum(m.current_balance for m in mortgages)

    cash_flow = noi - annual_debt_service

    # Cap rate: NOI / property value
    cap_rate = None
    if prop.current_value and prop.current_value > 0:
        cap_rate = round((noi / prop.current_value) * 100.0, 2)

    # Cash-on-cash: cash_flow / total cash invested (purchase_price - mortgage originals)
    cash_on_cash = None
    if prop.purchase_price and prop.purchase_price > 0:
        total_original_mortgages = sum(m.original_amount for m in mortgages)
        cash_invested = prop.purchase_price - total_original_mortgages
        if cash_invested > 0:
            cash_on_cash = round((cash_flow / cash_invested) * 100.0, 2)

    # LTV
    ltv = None
    if prop.current_value and prop.current_value > 0 and total_mortgage_balance > 0:
        ltv = round((total_mortgage_balance / prop.current_value) * 100.0, 1)

    # DSCR: NOI / debt service
    dscr = None
    if annual_debt_service > 0:
        dscr = round(noi / annual_debt_service, 2)

    return PropertyMetricsResponse(
        property_id=property_id,
        noi=round(noi, 2),
        cash_flow=round(cash_flow, 2),
        cap_rate=cap_rate,
        cash_on_cash=cash_on_cash,
        ltv=ltv,
        dscr=dscr,
    )


def get_vacancies(db: Session) -> VacancyResponse:
    """Get all vacant units across all properties."""
    properties = db.query(Property).options(
        joinedload(Property.units).joinedload(PropertyUnit.leases),
    ).filter(Property.is_active == True).all()  # noqa: E712
    entries: List[VacancyEntry] = []

    for prop in properties:
        for unit in prop.units:
            if not unit.is_active:
                continue
            has_active_lease = any(
                l.status == LeaseStatus.ACTIVE.value for l in unit.leases
            )
            if has_active_lease:
                continue

            # Estimate days vacant from last lease end date
            last_lease = next(
                (l for l in sorted(unit.leases, key=lambda x: x.end_date, reverse=True)
                 if l.status in (LeaseStatus.EXPIRED.value, LeaseStatus.TERMINATED.value)),
                None,
            )
            if last_lease and last_lease.end_date:
                days_vacant = (date.today() - last_lease.end_date).days
            else:
                days_vacant = 0

            rent = unit.monthly_rent or 0.0
            daily_rent = rent / 30.0
            lost_income = round(daily_rent * max(days_vacant, 0), 2)

            entries.append(VacancyEntry(
                property_id=prop.id,
                property_name=prop.name,
                unit_id=unit.id,
                unit_number=unit.unit_number,
                monthly_rent=rent,
                days_vacant=max(days_vacant, 0),
                lost_income=lost_income,
            ))

    return VacancyResponse(
        total_vacant_units=len(entries),
        total_lost_income=round(sum(e.lost_income for e in entries), 2),
        entries=entries,
    )

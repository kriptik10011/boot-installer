"""
Cross-domain wiring for property management.

Automatically creates/updates entries in net worth, debt, calendar, and transactions
when property data changes.
"""

from datetime import date, timedelta
from sqlalchemy.orm import Session

from app.models.property import Property, Mortgage, Lease, RentPayment, PropertyExpense


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards to prevent SQL pattern injection."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
from app.models.asset import Asset, AssetType
from app.models.debt import DebtAccount, DebtType
from app.models.event import Event
from app.models.transaction import Transaction


def wire_property_to_net_worth(db: Session, prop: Property) -> Asset:
    """Create or update a net worth Asset for the property's current value."""
    tag = f"[property:{prop.id}]"
    asset = db.query(Asset).filter(Asset.name.like(f"%{_escape_like(tag)}%", escape="\\")).first()

    if asset:
        asset.current_value = prop.current_value or 0.0
        asset.last_updated = date.today()
    else:
        asset = Asset(
            name=f"{prop.name} {tag}",
            current_value=prop.current_value or 0.0,
            type=AssetType.REAL_ESTATE.value,
            is_liquid=False,
            notes=f"Auto-linked from property management. Address: {prop.address or 'N/A'}",
            last_updated=date.today(),
        )
        db.add(asset)

    db.flush()
    return asset


def wire_mortgage_to_debt(db: Session, mortgage: Mortgage) -> DebtAccount:
    """Create or update a DebtAccount for a mortgage."""
    tag = f"[mortgage:{mortgage.id}]"
    debt = db.query(DebtAccount).filter(DebtAccount.name.like(f"%{_escape_like(tag)}%", escape="\\")).first()

    if debt:
        debt.current_balance = mortgage.current_balance
        debt.interest_rate = mortgage.interest_rate
        debt.minimum_payment = mortgage.monthly_payment
        debt.is_active = mortgage.is_active
    else:
        lender = mortgage.lender or "Mortgage"
        debt = DebtAccount(
            name=f"{lender} {tag}",
            current_balance=mortgage.current_balance,
            original_balance=mortgage.original_amount,
            interest_rate=mortgage.interest_rate,
            minimum_payment=mortgage.monthly_payment,
            type=DebtType.MORTGAGE.value,
            lender=mortgage.lender,
            is_active=mortgage.is_active,
        )
        db.add(debt)

    db.flush()
    return debt


def wire_lease_to_calendar(db: Session, lease: Lease) -> list[Event]:
    """Create calendar events for lease milestones (start, -90d, -60d, expiry)."""
    tag = f"[lease:{lease.id}]"
    # Remove old events for this lease
    db.query(Event).filter(Event.description.like(f"%{_escape_like(tag)}%", escape="\\")).delete(synchronize_session=False)

    unit = lease.unit
    unit_label = f"Unit {unit.unit_number}" if unit else f"Unit #{lease.unit_id}"
    tenant = lease.tenant
    tenant_label = tenant.name if tenant else "Tenant"

    milestones = [
        (lease.start_date, f"Lease Start: {tenant_label} - {unit_label}"),
        (lease.end_date - timedelta(days=90), f"Lease Expiry -90d: {tenant_label} - {unit_label}"),
        (lease.end_date - timedelta(days=60), f"Lease Expiry -60d: {tenant_label} - {unit_label}"),
        (lease.end_date, f"Lease Expiry: {tenant_label} - {unit_label}"),
    ]

    events = []
    for evt_date, name in milestones:
        if evt_date < date.today() - timedelta(days=30):
            continue
        event = Event(
            name=name,
            date=evt_date,
            description=f"Auto-generated lease event. {tag}",
        )
        db.add(event)
        events.append(event)

    db.flush()
    return events


def wire_rent_to_income(db: Session, payment: RentPayment) -> Transaction:
    """Create an income Transaction for a rent payment."""
    tag = f"[rent:{payment.id}]"
    existing = db.query(Transaction).filter(Transaction.notes.like(f"%{_escape_like(tag)}%", escape="\\")).first()
    if existing:
        existing.amount = payment.amount_paid
        existing.date = payment.paid_date or date.today()
        db.flush()
        return existing

    txn = Transaction(
        date=payment.paid_date or date.today(),
        amount=payment.amount_paid,
        description=f"Rent payment - {payment.period_month}",
        is_income=True,
        notes=f"Auto-linked from property rent payment. {tag}",
    )
    db.add(txn)
    db.flush()
    return txn


def wire_expense_to_transaction(db: Session, expense: PropertyExpense) -> Transaction:
    """Create an expense Transaction for a property expense."""
    tag = f"[prop-expense:{expense.id}]"
    existing = db.query(Transaction).filter(Transaction.notes.like(f"%{_escape_like(tag)}%", escape="\\")).first()
    if existing:
        existing.amount = expense.amount
        existing.date = expense.date
        existing.description = expense.description or f"Property expense - {expense.category}"
        db.flush()
        return existing

    txn = Transaction(
        date=expense.date,
        amount=expense.amount,
        description=expense.description or f"Property expense - {expense.category}",
        merchant=expense.vendor,
        is_income=False,
        notes=f"Auto-linked from property expense. {tag}",
    )
    db.add(txn)
    db.flush()
    return txn

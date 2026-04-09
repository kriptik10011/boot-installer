"""
Transaction management service.

Handles: duplicate detection, merchant auto-categorization,
split transactions, spending velocity, income summary.
All deterministic — no AI, no estimates.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.income import IncomeSource
from app.models.budget import BudgetCategory
from app.utils.bill_utils import normalize_to_monthly

# Named constants
DUPLICATE_WINDOW_HOURS = 24
VALID_FREQUENCIES = {"weekly", "biweekly", "monthly", "quarterly", "annual"}


@dataclass
class DuplicateWarning:
    """Warning about a potential duplicate transaction."""
    existing_id: int
    existing_description: str
    existing_date: date
    existing_amount: float
    similarity_reason: str


@dataclass
class MerchantCategorySuggestion:
    """Auto-suggestion for merchant → category mapping."""
    category_id: int
    category_name: str
    confidence: float  # 0-1 based on how many past transactions match
    transaction_count: int


@dataclass
class SpendingVelocity:
    """Budget pacing indicator: are you ahead or behind budget?"""
    category_id: int
    category_name: str
    budget_amount: float
    spent_amount: float
    pct_budget_used: float
    pct_period_elapsed: float
    velocity: float  # >1 = overspending, <1 = underspending
    status: str  # "on_track", "ahead", "behind"
    days_remaining: int


@dataclass
class IncomeSummary:
    """Expected vs actual income for a period."""
    period_start: date
    period_end: date
    expected_income: float
    actual_income: float
    difference: float
    sources: List[dict]


@dataclass
class RecurringBillStatus:
    """Status of a recurring bill/subscription."""
    id: int
    description: str
    amount: float
    frequency: str
    next_due_date: Optional[date]
    is_overdue: bool
    days_until_due: Optional[int]
    is_subscription: bool
    subscription_service: Optional[str]


def check_duplicate(
    db: Session,
    amount: float,
    merchant: Optional[str],
    txn_date: date,
    hours_window: int = DUPLICATE_WINDOW_HOURS,
) -> Optional[DuplicateWarning]:
    """
    Check if a similar transaction exists within a time window.

    Duplicate criteria: same merchant + same amount within configured window.
    Returns warning if potential duplicate found (user decides).
    """
    if not merchant:
        return None

    window_days = max(1, hours_window // 24)
    window_start = txn_date - timedelta(days=window_days)
    window_end = txn_date + timedelta(days=window_days)

    safe_merchant = merchant.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    existing = db.query(Transaction).filter(
        Transaction.merchant.ilike(safe_merchant, escape="\\"),
        Transaction.amount == amount,
        Transaction.date >= window_start,
        Transaction.date <= window_end,
    ).first()

    if existing:
        return DuplicateWarning(
            existing_id=existing.id,
            existing_description=existing.description,
            existing_date=existing.date,
            existing_amount=existing.amount,
            similarity_reason=f"Same merchant ({merchant}) and amount (${amount}) within 24 hours",
        )

    return None


def suggest_category_for_merchant(
    db: Session,
    merchant: str,
) -> Optional[MerchantCategorySuggestion]:
    """
    Suggest a budget category based on past transactions with this merchant.

    Rule-based: counts which category has the most transactions for this merchant.
    Requires 2+ matching transactions for a suggestion.
    """
    if not merchant:
        return None

    # Find most common category for this merchant
    safe_merchant = merchant.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    result = db.query(
        Transaction.category_id,
        func.count(Transaction.id).label("count"),
    ).filter(
        Transaction.merchant.ilike(safe_merchant, escape="\\"),
        Transaction.category_id != None,
        Transaction.is_income == False,
    ).group_by(
        Transaction.category_id,
    ).order_by(
        func.count(Transaction.id).desc(),
    ).first()

    if not result or result[1] < 2:
        return None

    category = db.query(BudgetCategory).filter(BudgetCategory.id == result[0]).first()
    if not category:
        return None

    # Count total transactions for this merchant
    total = db.query(func.count(Transaction.id)).filter(
        Transaction.merchant.ilike(safe_merchant, escape="\\"),
        Transaction.is_income == False,
    ).scalar() or 1

    return MerchantCategorySuggestion(
        category_id=category.id,
        category_name=category.name,
        confidence=min(1.0, result[1] / total),
        transaction_count=result[1],
    )


def create_split_transaction(
    db: Session,
    txn_date: date,
    total_amount: float,
    description: str,
    splits: List[Tuple[int, float]],  # (category_id, amount)
    merchant: Optional[str] = None,
    payment_method: Optional[str] = None,
    notes: Optional[str] = None,
) -> List[Transaction]:
    """
    Create a split transaction — one purchase across multiple budget categories.

    Example: $150 Target → $80 groceries + $70 household.
    Each split becomes its own Transaction record linked by receipt_note.
    """
    # Validate no negative or zero amounts
    for cat_id, amount in splits:
        if amount <= 0:
            raise ValueError(f"Split amount must be positive, got {amount} for category {cat_id}")

    # Validate splits sum to total
    split_total = sum(amount for _, amount in splits)
    if abs(split_total - total_amount) > 0.01:
        raise ValueError(f"Split amounts ({split_total}) don't match total ({total_amount})")

    receipt_ref = f"Split: {description} (${total_amount:.2f})"
    transactions = []

    for category_id, amount in splits:
        txn = Transaction(
            date=txn_date,
            amount=amount,
            description=description,
            merchant=merchant,
            category_id=category_id,
            payment_method=payment_method,
            is_income=False,
            notes=notes,
            receipt_note=receipt_ref,
        )
        db.add(txn)
        transactions.append(txn)

    db.flush()
    return transactions


def calculate_spending_velocity(
    db: Session,
    period_start: Optional[date] = None,
) -> List[SpendingVelocity]:
    """
    Calculate spending velocity for each budget category.

    velocity = pct_budget_used / pct_period_elapsed
    > 1.0 = overspending pace (will exceed budget)
    < 1.0 = underspending pace (will have surplus)
    = 1.0 = exactly on track
    """
    from app.services.budget_engine import get_period_bounds

    today = date.today()
    start, end = get_period_bounds(period_start or today)

    total_days = max(1, (end - start).days + 1)
    # Clamp elapsed_days: minimum 1 (avoid division by zero), maximum total_days
    raw_elapsed = (today - start).days + 1
    elapsed_days = max(1, min(total_days, raw_elapsed))
    pct_elapsed = elapsed_days / total_days * 100.0
    days_remaining = max(0, (end - today).days)

    categories = db.query(BudgetCategory).filter(
        BudgetCategory.is_active == True,
        BudgetCategory.budget_amount > 0,
    ).all()

    # Batch-load per-category spending with a single GROUP BY query
    cat_ids = [cat.id for cat in categories]
    spent_rows = db.query(
        Transaction.category_id,
        func.coalesce(func.sum(Transaction.amount), 0.0),
    ).filter(
        Transaction.category_id.in_(cat_ids),
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.is_income == False,
    ).group_by(Transaction.category_id).all() if cat_ids else []
    spent_by_cat = {row[0]: row[1] for row in spent_rows}

    results = []
    for cat in categories:
        spent = spent_by_cat.get(cat.id, 0.0)

        pct_used = (spent / cat.budget_amount * 100.0) if cat.budget_amount > 0 else 0.0
        velocity = (pct_used / pct_elapsed) if pct_elapsed > 0 else 0.0

        if velocity > 1.15:
            status = "behind"  # overspending
        elif velocity < 0.85:
            status = "ahead"  # underspending
        else:
            status = "on_track"

        results.append(SpendingVelocity(
            category_id=cat.id,
            category_name=cat.name,
            budget_amount=cat.budget_amount,
            spent_amount=round(spent, 2),
            pct_budget_used=round(pct_used, 1),
            pct_period_elapsed=round(pct_elapsed, 1),
            velocity=round(velocity, 2),
            status=status,
            days_remaining=days_remaining,
        ))

    return results


def get_income_summary(
    db: Session,
    period_start: date,
) -> IncomeSummary:
    """
    Compare expected income (from IncomeSource) vs actual income (from Transaction).
    """
    from app.services.budget_engine import get_period_bounds

    start, end = get_period_bounds(period_start)

    # Expected from sources
    sources = db.query(IncomeSource).filter(IncomeSource.is_active == True).all()
    expected = 0.0
    source_details = []

    # Batch-load per-source actual income with a single GROUP BY query
    source_ids = [src.id for src in sources]
    income_rows = db.query(
        Transaction.income_source_id,
        func.coalesce(func.sum(Transaction.amount), 0.0),
    ).filter(
        Transaction.income_source_id.in_(source_ids),
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.is_income == True,
    ).group_by(Transaction.income_source_id).all() if source_ids else []
    actual_by_source = {row[0]: row[1] for row in income_rows}

    for src in sources:
        expected_amount = normalize_to_monthly(src.amount, src.frequency)

        # Check actual income transactions linked to this source
        actual = actual_by_source.get(src.id, 0.0)

        expected += expected_amount
        source_details.append({
            "source_id": src.id,
            "name": src.name,
            "frequency": src.frequency,
            "expected": round(expected_amount, 2),
            "actual": round(actual, 2),
            "difference": round(actual - expected_amount, 2),
        })

    # Also check for unlinked income transactions
    unlinked_income = db.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.income_source_id == None,
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.is_income == True,
    ).scalar() or 0.0

    actual_total = sum(s["actual"] for s in source_details) + unlinked_income

    if unlinked_income > 0:
        source_details.append({
            "source_id": None,
            "name": "Other income",
            "frequency": "irregular",
            "expected": 0.0,
            "actual": round(unlinked_income, 2),
            "difference": round(unlinked_income, 2),
        })

    return IncomeSummary(
        period_start=start,
        period_end=end,
        expected_income=round(expected, 2),
        actual_income=round(actual_total, 2),
        difference=round(actual_total - expected, 2),
        sources=source_details,
    )


def get_upcoming_recurring(
    db: Session,
    days: int = 30,
) -> List[RecurringBillStatus]:
    """Get upcoming recurring bills/subscriptions due within N days."""
    today = date.today()
    cutoff = today + timedelta(days=days)

    recurrences = db.query(TransactionRecurrence).filter(
        TransactionRecurrence.is_active == True,
        TransactionRecurrence.next_due_date != None,
        TransactionRecurrence.next_due_date <= cutoff,
    ).order_by(TransactionRecurrence.next_due_date).all()

    from app.utils.bill_utils import is_bill_overdue, days_until_due

    results = []
    for rec in recurrences:
        days_until = days_until_due(rec.next_due_date) if rec.next_due_date else None
        overdue = is_bill_overdue(rec.next_due_date) if rec.next_due_date else False

        results.append(RecurringBillStatus(
            id=rec.id,
            description=rec.description,
            amount=rec.amount,
            frequency=rec.frequency,
            next_due_date=rec.next_due_date,
            is_overdue=overdue,
            days_until_due=days_until,
            is_subscription=rec.is_subscription,
            subscription_service=rec.subscription_service,
        ))

    return results


def get_subscription_summary(db: Session) -> dict:
    """
    Summary of all active subscriptions.

    Shows monthly and annual totals.
    """
    subs = db.query(TransactionRecurrence).filter(
        TransactionRecurrence.is_active == True,
        TransactionRecurrence.is_subscription == True,
    ).all()

    monthly_total = 0.0
    for sub in subs:
        monthly_total += normalize_to_monthly(sub.amount, sub.frequency)

    return {
        "subscription_count": len(subs),
        "monthly_total": round(monthly_total, 2),
        "annual_total": round(monthly_total * 12, 2),
        "subscriptions": [
            {
                "id": s.id,
                "description": s.description,
                "service": s.subscription_service,
                "amount": s.amount,
                "frequency": s.frequency,
                "monthly_equivalent": round(normalize_to_monthly(s.amount, s.frequency), 2),
            }
            for s in subs
        ],
    }



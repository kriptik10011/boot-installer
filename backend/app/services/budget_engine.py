"""
Zero-based envelope budgeting engine.

Every dollar gets a job. All calculations are deterministic and traceable.
No AI estimates. No black boxes.

Key concepts:
- Income: money coming in
- Budget categories (envelopes): where money goes
- Allocation: assigning income to categories each period
- Safe to Spend: hero number = income - committed - spent
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.budget import BudgetCategory, BudgetAllocation
from app.models.financial import FinancialItem, FinancialItemType
from app.models.income import IncomeSource
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.utils.bill_utils import normalize_to_monthly


@dataclass
class CategoryStatus:
    """Status of a single budget category for a period."""
    category_id: int
    name: str
    type: str
    color: Optional[str]
    budgeted: float
    spent: float
    remaining: float
    rollover: float
    pct_used: float
    sort_order: int


@dataclass
class BudgetStatus:
    """Full budget status for a period."""
    period_start: date
    period_end: date
    total_income: float
    total_allocated: float
    available_to_budget: float
    total_spent: float
    categories: List[CategoryStatus]


@dataclass
class SafeToSpend:
    """
    The hero number — answers 'Can I afford this?'

    Fully traceable arithmetic:
    safe = income - upcoming_bills - allocated_remaining - savings_contributions - already_spent
    """
    amount: float
    total_income: float
    upcoming_bills: float
    budget_allocated: float
    already_spent: float
    savings_contributions: float
    breakdown: dict = field(default_factory=dict)


def get_period_bounds(period_start: date, period: str = "monthly") -> tuple:
    """Get start and end dates for a budget period."""
    if period == "weekly":
        # Week starts on Monday
        start = period_start - timedelta(days=period_start.weekday())
        end = start + timedelta(days=6)
    else:
        # Monthly: first to last day of month
        start = period_start.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            end = start.replace(month=start.month + 1, day=1) - timedelta(days=1)
    return start, end


def calculate_budget_status(db: Session, period_start: date) -> BudgetStatus:
    """
    Calculate full budget status for a period.

    Returns category-by-category breakdown with spent vs budgeted.
    All math is deterministic — every number traceable.
    """
    start, end = get_period_bounds(period_start)

    # Get active budget categories
    categories = db.query(BudgetCategory).filter(
        BudgetCategory.is_active == True
    ).order_by(BudgetCategory.sort_order).all()

    # Calculate total income for period
    total_income = _calculate_period_income(db, start, end)

    category_statuses = []
    total_allocated = 0.0
    total_spent = 0.0

    # Batch-load allocations for all categories in this period
    cat_ids = [cat.id for cat in categories]
    all_allocations = db.query(BudgetAllocation).filter(
        BudgetAllocation.category_id.in_(cat_ids),
        BudgetAllocation.period_start == start,
    ).all() if cat_ids else []
    allocations_by_cat = {a.category_id: a for a in all_allocations}

    # Batch-load per-category spending with a single GROUP BY query
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

    for cat in categories:
        # Get or create allocation for this period
        allocation = allocations_by_cat.get(cat.id)

        budgeted = allocation.allocated_amount if allocation else cat.budget_amount
        rollover = allocation.rolled_over_from if allocation else 0.0

        # Calculate spent in this category for this period
        spent = spent_by_cat.get(cat.id, 0.0)

        total_available = budgeted + rollover
        remaining = total_available - spent
        pct_used = min(100.0, (spent / total_available * 100.0)) if total_available > 0 else 0.0

        category_statuses.append(CategoryStatus(
            category_id=cat.id,
            name=cat.name,
            type=cat.type,
            color=cat.color,
            budgeted=budgeted,
            spent=spent,
            remaining=remaining,
            rollover=rollover,
            pct_used=round(pct_used, 1),
            sort_order=cat.sort_order,
        ))

        total_allocated += budgeted
        total_spent += spent

    available_to_budget = total_income - total_allocated

    return BudgetStatus(
        period_start=start,
        period_end=end,
        total_income=round(total_income, 2),
        total_allocated=round(total_allocated, 2),
        available_to_budget=round(available_to_budget, 2),
        total_spent=round(total_spent, 2),
        categories=category_statuses,
    )


def safe_to_spend(db: Session) -> SafeToSpend:
    """
    The hero number — answers 'Can I afford this?'

    safe = income_this_period
         - upcoming_bills_this_period
         - sum(category_remaining_budgets)
         - savings_goal_contributions
         - already_spent (unbudgeted)

    ALWAYS arithmetic. NEVER estimated.
    """
    today = date.today()
    start, end = get_period_bounds(today)

    # Income this period
    total_income = _calculate_period_income(db, start, end)

    # Upcoming bills: recurring transactions due between now and period end
    recurring_upcoming = db.query(func.coalesce(func.sum(TransactionRecurrence.amount), 0.0)).filter(
        TransactionRecurrence.is_active == True,
        TransactionRecurrence.next_due_date != None,
        TransactionRecurrence.next_due_date >= today,
        TransactionRecurrence.next_due_date <= end,
    ).scalar() or 0.0

    # One-time bills: unpaid FinancialItems due between now and period end
    one_time_upcoming = db.query(func.coalesce(func.sum(FinancialItem.amount), 0.0)).filter(
        FinancialItem.type == FinancialItemType.BILL,
        FinancialItem.is_paid == False,
        FinancialItem.due_date >= today,
        FinancialItem.due_date <= end,
    ).scalar() or 0.0

    upcoming_bills = recurring_upcoming + one_time_upcoming

    # Budget allocated (sum of all active category budgets)
    budget_allocated = db.query(func.coalesce(func.sum(BudgetCategory.budget_amount), 0.0)).filter(
        BudgetCategory.is_active == True,
    ).scalar() or 0.0

    # Already spent this period (all expense transactions)
    already_spent = db.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.is_income == False,
    ).scalar() or 0.0

    # Savings contributions (from SavingsGoal monthly_contribution)
    from app.models.savings_goal import SavingsGoal
    savings_contributions = db.query(func.coalesce(func.sum(SavingsGoal.monthly_contribution), 0.0)).filter(
        SavingsGoal.is_achieved == False,
    ).scalar() or 0.0

    # Safe to spend formula (single coherent calculation):
    # safe = income - already_spent - upcoming_bills - savings_contributions
    #
    # This avoids double-counting: budget_allocated is informational (shown in
    # breakdown) but not subtracted separately, because spending already reduces
    # the income pool and upcoming_bills covers committed future outflows.
    safe_amount = total_income - already_spent - upcoming_bills - savings_contributions

    return SafeToSpend(
        amount=round(max(0, safe_amount), 2),
        total_income=round(total_income, 2),
        upcoming_bills=round(upcoming_bills, 2),
        budget_allocated=round(budget_allocated, 2),
        already_spent=round(already_spent, 2),
        savings_contributions=round(savings_contributions, 2),
        breakdown={
            "formula": "income - already_spent - upcoming_bills - savings_contributions",
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
        },
    )


def calculate_rollover(db: Session, category_id: int, current_period_start: date) -> float:
    """
    Calculate rollover amount from previous period.

    If category has rollover enabled: remaining from last period carries over.
    Respects rollover_cap if set.
    """
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category or not category.rollover_enabled:
        return 0.0

    # Find previous period
    if category.period == "weekly":
        prev_start = current_period_start - timedelta(days=7)
    else:
        # Previous month
        first_of_month = current_period_start.replace(day=1)
        prev_start = (first_of_month - timedelta(days=1)).replace(day=1)

    prev_start, prev_end = get_period_bounds(prev_start, category.period)

    # Check for explicit allocation
    prev_allocation = db.query(BudgetAllocation).filter(
        BudgetAllocation.category_id == category_id,
        BudgetAllocation.period_start == prev_start,
    ).first()

    # Always recalculate spent in real-time to avoid stale data.
    # BudgetAllocation.spent_amount is only updated at allocation time,
    # so we query transactions directly for accuracy.
    prev_budgeted = category.budget_amount
    if prev_allocation:
        prev_budgeted = prev_allocation.allocated_amount

    spent = _calculate_category_spent(db, category_id, prev_start, prev_end)
    remaining = prev_budgeted - spent

    # Only roll over positive amounts
    rollover = max(0.0, remaining)

    # Apply cap if set
    if category.rollover_cap is not None:
        rollover = min(rollover, category.rollover_cap)

    return round(rollover, 2)


def allocate_budget(
    db: Session,
    category_id: int,
    period_start: date,
    amount: float,
    note: Optional[str] = None,
) -> BudgetAllocation:
    """
    Allocate (or reallocate) budget for a category in a period.

    Creates or updates the BudgetAllocation record.
    """
    start, end = get_period_bounds(period_start)

    allocation = db.query(BudgetAllocation).filter(
        BudgetAllocation.category_id == category_id,
        BudgetAllocation.period_start == start,
    ).first()

    # Calculate rollover
    rollover = calculate_rollover(db, category_id, start)

    # Calculate current spent
    spent = _calculate_category_spent(db, category_id, start, end)

    if allocation:
        allocation.allocated_amount = amount
        allocation.rolled_over_from = rollover
        allocation.spent_amount = spent
        if note:
            allocation.adjustment_note = note
    else:
        allocation = BudgetAllocation(
            category_id=category_id,
            period_start=start,
            period_end=end,
            allocated_amount=amount,
            spent_amount=spent,
            rolled_over_from=rollover,
            adjustment_note=note,
        )
        db.add(allocation)

    db.flush()
    return allocation


# --- Private helpers ---

def _calculate_period_income(db: Session, start: date, end: date) -> float:
    """
    Calculate total income for a period.

    Sums income transactions + expected income from active sources.
    """
    # Actual income transactions in period
    actual_income = db.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.is_income == True,
    ).scalar() or 0.0

    # If no income transactions, estimate from income sources
    if actual_income == 0:
        sources = db.query(IncomeSource).filter(IncomeSource.is_active == True).all()
        for source in sources:
            actual_income += normalize_to_monthly(source.amount, source.frequency)

    return actual_income


def _calculate_category_spent(db: Session, category_id: int, start: date, end: date) -> float:
    """Calculate total spent in a category for a period."""
    spent = db.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.category_id == category_id,
        Transaction.date >= start,
        Transaction.date <= end,
        Transaction.is_income == False,
    ).scalar() or 0.0
    return spent

"""
Net worth and cash flow calculation service.

Handles: net worth trends, milestones, cash flow forecasting,
low balance warnings.
All deterministic — no AI, no estimates.
"""

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.asset import Asset, AssetHistory
from app.models.debt import DebtAccount
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.income import IncomeSource

logger = logging.getLogger("weekly_review")


@dataclass
class NetWorthTrendEntry:
    """Net worth at a point in time."""
    date: date
    total_assets: float
    total_liabilities: float
    net_worth: float


@dataclass
class NetWorthMilestone:
    """A net worth milestone."""
    amount: float
    label: str
    achieved: bool
    achieved_date: Optional[date]


@dataclass
class CashFlowDayEntry:
    """Single day in cash flow projection."""
    date: date
    projected_balance: float
    income: float
    expenses: float
    bills: float
    net_change: float


@dataclass
class CashFlowForecast:
    """Complete cash flow projection."""
    start_balance: float
    days: int
    daily_projections: List[CashFlowDayEntry]
    low_balance_warnings: List[dict]
    min_projected_balance: float
    min_balance_date: Optional[date]


def get_net_worth_trend(
    db: Session,
    months: int = 12,
) -> List[NetWorthTrendEntry]:
    """
    Get net worth trend from asset history snapshots.

    Returns monthly data points for the last N months.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    entries = []

    # Batch-load assets once (was inside loop — 13 identical queries)
    assets = db.query(Asset).all()

    # Batch-load ALL asset history snapshots, ordered by date desc
    all_history = db.query(AssetHistory).order_by(
        AssetHistory.asset_id, AssetHistory.date.desc()
    ).all()

    # Index history by asset_id for fast lookup
    history_by_asset: dict[int, list] = {}
    for h in all_history:
        history_by_asset.setdefault(h.asset_id, []).append(h)

    # Compute liabilities once (same value for all months — no historical debt tracking)
    # LIMITATION (H-11): Historical months use current debt balance because
    # we don't have historical debt snapshots. This makes the trend less
    # accurate for past months. For current month (i==0), it's exact.
    # V3 could add DebtHistory table for accurate historical tracking.
    total_liabilities = db.query(
        func.coalesce(func.sum(DebtAccount.current_balance), 0.0)
    ).filter(DebtAccount.is_active == True).scalar() or 0.0

    for i in range(months, -1, -1):
        target_date = today - relativedelta(months=i)
        month_end = target_date.replace(day=1) + relativedelta(months=1) - timedelta(days=1)
        if month_end > today:
            month_end = today

        # Find latest snapshot on or before month_end for each asset (in-memory)
        total_assets = 0.0
        for asset in assets:
            asset_history = history_by_asset.get(asset.id, [])
            # History is sorted desc by date, find first snapshot <= month_end
            snapshot_value = None
            for h in asset_history:
                if h.date <= month_end:
                    snapshot_value = h.value
                    break
            if snapshot_value is not None:
                total_assets += snapshot_value
            elif i == 0:
                # No snapshot, use current value only for current month
                total_assets += asset.current_value

        entries.append(NetWorthTrendEntry(
            date=month_end,
            total_assets=round(total_assets, 2),
            total_liabilities=round(total_liabilities, 2),
            net_worth=round(total_assets - total_liabilities, 2),
        ))

    return entries


def detect_net_worth_milestones(
    db: Session,
) -> List[NetWorthMilestone]:
    """
    Check which net worth milestones have been achieved.

    Milestones: $1K, $5K, $10K, $25K, $50K, $100K, $250K, $500K, $1M
    """
    total_assets = db.query(
        func.coalesce(func.sum(Asset.current_value), 0.0)
    ).scalar() or 0.0

    total_liabilities = db.query(
        func.coalesce(func.sum(DebtAccount.current_balance), 0.0)
    ).filter(DebtAccount.is_active == True).scalar() or 0.0

    net_worth = total_assets - total_liabilities

    milestone_amounts = [
        (1000, "$1K"),
        (5000, "$5K"),
        (10000, "$10K"),
        (25000, "$25K"),
        (50000, "$50K"),
        (100000, "$100K"),
        (250000, "$250K"),
        (500000, "$500K"),
        (1000000, "$1M"),
    ]

    milestones = []
    for amount, label in milestone_amounts:
        milestones.append(NetWorthMilestone(
            amount=amount,
            label=label,
            achieved=net_worth >= amount,
            achieved_date=None,  # Would need historical tracking for exact date
        ))

    return milestones


def forecast_cash_flow(
    db: Session,
    days: int = 30,
    low_balance_threshold: float = 500.0,
) -> CashFlowForecast:
    """
    Project daily cash flow for the next N days.

    Methodology:
    1. Start with current liquid asset balance
    2. For each day:
       - Add expected income (from IncomeSource.next_expected_date)
       - Subtract recurring bills (from TransactionRecurrence.next_due_date)
       - Subtract average daily spending (from recent transaction history)
    3. Flag days where projected balance < threshold
    """

    today = date.today()

    # Starting balance: sum of liquid assets
    start_balance = db.query(
        func.coalesce(func.sum(Asset.current_value), 0.0)
    ).filter(Asset.is_liquid == True).scalar() or 0.0

    # Calculate average daily spending from last 30 days
    thirty_days_ago = today - timedelta(days=30)
    recent_spending = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= thirty_days_ago,
        Transaction.date <= today,
        Transaction.is_income == False,
        Transaction.is_recurring == False,  # Don't double-count recurring
    ).scalar() or 0.0

    days_with_data = (today - thirty_days_ago).days or 1
    avg_daily_spending = recent_spending / days_with_data

    # Get recurring bills and their due dates
    recurring = db.query(TransactionRecurrence).filter(
        TransactionRecurrence.is_active == True,
        TransactionRecurrence.next_due_date != None,
    ).all()

    # Get income sources and their expected dates
    income_sources = db.query(IncomeSource).filter(
        IncomeSource.is_active == True,
        IncomeSource.next_expected_date != None,
    ).all()

    # M-11: Account for savings goal contributions (monthly)
    from app.models.savings_goal import SavingsGoal
    monthly_savings = db.query(
        func.coalesce(func.sum(SavingsGoal.monthly_contribution), 0.0)
    ).filter(SavingsGoal.is_achieved == False).scalar() or 0.0
    daily_savings = round(monthly_savings / 30.0, 2)

    # Project each day
    balance = start_balance
    projections = []
    warnings = []
    min_balance = start_balance
    min_balance_date = today

    for i in range(days):
        day = today + timedelta(days=i + 1)
        day_income = 0.0
        day_bills = 0.0
        day_expenses = round(avg_daily_spending, 2)

        # Check for income on this day
        for src in income_sources:
            if _income_due_on(src, day):
                day_income += src.amount

        # Check for bills on this day
        for rec in recurring:
            if _bill_due_on(rec, day):
                day_bills += rec.amount

        net_change = day_income - day_expenses - day_bills - daily_savings
        balance += net_change

        projections.append(CashFlowDayEntry(
            date=day,
            projected_balance=round(balance, 2),
            income=round(day_income, 2),
            expenses=round(day_expenses, 2),
            bills=round(day_bills, 2),
            net_change=round(net_change, 2),
        ))

        if balance < min_balance:
            min_balance = balance
            min_balance_date = day

        if balance < low_balance_threshold:
            warnings.append({
                "date": day,
                "projected_balance": round(balance, 2),
                "threshold": low_balance_threshold,
                "message": f"Balance projected below ${low_balance_threshold} on {day.isoformat()}",
            })

    return CashFlowForecast(
        start_balance=round(start_balance, 2),
        days=days,
        daily_projections=projections,
        low_balance_warnings=warnings,
        min_projected_balance=round(min_balance, 2),
        min_balance_date=min_balance_date,
    )


def _income_due_on(source: IncomeSource, day: date) -> bool:
    """Check if an income source has a payment on this day.

    H-10 FIX: For monthly frequency, also verify the day is on or after
    next_expected_date's month, not just matching day-of-month.
    """
    if not source.next_expected_date:
        return False

    # Day must be on or after the reference date
    if day < source.next_expected_date:
        return False

    if source.frequency == "monthly":
        return day.day == source.next_expected_date.day
    elif source.frequency == "biweekly":
        delta = (day - source.next_expected_date).days
        return delta >= 0 and delta % 14 == 0
    elif source.frequency == "weekly":
        delta = (day - source.next_expected_date).days
        return delta >= 0 and delta % 7 == 0

    return day == source.next_expected_date


def _bill_due_on(rec: TransactionRecurrence, day: date) -> bool:
    """Check if a recurring bill is due on this day.

    H-13 FIX: Same day-of-month guard as _income_due_on — only match
    on or after next_due_date to prevent phantom matches in past months.
    """
    if not rec.next_due_date:
        return False

    # Day must be on or after the reference date
    if day < rec.next_due_date:
        return False

    if rec.frequency == "monthly":
        return day.day == rec.next_due_date.day
    elif rec.frequency == "weekly":
        delta = (day - rec.next_due_date).days
        return delta >= 0 and delta % 7 == 0
    elif rec.frequency == "biweekly":
        delta = (day - rec.next_due_date).days
        return delta >= 0 and delta % 14 == 0

    return day == rec.next_due_date

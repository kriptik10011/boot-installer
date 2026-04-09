"""
Debt payoff calculation service.

Handles: snowball/avalanche strategies, payoff schedule generation,
interest calculation, extra payment simulation, strategy comparison.
All deterministic — no AI, no estimates.
"""

import logging
from dataclasses import dataclass
from datetime import date
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.debt import DebtAccount

logger = logging.getLogger("weekly_review")


@dataclass
class ScheduleEntry:
    """One month's payment detail for one debt."""
    month: int
    debt_name: str
    payment: float
    principal: float
    interest: float
    balance_after: float


@dataclass
class PayoffPlan:
    """Complete payoff schedule for all debts."""
    strategy: str
    total_months: int
    total_interest: float
    total_paid: float
    debt_free_date: Optional[date]
    schedule: List[ScheduleEntry]


@dataclass
class DebtSnapshot:
    """Working copy of a debt for simulation."""
    name: str
    balance: float
    interest_rate: float  # APR as decimal (e.g., 0.18 for 18%)
    minimum_payment: float

    @property
    def monthly_rate(self) -> float:
        return self.interest_rate / 12.0


def calculate_payoff_plan(
    db: Session,
    strategy: str = "avalanche",
    extra_monthly: float = 0.0,
) -> PayoffPlan:
    """
    Calculate a full payoff schedule using the given strategy.

    Strategies:
    - "snowball": Pay smallest balance first (psychological momentum)
    - "avalanche": Pay highest interest first (mathematically optimal)
    - "minimum": Pay only minimums (baseline comparison)

    Each month:
    1. Calculate interest on all debts
    2. Pay minimum on all debts
    3. Apply extra payment to target debt (first in sorted order)
    4. When target debt paid off, roll its payment to next debt
    """
    from dateutil.relativedelta import relativedelta

    accounts = db.query(DebtAccount).filter(
        DebtAccount.is_active == True,
        DebtAccount.current_balance > 0,
    ).all()

    if not accounts:
        return PayoffPlan(
            strategy=strategy,
            total_months=0,
            total_interest=0.0,
            total_paid=0.0,
            debt_free_date=None,
            schedule=[],
        )

    # Create working copies
    debts = [
        DebtSnapshot(
            name=a.name,
            balance=a.current_balance,
            interest_rate=a.interest_rate / 100.0,
            minimum_payment=a.minimum_payment,
        )
        for a in accounts
    ]

    # H-6: Guard against zero minimum_payment with positive interest.
    # If minimum doesn't cover monthly interest, balance grows forever.
    for debt in debts:
        monthly_interest = debt.balance * debt.monthly_rate
        if debt.minimum_payment > 0 and debt.minimum_payment < monthly_interest:
            logger.warning(
                "Debt '%s': minimum payment $%.2f < monthly interest $%.2f. "
                "Balance will grow. Consider increasing payment.",
                debt.name, debt.minimum_payment, monthly_interest,
            )
        if debt.minimum_payment == 0 and debt.interest_rate > 0:
            logger.warning(
                "Debt '%s': minimum payment is $0 with %.1f%% APR. "
                "Setting minimum to interest amount to prevent infinite growth.",
                debt.name, debt.interest_rate * 100,
            )
            # Auto-set minimum to at least cover interest so balance doesn't grow
            debt.minimum_payment = max(1.0, round(monthly_interest + 0.01, 2))

    base_extra = extra_monthly + sum(a.extra_payment_amount for a in accounts)
    original_total_minimum = sum(d.minimum_payment for d in debts)
    schedule = []
    total_interest = 0.0
    total_paid = 0.0
    month = 0
    max_months = 600  # 50-year safety cap

    while any(d.balance > 0.01 for d in debts) and month < max_months:
        month += 1

        # Sort debts by strategy for targeting
        active_debts = [d for d in debts if d.balance > 0.01]
        if not active_debts:
            break

        if strategy == "snowball":
            active_debts.sort(key=lambda d: d.balance)
        elif strategy == "avalanche":
            active_debts.sort(key=lambda d: -d.interest_rate)
        # "minimum" doesn't change order

        # C-2 FIX: Calculate freed minimums from paid-off debts BEFORE this month's loop.
        # The snowball/avalanche effect: when a debt is paid off, its minimum payment
        # becomes available as extra for the target debt.
        active_minimum_needed = sum(d.minimum_payment for d in debts if d.balance > 0.01)
        freed_minimums = original_total_minimum - active_minimum_needed
        extra_this_month = base_extra + freed_minimums

        for debt in debts:
            if debt.balance <= 0.01:
                continue

            # Calculate interest
            interest = round(debt.balance * debt.monthly_rate, 2)
            total_interest += interest
            debt.balance += interest

            # Calculate payment
            payment = min(debt.balance, debt.minimum_payment)

            # Apply extra to the target debt (first in sorted active_debts)
            if debt is active_debts[0] and extra_this_month > 0:
                extra_applied = min(extra_this_month, debt.balance - payment)
                payment += extra_applied
                extra_this_month -= extra_applied

            # Ensure we don't overpay
            payment = min(payment, debt.balance)
            principal = payment - interest
            debt.balance = max(0.0, debt.balance - payment)
            total_paid += payment

            schedule.append(ScheduleEntry(
                month=month,
                debt_name=debt.name,
                payment=round(payment, 2),
                principal=round(principal, 2),
                interest=round(interest, 2),
                balance_after=round(debt.balance, 2),
            ))

    today = date.today()
    debt_free_date = today + relativedelta(months=month) if month > 0 else today

    return PayoffPlan(
        strategy=strategy,
        total_months=month,
        total_interest=round(total_interest, 2),
        total_paid=round(total_paid, 2),
        debt_free_date=debt_free_date,
        schedule=schedule,
    )


def compare_strategies(
    db: Session,
    extra_monthly: float = 0.0,
) -> dict:
    """
    Compare snowball vs avalanche strategies.

    Returns both plans plus the savings difference.
    """
    snowball = calculate_payoff_plan(db, "snowball", extra_monthly)
    avalanche = calculate_payoff_plan(db, "avalanche", extra_monthly)

    return {
        "snowball": snowball,
        "avalanche": avalanche,
        "interest_savings": round(snowball.total_interest - avalanche.total_interest, 2),
        "time_difference_months": snowball.total_months - avalanche.total_months,
    }


def simulate_extra_payment(
    db: Session,
    extra_amount: float,
    strategy: str = "avalanche",
) -> dict:
    """
    Simulate adding extra monthly payment.

    Compares current plan (with existing extras) vs plan with additional extra.
    """
    current = calculate_payoff_plan(db, strategy, 0.0)
    with_extra = calculate_payoff_plan(db, strategy, extra_amount)

    return {
        "current_plan": current,
        "extra_plan": with_extra,
        "months_saved": current.total_months - with_extra.total_months,
        "interest_saved": round(current.total_interest - with_extra.total_interest, 2),
        "extra_monthly": extra_amount,
    }


def get_debt_summary(db: Session) -> dict:
    """
    Comprehensive debt summary with weighted average interest rate.
    """
    accounts = db.query(DebtAccount).filter(
        DebtAccount.is_active == True,
    ).all()

    total_balance = sum(a.current_balance for a in accounts)
    total_minimums = sum(a.minimum_payment for a in accounts)

    # Weighted average interest rate
    if total_balance > 0:
        weighted_rate = sum(
            a.interest_rate * a.current_balance for a in accounts
        ) / total_balance
    else:
        weighted_rate = 0.0

    # Get projected debt-free date using avalanche
    plan = calculate_payoff_plan(db, "avalanche")

    return {
        "total_debt": round(total_balance, 2),
        "total_minimum_payments": round(total_minimums, 2),
        "weighted_avg_interest": round(weighted_rate, 2),
        "debt_count": len(accounts),
        "projected_debt_free_date": plan.debt_free_date,
        "total_interest_remaining": plan.total_interest,
    }

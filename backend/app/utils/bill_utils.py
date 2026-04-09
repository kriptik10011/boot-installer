"""
Canonical bill/overdue and frequency-normalization utilities.

Single source of truth for overdue logic and frequency-to-monthly math
across finances, recurring, transactions, budget, and reports.
"""

from datetime import date


# Frequency multipliers for converting to monthly equivalent.
# 52 weeks / 12 months = 4.333...; 26 biweekly / 12 = 2.166...
WEEKS_PER_MONTH = 4.33
BIWEEKS_PER_MONTH = 2.17


def is_bill_overdue(due_date: date, is_paid: bool = False) -> bool:
    """True if bill is past due and not paid.

    Args:
        due_date: The bill's due date.
        is_paid: Whether the bill has been paid. Defaults to False for recurring
                 bills where payment status is not tracked per occurrence.
    """
    return due_date < date.today() and not is_paid


def days_until_due(due_date: date) -> int:
    """Calendar days until due. Negative means overdue."""
    return (due_date - date.today()).days


def normalize_to_monthly(amount: float, frequency: str) -> float:
    """Convert any frequency amount to its monthly equivalent.

    Supported frequencies: monthly, annual, quarterly, weekly, biweekly.
    Unknown frequencies are returned as-is (assumed monthly).
    """
    if frequency == "monthly":
        return amount
    elif frequency == "annual":
        return amount / 12.0
    elif frequency == "quarterly":
        return amount / 3.0
    elif frequency == "weekly":
        return amount * WEEKS_PER_MONTH
    elif frequency == "biweekly":
        return amount * BIWEEKS_PER_MONTH
    return amount

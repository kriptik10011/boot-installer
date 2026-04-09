"""
Recurrence Expander Service

Expands recurrence rules into individual occurrence dates.
Handles daily, weekly, monthly, yearly patterns with end conditions.

Expands recurring bills and events into calendar occurrences.
"""

from datetime import date, timedelta
from typing import List, Optional
from calendar import monthrange

from app.models.recurrence import RecurrenceRule, RecurrenceFrequency, RecurrenceEndType


def expand_recurrence(
    rule: RecurrenceRule,
    start_date: date,
    end_date: date,
    master_date: date,
) -> List[date]:
    """
    Expand a recurrence rule into individual occurrence dates.

    Args:
        rule: The recurrence rule to expand
        start_date: Start of the date range to expand into
        end_date: End of the date range to expand into (exclusive)
        master_date: The original date of the master event/bill

    Returns:
        List of dates when the recurring item occurs within the range
    """
    if not rule:
        return []

    occurrences: List[date] = []

    # For 'never' ending rules, limit to 1 year ahead from today
    max_end = end_date
    if rule.end_type == RecurrenceEndType.NEVER:
        one_year_ahead = date.today() + timedelta(days=365)
        max_end = min(end_date, one_year_ahead)
    elif rule.end_type == RecurrenceEndType.DATE and rule.end_date:
        max_end = min(end_date, rule.end_date)

    # Track occurrence count for COUNT end type
    occurrence_count = 0
    max_occurrences = rule.end_count if rule.end_type == RecurrenceEndType.COUNT else None

    # Start from the master date and iterate forward
    current = master_date

    while current < max_end:
        # Check if we've hit the occurrence limit
        if max_occurrences and occurrence_count >= max_occurrences:
            break

        # If current date is within our query range, add it
        if current >= start_date and current < end_date:
            occurrences.append(current)

        occurrence_count += 1

        # Calculate next occurrence based on frequency
        current = _get_next_occurrence(current, rule, master_date)

        # Safety: prevent infinite loops
        if current is None or current > max_end + timedelta(days=365):
            break

    return occurrences


def _get_next_occurrence(
    current: date,
    rule: RecurrenceRule,
    master_date: date,
) -> Optional[date]:
    """
    Calculate the next occurrence after the current date.

    Args:
        current: The current occurrence date
        rule: The recurrence rule
        master_date: The original master date (for reference)

    Returns:
        The next occurrence date, or None if calculation fails
    """
    interval = rule.interval or 1

    if rule.frequency == RecurrenceFrequency.DAILY:
        return current + timedelta(days=interval)

    elif rule.frequency == RecurrenceFrequency.WEEKLY:
        return current + timedelta(weeks=interval)

    elif rule.frequency == RecurrenceFrequency.MONTHLY:
        # Handle monthly with day_of_month
        target_day = rule.day_of_month or master_date.day

        # Move to next month(s)
        new_month = current.month + interval
        new_year = current.year

        while new_month > 12:
            new_month -= 12
            new_year += 1

        # Handle months with fewer days (e.g., Feb 30 -> Feb 28)
        max_day = monthrange(new_year, new_month)[1]
        actual_day = min(target_day, max_day)

        return date(new_year, new_month, actual_day)

    elif rule.frequency == RecurrenceFrequency.YEARLY:
        # Handle yearly (e.g., birthdays)
        new_year = current.year + interval
        target_month = master_date.month
        target_day = master_date.day

        # Handle Feb 29 in non-leap years
        if target_month == 2 and target_day == 29:
            max_day = monthrange(new_year, 2)[1]
            target_day = min(29, max_day)

        return date(new_year, target_month, target_day)

    return None

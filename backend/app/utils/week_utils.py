"""Canonical week date range helpers.

Standardizes on exclusive upper bound: date >= start AND date < end.
This matches SQL range semantics and avoids datetime edge cases.
"""

from datetime import date, timedelta


def get_week_range(week_start: date | str) -> tuple[date, date]:
    """Returns (monday, next_monday) -- exclusive upper bound.

    Usage:
        start, end = get_week_range(week_start)
        db.query(Model).filter(Model.date >= start, Model.date < end)
    """
    if isinstance(week_start, str):
        week_start = date.fromisoformat(week_start)
    return (week_start, week_start + timedelta(days=7))


def get_week_dates(week_start: date | str) -> list[date]:
    """Returns [mon, tue, wed, thu, fri, sat, sun]."""
    start, _ = get_week_range(week_start)
    return [start + timedelta(days=i) for i in range(7)]

"""
Tests for Recurrence Expander Service

Tests the expansion of recurrence rules into individual occurrence dates.
"""

import pytest
from datetime import date, timedelta

from app.models.recurrence import RecurrenceRule, RecurrenceFrequency, RecurrenceEndType
from app.services.recurrence_expander import expand_recurrence


class FakeRecurrenceRule:
    """Fake RecurrenceRule for testing without database."""

    def __init__(
        self,
        frequency: RecurrenceFrequency,
        interval: int = 1,
        day_of_week: int | None = None,
        day_of_month: int | None = None,
        end_type: RecurrenceEndType = RecurrenceEndType.NEVER,
        end_count: int | None = None,
        end_date: date | None = None,
    ):
        self.frequency = frequency
        self.interval = interval
        self.day_of_week = day_of_week
        self.day_of_month = day_of_month
        self.end_type = end_type
        self.end_count = end_count
        self.end_date = end_date


class TestExpandDaily:
    """Tests for daily recurrence expansion."""

    def test_daily_simple(self):
        """Daily recurrence expands to every day in range."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.DAILY)
        master = date(2026, 2, 1)
        start = date(2026, 2, 1)
        end = date(2026, 2, 8)  # 7 days

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 7
        assert occurrences[0] == date(2026, 2, 1)
        assert occurrences[6] == date(2026, 2, 7)

    def test_daily_interval_2(self):
        """Daily recurrence with interval 2 (every other day)."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.DAILY, interval=2)
        master = date(2026, 2, 1)
        start = date(2026, 2, 1)
        end = date(2026, 2, 8)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 4
        assert occurrences == [
            date(2026, 2, 1),
            date(2026, 2, 3),
            date(2026, 2, 5),
            date(2026, 2, 7),
        ]

    def test_daily_starts_before_range(self):
        """Recurrence starting before query range returns only in-range dates."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.DAILY)
        master = date(2026, 1, 15)  # Starts 2 weeks before
        start = date(2026, 2, 1)
        end = date(2026, 2, 4)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 3
        assert occurrences[0] == date(2026, 2, 1)


class TestExpandWeekly:
    """Tests for weekly recurrence expansion."""

    def test_weekly_simple(self):
        """Weekly recurrence expands to same day each week."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.WEEKLY)
        master = date(2026, 2, 1)  # A Sunday
        start = date(2026, 2, 1)
        end = date(2026, 3, 1)  # 4 weeks

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 4
        assert occurrences == [
            date(2026, 2, 1),
            date(2026, 2, 8),
            date(2026, 2, 15),
            date(2026, 2, 22),
        ]

    def test_weekly_interval_2(self):
        """Biweekly recurrence."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.WEEKLY, interval=2)
        master = date(2026, 2, 1)
        start = date(2026, 2, 1)
        end = date(2026, 3, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 2
        assert occurrences == [date(2026, 2, 1), date(2026, 2, 15)]


class TestExpandMonthly:
    """Tests for monthly recurrence expansion."""

    def test_monthly_simple(self):
        """Monthly recurrence on same day each month."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.MONTHLY)
        master = date(2026, 1, 15)
        start = date(2026, 1, 1)
        end = date(2026, 4, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 3
        assert occurrences == [
            date(2026, 1, 15),
            date(2026, 2, 15),
            date(2026, 3, 15),
        ]

    def test_monthly_31st_in_short_month(self):
        """Monthly on 31st adjusts to last day of short months."""
        rule = FakeRecurrenceRule(
            frequency=RecurrenceFrequency.MONTHLY, day_of_month=31
        )
        master = date(2026, 1, 31)
        start = date(2026, 1, 1)
        end = date(2026, 4, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 3
        assert occurrences == [
            date(2026, 1, 31),
            date(2026, 2, 28),  # Feb 28 (not leap year)
            date(2026, 3, 31),
        ]

    def test_monthly_interval_3(self):
        """Quarterly recurrence (every 3 months)."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.MONTHLY, interval=3)
        master = date(2026, 1, 1)
        start = date(2026, 1, 1)
        end = date(2027, 1, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 4
        assert occurrences == [
            date(2026, 1, 1),
            date(2026, 4, 1),
            date(2026, 7, 1),
            date(2026, 10, 1),
        ]


class TestExpandYearly:
    """Tests for yearly recurrence expansion."""

    def test_yearly_simple(self):
        """Yearly recurrence on same date each year."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.YEARLY)
        master = date(2024, 6, 15)
        start = date(2024, 1, 1)
        end = date(2027, 1, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 3
        assert occurrences == [
            date(2024, 6, 15),
            date(2025, 6, 15),
            date(2026, 6, 15),
        ]

    def test_yearly_feb_29_leap_year(self):
        """Yearly on Feb 29 adjusts to Feb 28 in non-leap years."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.YEARLY)
        master = date(2024, 2, 29)  # 2024 is a leap year
        start = date(2024, 1, 1)
        end = date(2027, 3, 1)  # Query range limited by implementation's 1-year cap from today

        occurrences = expand_recurrence(rule, start, end, master)

        # First 3 occurrences (capped by today + 1 year limit for 'never' end type)
        assert len(occurrences) >= 2  # At least the 2024 and 2025 occurrences
        assert occurrences[0] == date(2024, 2, 29)  # Leap year
        assert occurrences[1] == date(2025, 2, 28)  # Not leap year, adjusted


class TestEndConditions:
    """Tests for recurrence end conditions."""

    def test_end_by_count(self):
        """Recurrence ends after N occurrences."""
        rule = FakeRecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            end_type=RecurrenceEndType.COUNT,
            end_count=5,
        )
        master = date(2026, 2, 1)
        start = date(2026, 2, 1)
        end = date(2026, 3, 1)  # Query range is larger than count

        occurrences = expand_recurrence(rule, start, end, master)

        assert len(occurrences) == 5

    def test_end_by_date(self):
        """Recurrence ends on specific date (exclusive)."""
        rule = FakeRecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            end_type=RecurrenceEndType.DATE,
            end_date=date(2026, 2, 10),
        )
        master = date(2026, 2, 1)
        start = date(2026, 2, 1)
        end = date(2026, 3, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        # End date is exclusive in the implementation (< not <=)
        assert len(occurrences) == 9  # Feb 1-9
        assert occurrences[-1] == date(2026, 2, 9)

    def test_end_never_limits_to_one_year(self):
        """'Never' end type is capped at 1 year from today for safety."""
        rule = FakeRecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            end_type=RecurrenceEndType.NEVER,
        )
        master = date(2026, 1, 1)
        start = date(2026, 1, 1)
        end = date(2030, 1, 1)  # 4 years query range

        occurrences = expand_recurrence(rule, start, end, master)

        # The implementation caps at today() + 365 days
        # Since we can't control today() in this test, just verify it's capped
        # to something reasonable (less than 4 years = 1461 days)
        assert len(occurrences) < 1461  # 4 years
        # And it should have at least a year's worth
        assert len(occurrences) >= 300


class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_rule(self):
        """None rule returns empty list."""
        occurrences = expand_recurrence(None, date(2026, 1, 1), date(2026, 2, 1), date(2026, 1, 1))
        assert occurrences == []

    def test_range_before_master(self):
        """Query range entirely before master date returns empty."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.WEEKLY)
        master = date(2026, 3, 1)
        start = date(2026, 1, 1)
        end = date(2026, 2, 1)

        occurrences = expand_recurrence(rule, start, end, master)

        assert occurrences == []

    def test_single_day_range(self):
        """Query range of a single day returns single occurrence if match."""
        rule = FakeRecurrenceRule(frequency=RecurrenceFrequency.DAILY)
        master = date(2026, 2, 1)
        start = date(2026, 2, 5)
        end = date(2026, 2, 6)

        occurrences = expand_recurrence(rule, start, end, master)

        assert occurrences == [date(2026, 2, 5)]

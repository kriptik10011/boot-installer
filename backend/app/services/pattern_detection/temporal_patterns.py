"""
Temporal Pattern Detection

Detects time-based patterns from observation data:
- Planning time (when user typically plans their week)
- Peak usage hours
- Day-of-week patterns

Uses histogram bucketing and confidence scoring.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.observation import ObservationEvent, SessionSummary


class TemporalPatternDetector:
    """Detects temporal patterns from user behavior."""

    # Minimum data points for pattern confidence
    MIN_SESSIONS_FOR_CONFIDENCE = 5
    MIN_EVENTS_FOR_PEAK = 10

    def __init__(self, db: Session):
        self.db = db

    def detect_planning_time(self) -> Optional[dict]:
        """
        Detect when user typically does their planning sessions.

        Uses histogram bucketing to find the most common day/hour combination
        for planning sessions (sessions > 5 min with 2+ views).

        Returns:
            dict with day, hour, confidence or None if insufficient data
        """
        # Get planning sessions
        planning_sessions = self.db.query(SessionSummary).filter(
            SessionSummary.is_planning_session == True
        ).all()

        if len(planning_sessions) < self.MIN_SESSIONS_FOR_CONFIDENCE:
            return None

        # Build histogram of day/hour combinations
        day_hour_counts = defaultdict(int)
        for session in planning_sessions:
            key = (session.day_of_week, session.hour_started)
            day_hour_counts[key] += 1

        if not day_hour_counts:
            return None

        # Find the most common day/hour
        most_common = max(day_hour_counts.items(), key=lambda x: x[1])
        (day, hour), count = most_common

        # Calculate confidence based on concentration
        # Higher confidence if most sessions cluster at same time
        total_sessions = len(planning_sessions)
        concentration = count / total_sessions

        # Confidence formula: base on concentration and sample size
        # concentration (0-1) * sample_size_factor (0-1)
        sample_size_factor = min(total_sessions / 20, 1.0)  # Caps at 20 sessions
        confidence = round(concentration * 0.7 + sample_size_factor * 0.3, 2)

        return {
            "day": day,
            "hour": hour,
            "confidence": confidence,
            "session_count": count,
            "total_planning_sessions": total_sessions,
        }

    def detect_peak_hours(self, days_back: int = 30) -> list[int]:
        """
        Detect peak usage hours using histogram bucketing.

        Args:
            days_back: Number of days to analyze

        Returns:
            List of peak hours (0-23), sorted by frequency
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        # Count events by hour
        hour_counts = self.db.query(
            ObservationEvent.hour_of_day,
            func.count(ObservationEvent.id).label('count')
        ).filter(
            ObservationEvent.timestamp >= cutoff
        ).group_by(
            ObservationEvent.hour_of_day
        ).all()

        if not hour_counts or sum(c for _, c in hour_counts) < self.MIN_EVENTS_FOR_PEAK:
            return []

        # Calculate average and find hours above average
        total = sum(count for _, count in hour_counts)
        avg = total / 24

        # Peak hours are those significantly above average (1.5x)
        peaks = [
            hour for hour, count in hour_counts
            if count >= avg * 1.5
        ]

        # Sort by frequency (most active first)
        peaks.sort(key=lambda h: next(
            (c for hr, c in hour_counts if hr == h), 0
        ), reverse=True)

        return peaks[:5]  # Return top 5 peak hours

    def detect_busiest_day(self, days_back: int = 30) -> Optional[int]:
        """
        Detect the busiest day of the week.

        Args:
            days_back: Number of days to analyze

        Returns:
            Day of week (0=Sunday, 6=Saturday) or None
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        # Count events by day of week
        day_counts = self.db.query(
            ObservationEvent.day_of_week,
            func.count(ObservationEvent.id).label('count')
        ).filter(
            ObservationEvent.timestamp >= cutoff
        ).group_by(
            ObservationEvent.day_of_week
        ).all()

        if not day_counts:
            return None

        # Find the day with most events
        busiest = max(day_counts, key=lambda x: x[1])
        return busiest[0]

    def get_events_by_day(self, days_back: int = 30) -> dict[int, int]:
        """
        Get event counts by day of week.

        Returns:
            Dict mapping day (0-6) to event count
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        day_counts = self.db.query(
            ObservationEvent.day_of_week,
            func.count(ObservationEvent.id).label('count')
        ).filter(
            ObservationEvent.timestamp >= cutoff
        ).group_by(
            ObservationEvent.day_of_week
        ).all()

        return {day: count for day, count in day_counts}

    def get_events_by_hour(self, days_back: int = 30) -> dict[int, int]:
        """
        Get event counts by hour.

        Returns:
            Dict mapping hour (0-23) to event count
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        hour_counts = self.db.query(
            ObservationEvent.hour_of_day,
            func.count(ObservationEvent.id).label('count')
        ).filter(
            ObservationEvent.timestamp >= cutoff
        ).group_by(
            ObservationEvent.hour_of_day
        ).all()

        return {hour: count for hour, count in hour_counts}

    def detect_weekly_pattern(self) -> Optional[dict]:
        """
        Detect weekly recurring patterns using autocorrelation.

        Looks for patterns that repeat on a 7-day cycle.

        Returns:
            dict with pattern details or None
        """
        # Get session data for the last 8 weeks
        cutoff = datetime.now(timezone.utc) - timedelta(weeks=8)

        sessions = self.db.query(SessionSummary).filter(
            SessionSummary.started_at >= cutoff
        ).all()

        if len(sessions) < 14:  # Need at least 2 weeks of data
            return None

        # Group by day of week
        day_sessions = defaultdict(list)
        for session in sessions:
            day_sessions[session.day_of_week].append(session)

        # Calculate consistency score for each day
        # A day is "consistent" if sessions occur on that day regularly
        total_weeks = 8
        consistent_days = []

        for day, day_session_list in day_sessions.items():
            # How many weeks had a session on this day?
            weeks_with_session = len(set(
                s.started_at.isocalendar()[1] for s in day_session_list
            ))
            consistency = weeks_with_session / total_weeks

            if consistency >= 0.5:  # Present in at least half the weeks
                consistent_days.append({
                    "day": day,
                    "consistency": round(consistency, 2),
                    "avg_sessions_per_week": round(len(day_session_list) / total_weeks, 1)
                })

        if not consistent_days:
            return None

        return {
            "consistent_days": sorted(consistent_days, key=lambda x: x["consistency"], reverse=True),
            "weeks_analyzed": total_weeks,
            "confidence": round(len(consistent_days) / 7, 2)
        }

    def get_all_temporal_patterns(self) -> dict:
        """
        Get all temporal patterns in one call.

        Returns:
            dict with all temporal pattern data
        """
        return {
            "planning_time": self.detect_planning_time(),
            "peak_hours": self.detect_peak_hours(),
            "busiest_day": self.detect_busiest_day(),
            "events_by_day": self.get_events_by_day(),
            "events_by_hour": self.get_events_by_hour(),
            "weekly_pattern": self.detect_weekly_pattern(),
        }

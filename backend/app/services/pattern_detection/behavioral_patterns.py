"""
Behavioral Pattern Detection

Detects user behavior patterns from observation data:
- Session analysis (duration, frequency)
- View preferences (which views user spends time on)
- Action frequency (what actions are most common)
- Drift detection (when patterns change significantly)

Uses EWMA for trend detection, reference class for estimates,
and ADWIN for drift detection (distinguishes one-off anomalies from pattern changes).
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict
import statistics

from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from app.services.pattern_detection.constants import EWMA_ALPHA

from app.models.observation import ObservationEvent, SessionSummary, DwellTimeRecord
from app.services.pattern_detection.adwin import DriftDetector


class BehavioralPatternDetector:
    """
    Detects behavioral patterns from user activity.

    Enhanced with ADWIN drift detection to distinguish:
    - One-off anomalies: "You had a long session once" (not a pattern change)
    - Concept drift: "Your sessions are now longer" (new normal)
    """

    # Minimum data points for reliable patterns
    MIN_SESSIONS = 5
    MIN_EVENTS = 10

    def __init__(self, db: Session):
        self.db = db
        # Initialize drift detectors for key metrics
        self._drift_detector = DriftDetector()
        self._drift_initialized = False

    def _calculate_ewma(self, values: list[float], alpha: float = None) -> float:
        """
        Calculate Exponential Weighted Moving Average.

        More weight on recent values to catch trend drift.

        Args:
            values: List of values (oldest first)
            alpha: Smoothing factor (default: EWMA_ALPHA)

        Returns:
            EWMA value
        """
        if not values:
            return 0.0

        alpha = alpha or EWMA_ALPHA
        ewma = values[0]

        for value in values[1:]:
            ewma = alpha * value + (1 - alpha) * ewma

        return ewma

    def analyze_sessions(self, days_back: int = 30) -> dict:
        """
        Analyze session patterns with drift detection.

        Returns:
            dict with session statistics, trends, and drift information
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        sessions = self.db.query(SessionSummary).filter(
            SessionSummary.started_at >= cutoff,
            SessionSummary.duration_seconds != None
        ).order_by(SessionSummary.started_at).all()

        if len(sessions) < self.MIN_SESSIONS:
            return {
                "total_sessions": len(sessions),
                "insufficient_data": True
            }

        durations = [s.duration_seconds for s in sessions]

        # Reference class: median duration is more robust than mean
        median_duration = statistics.median(durations)
        mean_duration = statistics.mean(durations)

        # EWMA to detect if sessions are getting longer/shorter
        ewma_duration = self._calculate_ewma(durations)

        # Trend: compare EWMA to median
        trend = "stable"
        if ewma_duration > median_duration * 1.2:
            trend = "increasing"
        elif ewma_duration < median_duration * 0.8:
            trend = "decreasing"

        # Planning vs Living ratio
        planning_count = sum(1 for s in sessions if s.is_planning_session)
        living_count = len(sessions) - planning_count

        # ADWIN drift detection for session duration
        # Feed durations into drift detector to detect pattern changes
        drift_result = None
        for duration in durations:
            drift_result = self._drift_detector.record("session_duration", duration)

        # Check if a significant drift was detected
        drift_info = None
        if drift_result and drift_result.drift_detected:
            drift_info = {
                "detected": True,
                "old_mean_seconds": drift_result.old_mean,
                "new_mean_seconds": drift_result.new_mean,
                "message": f"Session pattern changed: {drift_result.old_mean:.0f}s → {drift_result.new_mean:.0f}s",
            }
        elif drift_result:
            drift_info = {
                "detected": False,
                "current_mean_seconds": round(drift_result.new_mean, 1),
                "message": drift_result.message,
            }

        return {
            "total_sessions": len(sessions),
            "median_duration_seconds": round(median_duration, 1),
            "mean_duration_seconds": round(mean_duration, 1),
            "ewma_duration_seconds": round(ewma_duration, 1),
            "duration_trend": trend,
            "planning_sessions": planning_count,
            "living_sessions": living_count,
            "planning_ratio": round(planning_count / len(sessions), 2) if sessions else 0,
            "sessions_per_day": round(len(sessions) / days_back, 2),
            "drift_detection": drift_info,
        }

    def get_view_preferences(self, days_back: int = 30) -> list[dict]:
        """
        Get user's view preferences based on dwell time.

        Returns:
            List of views sorted by total time spent
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        # Get sessions within timeframe
        session_ids_subquery = self.db.query(SessionSummary.session_id).filter(
            SessionSummary.started_at >= cutoff
        )

        # Aggregate dwell time by view
        dwell_stats = self.db.query(
            DwellTimeRecord.view_name,
            func.sum(DwellTimeRecord.total_seconds).label('total_seconds'),
            func.sum(DwellTimeRecord.entry_count).label('total_entries')
        ).filter(
            DwellTimeRecord.session_id.in_(session_ids_subquery.scalar_subquery())
        ).group_by(
            DwellTimeRecord.view_name
        ).order_by(
            desc('total_seconds')
        ).all()

        if not dwell_stats:
            return []

        total_time = sum(d.total_seconds or 0 for d in dwell_stats)

        return [
            {
                "view": d.view_name,
                "total_seconds": round(d.total_seconds or 0, 1),
                "entries": d.total_entries or 0,
                "avg_seconds_per_visit": round(
                    (d.total_seconds or 0) / (d.total_entries or 1), 1
                ),
                "time_share": round(
                    (d.total_seconds or 0) / total_time, 2
                ) if total_time > 0 else 0
            }
            for d in dwell_stats
        ]

    def get_action_frequency(self, days_back: int = 30) -> list[dict]:
        """
        Get most frequent user actions.

        Returns:
            List of actions sorted by frequency
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        action_stats = self.db.query(
            ObservationEvent.action_name,
            func.count(ObservationEvent.id).label('count')
        ).filter(
            ObservationEvent.timestamp >= cutoff,
            ObservationEvent.event_type == 'action',
            ObservationEvent.action_name != None
        ).group_by(
            ObservationEvent.action_name
        ).order_by(
            desc('count')
        ).limit(20).all()

        if not action_stats:
            return []

        total_actions = sum(a.count for a in action_stats)

        return [
            {
                "action": a.action_name,
                "count": a.count,
                "frequency_share": round(a.count / total_actions, 2) if total_actions > 0 else 0
            }
            for a in action_stats
        ]

    def detect_preferred_start_view(self) -> Optional[str]:
        """
        Detect which view user typically starts their session with.

        Returns:
            View name or None
        """
        # Get first view_enter event for each session (SQLite compatible)
        # Use group_by with min(id) to get first event per session
        from sqlalchemy import func as sqla_func
        first_event_ids = self.db.query(
            sqla_func.min(ObservationEvent.id).label('first_id')
        ).filter(
            ObservationEvent.event_type == 'view_enter'
        ).group_by(
            ObservationEvent.session_id
        ).subquery()

        first_views = self.db.query(
            ObservationEvent.view_name
        ).filter(
            ObservationEvent.id.in_(
                self.db.query(first_event_ids.c.first_id)
            )
        ).all()

        if len(first_views) < self.MIN_SESSIONS:
            return None

        # Count first views
        view_counts = defaultdict(int)
        for (view,) in first_views:
            if view:
                view_counts[view] += 1

        if not view_counts:
            return None

        # Return most common first view
        return max(view_counts.items(), key=lambda x: x[1])[0]

    def get_dismissal_patterns(self, days_back: int = 30) -> dict:
        """
        Analyze dismissal patterns to learn user preferences.

        Returns:
            dict with dismissal analysis
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        dismissals = self.db.query(ObservationEvent).filter(
            ObservationEvent.timestamp >= cutoff,
            ObservationEvent.event_type == 'dismissal'
        ).all()

        if not dismissals:
            return {"total_dismissals": 0, "patterns": []}

        # Group by item type
        by_type = defaultdict(int)
        for d in dismissals:
            metadata = d.event_metadata or {}
            item_type = metadata.get('item_type', 'unknown')
            by_type[item_type] += 1

        return {
            "total_dismissals": len(dismissals),
            "patterns": [
                {"item_type": k, "count": v}
                for k, v in sorted(by_type.items(), key=lambda x: x[1], reverse=True)
            ]
        }

    def get_reference_class_duration(self, action_name: str) -> Optional[dict]:
        """
        Get reference class duration estimate for an action.

        Uses median of past similar actions for realistic estimates.

        Args:
            action_name: The action to estimate duration for

        Returns:
            dict with duration estimate or None
        """
        # Look for actions with duration metadata
        events = self.db.query(ObservationEvent).filter(
            ObservationEvent.action_name == action_name,
            ObservationEvent.event_metadata != None
        ).all()

        durations = []
        for e in events:
            metadata = e.event_metadata or {}
            if 'duration_seconds' in metadata:
                durations.append(metadata['duration_seconds'])

        if len(durations) < 3:
            return None

        return {
            "action": action_name,
            "median_seconds": statistics.median(durations),
            "mean_seconds": statistics.mean(durations),
            "sample_size": len(durations),
            "confidence": min(len(durations) / 20, 1.0)
        }

    def get_drift_status(self) -> dict:
        """
        Get drift detection status for all tracked patterns.

        Returns drift information for:
        - session_duration: How long user spends in app
        - event_count: Number of events per week
        - planning_hour: When user does planning

        Returns:
            dict with drift status per pattern type
        """
        return self._drift_detector.check_all_drift()

    def record_pattern_value(self, pattern_type: str, value: float) -> Optional[dict]:
        """
        Record a value and check for drift.

        Use this to track pattern changes over time:
        - Call with daily/weekly values
        - Returns drift info if pattern changed

        Args:
            pattern_type: One of 'wake_time', 'spending', 'planning_hour', 'event_count', 'session_duration'
            value: The observed value

        Returns:
            dict with drift detection result, or None if pattern type unknown
        """
        result = self._drift_detector.record(pattern_type, value)
        if result is None:
            return None

        return {
            "pattern_type": pattern_type,
            "drift_detected": result.drift_detected,
            "old_mean": result.old_mean,
            "new_mean": result.new_mean,
            "window_size": result.window_size,
            "message": result.message,
        }

    def get_all_behavioral_patterns(self) -> dict:
        """
        Get all behavioral patterns in one call.

        Returns:
            dict with all behavioral pattern data including drift status
        """
        sessions = self.analyze_sessions()

        # Collect any detected drifts
        detected_drifts = []
        if sessions.get("drift_detection", {}).get("detected"):
            detected_drifts.append({
                "pattern": "session_duration",
                **sessions["drift_detection"],
            })

        return {
            "sessions": sessions,
            "view_preferences": self.get_view_preferences(),
            "action_frequency": self.get_action_frequency(),
            "preferred_start_view": self.detect_preferred_start_view(),
            "dismissals": self.get_dismissal_patterns(),
            "drift_status": self.get_drift_status(),
            "detected_drifts": detected_drifts,
        }

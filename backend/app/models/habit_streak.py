"""
Habit Streak Models

Persistence layer for resilient streak tracking.
Stores forgiveness-based streak data instead of shame-based binary streaks.

Key principles:
- "Deviation is data, not failure"
- Forgiveness tokens prevent instant shame
- Trend scores provide "Best X of Y" backup metrics
"""

from datetime import datetime, date, timezone
from sqlalchemy import Column, Integer, String, Float, Date, DateTime
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from app.database import Base


class HabitStreak(Base):
    """
    Persisted streak state for a habit.

    Tracks forgiveness-based streaks, not binary streaks.
    Each habit has its own row with full history tracking.
    """
    __tablename__ = "habit_streaks"

    id = Column(Integer, primary_key=True, index=True)

    # Habit identification
    habit_name = Column(String(100), nullable=False, unique=True, index=True)
    """Unique name for this habit (e.g., 'planning_session', 'meal_planning')"""

    # Core streak data
    current_streak = Column(Integer, nullable=False, default=0)
    """Current consecutive weeks with occurrence"""

    forgiveness_tokens = Column(Integer, nullable=False, default=2)
    """Number of "saves" available (max 2, regenerates 1/month)"""

    trend_score = Column(Float, nullable=False, default=0.0)
    """Rolling trend score (0.0 to 1.0) - decays on miss, grows on hit"""

    # History tracking
    total_occurrences = Column(Integer, nullable=False, default=0)
    """Total times this habit has occurred"""

    tracking_weeks = Column(Integer, nullable=False, default=0)
    """Total weeks tracked"""

    last_occurrence = Column(Date, nullable=True)
    """Date of last occurrence"""

    # Token regeneration
    tokens_used = Column(Integer, nullable=False, default=0)
    """Total tokens ever used (for analytics)"""

    last_token_regen = Column(Date, nullable=True)
    """Date of last token regeneration"""

    max_tokens = Column(Integer, nullable=False, default=2)
    """Maximum forgiveness tokens for this habit"""

    # Timestamps
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Week history (JSON array of {week_start: str, occurred: bool})
    week_history = Column(SQLiteJSON, nullable=False, default=list)
    """Recent week history for "Best X of Y" display"""

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "habit_name": self.habit_name,
            "current_streak": self.current_streak,
            "forgiveness_tokens": self.forgiveness_tokens,
            "trend_score": round(self.trend_score, 2),
            "total_occurrences": self.total_occurrences,
            "tracking_weeks": self.tracking_weeks,
            "last_occurrence": self.last_occurrence.isoformat() if self.last_occurrence else None,
            "tokens_used": self.tokens_used,
            "max_tokens": self.max_tokens,
        }

    def get_current_week_status(self) -> bool | None:
        """
        Check if there's a recording for the current week.

        Returns:
            True if occurred=True this week,
            False if occurred=False this week,
            None if not yet recorded this week.
        """
        from datetime import timedelta
        today = date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        week_start = (today - timedelta(days=days_since_sunday)).isoformat()

        history = self.week_history or []
        for entry in reversed(history):
            if entry.get("week_start") == week_start:
                return entry.get("occurred")
        return None

    def get_display(self) -> dict:
        """
        Get user-friendly display format.

        Returns shame-free representation focusing on progress, not failure.
        """
        # Calculate "Best X of Y" metric
        lookback_weeks = min(8, self.tracking_weeks) or 1
        best_of_y = round(self.trend_score * lookback_weeks)

        # Determine trend label
        if self.trend_score >= 0.75:
            trend_label = "Strong habit"
        elif self.trend_score >= 0.5:
            trend_label = "Building"
        elif self.trend_score >= 0.25:
            trend_label = "Fading"
        else:
            trend_label = "Starting fresh"

        # Saves display (positive framing)
        if self.forgiveness_tokens > 0:
            saves_text = f"{self.forgiveness_tokens} save{'s' if self.forgiveness_tokens > 1 else ''} available"
        else:
            saves_text = "No saves left"

        return {
            "streak": self.current_streak,
            "trend_score": round(self.trend_score, 2),
            "best_of_y": f"{best_of_y}/{lookback_weeks}",
            "trend_label": trend_label,
            "saves_remaining": self.forgiveness_tokens,
            "saves_text": saves_text,
            "total_weeks": self.tracking_weeks,
            "total_occurrences": self.total_occurrences,
            # Primary display (shame-free)
            "display_text": f"{self.current_streak} week streak ({saves_text})",
            # Secondary display (trend-based)
            "trend_text": f"{trend_label} ({best_of_y}/{lookback_weeks} weeks)",
            # Current week recording status
            "recorded_this_week": self.get_current_week_status(),
        }

"""
Resilient Streak Tracking

Implements "Best X of Y" trend tracking with forgiveness tokens
instead of traditional binary streak tracking (which is considered
a dark pattern due to shame mechanics).

Key principles from Intelligence Design:
- "Deviation is data, not failure"
- Traditional streaks break on first miss, causing shame
- Forgiveness tokens prevent instant shame
- Trend scores provide resilient backup metrics

Example:
- Traditional: "7 week streak → broken → 0" (shame!)
- Resilient: "6/8 weeks" + 2 forgiveness saves (no shame)
"""

from datetime import date
from typing import Optional
from dataclasses import dataclass

from sqlalchemy.orm import Session


@dataclass
class ResilientStreak:
    """
    A streak that can handle occasional misses without breaking.

    Attributes:
        current_streak: Consecutive weeks with occurrence
        forgiveness_tokens: Number of "saves" available (max 2)
        trend_score: Rolling trend (0.0 to 1.0) - decay on miss
        total_occurrences: Total times pattern occurred
        tracking_weeks: Total weeks tracked
        last_occurrence: Date of last occurrence
        tokens_used: Total tokens ever used (for analytics)
    """

    current_streak: int = 0
    forgiveness_tokens: int = 2
    trend_score: float = 0.0
    total_occurrences: int = 0
    tracking_weeks: int = 0
    last_occurrence: Optional[date] = None
    tokens_used: int = 0

    # Token regeneration: 1 token per month after use
    last_token_regen: Optional[date] = None
    max_tokens: int = 2

    def record_week(self, occurred: bool) -> dict:
        """
        Record whether the pattern occurred this week.

        Args:
            occurred: Did the pattern happen this week?

        Returns:
            dict with status update info
        """
        self.tracking_weeks += 1
        status = {"action": "none", "message": ""}

        if occurred:
            self.current_streak += 1
            self.total_occurrences += 1
            self.last_occurrence = date.today()
            # Boost trend score on occurrence (weighted moving average)
            self.trend_score = (self.trend_score * 0.7) + 0.3
            status["action"] = "increment"
            status["message"] = f"Streak at {self.current_streak} weeks"
        else:
            if self.forgiveness_tokens > 0:
                # Use a forgiveness token - streak preserved
                self.forgiveness_tokens -= 1
                self.tokens_used += 1
                # Gentle trend decay even with token use
                self.trend_score = self.trend_score * 0.9
                status["action"] = "token_used"
                status["message"] = f"Save used! {self.forgiveness_tokens} remaining"
            else:
                # No tokens - streak breaks
                self.current_streak = 0
                # Steeper trend decay
                self.trend_score = self.trend_score * 0.7
                status["action"] = "reset"
                status["message"] = "Streak reset (no saves remaining)"

        # Clamp trend score
        self.trend_score = max(0.0, min(1.0, self.trend_score))

        return status

    def check_token_regeneration(self) -> bool:
        """
        Check if a forgiveness token should regenerate.

        Tokens regenerate 1 per month after use, up to max_tokens.

        Returns:
            True if a token was regenerated
        """
        if self.forgiveness_tokens >= self.max_tokens:
            return False

        today = date.today()

        # If we've never used tokens, no regen needed
        if self.last_token_regen is None:
            if self.tokens_used == 0:
                return False
            # Set initial regen date
            self.last_token_regen = today
            return False

        # Check if a month has passed
        days_since_regen = (today - self.last_token_regen).days
        if days_since_regen >= 30:
            self.forgiveness_tokens += 1
            self.last_token_regen = today
            return True

        return False

    def get_display(self) -> dict:
        """
        Get user-friendly display format.

        Returns shame-free representation focusing on progress,
        not failure.
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
        }

    def to_dict(self) -> dict:
        """Serialize to dictionary for storage."""
        return {
            "current_streak": self.current_streak,
            "forgiveness_tokens": self.forgiveness_tokens,
            "trend_score": self.trend_score,
            "total_occurrences": self.total_occurrences,
            "tracking_weeks": self.tracking_weeks,
            "last_occurrence": self.last_occurrence.isoformat() if self.last_occurrence else None,
            "tokens_used": self.tokens_used,
            "last_token_regen": self.last_token_regen.isoformat() if self.last_token_regen else None,
            "max_tokens": self.max_tokens,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ResilientStreak":
        """Deserialize from dictionary."""
        streak = cls()
        streak.current_streak = data.get("current_streak", 0)
        streak.forgiveness_tokens = data.get("forgiveness_tokens", 2)
        streak.trend_score = data.get("trend_score", 0.0)
        streak.total_occurrences = data.get("total_occurrences", 0)
        streak.tracking_weeks = data.get("tracking_weeks", 0)
        streak.tokens_used = data.get("tokens_used", 0)
        streak.max_tokens = data.get("max_tokens", 2)

        if data.get("last_occurrence"):
            streak.last_occurrence = date.fromisoformat(data["last_occurrence"])
        if data.get("last_token_regen"):
            streak.last_token_regen = date.fromisoformat(data["last_token_regen"])

        return streak


class HabitStreakTracker:
    """
    Tracks resilient streaks for various habits/patterns.

    Habits tracked:
    - planning_session: Did user do a planning session this week?
    - meal_planning: Did user plan meals this week?
    - bill_review: Did user review bills this week?
    """

    def __init__(self, db: Session):
        self.db = db
        self._streaks: dict[str, ResilientStreak] = {}

    def get_streak(self, habit_name: str) -> ResilientStreak:
        """Get or create a streak for a habit."""
        if habit_name not in self._streaks:
            # TODO: Load from database
            self._streaks[habit_name] = ResilientStreak()

        streak = self._streaks[habit_name]

        # Check for token regeneration
        streak.check_token_regeneration()

        return streak

    def record_habit_occurrence(self, habit_name: str, occurred: bool = True) -> dict:
        """
        Record that a habit occurred (or didn't occur) this week.

        Args:
            habit_name: The habit to record
            occurred: Whether the habit occurred

        Returns:
            Status update dictionary
        """
        streak = self.get_streak(habit_name)
        status = streak.record_week(occurred)

        # TODO: Persist to database

        return {
            "habit": habit_name,
            **status,
            "display": streak.get_display(),
        }

    def get_all_streaks(self) -> dict[str, dict]:
        """Get display info for all tracked habits."""
        result = {}
        for habit_name, streak in self._streaks.items():
            streak.check_token_regeneration()
            result[habit_name] = streak.get_display()
        return result

    def get_habit_summary(self) -> dict:
        """
        Get a summary of all habits for the insights panel.

        Returns:
            Summary with strongest/weakest habits and overall health
        """
        if not self._streaks:
            return {
                "has_data": False,
                "message": "Start tracking habits to see your progress",
            }

        # Find strongest and weakest by trend score
        sorted_habits = sorted(
            self._streaks.items(),
            key=lambda x: x[1].trend_score,
            reverse=True
        )

        strongest = sorted_habits[0] if sorted_habits else None
        weakest = sorted_habits[-1] if len(sorted_habits) > 1 else None

        # Calculate overall habit health
        avg_trend = sum(s.trend_score for s in self._streaks.values()) / len(self._streaks)

        return {
            "has_data": True,
            "habits_tracked": len(self._streaks),
            "overall_health": round(avg_trend, 2),
            "strongest_habit": {
                "name": strongest[0],
                "display": strongest[1].get_display(),
            } if strongest else None,
            "weakest_habit": {
                "name": weakest[0],
                "display": weakest[1].get_display(),
            } if weakest and weakest[1].trend_score < 0.5 else None,
        }

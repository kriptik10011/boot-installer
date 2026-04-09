"""
Pattern Service — Orchestration layer between pattern router and engines.

Handles:
- Habit streak management (recording, token regeneration, summaries)

The PatternEngine and RecipePatternDetector are not extracted here —
they live in services/pattern_detection/.
"""

import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.habit_streak import HabitStreak

logger = logging.getLogger("weekly_review")


# =============================================================================
# Habit Streak Logic
# =============================================================================

def get_all_habits(db: Session) -> list:
    """Get all tracked habit streaks with display info."""
    habits = db.query(HabitStreak).all()
    return [
        {**habit.to_dict(), "display": habit.get_display()}
        for habit in habits
    ]


def get_habit_summary(db: Session) -> dict:
    """
    Get summary of all habits for the insights panel.

    Returns overall health, strongest/weakest habits, and all habit data.
    """
    habits = db.query(HabitStreak).all()

    if not habits:
        return {
            "has_data": False,
            "habits_tracked": 0,
            "overall_health": 0.0,
            "habits": [],
        }

    avg_trend = sum(h.trend_score for h in habits) / len(habits)
    sorted_habits = sorted(habits, key=lambda h: h.trend_score, reverse=True)
    strongest = sorted_habits[0]
    weakest = sorted_habits[-1] if len(sorted_habits) > 1 else None

    habits_data = [
        {**habit.to_dict(), "display": habit.get_display()}
        for habit in habits
    ]

    return {
        "has_data": True,
        "habits_tracked": len(habits),
        "overall_health": round(avg_trend, 2),
        "strongest_habit": {
            "name": strongest.habit_name,
            "display": strongest.get_display(),
        },
        "weakest_habit": {
            "name": weakest.habit_name,
            "display": weakest.get_display(),
        } if weakest and weakest.trend_score < 0.5 else None,
        "habits": habits_data,
    }


def get_or_create_habit(db: Session, habit_name: str) -> dict:
    """
    Get a specific habit streak, creating it if it doesn't exist.

    Returns habit data with display info.
    """
    habit = db.query(HabitStreak).filter(
        HabitStreak.habit_name == habit_name
    ).first()

    if not habit:
        habit = HabitStreak(habit_name=habit_name)
        db.add(habit)
        db.commit()
        db.refresh(habit)

    return {**habit.to_dict(), "display": habit.get_display()}


def record_habit_occurrence(db: Session, habit_name: str, occurred: bool) -> dict:
    """
    Record whether a habit occurred this week.

    Behavior:
    - If occurred=True: Increment streak, boost trend
    - If occurred=False with tokens: Use token, preserve streak
    - If occurred=False without tokens: Reset streak, decay trend

    Handles idempotency (re-recording same week = change of mind).
    """
    habit = db.query(HabitStreak).filter(
        HabitStreak.habit_name == habit_name
    ).first()

    if not habit:
        habit = HabitStreak(habit_name=habit_name)
        habit.current_streak = 0
        habit.forgiveness_tokens = 2
        habit.max_tokens = 2
        habit.trend_score = 0.0
        habit.total_occurrences = 0
        habit.tracking_weeks = 0
        habit.tokens_used = 0
        habit.week_history = []
        db.add(habit)

    # Check for token regeneration first
    _check_token_regeneration(habit)

    # Idempotency: Check if already recorded this week
    week_start = _get_current_week_start()
    history = habit.week_history or []
    existing_entry = None
    for entry in reversed(history):
        if entry.get("week_start") == week_start:
            existing_entry = entry
            break

    if existing_entry is not None:
        prev_occurred = existing_entry.get("occurred")
        if prev_occurred == occurred:
            # Same action repeated — no-op
            db.commit()
            db.refresh(habit)
            return {
                "habit": habit_name,
                "action": "no_change",
                "message": "Already recorded this week",
                "display": habit.get_display(),
            }

        # Reverse previous action, then apply new one
        if prev_occurred:
            habit.current_streak = max(0, habit.current_streak - 1)
            habit.total_occurrences = max(0, habit.total_occurrences - 1)
            habit.trend_score = max(0.0, (habit.trend_score - 0.3) / 0.7) if habit.trend_score > 0.3 else 0.0
        else:
            habit.tracking_weeks = max(0, habit.tracking_weeks - 1)

        history = [e for e in history if e.get("week_start") != week_start]
        habit.week_history = history
    else:
        habit.tracking_weeks += 1

    action = "none"
    message = ""

    if occurred:
        habit.current_streak += 1
        habit.total_occurrences += 1
        habit.last_occurrence = date.today()
        habit.trend_score = (habit.trend_score * 0.7) + 0.3
        action = "increment"
        message = f"Streak at {habit.current_streak} weeks"
    else:
        if habit.forgiveness_tokens > 0:
            habit.forgiveness_tokens -= 1
            habit.tokens_used += 1
            habit.trend_score = habit.trend_score * 0.9
            action = "token_used"
            message = f"Save used! {habit.forgiveness_tokens} remaining"
        else:
            habit.current_streak = 0
            habit.trend_score = habit.trend_score * 0.7
            action = "reset"
            message = "Streak reset (no saves remaining)"

    # Clamp trend score
    habit.trend_score = max(0.0, min(1.0, habit.trend_score))

    # Update week history (keep last 8 weeks)
    history = habit.week_history or []
    history.append({"week_start": week_start, "occurred": occurred})
    habit.week_history = history[-8:]

    db.commit()
    db.refresh(habit)

    return {
        "habit": habit_name,
        "action": action,
        "message": message,
        "display": habit.get_display(),
    }


def _check_token_regeneration(habit: HabitStreak) -> bool:
    """
    Check and perform token regeneration if due.
    Tokens regenerate 1 per month after use.
    """
    tokens = habit.forgiveness_tokens if habit.forgiveness_tokens is not None else 2
    max_tokens = habit.max_tokens if habit.max_tokens is not None else 2

    if tokens >= max_tokens:
        return False

    today = date.today()

    if habit.last_token_regen is None:
        if habit.tokens_used == 0:
            return False
        habit.last_token_regen = today
        return False

    days_since_regen = (today - habit.last_token_regen).days
    if days_since_regen >= 30:
        habit.forgiveness_tokens += 1
        habit.last_token_regen = today
        return True

    return False


def _get_current_week_start() -> str:
    """Get the start of the current week (Sunday) as ISO string."""
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    week_start = today - timedelta(days=days_since_sunday)
    return week_start.isoformat()

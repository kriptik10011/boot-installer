"""
Feedback Router

API endpoints for collecting user feedback.

Saves feedback to JSONL file for later analysis.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Event, FinancialItem, MealPlanEntry, Recipe
from app.models.observation import SessionSummary
from app.schemas.feedback import FeedbackSubmission, FeedbackResponse, UsageStats


router = APIRouter()
logger = logging.getLogger("weekly_review")
limiter = Limiter(key_func=get_remote_address)

# Get feedback directory - use app installation folder + user feedback
# This makes it easier for users to find their feedback files
APP_DIR = Path(__file__).parent.parent.parent.parent  # Go up from routers to weekly-review-prod
FEEDBACK_DIR = APP_DIR / 'user feedback'

# App version - should be updated with each release
APP_VERSION = "0.2.0"


def ensure_feedback_dir():
    """Ensure the feedback directory exists."""
    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/feedback", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def submit_feedback(
    request: Request,
    feedback: FeedbackSubmission,
    db: Session = Depends(get_db)
):
    """
    Submit user feedback.

    Collects ratings and comments, enriches with usage stats,
    and saves to a unique human-readable file.
    """
    ensure_feedback_dir()

    # Generate unique feedback ID
    feedback_id = str(uuid.uuid4())[:8]

    # Generate human-readable unique filename
    timestamp = datetime.now(timezone.utc)
    date_str = timestamp.strftime("%Y-%m-%d")
    filename = f"weekly-review-feedback-{date_str}-{feedback_id}.jsonl"

    # Get usage stats from database
    usage_stats = _get_usage_stats(db)

    # Build full feedback entry
    entry = {
        "feedback_id": feedback_id,
        "timestamp": timestamp.isoformat(),
        "app_version": APP_VERSION,
        "ratings": feedback.ratings,
        "comments": {
            "working_well": feedback.working_well,
            "could_be_better": feedback.could_be_better,
        },
        "usage_stats": usage_stats.model_dump(),
    }

    # Write to unique file
    feedback_file = FEEDBACK_DIR / filename
    try:
        with open(feedback_file, 'w', encoding='utf-8') as f:
            f.write(json.dumps(entry, indent=2) + '\n')
    except IOError:
        logger.exception("Failed to save feedback")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save feedback. Check server logs."
        )

    return FeedbackResponse(
        status="success",
        message="Thank you for your feedback!",
        feedback_id=feedback_id,
        filename=filename,
        folder="feedback",
    )


@router.get("/feedback/stats", response_model=UsageStats)
@limiter.limit("30/minute")
def get_usage_stats_endpoint(request: Request, db: Session = Depends(get_db)):
    """
    Get current usage statistics.

    Useful for auto-filling the feedback form.
    """
    return _get_usage_stats(db)


def _get_usage_stats(db: Session) -> UsageStats:
    """Collect usage statistics from the database."""

    # Count events
    event_count = db.query(func.count(Event.id)).scalar() or 0

    # Count meals
    meal_count = db.query(func.count(MealPlanEntry.id)).scalar() or 0

    # Count bills/finances
    finance_count = db.query(func.count(FinancialItem.id)).scalar() or 0

    # Count recipes
    recipe_count = db.query(func.count(Recipe.id)).scalar() or 0

    # Count observation sessions
    session_count = db.query(func.count(SessionSummary.id)).scalar() or 0

    # Check if intelligence mode has been used (>10 sessions = warm start)
    intelligence_used = session_count >= 10

    # Days since install - estimate from oldest event or session
    oldest_event = db.query(Event.created_at).order_by(Event.created_at).first()
    oldest_session = db.query(SessionSummary.started_at).order_by(SessionSummary.started_at).first()

    days_since = 0
    if oldest_event or oldest_session:
        oldest_date = None
        if oldest_event and oldest_event[0]:
            oldest_date = oldest_event[0]
        if oldest_session and oldest_session[0]:
            if oldest_date is None or oldest_session[0] < oldest_date:
                oldest_date = oldest_session[0]

        if oldest_date:
            # Handle timezone-naive dates
            if oldest_date.tzinfo is None:
                oldest_date = oldest_date.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_since = (now - oldest_date).days

    return UsageStats(
        days_since_install=days_since,
        total_events_created=event_count,
        total_meals_planned=meal_count,
        total_bills_tracked=finance_count,
        total_recipes_saved=recipe_count,
        total_observation_sessions=session_count,
        intelligence_mode_used=intelligence_used,
    )

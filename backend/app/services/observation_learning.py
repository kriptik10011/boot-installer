"""
Observation Learning Service — Learn from user interactions with insights.

Dismissal learning: 3+ dismissals of same type+context → suppression.
Action learning: Boost confidence 1.1-1.3x based on action outcomes.
"""

from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.observation_learning import InsightDismissal, InsightAction


SUPPRESSION_THRESHOLD = 3

# Action outcome → confidence multiplier
OUTCOME_BOOSTS = {
    "completed": 1.3,
    "partial": 1.1,
    "viewed": 1.05,
    "ignored": 0.95,
    "default": 1.0,
}


def learn_from_dismissed(db: Session, insight_type: str, context: str = "global") -> int:
    """
    Record a dismissal. Returns the new count.
    If count >= SUPPRESSION_THRESHOLD, this insight type will be suppressed.
    """
    existing = (
        db.query(InsightDismissal)
        .filter(
            InsightDismissal.insight_type == insight_type,
            InsightDismissal.context == context,
        )
        .first()
    )

    if existing:
        existing.count += 1
        existing.last_dismissed_at = datetime.now(timezone.utc)
        db.commit()
        return existing.count

    dismissal = InsightDismissal(
        insight_type=insight_type,
        context=context,
        count=1,
    )
    db.add(dismissal)
    db.commit()
    return 1


def learn_from_acted(
    db: Session,
    insight_type: str,
    action: str,
    outcome: str | None = None,
) -> float:
    """
    Record an action taken on an insight.
    Returns the confidence boost multiplier.
    """
    boost = OUTCOME_BOOSTS.get(outcome or "default", OUTCOME_BOOSTS["default"])

    entry = InsightAction(
        insight_type=insight_type,
        action=action,
        outcome=outcome,
        confidence_boost=boost,
    )
    db.add(entry)
    db.commit()

    return boost


def should_suppress(db: Session, insight_type: str, context: str = "global") -> bool:
    """Check if an insight type should be suppressed due to repeated dismissals."""
    dismissal = (
        db.query(InsightDismissal)
        .filter(
            InsightDismissal.insight_type == insight_type,
            InsightDismissal.context == context,
        )
        .first()
    )

    if not dismissal:
        return False

    return dismissal.count >= SUPPRESSION_THRESHOLD


def get_suppressed_patterns(db: Session) -> list[dict]:
    """Get all suppressed insight types."""
    suppressed = (
        db.query(InsightDismissal)
        .filter(InsightDismissal.count >= SUPPRESSION_THRESHOLD)
        .all()
    )

    return [
        {
            "insight_type": d.insight_type,
            "context": d.context,
            "count": d.count,
            "last_dismissed_at": str(d.last_dismissed_at) if d.last_dismissed_at else None,
        }
        for d in suppressed
    ]


def get_confidence_boost(db: Session, insight_type: str) -> float:
    """
    Get cumulative confidence boost for an insight type based on action history.
    Returns a multiplier (1.0 = no change, >1.0 = boost).
    """
    actions = (
        db.query(InsightAction)
        .filter(InsightAction.insight_type == insight_type)
        .order_by(InsightAction.created_at.desc())
        .limit(10)
        .all()
    )

    if not actions:
        return 1.0

    # Average the last 10 boosts
    avg_boost = sum(a.confidence_boost for a in actions) / len(actions)
    return round(min(avg_boost, 1.5), 2)  # Cap at 1.5x

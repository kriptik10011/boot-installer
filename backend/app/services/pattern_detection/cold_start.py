"""
Cold Start Templates and Shrinkage-Based Personalization

Implements the "Leather Boot" principle from Intelligence Design:
- Start with good defaults (stiff)
- Gradually mold to user's patterns over time (break in)
- Never show a broken/empty experience in week 1

Cold Start Strategy:
| Feature            | Week 1-3 Approach       | Why                        |
|--------------------|-------------------------|----------------------------|
| Planning time      | Template: Sunday 6-8pm  | Universal enough to be useful |
| Busy days          | Template: Tue/Thu       | Common work patterns       |
| Spending trends    | Learning indicator      | Too personal for defaults  |
| Habit patterns     | Learning indicator      | Must observe first         |
| Day health scoring | Immediate               | Deterministic formula      |
| Conflict detection | Immediate               | Deterministic overlap check|

Shrinkage Formula (for adaptive thresholds):
- Start with global default
- Shrink toward user data as evidence grows
- Formula: shrinkage = min(1.0, sample_size / 20)
- Result: (shrinkage × user_value) + ((1 - shrinkage) × global_default)
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ColdStartTemplate:
    """A default value used during the cold start period."""

    value: any
    """The default value to use"""

    confidence: float
    """How confident we are in this default (0-1)"""

    source: str
    """Where this default comes from (template, heuristic, population)"""

    explanation: str
    """Human-readable explanation for users"""


# =============================================================================
# DEFAULT TEMPLATES
# =============================================================================

PLANNING_TIME_TEMPLATE = ColdStartTemplate(
    value={"day": 0, "hour": 18},  # Sunday 6pm
    confidence=0.3,
    source="template",
    explanation="Most people plan on Sunday evenings"
)

BUSY_DAYS_TEMPLATE = ColdStartTemplate(
    value=[1, 3],  # Tuesday, Thursday (0=Sunday)
    confidence=0.3,
    source="template",
    explanation="Common workweek busy days"
)

SPENDING_THRESHOLD_TEMPLATE = ColdStartTemplate(
    value=0.15,  # 15% above average triggers alert
    confidence=0.5,
    source="template",
    explanation="Default spending alert at 15% above average"
)

CONFIDENCE_THRESHOLD_TEMPLATE = ColdStartTemplate(
    value=0.5,
    confidence=0.5,
    source="template",
    explanation="Default confidence threshold for surfacing"
)


# =============================================================================
# SHRINKAGE FORMULA
# =============================================================================

def shrinkage_blend(
    user_value: float,
    global_default: float,
    sample_size: int,
    full_trust_threshold: int = 20
) -> float:
    """
    Blend user value with global default using shrinkage.

    This is NOT machine learning - it's a simple weighted average
    that increases trust in user data as evidence grows.

    Args:
        user_value: Observed value from user's data
        global_default: The default/template value
        sample_size: How many observations we have
        full_trust_threshold: Samples needed for full trust (default: 20)

    Returns:
        Blended value between user_value and global_default

    Example:
        - Week 1 (3 samples): 0.15 × user + 0.85 × default
        - Week 2 (8 samples): 0.4 × user + 0.6 × default
        - Week 4+ (20 samples): 1.0 × user + 0.0 × default
    """
    shrinkage = min(1.0, sample_size / full_trust_threshold)
    return (shrinkage * user_value) + ((1 - shrinkage) * global_default)


def get_adaptive_threshold(
    user_observed: Optional[float],
    global_default: float,
    sample_size: int,
    full_trust_threshold: int = 20
) -> dict:
    """
    Get an adaptive threshold that personalizes over time.

    Args:
        user_observed: User's observed value (None if no data)
        global_default: Default threshold
        sample_size: Number of observations
        full_trust_threshold: Samples for full personalization

    Returns:
        dict with threshold value and metadata
    """
    if user_observed is None or sample_size == 0:
        return {
            "value": global_default,
            "is_personalized": False,
            "shrinkage_factor": 0.0,
            "source": "template",
            "message": "Using default (learning your patterns...)"
        }

    shrinkage = min(1.0, sample_size / full_trust_threshold)
    blended = shrinkage_blend(user_observed, global_default, sample_size, full_trust_threshold)

    if shrinkage >= 1.0:
        source = "personalized"
        message = "Based on your patterns"
    elif shrinkage >= 0.5:
        source = "blended"
        message = "Partially personalized"
    else:
        source = "template"
        message = f"Learning ({int(shrinkage * 100)}% personalized)"

    return {
        "value": round(blended, 3),
        "is_personalized": shrinkage >= 0.5,
        "shrinkage_factor": round(shrinkage, 2),
        "source": source,
        "message": message,
        "user_value": user_observed,
        "default_value": global_default,
    }


# =============================================================================
# LEARNING PROGRESS INDICATOR
# =============================================================================

@dataclass
class LearningProgress:
    """Progress indicator for features still in learning phase."""

    feature: str
    """Feature being learned"""

    current_samples: int
    """Number of observations so far"""

    required_samples: int
    """Minimum samples needed"""

    progress_percent: int
    """0-100 progress"""

    estimated_ready: Optional[str]
    """Estimated date when feature will be ready"""

    message: str
    """User-facing message"""


def get_learning_progress(
    feature: str,
    current_samples: int,
    required_samples: int = 20,
    samples_per_week: float = 5.0
) -> LearningProgress:
    """
    Get learning progress for a feature.

    Args:
        feature: Feature name
        current_samples: Current observation count
        required_samples: Minimum needed for full personalization
        samples_per_week: Expected samples per week

    Returns:
        LearningProgress with status info
    """
    progress_percent = min(100, int((current_samples / required_samples) * 100))

    # Estimate time remaining
    remaining = required_samples - current_samples
    if remaining <= 0:
        estimated_ready = None
        message = f"{feature.replace('_', ' ').title()} is ready!"
    else:
        weeks_remaining = remaining / samples_per_week
        if weeks_remaining < 1:
            estimated_ready = "This week"
            message = f"Almost ready... ({progress_percent}%)"
        elif weeks_remaining < 2:
            estimated_ready = "~1 week"
            message = f"Getting to know your patterns... ({progress_percent}%)"
        else:
            estimated_ready = f"~{int(weeks_remaining)} weeks"
            message = f"Learning {feature.replace('_', ' ')}... ({progress_percent}%)"

    return LearningProgress(
        feature=feature,
        current_samples=current_samples,
        required_samples=required_samples,
        progress_percent=progress_percent,
        estimated_ready=estimated_ready,
        message=message,
    )


# =============================================================================
# COLD START MANAGER
# =============================================================================

class ColdStartManager:
    """
    Manages cold start behavior and progressive personalization.

    Tracks which features are ready and provides appropriate
    defaults or learning indicators.
    """

    def __init__(self):
        self.templates = {
            "planning_time": PLANNING_TIME_TEMPLATE,
            "busy_days": BUSY_DAYS_TEMPLATE,
            "spending_threshold": SPENDING_THRESHOLD_TEMPLATE,
            "confidence_threshold": CONFIDENCE_THRESHOLD_TEMPLATE,
        }

        # Features that work immediately (deterministic)
        self.immediate_features = {
            "day_health",       # Always works - deterministic formula
            "conflict_detection",  # Always works - overlap check
            "bill_tracking",    # Always works - shows due dates
        }

        # Features that need learning
        self.learning_features = {
            "planning_time": 5,     # 5 sessions to detect pattern
            "busy_days": 14,        # 2 weeks of data
            "spending_trends": 28,  # 4 weeks for trend
            "habit_patterns": 21,   # 3 weeks
        }

    def get_feature_status(
        self,
        feature: str,
        sample_count: int = 0,
        user_value: any = None
    ) -> dict:
        """
        Get the status of a feature (template, learning, or ready).

        Args:
            feature: Feature name
            sample_count: Number of observations
            user_value: User's observed value (if any)

        Returns:
            dict with value, status, and appropriate message
        """
        # Immediate features are always ready
        if feature in self.immediate_features:
            return {
                "status": "ready",
                "value": user_value,
                "source": "immediate",
                "message": None,
            }

        # Check learning features
        if feature in self.learning_features:
            required = self.learning_features[feature]

            if sample_count >= required:
                # Feature is ready - use user value
                return {
                    "status": "ready",
                    "value": user_value,
                    "source": "learned",
                    "message": None,
                }
            else:
                # Still learning
                progress = get_learning_progress(feature, sample_count, required)

                # Use template if available
                template = self.templates.get(feature)
                if template:
                    return {
                        "status": "learning",
                        "value": template.value,
                        "source": "template",
                        "message": progress.message,
                        "progress": progress.progress_percent,
                        "estimated_ready": progress.estimated_ready,
                    }
                else:
                    return {
                        "status": "learning",
                        "value": None,
                        "source": "none",
                        "message": progress.message,
                        "progress": progress.progress_percent,
                        "estimated_ready": progress.estimated_ready,
                    }

        # Unknown feature
        return {
            "status": "unknown",
            "value": user_value,
            "source": "passthrough",
            "message": None,
        }

    def get_planning_time(self, user_value: Optional[dict], session_count: int) -> dict:
        """Get planning time with cold start handling."""
        status = self.get_feature_status("planning_time", session_count, user_value)

        if status["status"] == "ready" and user_value:
            return {
                **status,
                "day": user_value.get("day", 0),
                "hour": user_value.get("hour", 18),
            }
        else:
            template = PLANNING_TIME_TEMPLATE
            return {
                **status,
                "day": template.value["day"],
                "hour": template.value["hour"],
            }

    def get_busy_days(self, user_value: Optional[list], days_tracked: int) -> dict:
        """Get busy days with cold start handling."""
        status = self.get_feature_status("busy_days", days_tracked, user_value)

        if status["status"] == "ready" and user_value:
            return {
                **status,
                "days": user_value,
            }
        else:
            template = BUSY_DAYS_TEMPLATE
            return {
                **status,
                "days": template.value,
            }

    def get_all_feature_status(self, sample_counts: dict) -> dict:
        """Get status of all features at once."""
        return {
            feature: self.get_feature_status(feature, sample_counts.get(feature, 0))
            for feature in list(self.learning_features.keys()) + list(self.immediate_features)
        }

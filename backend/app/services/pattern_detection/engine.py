"""
Pattern Detection Engine

Main orchestrator that combines all pattern detection types.
Provides a unified interface for the API layer.

Cold Start Integration (from Intelligence Boundary Analysis):
- Uses ColdStartManager for week 1-3 experience
- Shrinkage formula blends templates with observed values
- Learning progress indicators show personalization status
"""

import logging
from datetime import date, timedelta
from typing import Optional

log = logging.getLogger("weekly_review")

from sqlalchemy.orm import Session

from app.services.pattern_detection.temporal_patterns import TemporalPatternDetector
from app.services.pattern_detection.behavioral_patterns import BehavioralPatternDetector
from app.services.pattern_detection.domain_patterns import DomainPatternDetector
from app.services.pattern_detection.cold_start import (
    ColdStartManager,
    shrinkage_blend,
)


class PatternEngine:
    """
    Main pattern detection engine.

    Orchestrates temporal, behavioral, and domain pattern detection.
    Provides confidence-scored insights ready for surfacing.

    Cold Start Behavior:
    - Week 1-3: Uses templates with shrinkage blending
    - Week 4+: Fully personalized based on observations
    """

    def __init__(self, db: Session):
        self.db = db
        self.temporal = TemporalPatternDetector(db)
        self.behavioral = BehavioralPatternDetector(db)
        self.domain = DomainPatternDetector(db)
        self.cold_start = ColdStartManager()

    def _get_current_week_start(self) -> str:
        """Get the start of the current week (Sunday)."""
        today = date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        week_start = today - timedelta(days=days_since_sunday)
        return week_start.isoformat()

    # =========================================================================
    # TEMPORAL PATTERNS
    # =========================================================================

    def get_temporal_patterns(self) -> dict:
        """
        Get all temporal patterns with cold start handling.

        If insufficient data, uses templates and returns learning progress.

        Returns:
            dict with planning_time, peak_hours, busiest_day, learning_status
        """
        patterns = self.temporal.get_all_temporal_patterns()

        # Get session count for cold start calculations
        behavioral = self.behavioral.get_all_behavioral_patterns()
        sessions = behavioral.get("sessions", {})
        session_count = sessions.get("total_sessions", 0)

        # Handle planning time with cold start
        planning_time = patterns.get("planning_time")
        planning_status = self.cold_start.get_planning_time(
            planning_time,
            session_count
        )

        # Determine if we should use template or observed value
        if planning_status["status"] == "ready" and planning_time:
            final_planning_time = planning_time
        else:
            # Use template value
            final_planning_time = {
                "day": planning_status["day"],
                "hour": planning_status["hour"],
                "concentration": 0.3,  # Template confidence
                "confidence": 0.3,
                "is_template": True,
            }

        return {
            "planning_time": final_planning_time,
            "peak_hours": patterns.get("peak_hours", []),
            "busiest_day": patterns.get("busiest_day"),
            "events_by_day": patterns.get("events_by_day", {}),
            "events_by_hour": patterns.get("events_by_hour", {}),
            "weekly_pattern": patterns.get("weekly_pattern"),
            "learning_status": {
                "planning_time": planning_status,
            },
        }

    # =========================================================================
    # BEHAVIORAL PATTERNS
    # =========================================================================

    def get_behavioral_patterns(self) -> dict:
        """
        Get all behavioral patterns.

        Returns:
            dict with session analysis, view preferences, action frequency
        """
        patterns = self.behavioral.get_all_behavioral_patterns()

        return {
            "sessions": patterns.get("sessions", {}),
            "view_preferences": patterns.get("view_preferences", []),
            "action_frequency": patterns.get("action_frequency", []),
            "preferred_start_view": patterns.get("preferred_start_view"),
            "dismissals": patterns.get("dismissals", {}),
        }

    # =========================================================================
    # DOMAIN PATTERNS
    # =========================================================================

    def get_day_health(self, target_date: str) -> dict:
        """
        Get health score for a specific day.

        Args:
            target_date: Date string (YYYY-MM-DD)

        Returns:
            dict with score, status, and component details
        """
        return self.domain.calculate_day_health(target_date)

    def get_week_summary(self, week_start: Optional[str] = None) -> dict:
        """
        Get comprehensive summary for a week.

        Args:
            week_start: Week start date (defaults to current week)

        Returns:
            dict with week statistics and summary sentence
        """
        if not week_start:
            week_start = self._get_current_week_start()

        return self.domain.get_week_summary(week_start)

    def get_conflicts(self, week_start: Optional[str] = None) -> list[dict]:
        """
        Get event conflicts for a week.

        Args:
            week_start: Week start date (defaults to current week)

        Returns:
            List of conflict details
        """
        if not week_start:
            week_start = self._get_current_week_start()

        return self.domain.detect_conflicts_for_week(week_start)

    def get_spending_trend(self) -> dict:
        """
        Get spending trend vs 4-week average.

        Returns:
            dict with current_week, average, percent_change, trend
        """
        return self.domain.get_spending_trend()

    def get_meal_gaps(self, week_start: Optional[str] = None) -> list[dict]:
        """
        Get unplanned meal slots for a week.

        Args:
            week_start: Week start date (defaults to current week)

        Returns:
            List of unplanned meal slots
        """
        if not week_start:
            week_start = self._get_current_week_start()

        return self.domain.get_meal_gaps(week_start)

    # =========================================================================
    # DOMAIN INTELLIGENCE
    # =========================================================================

    def get_recurring_meal_patterns(self, weeks_back: int = 4) -> list[dict]:
        """Get recurring meal patterns from domain detector."""
        return self.domain.get_recurring_meal_patterns(weeks_back=weeks_back)

    def get_ingredient_variety(self, week_start: Optional[str] = None) -> dict:
        """Get ingredient variety analysis for a week."""
        if not week_start:
            week_start = self._get_current_week_start()
        return self.domain.get_ingredient_variety_for_week(week_start)

    def get_restocking_predictions(self) -> list[dict]:
        """Get RCF-based restocking predictions."""
        return self.domain.get_restocking_predictions()

    def get_low_stock_meals(self, week_start: Optional[str] = None) -> list[dict]:
        """Get low-stock items cross-referenced with upcoming meals."""
        if not week_start:
            week_start = self._get_current_week_start()
        return self.domain.get_low_stock_in_upcoming_meals(week_start)

    def get_tracking_suggestions(self) -> list[dict]:
        """Get LinUCB tracking mode suggestions."""
        return self.domain.get_tracking_mode_suggestions()

    # =========================================================================
    # COMBINED PATTERNS
    # =========================================================================

    def get_all_patterns(self, week_start: Optional[str] = None) -> dict:
        """
        Get all patterns in one call.

        This is the main method for the frontend to consume.
        Combines temporal, behavioral, and domain patterns.

        Args:
            week_start: Week start date (defaults to current week)

        Returns:
            dict with all pattern data
        """
        if not week_start:
            week_start = self._get_current_week_start()

        return {
            "temporal": self.get_temporal_patterns(),
            "behavioral": self.get_behavioral_patterns(),
            "week_summary": self.get_week_summary(week_start),
            "day_healths": [
                self.get_day_health(
                    (date.fromisoformat(week_start) + timedelta(days=i)).isoformat()
                )
                for i in range(7)
            ],
            "conflicts": self.get_conflicts(week_start),
            "spending_trend": self.get_spending_trend(),
            "meal_gaps": self.get_meal_gaps(week_start),
            "week_start": week_start,
        }

    # =========================================================================
    # CONFIDENCE SCORING
    # =========================================================================

    def calculate_overall_confidence(self) -> dict:
        """
        Calculate overall confidence in pattern detection with cold start handling.

        Uses shrinkage formula to blend default confidence with observed confidence.
        Returns learning progress indicators for features still in cold start.

        Based on:
        - Amount of observation data
        - Age of data
        - Consistency of patterns
        - Cold start shrinkage factors

        Returns:
            dict with confidence scores, learning progress, and feature readiness
        """
        temporal = self.get_temporal_patterns()
        behavioral = self.get_behavioral_patterns()

        # Get sample counts for shrinkage calculations
        sessions = behavioral.get("sessions", {})
        session_count = sessions.get("total_sessions", 0)

        # Get all feature statuses from cold start manager
        sample_counts = {
            "planning_time": session_count,
            "busy_days": session_count * 2,  # Approximate days tracked
            "spending_trends": session_count * 7,  # Approximate days
            "habit_patterns": session_count * 3,
        }
        feature_status = self.cold_start.get_all_feature_status(sample_counts)

        # Temporal confidence with shrinkage
        temporal_confidence = 0.0
        planning_time = temporal.get("planning_time")
        if planning_time:
            observed_conf = planning_time.get("confidence", 0)
            # Use shrinkage to blend with default confidence (0.3)
            blended_conf = shrinkage_blend(
                observed_conf,
                0.3,  # Default confidence
                session_count,
                full_trust_threshold=5  # 5 sessions for planning time
            )
            temporal_confidence += blended_conf * 0.4

        if temporal.get("peak_hours"):
            temporal_confidence += min(len(temporal["peak_hours"]) / 3, 1.0) * 0.3
        if temporal.get("busiest_day") is not None:
            temporal_confidence += 0.3

        # Behavioral confidence with shrinkage
        behavioral_confidence = 0.0
        if not sessions.get("insufficient_data"):
            behavioral_confidence += 0.5
        if behavioral.get("view_preferences"):
            behavioral_confidence += min(len(behavioral["view_preferences"]) / 5, 1.0) * 0.3
        if behavioral.get("preferred_start_view"):
            behavioral_confidence += 0.2

        # Calculate overall with minimum floor for cold start
        raw_overall = (temporal_confidence + behavioral_confidence) / 2

        # Cold start: Even with low confidence, we can surface template-based insights
        # Use shrinkage to raise the floor during cold start period
        cold_start_floor = shrinkage_blend(
            raw_overall,
            0.35,  # Minimum floor for cold start (allows some insights)
            session_count,
            full_trust_threshold=10
        )

        # Build learning progress for each feature
        learning_progress = {}
        for feature, status in feature_status.items():
            if status["status"] == "learning":
                learning_progress[feature] = {
                    "status": "learning",
                    "progress": status.get("progress", 0),
                    "message": status.get("message", "Learning..."),
                    "estimated_ready": status.get("estimated_ready"),
                }
            elif status["status"] == "ready":
                learning_progress[feature] = {
                    "status": "ready",
                    "progress": 100,
                    "message": None,
                }

        # Determine ready state
        # With cold start templates, we can surface insights earlier
        is_cold_start = session_count < 10
        ready_for_surfacing = cold_start_floor >= 0.35 if is_cold_start else raw_overall >= 0.5

        return {
            "temporal": round(temporal_confidence, 2),
            "behavioral": round(behavioral_confidence, 2),
            "overall": round(cold_start_floor if is_cold_start else raw_overall, 2),
            "raw_overall": round(raw_overall, 2),
            "ready_for_surfacing": ready_for_surfacing,
            "is_cold_start": is_cold_start,
            "session_count": session_count,
            "learning_progress": learning_progress,
            "feature_readiness": {
                feature: status["status"] == "ready"
                for feature, status in feature_status.items()
            },
        }

    # =========================================================================
    # EVIDENCE HELPERS
    # =========================================================================

    @staticmethod
    def _build_evidence(
        observation_count: Optional[int] = None,
        pattern_strength: Optional[float] = None,
        last_observed: Optional[str] = None,
        context: Optional[str] = None,
    ) -> dict:
        """Build an evidence dict for insight Glass Box display."""
        evidence = {}
        if observation_count is not None:
            evidence["observation_count"] = observation_count
        if pattern_strength is not None:
            evidence["pattern_strength"] = round(pattern_strength, 2)
        if last_observed is not None:
            evidence["last_observed"] = last_observed
        if context is not None:
            evidence["context"] = context
        return evidence

    # =========================================================================
    # INSIGHTS (for future surfacing layer)
    # =========================================================================

    def get_actionable_insights(self, week_start: Optional[str] = None) -> list[dict]:
        """
        Get actionable insights ready for surfacing with cold start support.

        During cold start period:
        - Template-based insights are shown with lower confidence
        - Learning progress is indicated in messages
        - Deterministic insights (conflicts, bills) always work

        Args:
            week_start: Week start date (defaults to current week)

        Returns:
            List of insights sorted by priority
        """
        if not week_start:
            week_start = self._get_current_week_start()

        insights = []
        confidence = self.calculate_overall_confidence()
        is_cold_start = confidence.get("is_cold_start", False)

        # Deterministic insights ALWAYS work (no learning required)
        # These are "immediate" features in cold start terms

        # Week summary insights (deterministic)
        summary = self.get_week_summary(week_start)
        today_iso = date.today().isoformat()

        if summary["busy_days"] >= 3:
            insights.append({
                "type": "busy_week",
                "message": f"{summary['busy_days']} busy days this week — consider lightening the load",
                "priority": 2,
                "confidence": 0.9,
                "evidence": self._build_evidence(
                    observation_count=summary["busy_days"],
                    pattern_strength=0.9,
                    last_observed=today_iso,
                    context=f"Day health scores show {summary['busy_days']} of 7 days are busy or overloaded",
                ),
            })

        if summary["total_bills_due"] > 0:
            bills_count = summary.get("overdue_bills", 0) + max(1, int(summary["total_bills_due"] / 100))
            insights.append({
                "type": "bills_due",
                "message": f"${summary['total_bills_due']:,.0f} in bills due this week",
                "priority": 2,
                "confidence": 1.0,
                "evidence": self._build_evidence(
                    observation_count=bills_count,
                    pattern_strength=1.0,
                    last_observed=today_iso,
                    context="Based on scheduled bill due dates this week",
                ),
            })

        if summary["event_conflicts"] > 0:
            insights.append({
                "type": "conflicts",
                "message": f"{summary['event_conflicts']} scheduling conflict(s) detected",
                "priority": 2,
                "confidence": 1.0,
                "evidence": self._build_evidence(
                    observation_count=summary["event_conflicts"],
                    pattern_strength=1.0,
                    last_observed=today_iso,
                    context="Events with overlapping time slots this week",
                ),
            })

        # Planning time insight (supports cold start templates)
        temporal = self.get_temporal_patterns()
        if temporal.get("planning_time"):
            pt = temporal["planning_time"]
            day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

            # Check if this is a template or learned value
            is_template = pt.get("is_template", False)

            if is_template:
                # Cold start: Show template with appropriate messaging
                insights.append({
                    "type": "planning_time",
                    "message": f"Most people plan on {day_names[pt['day']]} evenings",
                    "priority": 4,
                    "confidence": 0.3,
                    "is_template": True,
                    "learning_message": "We'll learn your preferred time soon",
                    "evidence": self._build_evidence(
                        pattern_strength=0.3,
                        context="Based on common planning patterns — personalizing as we learn yours",
                    ),
                })
            else:
                # Learned: Show personalized message
                pt_conf = pt.get("confidence", 0.5)
                session_count = pt.get("session_count", pt.get("total_planning_sessions", 0))
                insights.append({
                    "type": "planning_time",
                    "message": f"You usually plan on {day_names[pt['day']]} around {pt['hour']}:00",
                    "priority": 4,
                    "confidence": pt_conf,
                    "evidence": self._build_evidence(
                        observation_count=session_count if session_count else None,
                        pattern_strength=pt_conf,
                        last_observed=today_iso,
                        context=f"Detected from your planning sessions on {day_names[pt['day']]}s",
                    ),
                })

        # Spending trend insight (needs learning but can show early)
        spending = self.get_spending_trend()
        weekly_history_len = len(spending.get("weekly_history", []))
        if spending.get("trend") == "higher" and spending.get("percent_change", 0) > 25:
            insights.append({
                "type": "spending_high",
                "message": f"Spending is {spending['percent_change']:.0f}% higher than usual",
                "priority": 2,
                "confidence": 0.8,
                "evidence": self._build_evidence(
                    observation_count=weekly_history_len,
                    pattern_strength=0.8,
                    last_observed=today_iso,
                    context=f"Compared to your 4-week average of ${spending.get('four_week_average', 0):,.0f}",
                ),
            })
        elif is_cold_start and spending.get("current_week", 0) > 0:
            # Cold start: Just acknowledge spending exists
            insights.append({
                "type": "spending_info",
                "message": f"${spending['current_week']:,.0f} in bills this week",
                "priority": 3,
                "confidence": 1.0,
                "is_template": True,
                "learning_message": "Trend comparison coming after 4 weeks",
                "evidence": self._build_evidence(
                    pattern_strength=1.0,
                    context="Tracking your spending — trend analysis available after 4 weeks of data",
                ),
            })

        # Domain Intelligence insights

        # Recurring meal patterns
        recurring = self.get_recurring_meal_patterns()
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        for pattern in recurring[:2]:  # Top 2 patterns only
            if pattern["occurrences"] >= 3:
                recur_conf = min(0.9, 0.5 + pattern["occurrences"] * 0.1)
                insights.append({
                    "type": "recurring_meal",
                    "message": f"You often make {pattern['recipe_name']} on {day_names[pattern['day_of_week']]}s",
                    "priority": 3,
                    "confidence": recur_conf,
                    "evidence": self._build_evidence(
                        observation_count=pattern["occurrences"],
                        pattern_strength=recur_conf,
                        last_observed=today_iso,
                        context=f"Cooked {pattern['occurrences']} times on {day_names[pattern['day_of_week']]}s in the last 4 weeks",
                    ),
                })

        # Low stock + upcoming meals cross-reference
        low_stock_meals = self.get_low_stock_meals(week_start)
        if low_stock_meals:
            # Group by unique ingredient count
            unique_ingredients = {a["ingredient_name"] for a in low_stock_meals}
            affected_recipes = {a["recipe_name"] for a in low_stock_meals}
            earliest_meal = min((a["meal_date"] for a in low_stock_meals), default=today_iso)
            if len(unique_ingredients) <= 3:
                names = ", ".join(sorted(unique_ingredients))
                insights.append({
                    "type": "low_stock_meal",
                    "message": f"Upcoming meals need {names} — check inventory",
                    "priority": 2,
                    "confidence": 0.95,
                    "evidence": self._build_evidence(
                        observation_count=len(low_stock_meals),
                        pattern_strength=0.95,
                        last_observed=earliest_meal,
                        context=f"Cross-referenced {len(affected_recipes)} planned meal(s) against current inventory",
                    ),
                })
            else:
                insights.append({
                    "type": "low_stock_meal",
                    "message": f"{len(unique_ingredients)} ingredients needed for this week's meals may be low or missing",
                    "priority": 2,
                    "confidence": 0.95,
                    "evidence": self._build_evidence(
                        observation_count=len(low_stock_meals),
                        pattern_strength=0.95,
                        last_observed=earliest_meal,
                        context=f"Cross-referenced {len(affected_recipes)} planned meal(s) against current inventory",
                    ),
                })

        # Ingredient variety (low variety warning)
        variety = self.get_ingredient_variety(week_start)
        if variety["variety_score"] < 0.5 and variety["total_uses"] > 0:
            top_repeated = variety["repeated_ingredients"][:2]
            if top_repeated:
                names = " and ".join(r["ingredient_name"] for r in top_repeated)
                insights.append({
                    "type": "low_variety",
                    "message": f"This week leans heavy on {names} — consider mixing it up",
                    "priority": 3,
                    "confidence": 0.7,
                    "evidence": self._build_evidence(
                        observation_count=variety["total_uses"],
                        pattern_strength=1.0 - variety["variety_score"],
                        last_observed=today_iso,
                        context=f"Variety score {variety['variety_score']:.0%} — {variety['total_unique']} unique ingredients across {variety['total_uses']} uses",
                    ),
                })

        # Restocking predictions
        restock = self.get_restocking_predictions()
        if restock:
            count = len(restock)
            restock_context = "Based on current inventory levels and consumption history"
            if count <= 3:
                names = ", ".join(r["item_name"] for r in restock)
                insights.append({
                    "type": "restock_needed",
                    "message": f"{names} may need restocking soon",
                    "priority": 2,
                    "confidence": 0.8,
                    "evidence": self._build_evidence(
                        observation_count=count,
                        pattern_strength=0.8,
                        last_observed=today_iso,
                        context=restock_context,
                    ),
                })
            else:
                insights.append({
                    "type": "restock_needed",
                    "message": f"{count} items may need restocking before your next shopping trip",
                    "priority": 2,
                    "confidence": 0.8,
                    "evidence": self._build_evidence(
                        observation_count=count,
                        pattern_strength=0.8,
                        last_observed=today_iso,
                        context=restock_context,
                    ),
                })

        # ADWIN drift detection - when patterns change significantly
        behavioral = self.get_behavioral_patterns()
        detected_drifts = behavioral.get("detected_drifts", [])
        for drift in detected_drifts:
            if drift.get("detected"):
                pattern_name = drift.get("pattern", "pattern").replace("_", " ")
                insights.append({
                    "type": "pattern_changed",
                    "message": drift.get("message", f"Your {pattern_name} has changed"),
                    "priority": 2,
                    "confidence": 0.9,
                    "drift_info": {
                        "pattern": drift.get("pattern"),
                        "old_value": drift.get("old_mean_seconds"),
                        "new_value": drift.get("new_mean_seconds"),
                    },
                    "evidence": self._build_evidence(
                        pattern_strength=0.9,
                        last_observed=today_iso,
                        context=f"ADWIN detected a significant shift in your {pattern_name}",
                    ),
                })

        # Add learning progress insight if in cold start
        if is_cold_start:
            learning_progress = confidence.get("learning_progress", {})
            learning_features = [
                f for f, status in learning_progress.items()
                if status.get("status") == "learning"
            ]

            if learning_features:
                # Find the feature closest to ready
                closest = min(
                    learning_features,
                    key=lambda f: 100 - learning_progress[f].get("progress", 0)
                )
                progress = learning_progress[closest]

                insights.append({
                    "type": "learning_progress",
                    "message": progress.get("message", "Learning your patterns..."),
                    "priority": 0,
                    "confidence": 0.5,
                    "learning_features": learning_features,
                    "next_ready": closest,
                    "next_ready_progress": progress.get("progress", 0),
                    "evidence": self._build_evidence(
                        observation_count=confidence.get("session_count", 0),
                        pattern_strength=progress.get("progress", 0) / 100.0,
                        context=f"Personalizing {len(learning_features)} feature(s) — {closest.replace('_', ' ')} is {progress.get('progress', 0)}% ready",
                    ),
                })

        # V2 Financial Intelligence (extracted to financial_insights.py)
        from app.services.pattern_detection.financial_insights import build_financial_insights
        insights.extend(build_financial_insights(self.db, today_iso))

        # Apply feedback loop: suppress dismissed insights, boost acted-on ones
        try:
            from app.services.observation_learning import should_suppress, get_confidence_boost
            filtered = []
            for insight in insights:
                if should_suppress(self.db, insight["type"]):
                    continue
                boost = get_confidence_boost(self.db, insight["type"])
                if boost != 1.0:
                    insight["confidence"] = min(1.0, insight["confidence"] * boost)
                filtered.append(insight)
            insights = filtered
        except Exception as e:
            # Observation tables may not exist yet — graceful degradation
            log.debug("Observation feedback loop skipped (tables may not exist): %s", e)

        # Sort by priority (higher = more important)
        insights.sort(key=lambda x: x["priority"], reverse=True)

        return insights

    def get_learning_status(self) -> dict:
        """
        Get comprehensive learning status for the UI.

        Returns a summary of all features and their personalization progress.
        Useful for settings/debug views.

        Returns:
            dict with per-feature status and overall progress
        """
        confidence = self.calculate_overall_confidence()

        return {
            "is_cold_start": confidence.get("is_cold_start", True),
            "session_count": confidence.get("session_count", 0),
            "overall_progress": min(100, int(confidence.get("session_count", 0) / 10 * 100)),
            "features": confidence.get("learning_progress", {}),
            "feature_readiness": confidence.get("feature_readiness", {}),
            "next_milestone": self._get_next_milestone(confidence),
        }

    def _get_next_milestone(self, confidence: dict) -> Optional[dict]:
        """Get the next feature milestone to achieve."""
        learning = confidence.get("learning_progress", {})

        # Find features still learning, sorted by progress
        learning_features = [
            (feature, status)
            for feature, status in learning.items()
            if status.get("status") == "learning"
        ]

        if not learning_features:
            return None

        # Sort by progress (descending) to find closest to ready
        learning_features.sort(
            key=lambda x: x[1].get("progress", 0),
            reverse=True
        )

        feature, status = learning_features[0]
        return {
            "feature": feature,
            "progress": status.get("progress", 0),
            "estimated_ready": status.get("estimated_ready"),
            "message": f"{feature.replace('_', ' ').title()} is {status.get('progress', 0)}% personalized",
        }

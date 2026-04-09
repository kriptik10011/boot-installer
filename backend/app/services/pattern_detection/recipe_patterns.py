"""
Recipe Pattern Detection

Detects cooking patterns from user's cooking history:
- Reference Class Forecasting for prep/cook times (median, not average)
- Chef's notes retrieval (RAG pattern for user's own words)
- Time variance suggestions

Intelligence Principles Applied:
- Uses MEDIAN (robust to outliers like forgotten timers)
- Confidence threshold: 0.5 minimum for surfacing
- 3 dismissals within 30 days = suppress suggestion
- Suggestions only in Planning Mode (Pull Don't Push)

Intelligent cooking mode.
"""

import statistics
from typing import Optional

from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app.models.meal import MealPlanEntry
from app.models.recipe import Recipe


class RecipePatternDetector:
    """Detects cooking patterns from user's recipe history."""

    # Minimum sessions needed before surfacing personalized estimates
    MIN_SESSIONS_FOR_ESTIMATE = 2

    # Confidence calculation: increases with more data points
    # 2 sessions = 0.3, 3 = 0.45, 4 = 0.6, 5 = 0.75, 6+ = 0.9
    CONFIDENCE_PER_SESSION = 0.15
    MAX_CONFIDENCE = 0.9

    # Variance threshold for suggesting recipe update
    # Only suggest if actual differs by >20% OR >10 minutes
    VARIANCE_PERCENT_THRESHOLD = 20
    VARIANCE_MINUTES_THRESHOLD = 10

    def __init__(self, db: Session):
        self.db = db

    def get_cooking_history(
        self,
        recipe_id: int,
        limit: int = 10
    ) -> list[dict]:
        """
        Get user's cooking history for a specific recipe.

        Returns:
            List of cooking sessions with actual times and notes
        """
        sessions = self.db.query(MealPlanEntry).filter(
            MealPlanEntry.recipe_id == recipe_id,
            MealPlanEntry.cooked_at.isnot(None)  # Only completed cooking sessions
        ).order_by(
            desc(MealPlanEntry.cooked_at)
        ).limit(limit).all()

        return [
            {
                "meal_id": s.id,
                "date": s.date.isoformat() if hasattr(s.date, 'isoformat') else str(s.date),
                "cooked_at": s.cooked_at.isoformat() if s.cooked_at else None,
                "actual_servings": s.actual_servings,
                "actual_prep_minutes": s.actual_prep_minutes,
                "actual_cook_minutes": s.actual_cook_minutes,
                "total_minutes": (s.actual_prep_minutes or 0) + (s.actual_cook_minutes or 0),
                "notes": s.cooking_notes,
            }
            for s in sessions
        ]

    def get_recipe_duration_estimate(self, recipe_id: int) -> dict:
        """
        Calculate realistic duration using Reference Class Forecasting.

        Uses MEDIAN of last N cooking sessions (robust to outliers).
        Only surfaces when confidence >= 0.5 (per cached decisions).

        Returns:
            dict with prep/cook estimates, confidence, and source
        """
        # Get recipe for baseline times
        recipe = self.db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            return {
                "source": "unknown",
                "confidence": 0.0,
                "error": "Recipe not found"
            }

        # Get cooking history
        history = self.get_cooking_history(recipe_id, limit=5)

        # Filter sessions with valid time data
        valid_sessions = [
            s for s in history
            if s["actual_prep_minutes"] is not None
            and s["actual_cook_minutes"] is not None
        ]

        # Not enough data - return recipe defaults
        if len(valid_sessions) < self.MIN_SESSIONS_FOR_ESTIMATE:
            return {
                "prep_minutes": recipe.prep_time_minutes,
                "cook_minutes": recipe.cook_time_minutes,
                "total_minutes": (recipe.prep_time_minutes or 0) + (recipe.cook_time_minutes or 0),
                "source": "recipe",
                "confidence": 0.0,
                "sample_count": len(valid_sessions),
                "message": f"Need {self.MIN_SESSIONS_FOR_ESTIMATE - len(valid_sessions)} more cooking sessions for personalized estimate"
            }

        # Calculate MEDIAN (Reference Class Forecasting)
        prep_times = [s["actual_prep_minutes"] for s in valid_sessions]
        cook_times = [s["actual_cook_minutes"] for s in valid_sessions]
        total_times = [s["total_minutes"] for s in valid_sessions]

        median_prep = statistics.median(prep_times)
        median_cook = statistics.median(cook_times)
        median_total = statistics.median(total_times)

        # Calculate confidence based on sample size
        confidence = min(
            self.MAX_CONFIDENCE,
            len(valid_sessions) * self.CONFIDENCE_PER_SESSION
        )

        return {
            "prep_minutes": round(median_prep),
            "cook_minutes": round(median_cook),
            "total_minutes": round(median_total),
            "source": "personalized",
            "confidence": round(confidence, 2),
            "sample_count": len(valid_sessions),
            "recipe_prep_minutes": recipe.prep_time_minutes,
            "recipe_cook_minutes": recipe.cook_time_minutes,
        }

    def get_chef_notes(self, recipe_id: int, limit: int = 5) -> list[dict]:
        """
        Get user's past cooking notes for a recipe.

        RAG pattern: Surface user's own words to help them cook.
        "Last time you noted: Use less chili"

        Returns:
            List of notes with dates, most recent first
        """
        sessions = self.db.query(MealPlanEntry).filter(
            MealPlanEntry.recipe_id == recipe_id,
            MealPlanEntry.cooking_notes.isnot(None),
            MealPlanEntry.cooking_notes != ""
        ).order_by(
            desc(MealPlanEntry.cooked_at)
        ).limit(limit).all()

        return [
            {
                "note": s.cooking_notes,
                "date": s.date.isoformat() if hasattr(s.date, 'isoformat') else str(s.date),
                "cooked_at": s.cooked_at.isoformat() if s.cooked_at else None,
                "servings": s.actual_servings,
            }
            for s in sessions
        ]

    def get_time_suggestion(self, recipe_id: int) -> Optional[dict]:
        """
        Generate time update suggestion if actual differs significantly.

        Follows Suggestion Contract pattern:
        - Only when variance > 20% OR > 10 minutes
        - Confidence >= 0.5 (per cached decisions)
        - Returns None if no suggestion warranted

        Note: Dismissal tracking (3 = 30 day suppress) handled by frontend.

        Returns:
            dict with suggestion details or None
        """
        estimate = self.get_recipe_duration_estimate(recipe_id)

        # Not enough confidence to suggest
        if estimate.get("confidence", 0) < 0.5:
            return None

        # No recipe times to compare
        if estimate.get("source") != "personalized":
            return None

        recipe_prep = estimate.get("recipe_prep_minutes") or 0
        recipe_cook = estimate.get("recipe_cook_minutes") or 0
        recipe_total = recipe_prep + recipe_cook

        actual_prep = estimate.get("prep_minutes", 0)
        actual_cook = estimate.get("cook_minutes", 0)
        actual_total = actual_prep + actual_cook

        # No recipe times set
        if recipe_total == 0:
            return None

        # Calculate variance
        variance_minutes = abs(actual_total - recipe_total)
        variance_percent = (variance_minutes / recipe_total) * 100

        # Check if variance exceeds thresholds
        if (variance_percent < self.VARIANCE_PERCENT_THRESHOLD
                and variance_minutes < self.VARIANCE_MINUTES_THRESHOLD):
            return None

        # Determine direction
        if actual_total > recipe_total:
            direction = "longer"
            message = f"You usually cook this in {actual_total} min (recipe says {recipe_total})"
        else:
            direction = "shorter"
            message = f"You usually finish in {actual_total} min (recipe says {recipe_total})"

        return {
            "recipe_id": recipe_id,
            "suggestion_type": "time_update",
            "direction": direction,
            "message": message,
            "recipe_total_minutes": recipe_total,
            "actual_total_minutes": actual_total,
            "suggested_prep_minutes": actual_prep,
            "suggested_cook_minutes": actual_cook,
            "variance_percent": round(variance_percent, 1),
            "confidence": estimate["confidence"],
            "sample_count": estimate["sample_count"],
        }

    def get_favorite_recipes(self, limit: int = 10) -> list[dict]:
        """
        Get user's most-cooked recipes ranked by cook count.

        Returns list of {recipe_id, recipe_name, cook_count, last_cooked}.
        Only includes recipes cooked at least twice with valid time data.
        """
        favorites = self.db.query(
            MealPlanEntry.recipe_id,
            func.count(MealPlanEntry.id).label('cook_count'),
            func.max(MealPlanEntry.cooked_at).label('last_cooked'),
        ).filter(
            MealPlanEntry.recipe_id.isnot(None),
            MealPlanEntry.cooked_at.isnot(None),
        ).group_by(
            MealPlanEntry.recipe_id
        ).having(
            func.count(MealPlanEntry.id) >= self.MIN_SESSIONS_FOR_ESTIMATE
        ).order_by(
            desc(func.count(MealPlanEntry.id))
        ).limit(limit).all()

        result = []
        for recipe_id, cook_count, last_cooked in favorites:
            recipe = self.db.query(Recipe).filter(Recipe.id == recipe_id).first()
            if recipe:
                result.append({
                    "recipe_id": recipe_id,
                    "recipe_name": recipe.name,
                    "cook_count": cook_count,
                    "last_cooked": last_cooked.isoformat() if last_cooked else None,
                })
        return result

    def get_recipe_insights(self, recipe_id: int) -> dict:
        """
        Get all recipe insights for display in UI.

        Combines:
        - Duration estimate (Reference Class Forecasting)
        - Chef's notes (RAG pattern)
        - Time suggestion (if warranted)

        Returns:
            dict with all insights for the recipe
        """
        return {
            "recipe_id": recipe_id,
            "duration_estimate": self.get_recipe_duration_estimate(recipe_id),
            "chef_notes": self.get_chef_notes(recipe_id),
            "time_suggestion": self.get_time_suggestion(recipe_id),
        }

    def get_recipes_with_suggestions(self) -> list[dict]:
        """
        Find all recipes that have time update suggestions.

        Used in Planning Mode to surface suggestions proactively.

        Returns:
            List of recipes with time suggestions
        """
        # Get all recipes that have been cooked at least twice
        cooked_recipes = self.db.query(
            MealPlanEntry.recipe_id,
            func.count(MealPlanEntry.id).label('cook_count')
        ).filter(
            MealPlanEntry.recipe_id.isnot(None),
            MealPlanEntry.cooked_at.isnot(None),
            MealPlanEntry.actual_prep_minutes.isnot(None),
            MealPlanEntry.actual_cook_minutes.isnot(None)
        ).group_by(
            MealPlanEntry.recipe_id
        ).having(
            func.count(MealPlanEntry.id) >= self.MIN_SESSIONS_FOR_ESTIMATE
        ).all()

        suggestions = []
        for recipe_id, _ in cooked_recipes:
            suggestion = self.get_time_suggestion(recipe_id)
            if suggestion:
                # Add recipe name
                recipe = self.db.query(Recipe).filter(Recipe.id == recipe_id).first()
                if recipe:
                    suggestion["recipe_name"] = recipe.name
                    suggestions.append(suggestion)

        return suggestions

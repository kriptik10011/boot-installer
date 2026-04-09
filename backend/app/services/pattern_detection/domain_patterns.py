"""
Domain Pattern Detection.

Detects domain-specific patterns from application data:
- Day health scoring (how manageable is a day)
- Conflict detection (overlapping events)
- Spending trends (EWMA comparison)
- Meal gaps (unplanned meals)
- Recurring meal patterns
- Ingredient variety analysis
- Restocking predictions
- Low stock + meal cross-reference
- Tracking mode suggestions

This combines observation data with actual domain entities.
"""

from datetime import datetime, date, timedelta
from typing import Optional
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event
from app.models.financial import FinancialItem
from app.models.meal import MealPlanEntry
from app.models.recipe import Recipe, Ingredient, RecipeIngredient, TrackingMode
from app.models.inventory import InventoryItem
from app.services.pattern_detection.constants import EWMA_ALPHA
from app.utils.week_utils import get_week_range


class DomainPatternDetector:
    """Detects domain-specific patterns from application data."""


    # Day health scoring constants
    BASE_SCORE = 100
    PENALTY_EVENT_OVER_3 = 10
    PENALTY_CONFLICT = 20
    PENALTY_UNPLANNED_MEAL = 5
    PENALTY_OVERDUE_BILL = 10
    PENALTY_UPCOMING_BILL = 5

    # Event overlap threshold (minutes)
    OVERLAP_THRESHOLD_MINUTES = 0

    def __init__(self, db: Session):
        self.db = db

    def _parse_date(self, date_input) -> date:
        """Parse date from string or date object."""
        if isinstance(date_input, str):
            return datetime.fromisoformat(date_input.replace('Z', '+00:00')).date()
        elif isinstance(date_input, datetime):
            return date_input.date()
        return date_input

    def _get_week_dates(self, week_start: str) -> list[date]:
        """Get all dates in a week starting from week_start."""
        start = self._parse_date(week_start)
        return [start + timedelta(days=i) for i in range(7)]

    def _parse_time(self, time_str: Optional[str]) -> Optional[int]:
        """
        Parse time string "HH:MM" to minutes since midnight.
        Returns None if time_str is None or invalid.
        """
        if not time_str:
            return None
        try:
            parts = time_str.split(":")
            hours = int(parts[0])
            minutes = int(parts[1]) if len(parts) > 1 else 0
            return hours * 60 + minutes
        except (ValueError, IndexError):
            return None

    def _load_week_meal_ingredients(self, week_start: str):
        """Load meals and build recipe-to-ingredients mapping for a week.

        Returns (meals, recipe_to_ingredients, recipe_name_map) where:
        - meals: list of MealPlanEntry with recipe_id set
        - recipe_to_ingredients: {recipe_id: [(ingredient_id, name), ...]}
        - recipe_name_map: {recipe_id: recipe_name}
        """
        week_dates = self._get_week_dates(week_start)
        meals = (
            self.db.query(MealPlanEntry)
            .filter(
                MealPlanEntry.date >= week_dates[0].isoformat(),
                MealPlanEntry.date <= week_dates[-1].isoformat(),
                MealPlanEntry.recipe_id.isnot(None),
            )
            .options(joinedload(MealPlanEntry.recipe))
            .all()
        )
        if not meals:
            return [], defaultdict(list), {}

        recipe_ids = list({m.recipe_id for m in meals})
        recipe_ingredients = (
            self.db.query(RecipeIngredient)
            .filter(RecipeIngredient.recipe_id.in_(recipe_ids))
            .options(joinedload(RecipeIngredient.ingredient))
            .all()
        )
        recipes = self.db.query(Recipe).filter(Recipe.id.in_(recipe_ids)).all()
        recipe_name_map = {r.id: r.name for r in recipes}

        recipe_to_ingredients: dict[int, list[tuple[int, str]]] = defaultdict(list)
        for ri in recipe_ingredients:
            if ri.ingredient_id:
                name = ri.ingredient.name if ri.ingredient else "Unknown"
                recipe_to_ingredients[ri.recipe_id].append((ri.ingredient_id, name))

        return meals, recipe_to_ingredients, recipe_name_map

    def calculate_day_health(self, target_date: str) -> dict:
        """
        Calculate health score for a specific day.

        Score starts at 100, subtracts penalties for:
        - Events over 3: -10 each
        - Time conflicts: -20
        - Unplanned meals: -5 each
        - Overdue bills: -10 each
        - Upcoming bills: -5 each

        Status thresholds:
        - 80-100: "light"
        - 60-79: "balanced"
        - 40-59: "busy"
        - 0-39: "overloaded"

        Returns:
            dict with score, status, and component counts
        """
        day = self._parse_date(target_date)
        day_str = day.isoformat()
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day, datetime.max.time())

        score = self.BASE_SCORE
        details = {
            "date": day_str,
            "event_count": 0,
            "has_conflicts": False,
            "conflict_count": 0,
            "bills_due": 0,
            "bills_amount": 0.0,
            "overdue_bills": 0,
            "unplanned_meals": 0,
        }

        # Count events for this day
        events = self.db.query(Event).filter(
            Event.date == day
        ).all()

        details["event_count"] = len(events)

        # Penalty for events over 3
        if len(events) > 3:
            score -= self.PENALTY_EVENT_OVER_3 * (len(events) - 3)

        # Check for time conflicts
        conflicts = self._detect_conflicts_for_events(events)
        if conflicts:
            details["has_conflicts"] = True
            details["conflict_count"] = len(conflicts)
            score -= self.PENALTY_CONFLICT

        # Check bills due on this day
        bills_due = self.db.query(FinancialItem).filter(
            func.date(FinancialItem.due_date) == day
        ).all()

        details["bills_due"] = len(bills_due)
        details["bills_amount"] = sum(b.amount for b in bills_due)

        # Penalty for bills
        for bill in bills_due:
            score -= self.PENALTY_UPCOMING_BILL

        # Check overdue bills (due before today, not paid)
        if day >= date.today():
            overdue = self.db.query(FinancialItem).filter(
                func.date(FinancialItem.due_date) < date.today(),
                FinancialItem.is_paid == False
            ).count()
            details["overdue_bills"] = overdue
            score -= self.PENALTY_OVERDUE_BILL * overdue

        # Check unplanned meals
        # A meal slot is unplanned if no meal entry exists
        meals_planned = self.db.query(MealPlanEntry).filter(
            MealPlanEntry.date == day_str
        ).count()

        # Assuming 3 meal slots per day (breakfast, lunch, dinner)
        unplanned = max(0, 3 - meals_planned)
        details["unplanned_meals"] = unplanned
        score -= self.PENALTY_UNPLANNED_MEAL * unplanned

        # Clamp score to 0-100
        score = max(0, min(100, score))

        # Determine status
        if score >= 80:
            status = "light"
        elif score >= 60:
            status = "balanced"
        elif score >= 40:
            status = "busy"
        else:
            status = "overloaded"

        return {
            **details,
            "score": score,
            "status": status,
        }

    def _detect_conflicts_for_events(self, events: list[Event]) -> list[tuple]:
        """
        Detect time conflicts between events.

        Returns:
            List of conflicting event pairs (id1, id2, overlap_minutes)
        """
        conflicts = []

        # Filter events that have valid start_time and parse to minutes
        # Events without start_time can't have time conflicts
        timed_events = []
        for e in events:
            start_mins = self._parse_time(e.start_time)
            end_mins = self._parse_time(e.end_time)
            if start_mins is not None:
                timed_events.append((e, start_mins, end_mins))

        # Sort by start time (minutes since midnight)
        sorted_events = sorted(timed_events, key=lambda x: x[1])

        for i, (event1, start1, end1) in enumerate(sorted_events):
            if end1 is None:
                continue

            for event2, start2, end2 in sorted_events[i + 1:]:
                # Check for overlap: event1 ends after event2 starts
                if end1 > start2:
                    # Calculate overlap duration
                    overlap_end = min(end1, end2 if end2 is not None else start2)
                    overlap_start = start2
                    overlap_minutes = overlap_end - overlap_start

                    if overlap_minutes > self.OVERLAP_THRESHOLD_MINUTES:
                        conflicts.append((event1.id, event2.id, round(overlap_minutes)))

        return conflicts

    def detect_conflicts_for_week(self, week_start: str) -> list[dict]:
        """
        Detect all event conflicts for a week.

        Returns:
            List of conflict details
        """
        week_dates = self._get_week_dates(week_start)
        all_conflicts = []

        # Batch query: load all events for the week at once
        all_events = self.db.query(Event).filter(
            Event.date >= week_dates[0],
            Event.date <= week_dates[-1],
        ).all()

        # Group events by date in Python
        events_by_date: dict[date, list] = defaultdict(list)
        for event in all_events:
            event_date = event.date if isinstance(event.date, date) else self._parse_date(str(event.date))
            events_by_date[event_date].append(event)

        for day in week_dates:
            events = events_by_date.get(day, [])

            conflicts = self._detect_conflicts_for_events(events)
            for id1, id2, overlap in conflicts:
                event1 = next((e for e in events if e.id == id1), None)
                event2 = next((e for e in events if e.id == id2), None)

                if event1 and event2:
                    all_conflicts.append({
                        "date": day.isoformat(),
                        "event1_id": id1,
                        "event1_name": event1.name,
                        "event2_id": id2,
                        "event2_name": event2.name,
                        "overlap_minutes": overlap,
                    })

        return all_conflicts

    def get_spending_trend(self, weeks: int = 4) -> dict:
        """
        Calculate spending trend using EWMA comparison.

        Compares current week to 4-week EWMA average.

        Returns:
            dict with current, average, change, and trend
        """
        today = date.today()

        # Get start of current week (Sunday)
        days_since_sunday = (today.weekday() + 1) % 7
        current_week_start = today - timedelta(days=days_since_sunday)

        # Calculate weekly totals for past N weeks
        # Batch query: load all expenses in the full date range, group by week in Python
        oldest_start = current_week_start - timedelta(weeks=weeks)
        _, newest_end = get_week_range(current_week_start)

        all_expenses = self.db.query(
            FinancialItem.due_date, FinancialItem.amount
        ).filter(
            func.date(FinancialItem.due_date) >= oldest_start,
            func.date(FinancialItem.due_date) < newest_end,
            FinancialItem.type == 'expense',
        ).all()

        # Build week_start -> total mapping
        week_totals_map: dict[date, float] = {}
        for expense in all_expenses:
            exp_date = expense.due_date if isinstance(expense.due_date, date) else self._parse_date(str(expense.due_date))
            # Find which week bucket this falls into
            days_from_oldest = (exp_date - oldest_start).days
            week_idx = days_from_oldest // 7
            bucket_start = oldest_start + timedelta(weeks=week_idx)
            week_totals_map[bucket_start] = week_totals_map.get(bucket_start, 0.0) + float(expense.amount or 0)

        weekly_totals = []
        for i in range(weeks, -1, -1):  # From oldest to newest
            ws = current_week_start - timedelta(weeks=i)
            weekly_totals.append(week_totals_map.get(ws, 0.0))

        if len(weekly_totals) < 2:
            return {
                "current_week": 0,
                "four_week_average": 0,
                "percent_change": 0,
                "trend": "normal",
                "insufficient_data": True
            }

        # Current week is the last entry
        current_week = weekly_totals[-1]

        # Calculate EWMA of previous weeks (excluding current)
        previous_weeks = weekly_totals[:-1]
        four_week_ewma = self._calculate_ewma(previous_weeks)

        # Calculate percent change
        if four_week_ewma > 0:
            percent_change = ((current_week - four_week_ewma) / four_week_ewma) * 100
        else:
            percent_change = 0 if current_week == 0 else 100

        # Determine trend
        if percent_change > 15:
            trend = "higher"
        elif percent_change < -15:
            trend = "lower"
        else:
            trend = "normal"

        return {
            "current_week": round(current_week, 2),
            "four_week_average": round(four_week_ewma, 2),
            "percent_change": round(percent_change, 1),
            "trend": trend,
            "weekly_history": [round(w, 2) for w in weekly_totals],
        }

    def _calculate_ewma(self, values: list[float]) -> float:
        """Calculate EWMA with alpha = 0.3."""
        if not values:
            return 0.0

        ewma = values[0]
        for value in values[1:]:
            ewma = EWMA_ALPHA * value + (1 - EWMA_ALPHA) * ewma

        return ewma

    def get_week_summary(self, week_start: str) -> dict:
        """
        Generate comprehensive week summary.

        Returns:
            dict with week statistics and summary sentence
        """
        week_dates = self._get_week_dates(week_start)
        week_end = week_dates[-1]

        # Calculate day health for each day
        day_healths = [self.calculate_day_health(d.isoformat()) for d in week_dates]

        # Count busy/overloaded days
        busy_days = sum(1 for d in day_healths if d["status"] in ["busy", "overloaded"])

        # Total bills due this week
        bills = self.db.query(FinancialItem).filter(
            func.date(FinancialItem.due_date) >= week_dates[0],
            func.date(FinancialItem.due_date) <= week_end
        ).all()

        total_bills_due = sum(b.amount for b in bills)
        unpaid_bills = sum(b.amount for b in bills if not b.is_paid)

        # Overdue bills (before this week, not paid)
        overdue_count = self.db.query(FinancialItem).filter(
            func.date(FinancialItem.due_date) < week_dates[0],
            FinancialItem.is_paid == False
        ).count()

        # Count unplanned meals
        meals_planned = self.db.query(MealPlanEntry).filter(
            MealPlanEntry.date >= week_dates[0].isoformat(),
            MealPlanEntry.date <= week_end.isoformat()
        ).count()

        # 21 meal slots per week (3 per day * 7 days)
        unplanned_meals = max(0, 21 - meals_planned)

        # Count event conflicts
        conflicts = self.detect_conflicts_for_week(week_start)
        event_conflicts = len(conflicts)

        # Build summary sentence
        parts = []
        if busy_days > 0:
            parts.append(f"{busy_days} busy day{'s' if busy_days > 1 else ''}")
        if total_bills_due > 0:
            parts.append(f"${total_bills_due:,.0f} due")
        if unplanned_meals > 0:
            parts.append(f"{unplanned_meals} meal{'s' if unplanned_meals > 1 else ''} unplanned")
        if event_conflicts > 0:
            parts.append(f"{event_conflicts} conflict{'s' if event_conflicts > 1 else ''}")

        summary_sentence = "This week: " + ", ".join(parts) if parts else "This week looks clear!"

        return {
            "week_start": week_dates[0].isoformat(),
            "week_end": week_end.isoformat(),
            "busy_days": busy_days,
            "total_bills_due": round(total_bills_due, 2),
            "unpaid_bills": round(unpaid_bills, 2),
            "overdue_bills": overdue_count,
            "unplanned_meals": unplanned_meals,
            "event_conflicts": event_conflicts,
            "summary_sentence": summary_sentence,
            "day_healths": day_healths,
        }

    def get_meal_gaps(self, week_start: str) -> list[dict]:
        """
        Find unplanned meal slots for a week.

        Returns:
            List of unplanned meal slots
        """
        week_dates = self._get_week_dates(week_start)
        meal_types = ["breakfast", "lunch", "dinner"]
        gaps = []

        # Batch query: load all meals for the week at once
        all_meals = self.db.query(MealPlanEntry.date, MealPlanEntry.meal_type).filter(
            MealPlanEntry.date >= week_dates[0].isoformat(),
            MealPlanEntry.date <= week_dates[-1].isoformat(),
        ).all()

        # Build set of (date_str, meal_type) for O(1) lookup
        planned_set = set()
        for meal in all_meals:
            meal_date_str = str(meal.date)
            meal_type_val = meal.meal_type.value if hasattr(meal.meal_type, 'value') else str(meal.meal_type)
            planned_set.add((meal_date_str, meal_type_val))

        for day in week_dates:
            day_str = day.isoformat()

            for meal_type in meal_types:
                if (day_str, meal_type) not in planned_set:
                    gaps.append({
                        "date": day_str,
                        "meal_type": meal_type,
                        "day_name": day.strftime("%A"),
                    })

        return gaps

    # =========================================================================
    # MEALS DOMAIN INTELLIGENCE
    # =========================================================================

    def get_recurring_meal_patterns(self, weeks_back: int = 4) -> list[dict]:
        """
        Detect recurring meals — same recipe on same day-of-week for 2+ weeks.

        Only considers cooked meals (cooked_at is not None) to detect actual
        behavior, not just planned intentions.

        Returns:
            List of pattern dicts with recipe_name, day_of_week, occurrences, meal_type
        """
        # Look back N weeks from today
        cutoff = date.today() - timedelta(weeks=weeks_back)

        # Query all cooked meals with recipes in the time window
        cooked_meals = (
            self.db.query(MealPlanEntry)
            .filter(
                MealPlanEntry.cooked_at.isnot(None),
                MealPlanEntry.recipe_id.isnot(None),
                MealPlanEntry.date >= cutoff,
            )
            .options(joinedload(MealPlanEntry.recipe))
            .all()
        )

        # Group by (recipe_id, day_of_week)
        # day_of_week: Monday=0, Sunday=6
        pattern_counts: dict[tuple[int, int], dict] = defaultdict(
            lambda: {"recipe_name": "", "meal_type": "", "occurrences": 0}
        )

        for meal in cooked_meals:
            if not meal.recipe:
                continue
            meal_date = meal.date if isinstance(meal.date, date) else self._parse_date(str(meal.date))
            dow = meal_date.weekday()
            key = (meal.recipe_id, dow)
            entry = pattern_counts[key]
            entry["recipe_name"] = meal.recipe.name
            entry["meal_type"] = meal.meal_type.value if hasattr(meal.meal_type, 'value') else str(meal.meal_type)
            entry["occurrences"] += 1

        # Filter to patterns with 2+ occurrences
        patterns = []
        for (recipe_id, dow), info in pattern_counts.items():
            if info["occurrences"] >= 2:
                patterns.append({
                    "recipe_id": recipe_id,
                    "recipe_name": info["recipe_name"],
                    "day_of_week": dow,
                    "meal_type": info["meal_type"],
                    "occurrences": info["occurrences"],
                })

        # Sort by occurrences descending
        return sorted(patterns, key=lambda p: p["occurrences"], reverse=True)

    def get_ingredient_variety_for_week(self, week_start: str) -> dict:
        """
        Analyze ingredient variety for a week's meal plan.

        Counts how many times each ingredient appears across planned meals.
        High repetition = low variety score.

        Returns:
            dict with variety_score (0.0-1.0), repeated_ingredients, total_unique, total_uses
        """
        meals, recipe_to_ingredients, recipe_name_map = self._load_week_meal_ingredients(week_start)

        if not meals:
            return {
                "variety_score": 1.0,
                "repeated_ingredients": [],
                "total_unique": 0,
                "total_uses": 0,
            }

        # Count ingredient appearances across meals
        ingredient_usage: dict[int, dict] = defaultdict(
            lambda: {"name": "", "count": 0, "recipe_names": set()}
        )

        for meal in meals:
            for ing_id, ing_name in recipe_to_ingredients.get(meal.recipe_id, []):
                entry = ingredient_usage[ing_id]
                entry["name"] = ing_name
                entry["count"] += 1
                entry["recipe_names"].add(recipe_name_map.get(meal.recipe_id, "Unknown"))

        total_unique = len(ingredient_usage)
        total_uses = sum(v["count"] for v in ingredient_usage.values())

        # Repeated = appears in 2+ meal slots
        repeated = []
        for ing_id, info in ingredient_usage.items():
            if info["count"] >= 2:
                repeated.append({
                    "ingredient_id": ing_id,
                    "ingredient_name": info["name"],
                    "count": info["count"],
                    "recipe_names": sorted(info["recipe_names"]),
                })

        # Variety score: 1.0 if no repeats, decreasing with repetition
        # Formula: unique / total_uses (1.0 = every ingredient used once)
        if total_uses > 0:
            variety_score = min(1.0, total_unique / total_uses)
        else:
            variety_score = 1.0

        return {
            "variety_score": round(variety_score, 2),
            "repeated_ingredients": sorted(repeated, key=lambda r: r["count"], reverse=True),
            "total_unique": total_unique,
            "total_uses": total_uses,
        }

    # =========================================================================
    # SHOPPING DOMAIN INTELLIGENCE
    # =========================================================================

    def get_restocking_predictions(self, days_until_shopping: int = 7) -> list[dict]:
        """
        RCF-based restocking predictions using InventoryItem.needs_restock().

        Checks all inventory items and flags those predicted to run out
        before the next shopping trip.

        Returns:
            List of items needing restocking with prediction details
        """
        items = (
            self.db.query(InventoryItem)
            .options(joinedload(InventoryItem.ingredient))
            .all()
        )

        predictions = []
        for item in items:
            if item.needs_restock(days_until_shopping=days_until_shopping):
                tracking_mode = item.get_tracking_mode()
                pred = {
                    "item_id": item.id,
                    "item_name": item.name,
                    "ingredient_id": item.ingredient_id,
                    "tracking_mode": tracking_mode.value,
                    "needs_restock": True,
                }

                # Add mode-specific details
                if tracking_mode == TrackingMode.PERCENTAGE:
                    pred["percent_full"] = item.percent_full
                else:
                    pred["quantity"] = item.quantity
                    pred["unit"] = item.unit

                # Add RCF prediction if consumption history exists
                history = item.consumption_history or []
                if len(history) >= 3:
                    durations = [h.get("days_lasted", 14) for h in history[-5:] if h.get("days_lasted")]
                    if durations:
                        median = sorted(durations)[len(durations) // 2]
                        pred["predicted_depletion_days"] = median

                predictions.append(pred)

        return sorted(predictions, key=lambda p: p["item_name"])

    # =========================================================================
    # INVENTORY DOMAIN INTELLIGENCE
    # =========================================================================

    def get_low_stock_in_upcoming_meals(self, week_start: str) -> list[dict]:
        """
        Cross-reference low-stock or missing inventory with upcoming meal plan.

        For each planned meal this week, check if any recipe ingredients are
        low in stock or missing entirely from inventory.

        Returns:
            List of alerts with ingredient_name, recipe_name, meal_date
        """
        meals, recipe_to_ingredients, _ = self._load_week_meal_ingredients(week_start)

        if not meals:
            return []

        # Load all inventory items indexed by ingredient_id
        all_inventory = (
            self.db.query(InventoryItem)
            .filter(InventoryItem.ingredient_id.isnot(None))
            .options(joinedload(InventoryItem.ingredient))
            .all()
        )
        inventory_by_ingredient: dict[int, InventoryItem] = {}
        for inv_item in all_inventory:
            # Keep the item with the highest quantity for each ingredient
            existing = inventory_by_ingredient.get(inv_item.ingredient_id)
            if existing is None or (inv_item.quantity or 0) > (existing.quantity or 0):
                inventory_by_ingredient[inv_item.ingredient_id] = inv_item

        # Check each meal's ingredients against inventory
        alerts = []
        seen = set()  # Avoid duplicate alerts for same ingredient+recipe

        for meal in meals:
            recipe_name = meal.recipe.name if meal.recipe else "Unknown"
            meal_date_str = str(meal.date)

            for ing_id, ing_name in recipe_to_ingredients.get(meal.recipe_id, []):
                dedup_key = (ing_id, meal.recipe_id)
                if dedup_key in seen:
                    continue

                inv_item = inventory_by_ingredient.get(ing_id)

                is_low = False
                reason = ""

                if inv_item is None:
                    # No inventory entry at all
                    is_low = True
                    reason = "not_in_inventory"
                elif inv_item.needs_restock(days_until_shopping=7):
                    is_low = True
                    reason = "low_stock"

                if is_low:
                    seen.add(dedup_key)
                    alerts.append({
                        "ingredient_id": ing_id,
                        "ingredient_name": ing_name,
                        "recipe_name": recipe_name,
                        "meal_date": meal_date_str,
                        "reason": reason,
                    })

        return sorted(alerts, key=lambda a: a["meal_date"])

    def get_tracking_mode_suggestions(self) -> list[dict]:
        """
        Surface LinUCB tracking mode suggestions for ingredients.

        Only suggests when:
        - 5+ total interactions recorded
        - Clear majority (count > pct or vice versa)
        - User hasn't already set preferred_tracking_mode

        Returns:
            List of suggestion dicts with ingredient_name, suggested_mode, current_mode
        """
        # Query ingredients with enough interaction data and no preference set
        ingredients = (
            self.db.query(Ingredient)
            .filter(
                Ingredient.preferred_tracking_mode.is_(None),
            )
            .all()
        )

        suggestions = []
        for ing in ingredients:
            suggested = ing.get_suggested_tracking_mode()
            if suggested is None:
                continue

            current = ing.get_effective_tracking_mode()

            suggestions.append({
                "ingredient_id": ing.id,
                "ingredient_name": ing.name,
                "suggested_mode": suggested.value,
                "current_mode": current.value,
                "count_interactions": ing.count_interactions or 0,
                "percentage_interactions": ing.percentage_interactions or 0,
            })

        return suggestions

    # =========================================================================
    # COMBINED
    # =========================================================================

    def get_all_domain_patterns(self, week_start: str) -> dict:
        """
        Get all domain patterns for a week.

        Returns:
            dict with all domain pattern data
        """
        return {
            "week_summary": self.get_week_summary(week_start),
            "conflicts": self.detect_conflicts_for_week(week_start),
            "spending_trend": self.get_spending_trend(),
            "meal_gaps": self.get_meal_gaps(week_start),
            # Domain Intelligence
            "recurring_meal_patterns": self.get_recurring_meal_patterns(),
            "ingredient_variety": self.get_ingredient_variety_for_week(week_start),
            "restocking_predictions": self.get_restocking_predictions(),
            "low_stock_meals": self.get_low_stock_in_upcoming_meals(week_start),
            "tracking_suggestions": self.get_tracking_mode_suggestions(),
        }

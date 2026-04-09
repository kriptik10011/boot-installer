"""
Intelligence Service

Computes fully-formed intelligence responses on the backend.
Each function returns a complete response so frontend hooks can be thin
useQuery wrappers without business logic.
"""

import logging
from datetime import date, timedelta, datetime
from typing import Optional

log = logging.getLogger("weekly_review")

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.recipe import Recipe
from app.models.meal import MealPlanEntry
from app.models.event import Event
from app.models.inventory import InventoryItem
from app.models.financial import FinancialItem
from app.services.pattern_detection import PatternEngine
from app.services.pattern_detection.recipe_patterns import RecipePatternDetector
from app.services.observation_learning import should_suppress, get_confidence_boost
from app.utils.week_utils import get_week_range, get_week_dates


# =============================================================================
# HELPERS
# =============================================================================

def _get_confidence(db: Session) -> float:
    """Get overall pattern detection confidence score."""
    engine = PatternEngine(db)
    scores = engine.calculate_overall_confidence()
    return scores.get("overall", 0.5) if isinstance(scores, dict) else 0.5


# =============================================================================
# A4-3: RECIPE INTELLIGENCE
# =============================================================================

def compute_recipe_intelligence(db: Session) -> dict:
    """
    Compute recipe intelligence: favorites, complexity, suggestions, variety.

    Replaces frontend useRecipeIntelligence hook computation.
    """
    confidence = _get_confidence(db)
    is_learning = confidence < 0.5

    # Get all recipes
    recipes = db.query(Recipe).all()

    # Get favorites from recipe patterns
    detector = RecipePatternDetector(db)
    backend_favorites = detector.get_favorite_recipes(limit=10)
    favorite_cook_counts = {f["recipe_id"]: f["cook_count"] for f in backend_favorites}

    # Build favorites list with full recipe info
    recipe_map = {r.id: r for r in recipes}
    favorites = []
    if confidence >= 0.5:
        for fav in backend_favorites:
            recipe = recipe_map.get(fav["recipe_id"])
            if recipe:
                favorites.append({
                    "recipeId": recipe.id,
                    "recipeName": recipe.name,
                    "cookCount": fav["cook_count"],
                    "lastCooked": fav["last_cooked"],
                    "reasoning": f"You've cooked this {fav['cook_count']} times -- one of your go-to recipes.",
                })

    # Complexity scores
    complexity_scores = []
    for recipe in recipes:
        estimated_minutes = (recipe.prep_time_minutes or 0) + (recipe.cook_time_minutes or 0)
        cook_count = favorite_cook_counts.get(recipe.id, 0)

        if estimated_minutes <= 30:
            label = "Quick"
        elif estimated_minutes <= 60:
            label = "Medium"
        else:
            label = "Involved"

        accuracy_note = (
            f"Based on recipe estimate ({estimated_minutes} min). Open recipe for personalized timing."
            if cook_count >= 2
            else f"Based on recipe estimate ({estimated_minutes} min). Cook this recipe to improve accuracy."
        )

        complexity_scores.append({
            "recipeId": recipe.id,
            "estimatedMinutes": estimated_minutes,
            "actualMedianMinutes": None,
            "complexityLabel": label,
            "accuracyNote": accuracy_note,
        })

    # Quick recipes (<=30 min total time)
    quick_recipes = [
        r for r in recipes
        if 0 < (r.prep_time_minutes or 0) + (r.cook_time_minutes or 0) <= 30
    ]

    # Variety suggestions (recipes not in favorites)
    favorite_ids = {f["recipeId"] for f in favorites}
    insights = []

    if confidence >= 0.5:
        # Quick option insights
        for recipe in quick_recipes[:3]:
            total_time = (recipe.prep_time_minutes or 0) + (recipe.cook_time_minutes or 0)
            if not should_suppress(db, "quick_option"):
                insights.append({
                    "type": "quick_option",
                    "recipeId": recipe.id,
                    "recipeName": recipe.name,
                    "message": f"{recipe.name} - {total_time} min",
                    "reasoning": "Quick option for busy days.",
                    "confidence": confidence,
                    "priority": 3,
                })

        # Variety suggestions
        unexplored = [
            r for r in recipes
            if r.id not in favorite_ids and r.prep_time_minutes is not None
        ]
        for recipe in unexplored[:2]:
            if not should_suppress(db, "variety_suggestion"):
                insights.append({
                    "type": "variety_suggestion",
                    "recipeId": recipe.id,
                    "recipeName": recipe.name,
                    "message": f"Try {recipe.name}?",
                    "reasoning": "You haven't made this recently. Variety keeps meals interesting!",
                    "confidence": confidence,
                    "priority": 4,
                })

    insights.sort(key=lambda x: x["priority"])

    # Suggested recipes (favorites + quick + unexplored, up to 5)
    suggested_recipes = []
    suggested_ids = set()

    if not is_learning:
        for fav in favorites[:3]:
            rid = fav["recipeId"]
            r = recipe_map.get(rid)
            if r:
                suggested_recipes.append({
                    "id": r.id, "name": r.name,
                    "prep_time_minutes": r.prep_time_minutes,
                    "cook_time_minutes": r.cook_time_minutes,
                })
                suggested_ids.add(rid)

        for r in quick_recipes:
            if len(suggested_recipes) >= 5:
                break
            if r.id not in suggested_ids:
                suggested_recipes.append({
                    "id": r.id, "name": r.name,
                    "prep_time_minutes": r.prep_time_minutes,
                    "cook_time_minutes": r.cook_time_minutes,
                })
                suggested_ids.add(r.id)

        unexplored_for_suggest = [
            r for r in recipes if r.id not in favorite_ids
        ]
        for r in unexplored_for_suggest:
            if len(suggested_recipes) >= 5:
                break
            if r.id not in suggested_ids:
                suggested_recipes.append({
                    "id": r.id, "name": r.name,
                    "prep_time_minutes": r.prep_time_minutes,
                    "cook_time_minutes": r.cook_time_minutes,
                })
                suggested_ids.add(r.id)

    return {
        "favorites": favorites,
        "complexityScores": complexity_scores,
        "suggestedRecipes": suggested_recipes,
        "insights": insights,
        "confidence": confidence,
        "isLearning": is_learning,
    }


# =============================================================================
# A4-6: EVENT INTELLIGENCE
# =============================================================================

def compute_event_intelligence(db: Session, week_start: str) -> dict:
    """
    Compute event intelligence: conflicts, overloaded days, suggestions.

    Replaces frontend useEventIntelligence hook computation.
    """
    confidence = _get_confidence(db)
    is_learning = confidence < 0.5
    week_dates = [d.isoformat() for d in get_week_dates(week_start)]
    today = date.today().isoformat()

    OVERLOAD_THRESHOLD = 5
    BUSY_THRESHOLD = 3

    # Query events for the week
    start_date, end_date = get_week_range(week_start)
    events = db.query(Event).filter(
        Event.date >= start_date,
        Event.date < end_date,
    ).all()

    # Index by date
    events_by_date: dict[str, list] = {d: [] for d in week_dates}
    all_events = []
    for e in events:
        evt = {
            "id": e.id,
            "name": e.name,
            "date": e.date if isinstance(e.date, str) else e.date.isoformat(),
            "start_time": e.start_time,
            "end_time": e.end_time,
        }
        all_events.append(evt)
        d = evt["date"]
        if d in events_by_date:
            events_by_date[d].append(evt)

    def parse_time(t):
        if not t:
            return None
        parts = str(t).split(":")
        return int(parts[0]) * 60 + int(parts[1])

    # Build day insights
    day_insights = []
    for d in week_dates:
        day_events = events_by_date.get(d, [])
        count = len(day_events)
        is_today = d == today

        if count >= OVERLOAD_THRESHOLD:
            status = "overloaded"
        elif count >= BUSY_THRESHOLD:
            status = "busy"
        elif count >= 1:
            status = "balanced"
        else:
            status = "light"

        # Detect conflicts
        conflicts = []
        for i in range(len(day_events)):
            for j in range(i + 1, len(day_events)):
                e1, e2 = day_events[i], day_events[j]
                s1, e1_end = parse_time(e1["start_time"]), parse_time(e1["end_time"])
                s2, e2_end = parse_time(e2["start_time"]), parse_time(e2["end_time"])
                if s1 is None or e1_end is None or s2 is None or e2_end is None:
                    continue
                overlap = max(0, min(e1_end, e2_end) - max(s1, s2))
                if overlap > 0:
                    earlier, later = (e1, e2) if s1 < s2 else (e2, e1)
                    conflicts.append({
                        "event1Name": earlier["name"],
                        "event2Name": later["name"],
                        "overlapMinutes": overlap,
                        "message": f"{earlier['name']} overlaps with {later['name']} by {overlap} minutes",
                        "suggestion": f"Consider moving {later['name']} to start after {earlier['name']} ends",
                    })

        # Generate suggestions
        suggestions = []
        if conflicts:
            suggestions.append(f"{len(conflicts)} time conflict{'s' if len(conflicts) > 1 else ''} detected")
        if status == "overloaded":
            suggestions.append("Consider moving some events to lighter days")
        elif status == "busy":
            suggestions.append("Busy day - allow buffer time between events")

        # Back-to-back detection
        sorted_events = sorted(
            [e for e in day_events if e["start_time"] and e["end_time"]],
            key=lambda e: str(e["start_time"]),
        )
        for k in range(len(sorted_events) - 1):
            cur_end = parse_time(sorted_events[k]["end_time"])
            next_start = parse_time(sorted_events[k + 1]["start_time"])
            if cur_end is not None and next_start is not None:
                gap = next_start - cur_end
                if 0 <= gap < 15:
                    suggestions.append(
                        f'Only {gap} min between "{sorted_events[k]["name"]}" and "{sorted_events[k + 1]["name"]}"'
                    )

        # Reasoning
        parts = [f"{count} event{'s' if count != 1 else ''} scheduled"]
        if conflicts:
            parts.append(f"{len(conflicts)} time overlap{'s' if len(conflicts) != 1 else ''}")
        if status == "overloaded":
            parts.append("Day appears quite full")
        elif status == "busy":
            parts.append("Moderate activity level")
        reasoning = ". ".join(parts) + "."

        day_insights.append({
            "date": d,
            "dayName": _day_name(d),
            "isToday": is_today,
            "eventCount": count,
            "status": status,
            "conflicts": conflicts,
            "suggestions": suggestions,
            "reasoning": reasoning,
        })

    total_conflicts = sum(len(di["conflicts"]) for di in day_insights)
    overloaded_days = sum(1 for di in day_insights if di["status"] == "overloaded")
    conflict_days = sum(1 for di in day_insights if di["conflicts"])

    # byDate and upcoming for raw data subsets
    upcoming = [
        e for e in all_events if e["date"] >= today
    ]
    upcoming.sort(key=lambda e: e["date"])

    return {
        "dayInsights": day_insights,
        "totalConflicts": total_conflicts,
        "overloadedDays": overloaded_days,
        "conflictDays": conflict_days,
        "confidence": confidence,
        "isLearning": is_learning,
        "byDate": events_by_date,
        "upcoming": upcoming,
        "weekEventCount": len(all_events),
    }


def _day_name(date_str: str) -> str:
    """Get day name from a date string."""
    d = date.fromisoformat(date_str)
    return d.strftime("%A")


# =============================================================================
# A4-4: FINANCE INTELLIGENCE
# =============================================================================

def compute_finance_intelligence(db: Session, week_start: str) -> dict:
    """
    Compute finance intelligence: bill insights, budget pace, aggregates.

    Replaces frontend useFinanceIntelligence hook computation.
    """
    confidence = _get_confidence(db)
    today_str = date.today().isoformat()

    THRESHOLD_NOTIFICATION = 1
    THRESHOLD_URGENT = 2
    THRESHOLD_APPROACHING = 5

    # Query upcoming bills (one-time unpaid + recurring)
    # One-time unpaid financial items with due dates
    one_time_bills = db.query(FinancialItem).filter(
        FinancialItem.due_date.isnot(None),
        FinancialItem.is_paid == False,
        FinancialItem.type == "bill",
    ).all()

    # Build unified bill list
    today = date.today()
    bills = []
    for b in one_time_bills:
        due = b.due_date if isinstance(b.due_date, date) else date.fromisoformat(str(b.due_date))
        days_until = (due - today).days
        is_overdue = days_until < 0

        def urgency_color(d):
            if d < 0:
                return "#d97706"
            if d <= 1:
                return "#d97706"
            if d <= 5:
                return "#f59e0b"
            return "#64748b"

        def day_label(d):
            if d < 0:
                return f"{abs(d)}d overdue"
            if d == 0:
                return "Today"
            if d == 1:
                return "Tomorrow"
            return f"In {d}d"

        bills.append({
            "uid": f"onetime-{b.id}",
            "rawId": b.id,
            "source": "one_time",
            "name": b.name,
            "amount": float(b.amount or 0),
            "dueDate": due.isoformat(),
            "daysUntilDue": days_until,
            "isOverdue": is_overdue,
            "isSubscription": False,
            "frequency": None,
            "urgencyColor": urgency_color(days_until),
            "dayLabel": day_label(days_until),
        })

    # Bill insights (within 7 days or overdue)
    bill_insights = []
    for b in bills:
        d = b["daysUntilDue"]
        if d > 7 and d >= 0:
            continue

        if d < 0:
            urgency = "overdue"
        elif d <= THRESHOLD_NOTIFICATION:
            urgency = "urgent"
        elif d <= THRESHOLD_URGENT:
            urgency = "approaching"
        else:
            urgency = "ambient"

        # Message (No-Shame pattern)
        if d < 0:
            days_overdue = abs(d)
            message = f"{b['name']} was due {'yesterday' if days_overdue == 1 else f'{days_overdue} days ago'}"
        elif d == 0:
            message = f"{b['name']} is due today"
        elif d == 1:
            message = f"{b['name']} is due tomorrow"
        else:
            message = f"{b['name']} approaching ({d} days)"

        # Reasoning (Glass Box)
        if d < 0:
            reasoning = "This bill is past due. Showing to help you stay on track."
        elif d <= THRESHOLD_NOTIFICATION:
            reasoning = "Due within 24 hours. This is the most urgent timeframe for bill reminders."
        elif d <= THRESHOLD_URGENT:
            reasoning = f"Due within 48 hours. Gentle reminder to plan for this payment (${b['amount']:.2f})."
        elif d <= THRESHOLD_APPROACHING:
            reasoning = f"Coming up in {d} days. Showing as ambient awareness."
        else:
            reasoning = f"Due in {d} days. No action needed yet."

        # Suppression check
        insight_type = "bill_overdue" if urgency == "overdue" else "bill_due_soon"
        if should_suppress(db, insight_type):
            continue

        bill_insights.append({
            "bill": b,
            "source": b["source"],
            "daysUntilDue": d,
            "urgencyLevel": urgency,
            "message": message,
            "reasoning": reasoning,
            "shouldShow": True,
            "escalationLevel": "notification" if urgency in ("overdue", "urgent") else "passive",
        })

    # Sort by urgency
    urgency_order = {"overdue": 0, "urgent": 1, "approaching": 2, "ambient": 3}
    bill_insights.sort(key=lambda i: (urgency_order.get(i["urgencyLevel"], 9), i["daysUntilDue"]))

    # Budget pace insights
    budget_pace_insights = []
    try:
        from app.services.budget_engine import calculate_budget_status
        period_start = today.replace(day=1)
        status_obj = calculate_budget_status(db, period_start)
        budget_cats = [
            {"name": c.name, "budgeted": c.budgeted, "spent": c.spent, "pct_used": c.pct_used}
            for c in (status_obj.categories if status_obj else [])
        ]
        day_of_month = today.day
        days_in_month = (today.replace(month=today.month % 12 + 1, day=1) - timedelta(days=1)).day if today.month < 12 else 31
        month_progress = day_of_month / days_in_month

        for cat in budget_cats:
            budgeted = cat.get("budgeted", 0)
            if budgeted <= 0:
                continue
            pct_used = cat.get("pct_used", 0)
            spent = cat.get("spent", 0)
            if pct_used >= 100:
                budget_pace_insights.append({
                    "categoryName": cat["name"], "pctUsed": pct_used,
                    "budgeted": budgeted, "spent": spent, "level": "exceeded",
                    "message": f"{cat['name']} budget exceeded ({round(pct_used)}% used)",
                    "reasoning": f"You've spent ${spent:.0f} of your ${budgeted:.0f} {cat['name']} budget this month.",
                })
            elif pct_used > 80 and month_progress < 0.75:
                budget_pace_insights.append({
                    "categoryName": cat["name"], "pctUsed": pct_used,
                    "budgeted": budgeted, "spent": spent, "level": "warning",
                    "message": f"{cat['name']} spending ahead of pace ({round(pct_used)}%)",
                    "reasoning": f"{round(month_progress * 100)}% through the month but {round(pct_used)}% of {cat['name']} budget used. Consider slowing down.",
                })
        budget_pace_insights.sort(key=lambda i: (0 if i["level"] == "exceeded" else 1, -i["pctUsed"]))
    except Exception as e:
        log.warning("Budget intelligence failed: %s", e)

    # Aggregates
    upcoming_bills = [i for i in bill_insights if 0 <= i["daysUntilDue"] <= 7]
    overdue_count = sum(1 for b in bills if b["isOverdue"])

    # Raw data subsets
    by_date: dict[str, list] = {}
    for b in bills:
        key = b["dueDate"]
        if key not in by_date:
            by_date[key] = []
        by_date[key].append(b)

    overdue = [b for b in bills if b["isOverdue"]]
    upcoming7d = [b for b in bills if 0 <= b["daysUntilDue"] <= 7]
    upcoming14d = [b for b in bills if 0 <= b["daysUntilDue"] <= 14]
    upcoming30d = [b for b in bills if 0 <= b["daysUntilDue"] <= 30]

    return {
        "billInsights": bill_insights,
        "budgetPaceInsights": budget_pace_insights,
        "upcomingCount": len(upcoming_bills),
        "overdueCount": overdue_count,
        "totalUpcoming": sum(i["bill"]["amount"] for i in upcoming_bills),
        "confidence": confidence,
        "isLearning": confidence < 0.5,
        "all": bills,
        "byDate": by_date,
        "overdue": overdue,
        "upcoming7d": upcoming7d,
        "upcoming14d": upcoming14d,
        "upcoming30d": upcoming30d,
    }



# =============================================================================
# A4-5: INVENTORY INTELLIGENCE
# =============================================================================

def compute_inventory_intelligence(db: Session, week_start: str) -> dict:
    """
    Compute inventory intelligence: health, insights, aggregation.

    Replaces frontend useInventoryIntelligence hook computation.
    """
    confidence = _get_confidence(db)
    is_learning = confidence < 0.5
    today = date.today()
    today_str = today.isoformat()

    # Query inventory items
    items = db.query(InventoryItem).all()
    active_items = [i for i in items if (i.quantity or 0) > 0]

    # Expiring items (within 7 days)
    expiring = [
        i for i in active_items
        if i.expiration_date is not None
        and _days_until(i.expiration_date, today) <= 7
    ]

    # Low stock items (quantity <= 2)
    low_stock = [
        i for i in active_items
        if (i.quantity or 0) <= 2 and (i.quantity or 0) > 0
    ]

    # Location counts
    location_counts = {"pantry": 0, "fridge": 0, "freezer": 0}
    for item in active_items:
        loc = getattr(item, "location", None)
        if loc and loc in location_counts:
            location_counts[loc] += 1

    # Category breakdown
    cat_counts: dict[str, int] = {}
    for item in active_items:
        cat_name = "Uncategorized"
        if hasattr(item, "food_category") and item.food_category:
            cat_name = str(item.food_category).replace("_", " ").title()
        cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1
    category_breakdown = sorted(
        [{"name": k, "count": v} for k, v in cat_counts.items()],
        key=lambda x: -x["count"],
    )

    # Food group fills
    FOOD_GROUP_MAP = {
        "meat_poultry": "protein", "seafood": "protein", "deli": "protein", "frozen_meat": "protein",
        "dairy": "dairy", "eggs": "dairy", "ice_cream": "dairy",
        "dry_goods": "grains", "canned": "grains", "bread": "grains",
        "produce_leafy": "vegetables", "produce_root": "vegetables", "frozen_vegetables": "vegetables",
        "produce_fruit": "fruits",
    }
    group_counts = {"protein": 0, "dairy": 0, "grains": 0, "vegetables": 0, "fruits": 0}
    for item in active_items:
        fc = (getattr(item, "food_category", "") or "").lower()
        group = FOOD_GROUP_MAP.get(fc)
        if group:
            group_counts[group] += 1
    max_count = max(1, max(group_counts.values(), default=1))
    food_group_fills = {g: c / max_count for g, c in group_counts.items() if c > 0}

    # Expiring with days
    expiring_with_days = []
    for item in expiring:
        days_left = _days_until(item.expiration_date, today)
        expiring_with_days.append({
            "id": item.id,
            "name": item.name,
            "daysLeft": max(0, days_left),
            "quantity": item.quantity or 0,
            "unit": getattr(item, "unit", None),
        })

    # Health score
    health_score = max(0, min(100, 100 - len(expiring) * 10 - len(low_stock) * 5))
    if health_score >= 80:
        health_label = "Excellent"
        health_reasoning = "Inventory is well-maintained with no urgent items."
    elif health_score >= 60:
        health_label = "Good"
        health_reasoning = "A few items need attention soon."
    elif health_score >= 40:
        health_label = "Needs Attention"
        health_reasoning = "Several items expiring or running low."
    else:
        health_label = "Critical"
        health_reasoning = "Multiple items need immediate attention."

    # Insights
    insights = []
    if confidence >= 0.5:
        # Expiring
        for item in expiring[:3]:
            days = _days_until(item.expiration_date, today)
            is_urgent = days <= 2
            if not should_suppress(db, "expiring_soon"):
                insights.append({
                    "type": "expiring_soon",
                    "itemId": item.id,
                    "itemName": item.name,
                    "message": f"Use {item.name} soon" if is_urgent else f"{item.name} expires in {days} days",
                    "reasoning": f"{item.quantity or 0} {getattr(item, 'unit', 'units') or 'units'} available. Consider using in a meal this week.",
                    "confidence": confidence,
                    "priority": 1 if is_urgent else (2 if days <= 4 else 3),
                    "daysUntilAction": days,
                    "suggestedAction": "Plan a meal using this ingredient",
                })

        # Low stock
        for item in low_stock[:2]:
            if not should_suppress(db, "low_stock"):
                insights.append({
                    "type": "low_stock",
                    "itemId": item.id,
                    "itemName": item.name,
                    "message": f"{item.name} is running low",
                    "reasoning": f"Only {item.quantity or 0} {getattr(item, 'unit', 'units') or 'units'} remaining.",
                    "confidence": confidence,
                    "priority": 3,
                    "suggestedAction": "Add to shopping list",
                })

    insights.sort(key=lambda x: x["priority"])
    insights = insights[:5]

    return {
        "insights": insights,
        "health": {"score": health_score, "label": health_label, "reasoning": health_reasoning},
        "expiringCount": len(expiring),
        "lowStockCount": len(low_stock),
        "leftoverCount": 0,  # Leftovers need separate query; keeping simple
        "confidence": confidence,
        "isLearning": is_learning,
        "totalQuantitySum": sum(i.quantity or 0 for i in active_items),
        "activeItemCount": len(active_items),
        "locationCounts": location_counts,
        "categoryBreakdown": category_breakdown,
        "expiringWithDays": expiring_with_days,
        "lowStockDisplay": [
            {"id": i.id, "name": i.name, "currentQty": i.quantity or 0}
            for i in low_stock if (i.quantity or 0) > 0
        ],
        "foodGroupFills": food_group_fills,
    }


def _days_until(exp_date, today: date) -> int:
    """Calculate days until an expiration date."""
    if isinstance(exp_date, str):
        exp = date.fromisoformat(exp_date)
    elif isinstance(exp_date, datetime):
        exp = exp_date.date()
    elif isinstance(exp_date, date):
        exp = exp_date
    else:
        return 999
    return (exp - today).days


# =============================================================================
# A4-7: MEAL INTELLIGENCE
# =============================================================================

def compute_meal_intelligence(db: Session, week_start: str) -> dict:
    """
    Compute meal intelligence: gaps, suggestions, coverage.

    Replaces frontend useMealIntelligence hook computation.
    """
    confidence = _get_confidence(db)
    is_learning = confidence < 0.5
    week_dates = [d.isoformat() for d in get_week_dates(week_start)]
    today_str = date.today().isoformat()

    # Query meals for the week
    start_date, end_date = get_week_range(week_start)
    meals = db.query(MealPlanEntry).filter(
        MealPlanEntry.date >= start_date.isoformat(),
        MealPlanEntry.date < end_date.isoformat(),
    ).all()

    # Get recipes for suggestions
    recipes = db.query(Recipe).all()

    # Recently cooked (for penalizing repetition)
    recently_cooked = set()
    for m in meals:
        if m.recipe_id and m.cooked_at:
            recently_cooked.add(m.recipe_id)

    # Compute gaps (meal slots without entries)
    meal_types = ["breakfast", "lunch", "dinner"]
    meals_by_date: dict[str, list] = {d: [] for d in week_dates}
    for m in meals:
        d = m.date if isinstance(m.date, str) else m.date.isoformat()
        if d in meals_by_date:
            meals_by_date[d].append({
                "meal_type": m.meal_type or "dinner",
                "description": m.description,
                "recipe_id": m.recipe_id,
            })

    gaps = []
    for d in week_dates:
        filled_types = {m["meal_type"].lower() for m in meals_by_date.get(d, [])}
        for mt in meal_types:
            if mt not in filled_types:
                gaps.append({"date": d, "meal_type": mt})

    # Suggestions for gaps (top 3 recipes per gap, max 5 gaps)
    suggestions = []
    if not is_learning and recipes:
        for gap in gaps[:5]:
            gap_date = date.fromisoformat(gap["date"])
            day_of_week = gap_date.weekday()  # 0=Monday
            # Convert to JS convention for consistency (0=Sunday)
            js_day = (day_of_week + 1) % 7

            scored = []
            for r in recipes:
                score, reason = _score_recipe(r, js_day, gap["meal_type"], recently_cooked)
                scored.append({
                    "recipeId": r.id,
                    "recipeName": r.name,
                    "score": score,
                    "reason": reason,
                })

            scored.sort(key=lambda x: -x["score"])
            top = scored[:3]

            reasoning = f"Suggesting recipes for {_day_name(gap['date'])} {gap['meal_type']}. "
            reasoning += "Still learning your preferences." if is_learning else "Based on your cooking patterns and schedule."

            suggestions.append({
                "date": gap["date"],
                "mealType": gap["meal_type"],
                "suggestedRecipes": top,
                "reasoning": reasoning,
                "confidence": confidence,
            })

    # Day fills for bezel arcs
    day_fills = []
    for d in week_dates:
        day_meals = meals_by_date.get(d, [])
        filled = {m["meal_type"].lower() for m in day_meals}
        day_fills.append({
            "date": d,
            "dayName": _day_name(d)[:3],
            "breakfast": "breakfast" in filled,
            "lunch": "lunch" in filled,
            "dinner": "dinner" in filled,
            "filledCount": len(filled),
        })

    total_slots = len(week_dates) * 3
    planned_count = len(meals)

    # Next gap from today
    next_gap = None
    for g in gaps:
        if g["date"] >= today_str:
            next_gap = g
            break

    return {
        "gaps": gaps,
        "suggestions": suggestions,
        "plannedCount": planned_count,
        "unplannedCount": len(gaps),
        "confidence": confidence,
        "isLearning": is_learning,
        "byDate": meals_by_date,
        "nextMealGap": next_gap,
        "coveragePct": planned_count / total_slots if total_slots > 0 else 0,
        "dayFills": day_fills,
    }


def _score_recipe(recipe, js_day_of_week: int, meal_type: str, recently_cooked: set) -> tuple[float, str]:
    """Score a recipe for a meal slot. Returns (score, reason)."""
    score = 0.5
    reason = "Available recipe"

    if recipe.id in recently_cooked:
        score -= 0.3
        reason = "Recently cooked"

    total_time = (recipe.prep_time_minutes or 0) + (recipe.cook_time_minutes or 0)
    is_weekday = 1 <= js_day_of_week <= 5
    is_weekend = js_day_of_week in (0, 6)

    if meal_type == "lunch" and is_weekday and total_time <= 30:
        score += 0.2
        reason = "Quick option for weekday lunch"

    if meal_type == "dinner" and is_weekend and total_time >= 45:
        score += 0.15
        reason = "Great for a leisurely weekend dinner"

    breakfast_keywords = ["egg", "pancake", "waffle", "oatmeal", "breakfast", "toast", "smoothie"]
    if meal_type == "breakfast":
        if any(kw in recipe.name.lower() for kw in breakfast_keywords):
            score += 0.2
            reason = "Breakfast favorite"

    return (max(0, min(1, score)), reason)


# =============================================================================
# A4-8: CROSS-FEATURE INTELLIGENCE
# =============================================================================

def compute_cross_feature_intelligence(db: Session, week_start: str) -> dict:
    """
    Compute cross-feature intelligence: patterns spanning events + meals + finance + property.

    Includes Bayesian Surprise spending anomaly detection with Welford's algorithm.
    Replaces frontend useCrossFeatureIntelligence hook computation.
    """
    confidence = _get_confidence(db)
    is_learning = confidence < 0.5

    # Get sub-intelligence (reuse already-built functions)
    event_intel = compute_event_intelligence(db, week_start)
    meal_intel = compute_meal_intelligence(db, week_start)
    finance_intel = compute_finance_intelligence(db, week_start)

    overloaded_days = event_intel["overloadedDays"]
    light_days = sum(1 for d in event_intel["dayInsights"] if d["status"] == "light")
    unplanned_meals = meal_intel["unplannedCount"]
    total_conflicts = event_intel["totalConflicts"]
    overdue_bills = finance_intel["overdueCount"]
    total_bills_due = finance_intel["totalUpcoming"]
    upcoming_bill_count = finance_intel["upcomingCount"]

    # Week character
    if overloaded_days >= 3:
        week_character = "overloaded"
    elif overloaded_days >= 2 or total_conflicts >= 2:
        week_character = "busy"
    elif light_days >= 5:
        week_character = "light"
    else:
        week_character = "balanced"

    insights = []
    if not is_learning:
        # 1. Busy week + unplanned meals
        if overloaded_days >= 2 and unplanned_meals >= 3:
            insights.append({
                "type": "busy_week_meals",
                "message": "Busy week ahead with unplanned meals",
                "reasoning": f"{overloaded_days} overloaded days detected. {unplanned_meals} meals still unplanned. Quick-prep options recommended.",
                "confidence": confidence,
                "affectedFeatures": ["events", "meals"],
                "suggestion": "Consider batch cooking or quick-prep recipes this week",
                "priority": 3,
            })

        # 2. End of month + bills
        today = date.today()
        days_in_month = (today.replace(month=today.month % 12 + 1, day=1) - timedelta(days=1)).day if today.month < 12 else 31
        is_end_of_month = today.day > days_in_month - 7
        if is_end_of_month and upcoming_bill_count >= 2 and total_bills_due >= 200:
            insights.append({
                "type": "end_of_month_budget",
                "message": "End of month with bills due",
                "reasoning": f"${total_bills_due:.0f} in bills due this week. Budget-friendly meal options may help.",
                "confidence": confidence,
                "affectedFeatures": ["finances", "meals"],
                "suggestion": "Consider budget-friendly recipes to balance end-of-month expenses",
                "priority": 3,
            })

        # 3. Light week opportunity
        if light_days >= 4 and total_conflicts == 0 and overdue_bills == 0:
            insights.append({
                "type": "light_week_opportunity",
                "message": "Light week - good time for planning",
                "reasoning": f"{light_days} light days with no conflicts. Great opportunity for meal prep or tackling deferred tasks.",
                "confidence": confidence,
                "affectedFeatures": ["events", "meals"],
                "suggestion": "Consider meal prepping or trying new recipes this week",
                "priority": 4,
            })

        # 4. Weekend prep
        saturday = next((d for d in event_intel["dayInsights"] if date.fromisoformat(d["date"]).weekday() == 5), None)
        sunday = next((d for d in event_intel["dayInsights"] if date.fromisoformat(d["date"]).weekday() == 6), None)
        sat_count = saturday["eventCount"] if saturday else 0
        sun_count = sunday["eventCount"] if sunday else 0
        if sat_count <= 1 and sun_count <= 1 and unplanned_meals >= 5:
            insights.append({
                "type": "weekend_prep",
                "message": "Light weekend for meal prep",
                "reasoning": f"Weekend looks free. {unplanned_meals} meals unplanned for the week.",
                "confidence": confidence,
                "affectedFeatures": ["events", "meals"],
                "suggestion": "Consider batch cooking this weekend",
                "priority": 4,
            })

        # 5. Routine disruption
        counts = sorted(d["eventCount"] for d in event_intel["dayInsights"])
        if len(counts) >= 5:
            median = counts[len(counts) // 2]
            disrupted = [d for d in event_intel["dayInsights"] if d["eventCount"] >= median + 3]
            if disrupted:
                day_names = [d["dayName"][:3] for d in disrupted]
                insights.append({
                    "type": "routine_disruption",
                    "message": f"{', '.join(day_names)} unusually packed",
                    "reasoning": f"{disrupted[0]['eventCount']} events vs typical {median}/day. Consider lighter meals or prep ahead.",
                    "confidence": confidence,
                    "affectedFeatures": ["events", "meals"],
                    "suggestion": "Plan quick meals or prep ahead for busy days",
                    "priority": 3,
                })

        # 6. Spending anomaly (Bayesian Surprise / Welford's algorithm)
        spending_model = _load_spending_model(db)
        if spending_model["count"] >= 3 and total_bills_due > 0:
            std_dev = spending_model["variance"] ** 0.5 if spending_model["variance"] > 0 else 0
            if std_dev > 0:
                z_score = abs(total_bills_due - spending_model["mean"]) / std_dev
                if z_score > 2:
                    direction = "above" if total_bills_due > spending_model["mean"] else "below"
                    insights.append({
                        "type": "spending_anomaly",
                        "message": f"Spending is {z_score:.1f}s {direction} your usual",
                        "reasoning": f"Your typical weekly spending is ${spending_model['mean']:.0f} +/- ${std_dev:.0f}. This week: ${total_bills_due:.0f}. (Based on {spending_model['count']} weeks of data)",
                        "confidence": confidence,
                        "affectedFeatures": ["finances", "meals"],
                        "suggestion": "Consider budget-friendly meals this week to balance spending" if direction == "above" else "Light spending week - good time to stock up on staples",
                        "priority": 1 if z_score > 3 else (2 if z_score > 2.5 else 3),
                    })

            # Update model with this week's data (Welford's)
            _update_spending_model(db, spending_model, total_bills_due, week_start)

        # 7. Property cross-domain (if property data exists)
        try:
            from app.services.pattern_detection.property_patterns import PropertyPatternDetector
            # Only check if property module exists
        except ImportError:
            pass

    insights.sort(key=lambda x: x["priority"])

    return {
        "insights": insights,
        "weekCharacter": week_character,
        "isLearning": is_learning,
        "isLoading": False,
    }


def _load_spending_model(db: Session) -> dict:
    """Load spending model from IntelligenceModel table."""
    try:
        from app.models.intelligence_model import IntelligenceModel
        model = db.query(IntelligenceModel).filter(
            IntelligenceModel.model_type == "spending"
        ).first()
        if model:
            return {"mean": model.mean, "variance": model.variance, "count": model.count}
    except Exception as e:
        log.warning("Spending model read failed: %s", e)
    return {"mean": 0, "variance": 0, "count": 0}


def _update_spending_model(db: Session, old_model: dict, new_value: float, week_start: str) -> None:
    """Update spending model using Welford's online algorithm."""
    try:
        from app.models.intelligence_model import IntelligenceModel

        # Check if already updated for this week
        model_row = db.query(IntelligenceModel).filter(
            IntelligenceModel.model_type == "spending"
        ).first()

        if model_row and model_row.extra_data and model_row.extra_data.get("last_week") == week_start:
            return  # Already updated for this week

        # Welford's algorithm
        new_count = old_model["count"] + 1
        delta = new_value - old_model["mean"]
        new_mean = old_model["mean"] + delta / new_count
        delta2 = new_value - new_mean
        new_variance = (
            0 if old_model["count"] == 0
            else (old_model["variance"] * old_model["count"] + delta * delta2) / new_count
        )

        if model_row:
            model_row.mean = new_mean
            model_row.variance = new_variance
            model_row.count = new_count
            model_row.extra_data = {"last_week": week_start}
        else:
            model_row = IntelligenceModel(
                model_type="spending",
                mean=new_mean,
                variance=new_variance,
                count=new_count,
                extra_data={"last_week": week_start},
            )
            db.add(model_row)

        db.commit()
    except Exception as e:
        log.warning("Spending model update failed: %s", e)
        db.rollback()

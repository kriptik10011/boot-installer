"""
Meal Drafter — Generates 21 meal suggestions for a week.

Strategy:
  1. Recurrence: What did the user cook in the past 4 weeks? Repeat frequent meals.
  2. Pantry match: What recipes use ingredients currently in inventory?
  3. Variety: Avoid suggesting the same recipe on consecutive days.

Confidence >= 0.4 required for all suggestions.
"""

from datetime import date, timedelta
from collections import Counter
from sqlalchemy.orm import Session

from app.utils.week_utils import get_week_range
from app.models.meal import MealPlanEntry
from app.models.recipe import Recipe
from app.models.inventory import InventoryItem
from app.models.recipe import RecipeIngredient


MEAL_TYPES = ["breakfast", "lunch", "dinner"]
MIN_CONFIDENCE = 0.4
LOOKBACK_WEEKS = 4


def draft_week_meals(db: Session, week_start: str) -> list[dict]:
    """
    Generate 21 meal suggestions (7 days x 3 meal types).

    Returns list of dicts with: date, meal_type, recipe_id, recipe_name,
    confidence, reason.
    """
    start = date.fromisoformat(week_start)
    lookback_start = start - timedelta(weeks=LOOKBACK_WEEKS)

    # 1. Gather historical meal data
    past_meals = (
        db.query(MealPlanEntry)
        .filter(
            MealPlanEntry.date >= lookback_start,
            MealPlanEntry.date < start,
            MealPlanEntry.recipe_id.isnot(None),
        )
        .all()
    )

    # Count recipe usage per meal type
    recipe_freq: dict[str, Counter] = {mt: Counter() for mt in MEAL_TYPES}
    for meal in past_meals:
        recipe_freq[meal.meal_type.value if hasattr(meal.meal_type, 'value') else meal.meal_type][meal.recipe_id] += 1

    # 2. Get all recipes
    all_recipes = db.query(Recipe).all()
    recipe_map = {r.id: r for r in all_recipes}

    # 3. Get current inventory for pantry matching
    inventory_items = db.query(InventoryItem).filter(InventoryItem.quantity > 0).all()
    pantry_ingredient_ids = {item.ingredient_id for item in inventory_items if item.ingredient_id}

    # 4. Score recipes by pantry match
    # Batch-load all recipe ingredients to avoid N+1 queries
    all_recipe_ids = [r.id for r in all_recipes]
    all_recipe_ingredients = (
        db.query(RecipeIngredient)
        .filter(RecipeIngredient.recipe_id.in_(all_recipe_ids))
        .all()
    ) if all_recipe_ids else []

    recipe_ingredients_by_recipe: dict[int, list] = {}
    for ri in all_recipe_ingredients:
        if ri.recipe_id not in recipe_ingredients_by_recipe:
            recipe_ingredients_by_recipe[ri.recipe_id] = []
        recipe_ingredients_by_recipe[ri.recipe_id].append(ri)

    pantry_scores: dict[int, float] = {}
    for recipe in all_recipes:
        ingredients = recipe_ingredients_by_recipe.get(recipe.id, [])
        if not ingredients:
            pantry_scores[recipe.id] = 0.0
            continue

        matched = sum(1 for ing in ingredients if ing.ingredient_id in pantry_ingredient_ids)
        pantry_scores[recipe.id] = matched / len(ingredients)

    # 5. Check existing meals for this week (skip occupied slots)
    existing_meals = (
        db.query(MealPlanEntry)
        .filter(
            MealPlanEntry.date >= start,
            MealPlanEntry.date < get_week_range(start)[1],
        )
        .all()
    )
    occupied = {(str(m.date), m.meal_type.value if hasattr(m.meal_type, 'value') else m.meal_type) for m in existing_meals}

    # 6. Generate suggestions
    suggestions = []
    used_today: dict[str, set] = {}  # date -> set of recipe_ids (variety guard)

    for day_offset in range(7):
        day = start + timedelta(days=day_offset)
        day_str = day.isoformat()
        used_today[day_str] = set()

        for meal_type in MEAL_TYPES:
            if (day_str, meal_type) in occupied:
                continue

            # Score each recipe
            candidates = []
            freq_counter = recipe_freq.get(meal_type, Counter())

            for recipe in all_recipes:
                # Recurrence score (0-0.5)
                freq = freq_counter.get(recipe.id, 0)
                max_freq = max(freq_counter.values()) if freq_counter else 1
                recurrence_score = 0.5 * (freq / max(max_freq, 1))

                # Pantry score (0-0.3)
                pantry_score = 0.3 * pantry_scores.get(recipe.id, 0)

                # Variety penalty (-0.2 if used today)
                variety_penalty = -0.2 if recipe.id in used_today.get(day_str, set()) else 0

                # Base score (0.2 for any valid recipe)
                total = 0.2 + recurrence_score + pantry_score + variety_penalty

                if total >= MIN_CONFIDENCE:
                    reason_parts = []
                    if freq > 0:
                        reason_parts.append(f"cooked {freq}x in past {LOOKBACK_WEEKS} weeks")
                    if pantry_scores.get(recipe.id, 0) > 0:
                        pct = int(pantry_scores[recipe.id] * 100)
                        reason_parts.append(f"{pct}% ingredients in pantry")

                    candidates.append({
                        "recipe_id": recipe.id,
                        "recipe_name": recipe.name,
                        "confidence": round(min(total, 1.0), 2),
                        "reason": "; ".join(reason_parts) if reason_parts else "available recipe",
                    })

            # Pick best candidate
            candidates.sort(key=lambda c: c["confidence"], reverse=True)
            if candidates:
                best = candidates[0]
                used_today[day_str].add(best["recipe_id"])
                suggestions.append({
                    "date": day_str,
                    "meal_type": meal_type,
                    **best,
                })

    return suggestions

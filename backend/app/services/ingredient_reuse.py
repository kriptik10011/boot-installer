"""
Smart Ingredient Reuse Service.

Suggests recipes that share ingredients with already-planned meals
to minimize waste and reduce shopping list size.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List

from sqlalchemy.orm import Session

from app.utils.week_utils import get_week_range
from app.models.meal import MealPlanEntry
from app.models.recipe import Recipe, RecipeIngredient, Ingredient


@dataclass
class IngredientOverlap:
    ingredient_id: int
    ingredient_name: str
    shared_with_recipes: List[str]


@dataclass
class ReuseSuggestion:
    recipe_id: int
    recipe_name: str
    overlap_count: int
    total_ingredients: int
    overlap_pct: float
    shared_ingredients: List[IngredientOverlap] = field(default_factory=list)
    unique_ingredients: int = 0


def suggest_ingredient_reuse(
    db: Session,
    week_start: str,
    limit: int = 10,
) -> List[ReuseSuggestion]:
    """
    Suggest recipes that reuse ingredients already planned for the week.

    1. Find all planned meals for the week
    2. Collect their ingredient_ids
    3. Find unplanned recipes that share the most ingredients
    4. Return ranked by overlap percentage
    """
    start, end = get_week_range(week_start)

    # Get planned meals for the week
    planned_meals = db.query(MealPlanEntry).filter(
        MealPlanEntry.date >= start,
        MealPlanEntry.date < end,
        MealPlanEntry.recipe_id != None,
    ).all()

    if not planned_meals:
        return []

    # Collect ingredient_ids from planned recipes
    planned_recipe_ids = {m.recipe_id for m in planned_meals if m.recipe_id}

    # Batch-load planned recipes
    planned_recipes = db.query(Recipe).filter(
        Recipe.id.in_(planned_recipe_ids)
    ).all() if planned_recipe_ids else []
    planned_recipes_by_id = {r.id: r for r in planned_recipes}

    # Batch-load recipe ingredients for planned recipes
    planned_ris = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id.in_(planned_recipe_ids)
    ).all() if planned_recipe_ids else []

    planned_ingredient_ids: set[int] = set()
    ingredient_to_recipes: dict[int, list[str]] = {}
    for ri in planned_ris:
        if ri.ingredient_id:
            planned_ingredient_ids.add(ri.ingredient_id)
            recipe = planned_recipes_by_id.get(ri.recipe_id)
            recipe_name = recipe.name if recipe else "unknown"
            ingredient_to_recipes.setdefault(ri.ingredient_id, []).append(recipe_name)

    if not planned_ingredient_ids:
        return []

    # Find unplanned recipes
    all_recipes = db.query(Recipe).filter(
        Recipe.id.notin_(planned_recipe_ids),
    ).all()
    unplanned_ids = [r.id for r in all_recipes]
    unplanned_by_id = {r.id: r for r in all_recipes}

    # Batch-load ALL recipe ingredients for unplanned recipes
    all_unplanned_ris = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id.in_(unplanned_ids)
    ).all() if unplanned_ids else []

    ris_by_recipe: dict[int, list] = {}
    all_ingredient_ids: set[int] = set()
    for ri in all_unplanned_ris:
        ris_by_recipe.setdefault(ri.recipe_id, []).append(ri)
        if ri.ingredient_id:
            all_ingredient_ids.add(ri.ingredient_id)

    # Batch-load all ingredient names
    all_ingredients = db.query(Ingredient).filter(
        Ingredient.id.in_(all_ingredient_ids | planned_ingredient_ids)
    ).all() if (all_ingredient_ids | planned_ingredient_ids) else []
    ingredients_by_id = {ing.id: ing for ing in all_ingredients}

    suggestions: List[ReuseSuggestion] = []
    for recipe in all_recipes:
        ris = ris_by_recipe.get(recipe.id, [])
        if not ris:
            continue

        total = len(ris)
        shared: List[IngredientOverlap] = []

        for ri in ris:
            if ri.ingredient_id and ri.ingredient_id in planned_ingredient_ids:
                ing = ingredients_by_id.get(ri.ingredient_id)
                name = ing.canonical_name if ing else "unknown"
                shared.append(IngredientOverlap(
                    ingredient_id=ri.ingredient_id,
                    ingredient_name=name,
                    shared_with_recipes=ingredient_to_recipes.get(ri.ingredient_id, []),
                ))

        if not shared:
            continue

        overlap_pct = len(shared) / total * 100 if total > 0 else 0

        suggestions.append(ReuseSuggestion(
            recipe_id=recipe.id,
            recipe_name=recipe.name,
            overlap_count=len(shared),
            total_ingredients=total,
            overlap_pct=round(overlap_pct, 1),
            shared_ingredients=shared,
            unique_ingredients=total - len(shared),
        ))

    # Sort by overlap count desc, then overlap_pct desc
    suggestions.sort(key=lambda s: (-s.overlap_count, -s.overlap_pct))

    return suggestions[:limit]

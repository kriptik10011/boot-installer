"""
Pantry-First Meal Suggestions Service.

"What can I cook with what I have?"

Compares recipe ingredients against current inventory,
scores by ingredient match percentage, returns ranked list.
"""

from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.recipe import Recipe, RecipeIngredient
from app.models.inventory import InventoryItem
from app.models.recipe import Ingredient


@dataclass
class IngredientMatch:
    ingredient_id: int
    ingredient_name: str
    in_stock: bool
    stock_note: Optional[str] = None


@dataclass
class PantrySuggestion:
    recipe_id: int
    recipe_name: str
    total_ingredients: int
    matching_ingredients: int
    missing_ingredients: int
    match_pct: float
    matches: List[IngredientMatch] = field(default_factory=list)
    missing: List[IngredientMatch] = field(default_factory=list)


def suggest_from_pantry(
    db: Session,
    min_match_pct: float = 0.0,
    limit: int = 20,
) -> List[PantrySuggestion]:
    """
    Suggest recipes based on current inventory.

    Scoring: match_pct = matching_ingredients / total_ingredients * 100
    Recipes sorted by match percentage descending.

    Args:
        db: Database session
        min_match_pct: Minimum match percentage to include (0-100)
        limit: Maximum results to return
    """
    # Get all inventory ingredient_ids that have stock
    inventory_items = db.query(InventoryItem).filter(
        InventoryItem.ingredient_id != None,
    ).all()

    # Build set of ingredient_ids in stock
    # For COUNT mode: quantity > 0; for PERCENTAGE mode: percent_full > 0
    stocked_ids: set[int] = set()
    stock_notes: dict[int, str] = {}
    for item in inventory_items:
        has_stock = False
        if item.percent_full is not None and item.percent_full > 0:
            # Percentage-tracked item
            has_stock = item.percent_full > 10
            if has_stock:
                stock_notes[item.ingredient_id] = f"{item.percent_full}% remaining"
        else:
            has_stock = (item.quantity or 0) > 0
            if has_stock:
                qty_str = f"{item.quantity:.1f}" if item.quantity != int(item.quantity) else str(int(item.quantity))
                stock_notes[item.ingredient_id] = f"{qty_str} {item.unit or 'units'} in stock"

        if has_stock and item.ingredient_id:
            stocked_ids.add(item.ingredient_id)

    if not stocked_ids:
        return []

    # Get all recipes
    recipes = db.query(Recipe).all()
    recipe_ids = [r.id for r in recipes]

    # Batch-load ALL recipe ingredients
    all_recipe_ingredients = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id.in_(recipe_ids)
    ).all() if recipe_ids else []

    ris_by_recipe: dict[int, list] = {}
    all_ingredient_ids: set[int] = set()
    for ri in all_recipe_ingredients:
        ris_by_recipe.setdefault(ri.recipe_id, []).append(ri)
        if ri.ingredient_id:
            all_ingredient_ids.add(ri.ingredient_id)

    # Batch-load ALL ingredient names
    all_ingredients = db.query(Ingredient).filter(
        Ingredient.id.in_(all_ingredient_ids)
    ).all() if all_ingredient_ids else []
    ingredients_by_id = {ing.id: ing for ing in all_ingredients}

    suggestions: List[PantrySuggestion] = []
    for recipe in recipes:
        recipe_ingredients = ris_by_recipe.get(recipe.id, [])

        if not recipe_ingredients:
            continue

        total = len(recipe_ingredients)
        matches: List[IngredientMatch] = []
        missing: List[IngredientMatch] = []

        for ri in recipe_ingredients:
            if not ri.ingredient_id:
                # No ingredient link — count as missing
                missing.append(IngredientMatch(
                    ingredient_id=0,
                    ingredient_name="unknown",
                    in_stock=False,
                ))
                continue

            ing = ingredients_by_id.get(ri.ingredient_id)
            name = ing.canonical_name if ing else "unknown"

            if ri.ingredient_id in stocked_ids:
                matches.append(IngredientMatch(
                    ingredient_id=ri.ingredient_id,
                    ingredient_name=name,
                    in_stock=True,
                    stock_note=stock_notes.get(ri.ingredient_id),
                ))
            else:
                missing.append(IngredientMatch(
                    ingredient_id=ri.ingredient_id,
                    ingredient_name=name,
                    in_stock=False,
                ))

        match_pct = len(matches) / total * 100 if total > 0 else 0

        if match_pct >= min_match_pct and len(matches) > 0:
            suggestions.append(PantrySuggestion(
                recipe_id=recipe.id,
                recipe_name=recipe.name,
                total_ingredients=total,
                matching_ingredients=len(matches),
                missing_ingredients=len(missing),
                match_pct=round(match_pct, 1),
                matches=matches,
                missing=missing,
            ))

    # Sort by match percentage descending, then by fewer missing ingredients
    suggestions.sort(key=lambda s: (-s.match_pct, s.missing_ingredients))

    return suggestions[:limit]

"""
Preview Inventory Check — check parsed ingredient names against inventory.

Read-only: does NOT create Ingredient records.
Used by the URL import preview flow to show coverage before saving.
"""

from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem
from app.models.recipe import Ingredient
from app.services.ingredient_service import find_ingredient_readonly
from app.services.expiration_defaults import detect_food_category


@dataclass
class PreviewIngredientStatus:
    name: str
    in_stock: bool
    stock_note: Optional[str] = None
    food_category: Optional[str] = None
    alternatives: List[str] = field(default_factory=list)


@dataclass
class PreviewCoverageResult:
    coverage_pct: float
    total_ingredients: int
    in_stock_count: int
    missing_count: int
    ingredients: List[PreviewIngredientStatus]


def check_preview_coverage(
    db: Session,
    ingredient_names: List[str],
) -> PreviewCoverageResult:
    """
    Check a list of ingredient names against current inventory.

    For each name:
    1. Resolve to Ingredient via read-only lookup (no creation)
    2. Check InventoryItem stock status
    3. For missing items, suggest up to 3 alternatives from same food_category

    Returns coverage percentage and per-ingredient status.
    """
    if not ingredient_names:
        return PreviewCoverageResult(
            coverage_pct=0.0,
            total_ingredients=0,
            in_stock_count=0,
            missing_count=0,
            ingredients=[],
        )

    # Build inventory lookup: ingredient_id → stock info
    inventory_items = db.query(InventoryItem).filter(
        InventoryItem.ingredient_id != None,
    ).all()

    stocked_ids: set[int] = set()
    stock_notes: dict[int, str] = {}

    for item in inventory_items:
        if not item.ingredient_id:
            continue
        has_stock = False
        if item.percent_full is not None and item.percent_full > 0:
            has_stock = item.percent_full > 10
            if has_stock:
                stock_notes[item.ingredient_id] = f"{item.percent_full}% remaining"
        else:
            has_stock = (item.quantity or 0) > 0
            if has_stock:
                qty = item.quantity
                qty_str = f"{qty:.1f}" if qty != int(qty) else str(int(qty))
                stock_notes[item.ingredient_id] = f"{qty_str} {item.unit or 'units'} in stock"

        if has_stock:
            stocked_ids.add(item.ingredient_id)

    # Batch-load all stocked ingredients to avoid N+1 queries
    stocked_ingredient_ids = [item.ingredient_id for item in inventory_items if item.ingredient_id in stocked_ids]
    stocked_ingredients = db.query(Ingredient).filter(
        Ingredient.id.in_(stocked_ingredient_ids),
    ).all() if stocked_ingredient_ids else []
    stocked_ingredients_by_id = {ing.id: ing for ing in stocked_ingredients}

    # Build stocked food_category → ingredient names map for alternatives
    stocked_by_category: dict[str, list[str]] = {}
    for item in inventory_items:
        if item.ingredient_id not in stocked_ids:
            continue
        ing = stocked_ingredients_by_id.get(item.ingredient_id)
        if ing and ing.food_category:
            cat = ing.food_category
            if cat not in stocked_by_category:
                stocked_by_category[cat] = []
            name = ing.canonical_name or ing.name
            if name not in stocked_by_category[cat]:
                stocked_by_category[cat].append(name)

    # Check each ingredient
    results: List[PreviewIngredientStatus] = []
    in_stock_count = 0

    for raw_name in ingredient_names:
        name = raw_name.strip()
        if not name:
            continue

        ingredient = find_ingredient_readonly(db, name)

        if ingredient and ingredient.id in stocked_ids:
            # In stock
            in_stock_count += 1
            results.append(PreviewIngredientStatus(
                name=name,
                in_stock=True,
                stock_note=stock_notes.get(ingredient.id),
                food_category=ingredient.food_category,
            ))
        else:
            # Missing — find alternatives from same food_category
            food_cat = None
            if ingredient:
                food_cat = ingredient.food_category
            if not food_cat:
                food_cat = detect_food_category(name).value

            alternatives: List[str] = []
            if food_cat and food_cat in stocked_by_category:
                # Get up to 3 alternatives, excluding the ingredient itself
                exclude = (ingredient.canonical_name or name.lower()) if ingredient else name.lower()
                for alt in stocked_by_category[food_cat]:
                    if alt.lower() != exclude.lower():
                        alternatives.append(alt)
                    if len(alternatives) >= 3:
                        break

            results.append(PreviewIngredientStatus(
                name=name,
                in_stock=False,
                food_category=food_cat,
                alternatives=alternatives,
            ))

    total = len(results)
    coverage_pct = (in_stock_count / total * 100) if total > 0 else 0.0

    return PreviewCoverageResult(
        coverage_pct=round(coverage_pct, 1),
        total_ingredients=total,
        in_stock_count=in_stock_count,
        missing_count=total - in_stock_count,
        ingredients=results,
    )

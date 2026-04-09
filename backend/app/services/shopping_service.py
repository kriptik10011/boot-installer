"""
Shopping List Service — Business logic extracted from shopping_list router.

Handles:
- Shopping list generation from meal plans (ingredient consolidation, inventory checks)
- Shopping trip completion (inventory transfer with unit conversion)
- Smart shopping suggestions (purchase history)
- Package data enrichment
"""

import logging
import re
from datetime import date, datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import (
    ShoppingListItem, MealPlanEntry, Recipe, RecipeIngredient, Ingredient,
    InventoryItem, InventoryCategory,
    IngredientCategory, generate_canonical_name, infer_category_from_name
)
from app.utils.week_utils import get_week_range
from app.services.parsing.quantity_parser import (
    parse_quantity, normalize_unit, extract_effective_shopping_quantity,
    classify_unit_type,
)
from app.services.parsing.quantity_consolidator import (
    ConsolidatedItem,
    check_inventory_coverage,
    convert_same_type,
)
from app.services.package_converter import (
    cooking_to_packages,
    find_conversion,
    record_purchase,
)
from app.services.expiration_defaults import (
    get_default_expiration,
    detect_food_category,
    FoodCategory,
)
from app.services.inventory_unit_recommender import (
    clean_display_name,
    is_section_header,
    recommend_purchase_unit,
)
from app.models.inventory import StorageLocation

logger = logging.getLogger("weekly_review")

# Household staples that should never appear on a shopping list.
_HOUSEHOLD_SKIP_INGREDIENTS = {
    'water', 'ice', 'ice water', 'tap water', 'cold water', 'warm water',
    'hot water', 'boiling water', 'lukewarm water', 'filtered water',
    'ice cube', 'ice cubes',
}

# Map IngredientCategory enum -> shopping list display category
_CATEGORY_MAP = {
    IngredientCategory.LIQUID: "Condiments",
    IngredientCategory.PRODUCE: "Produce",
    IngredientCategory.PROTEIN: "Meat & Seafood",
    IngredientCategory.DAIRY: "Dairy",
    IngredientCategory.SOLID: "Pantry",
    IngredientCategory.SPICE: "Pantry",
    IngredientCategory.OTHER: "Other",
}


# =============================================================================
# Helper Functions
# =============================================================================

def infer_storage_location(food_category: FoodCategory) -> StorageLocation:
    """Infer default storage location from food category."""
    FRIDGE_CATEGORIES = {
        FoodCategory.DAIRY, FoodCategory.MEAT_POULTRY, FoodCategory.SEAFOOD,
        FoodCategory.EGGS, FoodCategory.PRODUCE_LEAFY, FoodCategory.PRODUCE_FRUIT,
        FoodCategory.PRODUCE_ROOT, FoodCategory.DELI, FoodCategory.LEFTOVERS,
    }
    FREEZER_CATEGORIES = {
        FoodCategory.FROZEN_MEAT, FoodCategory.FROZEN_VEGETABLES,
        FoodCategory.FROZEN_MEALS, FoodCategory.ICE_CREAM,
    }
    if food_category in FRIDGE_CATEGORIES:
        return StorageLocation.FRIDGE
    if food_category in FREEZER_CATEGORIES:
        return StorageLocation.FREEZER
    return StorageLocation.PANTRY


def categorize_ingredient(name: str) -> str:
    """Infer shopping list category from ingredient name."""
    category = infer_category_from_name(name)
    return _CATEGORY_MAP.get(category, "Other")


def enrich_with_package_data(items: list, db: Session) -> List[dict]:
    """
    Enrich shopping list items with package conversion data.

    For each item with a known ingredient, attempts to find a PackageConversion
    and compute package_display, package_detail, etc.

    Returns list of dicts suitable for ShoppingListItemResponse.
    Falls back gracefully: items without conversions get None package fields.
    """
    result = []
    for item in items:
        item_dict = {
            "id": item.id,
            "name": item.name,
            "quantity": item.quantity,
            "category": item.category,
            "is_checked": item.is_checked,
            "source_recipe_id": item.source_recipe_id,
            "week_start": item.week_start,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "ingredient_id": item.ingredient_id,
            "quantity_amount": item.quantity_amount,
            "quantity_unit": item.quantity_unit,
            "package_display": None,
            "package_detail": None,
            "package_size": None,
            "package_unit": None,
            "package_type": None,
            "packages_needed": None,
        }

        if item.quantity_amount and item.quantity_amount > 0 and item.quantity_unit:
            pkg = cooking_to_packages(
                db, item.quantity_amount, item.quantity_unit, item.name
            )
            if pkg:
                unit_display = item.quantity_unit or ""
                amt = item.quantity_amount
                if amt == int(amt):
                    detail = f"{int(amt)} {unit_display} needed".strip()
                else:
                    detail = f"{amt:.2g} {unit_display} needed".strip()

                item_dict["package_display"] = (
                    f"{pkg.packages_needed} {pkg.package_type}"
                    if pkg.packages_needed == 1
                    else f"{pkg.packages_needed} {pkg.package_type}s"
                )
                item_dict["package_detail"] = detail
                item_dict["package_size"] = pkg.package_size
                item_dict["package_unit"] = pkg.package_unit
                item_dict["package_type"] = pkg.package_type
                item_dict["packages_needed"] = pkg.packages_needed

        result.append(item_dict)
    return result


# =============================================================================
# Generate Shopping List
# =============================================================================

def generate_shopping_list(db: Session, week_start: date) -> dict:
    """
    Generate shopping list from meal plan for the specified week.

    Unified ingredient architecture:
    - Uses ingredient_id FK joins instead of ILIKE string matching
    - Smart thresholds via needs_restock() using Reference Class Forecasting
    - find_or_create_ingredient for consistent ingredient linking

    Idempotent: clears previously auto-generated items (source_recipe_id != NULL)
    before regenerating, so serving-size changes are reflected immediately.
    Manually-added items (source_recipe_id IS NULL) are preserved.

    Returns dict with items_created and recipes_processed counts.
    """
    # Clear previously auto-generated items so regeneration reflects current servings
    # Preserve checked items (user already purchased them)
    db.query(ShoppingListItem).filter(
        ShoppingListItem.week_start == week_start,
        ShoppingListItem.source_recipe_id.isnot(None),
        ShoppingListItem.is_checked == False  # noqa: E712
    ).delete(synchronize_session=False)

    _, week_end = get_week_range(week_start)

    # Get all meal plans for the week that have recipes
    meal_plans = db.query(MealPlanEntry).filter(
        MealPlanEntry.date >= week_start,
        MealPlanEntry.date < week_end,
        MealPlanEntry.recipe_id.isnot(None),
        MealPlanEntry.cooked_at.is_(None),
        MealPlanEntry.inventory_depleted.is_(False),
    ).all()

    # Get unique recipe IDs and create a mapping of recipe_id -> list of meal_plans
    recipe_meal_plans: dict[int, list] = {}
    for mp in meal_plans:
        if mp.recipe_id:
            if mp.recipe_id not in recipe_meal_plans:
                recipe_meal_plans[mp.recipe_id] = []
            recipe_meal_plans[mp.recipe_id].append(mp)

    recipe_ids = list(recipe_meal_plans.keys())
    recipes = db.query(Recipe).filter(Recipe.id.in_(recipe_ids)).all() if recipe_ids else []
    recipes_by_id = {r.id: r for r in recipes}

    items_created = 0
    recipes_processed = len(recipes)

    # Track ingredients to consolidate duplicates - keyed by ingredient_id
    ingredient_map: dict[int, dict] = {}

    # Batch load all recipe ingredients and ingredients to avoid N+1 queries
    all_recipe_ingredients = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id.in_(recipe_ids)
    ).all() if recipe_ids else []

    recipe_ingredients_by_recipe: dict[int, list] = {}
    ingredient_ids_needed = set()
    for ri in all_recipe_ingredients:
        if ri.recipe_id not in recipe_ingredients_by_recipe:
            recipe_ingredients_by_recipe[ri.recipe_id] = []
        recipe_ingredients_by_recipe[ri.recipe_id].append(ri)
        if ri.ingredient_id:
            ingredient_ids_needed.add(ri.ingredient_id)

    ingredients_list = db.query(Ingredient).filter(
        Ingredient.id.in_(ingredient_ids_needed)
    ).all() if ingredient_ids_needed else []
    ingredients_by_id = {ing.id: ing for ing in ingredients_list}

    for recipe_id, mps in recipe_meal_plans.items():
        recipe = recipes_by_id.get(recipe_id)
        if not recipe:
            continue

        recipe_ingredients = recipe_ingredients_by_recipe.get(recipe.id, [])

        default_servings = recipe.servings or 4
        total_scale_factor = 0.0
        for mp in mps:
            planned = mp.planned_servings or default_servings
            total_scale_factor += planned / default_servings

        for ri in recipe_ingredients:
            ingredient = ingredients_by_id.get(ri.ingredient_id)
            if not ingredient:
                # Log warning when ingredient lookup fails (stale reference to a deleted ingredient)
                logger.warning(
                    "Ingredient id=%s referenced by RecipeIngredient (recipe_id=%s) not found — "
                    "item silently omitted from shopping list",
                    ri.ingredient_id, recipe_id,
                )
                continue

            if not ingredient.canonical_name:
                ingredient.canonical_name = generate_canonical_name(ingredient.name)
                ingredient.category = infer_category_from_name(ingredient.name)

            ingredient_name = ingredient.name.strip()
            ingredient_id = ingredient.id

            canonical = (ingredient.canonical_name or ingredient_name).lower()
            if canonical in _HOUSEHOLD_SKIP_INGREDIENTS:
                continue

            # Parse and scale quantity
            quantity_str = None
            quantity_amount = None
            quantity_unit = None
            if ri.quantity:
                try:
                    parsed = parse_quantity(ri.quantity)
                    scaled_amount = parsed.amount * total_scale_factor
                    unit = ri.unit or parsed.unit or ""
                    quantity_amount = scaled_amount
                    quantity_unit = unit if unit else None
                    if scaled_amount == int(scaled_amount):
                        quantity_str = f"{int(scaled_amount)} {unit}".strip()
                    else:
                        quantity_str = f"{scaled_amount:.2f} {unit}".strip().rstrip('0').rstrip('.')
                except (ValueError, AttributeError):
                    quantity_str = f"{ri.quantity} {ri.unit or ''}".strip() if ri.quantity else None
            elif ri.unit:
                quantity_str = ri.unit

            # Fallback: extract effective shopping quantity from parenthetical notes
            if not quantity_unit and ri.notes and quantity_amount:
                effective = extract_effective_shopping_quantity(
                    quantity_amount, quantity_unit, ri.notes
                )
                if effective:
                    quantity_amount, quantity_unit = effective
                    unit = quantity_unit
                    if quantity_amount == int(quantity_amount):
                        quantity_str = f"{int(quantity_amount)} {unit}".strip()
                    else:
                        quantity_str = f"{quantity_amount:.2f} {unit}".strip().rstrip('0').rstrip('.')

            # Consolidate if same ingredient exists (by ingredient_id, not string)
            if ingredient_id in ingredient_map:
                existing = ingredient_map[ingredient_id]
                _consolidate_quantity(existing, quantity_amount, quantity_unit, quantity_str, recipe.id)
            else:
                ingredient_map[ingredient_id] = {
                    "ingredient_id": ingredient_id,
                    "ingredient": ingredient,
                    "name": ingredient_name,
                    "quantity": quantity_str,
                    "quantity_amount": quantity_amount,
                    "quantity_unit": quantity_unit,
                    "category": categorize_ingredient(ingredient_name),
                    "source_recipe_ids": [recipe.id],
                }

    # Get ingredient_ids of checked items that were preserved during regeneration
    preserved_ingredient_ids = {
        item.ingredient_id
        for item in db.query(ShoppingListItem).filter(
            ShoppingListItem.week_start == week_start,
            ShoppingListItem.is_checked == True,  # noqa: E712
            ShoppingListItem.ingredient_id.isnot(None),
        ).all()
    }

    # Create shopping list items for each unique ingredient
    for ingredient_id, data in ingredient_map.items():
        # Skip if a checked (purchased) item already exists for this ingredient
        if ingredient_id in preserved_ingredient_ids:
            continue

        if _should_skip_ingredient(db, week_start, ingredient_id, data):
            continue

        db_item = ShoppingListItem(
            ingredient_id=ingredient_id,
            name=data["name"],
            quantity=data["quantity"],
            quantity_amount=data.get("quantity_amount"),
            quantity_unit=data.get("quantity_unit"),
            category=data["category"],
            is_checked=False,
            # source_recipe_id stores only the first contributing recipe — the column is a
            # single Integer FK. The inventory_depleted flag is the primary idempotency guard.
            source_recipe_id=data["source_recipe_ids"][0] if data["source_recipe_ids"] else None,
            week_start=week_start,
        )
        db.add(db_item)
        items_created += 1

    db.commit()

    return {
        "items_created": items_created,
        "recipes_processed": recipes_processed,
    }


def _consolidate_quantity(
    existing: dict,
    quantity_amount: Optional[float],
    quantity_unit: Optional[str],
    quantity_str: Optional[str],
    recipe_id: int,
) -> None:
    """Consolidate a new ingredient quantity into an existing accumulator."""
    if quantity_amount and existing.get("quantity_amount"):
        existing_unit_norm = normalize_unit(existing.get("quantity_unit") or "")
        new_unit_norm = normalize_unit(quantity_unit or "")

        # Explicit null-unit handling
        existing_is_null = not existing.get("quantity_unit") or not existing_unit_norm
        new_is_null = not quantity_unit or not new_unit_norm

        if existing_is_null and new_is_null:
            logger.warning(
                "Consolidating unitless quantities: %s + %s for '%s' (ambiguous units)",
                existing.get("quantity_amount"), quantity_amount, existing.get("name", "unknown")
            )
            existing["quantity_amount"] += quantity_amount
        elif existing_unit_norm == new_unit_norm:
            existing["quantity_amount"] += quantity_amount
        else:
            converted = convert_same_type(quantity_amount, quantity_unit or "", existing.get("quantity_unit") or "")
            if converted is not None:
                existing["quantity_amount"] += converted
            else:
                reverse = convert_same_type(existing["quantity_amount"], existing.get("quantity_unit") or "", quantity_unit or "")
                if reverse is not None:
                    existing["quantity_amount"] = reverse + quantity_amount
                    existing["quantity_unit"] = quantity_unit
                else:
                    # Do NOT silently add incompatible units — log and skip instead
                    logger.warning(
                        "Cannot consolidate '%s %s' with '%s %s' for '%s' — incompatible units, skipping",
                        existing.get("quantity_amount"), existing.get("quantity_unit"),
                        quantity_amount, quantity_unit, existing.get("name", "unknown")
                    )
    elif quantity_amount:
        existing["quantity_amount"] = quantity_amount

    # Rebuild display string from accumulated total
    total = existing.get("quantity_amount")
    unit = existing.get("quantity_unit") or ""
    if total is not None:
        if total == int(total):
            existing["quantity"] = f"{int(total)} {unit}".strip()
        else:
            existing["quantity"] = f"{total:.2f} {unit}".strip().rstrip('0').rstrip('.')
    elif quantity_str and not existing["quantity"]:
        existing["quantity"] = quantity_str

    if recipe_id not in existing["source_recipe_ids"]:
        existing["source_recipe_ids"].append(recipe_id)


def _should_skip_ingredient(
    db: Session,
    week_start: date,
    ingredient_id: int,
    data: dict,
) -> bool:
    """Check if an ingredient should be skipped (manual item exists or inventory covers it)."""
    ingredient = data["ingredient"]

    # Skip if a manually-added item already covers this ingredient
    manual_by_id = db.query(ShoppingListItem).filter(
        ShoppingListItem.week_start == week_start,
        ShoppingListItem.ingredient_id == ingredient_id,
        ShoppingListItem.source_recipe_id.is_(None)
    ).first()

    safe_item_name = data["name"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    manual_by_name = db.query(ShoppingListItem).filter(
        ShoppingListItem.week_start == week_start,
        ShoppingListItem.name.ilike(safe_item_name, escape="\\"),
        ShoppingListItem.source_recipe_id.is_(None)
    ).first() if not manual_by_id else None

    if manual_by_id or manual_by_name:
        return True

    # Aggregate ALL inventory items for this ingredient
    all_inventory_items = db.query(InventoryItem).filter(
        InventoryItem.ingredient_id == ingredient_id
    ).all()

    # Canonical name fallback
    if not all_inventory_items:
        from app.models.recipe import Ingredient as IngredientModel
        canonical = generate_canonical_name(data["name"])
        if canonical:
            all_inventory_items = db.query(InventoryItem).join(
                IngredientModel, InventoryItem.ingredient_id == IngredientModel.id
            ).filter(
                IngredientModel.canonical_name == canonical
            ).all()

    # Fallback: check by name for legacy items
    if not all_inventory_items:
        all_inventory_items = db.query(InventoryItem).filter(
            InventoryItem.name.ilike(safe_item_name, escape="\\")
        ).all()

    if not all_inventory_items:
        return False

    existing_inventory = _aggregate_inventory(all_inventory_items)

    # Unified quantity check (no TrackingMode branching)
    inv_quantity = getattr(
        existing_inventory, '_aggregated_quantity', existing_inventory.quantity
    )

    # Tier 2/3 items (quantity_unit=None or "percent", 0-100 scale): threshold check
    if existing_inventory.quantity_unit is None or existing_inventory.quantity_unit == "percent":
        threshold = existing_inventory.reorder_threshold or 25
        if (inv_quantity or 0) >= threshold:
            return True
        return False

    # Real unit items: use check_inventory_coverage pipeline
    needed_amount = data.get("quantity_amount")
    needed_unit = data.get("quantity_unit")

    if needed_amount and needed_amount > 0 and inv_quantity is not None:
        needed_unit_for_check = needed_unit
        if not needed_unit and existing_inventory.unit:
            inv_norm = normalize_unit(existing_inventory.unit)
            if inv_norm and inv_norm != "count":
                needed_unit_for_check = existing_inventory.unit

        consolidated_need = ConsolidatedItem(
            ingredient_name=data["name"],
            total_amount=needed_amount,
            unit=needed_unit_for_check,
        )
        inv_unit = existing_inventory.unit or needed_unit_for_check or "count"
        coverage = check_inventory_coverage(
            needed=consolidated_need,
            inventory_amount=inv_quantity,
            inventory_unit=inv_unit,
            ingredient_name=data["name"],
        )
        if coverage.has_enough:
            return True
    else:
        # Zero/unparseable needed amount — skip only if inventory has actual stock
        if inv_quantity is not None and inv_quantity > 0:
            return True
        return False

    return False


def _aggregate_inventory(items: list) -> InventoryItem:
    """Aggregate multiple inventory items into a single item with combined quantity."""
    primary = items[0]
    if len(items) == 1:
        return primary

    # Use quantity_unit (canonical) when available, fall back to normalize_unit
    base_unit = primary.quantity_unit or normalize_unit(primary.unit or "")
    total_quantity = primary.quantity or 0

    for extra_item in items[1:]:
        extra_unit = extra_item.quantity_unit or normalize_unit(extra_item.unit or "")
        if base_unit == extra_unit or (not base_unit and not extra_unit):
            # Same unit or both None (0-100 scale) — direct addition
            total_quantity += (extra_item.quantity or 0)
        elif base_unit and extra_unit:
            # Different real units — attempt conversion
            converted = convert_same_type(
                extra_item.quantity or 0,
                extra_item.unit or extra_unit,
                primary.unit or base_unit,
            )
            if converted is not None:
                total_quantity += converted
            # else: silently skip — conservative (undercount -> item appears on list)
        # else: one has unit, other doesn't — skip (can't meaningfully add)

    primary._aggregated_quantity = total_quantity
    return primary


# =============================================================================
# Complete Shopping Trip
# =============================================================================

def complete_shopping_trip(
    db: Session,
    week_start: date,
    package_data_map: dict,
) -> dict:
    """
    Complete a shopping trip: transfer checked items to inventory and clear them.

    Per UX Decision: "Shopping Done" button flow
    - Checked items are added to food inventory (source='purchased')
    - Checked items are then removed from the shopping list
    - Unchecked items remain in the shopping list for next time

    Returns dict with items_transferred and items_cleared counts.
    """
    # FOR UPDATE lock prevents concurrent calls from double-transferring the same items
    checked_items = db.query(ShoppingListItem).filter(
        ShoppingListItem.week_start == week_start,
        ShoppingListItem.is_checked == True
    ).with_for_update().all()

    items_transferred = 0
    items_cleared = 0

    # Build category name -> id mapping
    category_mapping = {}
    categories = db.query(InventoryCategory).all()
    for cat in categories:
        category_mapping[cat.name.lower()] = cat.id

    from app.services import inventory_service as inv_svc

    # Wrap in try/rollback for atomicity — all items transfer or none do
    try:
        for item in checked_items:
            # Verify item still exists (guards against concurrent completion)
            refreshed = db.query(ShoppingListItem).filter(
                ShoppingListItem.id == item.id
            ).first()
            if not refreshed or not refreshed.is_checked:
                logger.warning("Shopping item %d already processed or removed, skipping", item.id)
                continue

            # Skip section headers that aren't real ingredients
            if is_section_header(item.name):
                logger.debug("Skipping section header '%s'", item.name)
                continue

            quantity_value, unit_value = _resolve_item_quantity(item)

            # Use package-aware recommendation instead of force-converting
            pkg_qty, pkg_unit, auto_pkg_meta = recommend_purchase_unit(
                db, item.name, quantity_value, unit_value or ''
            )
            if auto_pkg_meta:
                quantity_value = pkg_qty
                unit_value = pkg_unit

            # Clean display name for inventory
            display_name = clean_display_name(item.name)

            category_id = _resolve_category_id(item.category, category_mapping)

            # Detect food category and infer storage location for new items
            food_cat = detect_food_category(item.name)
            inferred_location = infer_storage_location(food_cat)

            # Compute unified fields for new items
            canon_unit = normalize_unit(unit_value) if unit_value else 'count'
            item_unit_type = classify_unit_type(canon_unit)
            if item_unit_type == 'discrete':
                default_reorder = 1
            elif canon_unit:
                default_reorder = None  # Will be set by package data if available
            else:
                default_reorder = 25  # 0-100 pseudo-scale

            # Build item_data and use unified upsert (match_any_location=True
            # because the user may have stored the item in a different location)
            exp_date, _, shelf_life = get_default_expiration(
                name=item.name,
                location=inferred_location.value,
                purchase_date=date.today(),
            )

            item_data = dict(
                ingredient_id=item.ingredient_id,
                name=display_name,
                quantity=quantity_value,
                unit=unit_value,
                location=inferred_location,
                source='purchased',
                purchase_date=date.today(),
                last_restocked_at=datetime.now(),
                category_id=category_id,
                food_category=food_cat.value,
                expiration_date=exp_date,
                default_shelf_life=shelf_life,
                expiration_auto_filled=True,
                # Unified fields
                quantity_unit=canon_unit,
                unit_type=item_unit_type,
                reorder_threshold=default_reorder,
            )

            db_item, merged = inv_svc.upsert_inventory_item(db, item_data, match_any_location=True)

            # Log when merge crosses storage locations so the user can spot misplaced items
            if merged and db_item.location != inferred_location:
                logger.info(
                    "Shopping item '%s' merged into existing inventory at '%s' "
                    "(inferred location was '%s'). User may need to relocate.",
                    item.name, db_item.location.value if hasattr(db_item.location, 'value') else db_item.location,
                    inferred_location.value,
                )

            # Backfill unified fields on existing items if still NULL
            if merged:
                if not db_item.unit_type and item_unit_type:
                    db_item.unit_type = item_unit_type
                if not db_item.quantity_unit and canon_unit:
                    db_item.quantity_unit = canon_unit
                if db_item.reorder_threshold is None and default_reorder is not None:
                    db_item.reorder_threshold = default_reorder

            # Percentage items — reset to full after restocking
            from app.models.recipe import TrackingMode
            is_pct_item = (
                db_item.quantity_unit is None
                or db_item.quantity_unit == "percent"
                or db_item.tracking_mode_override == "percentage"
                or (not merged and db_item.get_tracking_mode() == TrackingMode.PERCENTAGE)
            )
            if is_pct_item:
                db_item.quantity = 100
                db_item.percent_full = 100
                db_item.quantity_unit = "percent"

            # Apply package data with transferred_qty for DQ-7 override
            _apply_package_data(
                db, db_item, item, package_data_map,
                transferred_qty=quantity_value,
                auto_pkg_meta=auto_pkg_meta,
            )

            items_transferred += 1
            db.delete(item)
            items_cleared += 1

        db.commit()
    except Exception as e:
        logger.debug("Shopping trip completion failed, rolling back: %s", e)
        db.rollback()
        raise

    return {
        "items_transferred": items_transferred,
        "items_cleared": items_cleared,
    }


def _resolve_item_quantity(item: ShoppingListItem) -> tuple:
    """Resolve quantity and unit for inventory transfer.

    Priority:
      1. Pre-parsed quantity_amount / quantity_unit (set during shopping gen)
      2. Re-parse the display string via parse_quantity()
      3. Regex extraction of leading number from display string
      4. Fallback to 1.0 (last resort)
    """
    if item.quantity_amount is not None and item.quantity_amount > 0:
        return item.quantity_amount, item.quantity_unit
    elif item.quantity:
        try:
            parsed = parse_quantity(item.quantity)
            quantity_value = max(0.1, parsed.amount if parsed.amount > 0 else 1.0)
            unit_value = parsed.unit
            return quantity_value, unit_value
        except (ValueError, AttributeError):
            pass

        # Regex fallback: extract leading number before defaulting to 1.0
        number_match = re.match(
            r'^\s*([\d]+(?:[./]\d+)?)\s*(.*)',
            item.quantity,
        )
        if number_match:
            try:
                num_str, rest = number_match.groups()
                quantity_value = float(num_str) if '/' not in num_str else (
                    float(num_str.split('/')[0]) / float(num_str.split('/')[1])
                )
                if quantity_value > 0:
                    unit_value = rest.strip() or None
                    return quantity_value, unit_value
            except (ValueError, ZeroDivisionError):
                pass

        # True last resort — log and default
        logger.warning(
            "Could not parse quantity '%s' for shopping item '%s' (id=%s) — "
            "defaulting to 1.0. Original value lost.",
            item.quantity, item.name, item.id,
        )
        return 1.0, None
    return 1.0, None


def _resolve_category_id(category: Optional[str], category_mapping: dict) -> Optional[int]:
    """Map shopping category to inventory category_id."""
    if not category:
        return None
    category_id = category_mapping.get(category.lower())
    if category_id is None:
        legacy_mapping = {
            "bakery": "pantry",
            "other": "pantry",
            "baking": "pantry",
            "canned goods": "pantry",
            "grains": "pantry",
            "spices": "condiments",
            "sauces": "condiments",
        }
        fallback_name = legacy_mapping.get(category.lower())
        if fallback_name:
            category_id = category_mapping.get(fallback_name)
    return category_id


def _apply_package_data(
    db: Session,
    inv_item: InventoryItem,
    shopping_item: ShoppingListItem,
    package_data_map: dict,
    transferred_qty: float = 0,
    auto_pkg_meta: dict = None,
) -> None:
    """
    Apply V2 package data from PackageSizeModal to inventory item.

    When package data is provided, override the shopping list transfer amount
    with the full package size (converted to item's quantity_unit). This ensures
    inventory reflects what the user actually bought (a 2lb bag) rather than
    what the recipe needed (0.5 cups).

    auto_pkg_meta from recommend_purchase_unit() is used as fallback when no
    manual package data exists, avoiding duplicate find_conversion calls.
    """
    from app.services.inventory_service import convert_package_to_item_unit

    pkg = package_data_map.get(shopping_item.id)
    if pkg:
        # Validate package data before applying
        if not isinstance(pkg.package_size, (int, float)) or pkg.package_size <= 0:
            logger.warning(
                "Invalid package_size for '%s': %s — skipping package data",
                shopping_item.name, pkg.package_size
            )
            pkg = None
        elif pkg.package_size > 10000:
            logger.warning(
                "Unrealistic package_size for '%s': %s (max 10000) — skipping",
                shopping_item.name, pkg.package_size
            )
            pkg = None
        elif pkg.package_label and len(str(pkg.package_label)) > 200:
            logger.warning(
                "Package label too long for '%s' (%d chars) — truncating",
                shopping_item.name, len(str(pkg.package_label))
            )
            pkg.package_label = str(pkg.package_label)[:200]

    if pkg:
        # Store package metadata (normalize units to canonical form)
        canon_pkg_unit = normalize_unit(pkg.package_unit) if pkg.package_unit else pkg.package_unit
        inv_item.package_size = pkg.package_size
        inv_item.package_unit = canon_pkg_unit
        inv_item.package_label = pkg.package_label
        inv_item.package_type = pkg.package_type if hasattr(inv_item, 'package_type') else None
        inv_item.packages_count = (inv_item.packages_count or 0) + 1.0
        inv_item.amount_used = 0.0
        inv_item.amount_used_unit = canon_pkg_unit

        # DQ-7: Replace shopping list transfer with full package amount
        if pkg.package_size and pkg.package_size > 0:
            package_in_item_unit = convert_package_to_item_unit(
                pkg.package_size, pkg.package_unit, inv_item, db
            )
            if package_in_item_unit is not None:
                # Undo upsert's addition of transferred_qty, add full package instead
                inv_item.quantity = max(0, (inv_item.quantity or 0) - transferred_qty) + package_in_item_unit
                # Update reorder_threshold based on actual package size
                if inv_item.unit_type == 'continuous':
                    inv_item.reorder_threshold = round(package_in_item_unit * 0.20, 2)
            # else: conversion failed — keep upsert's raw addition as fallback

            # Backfill quantity_unit/unit_type from package data if still NULL
            if not inv_item.quantity_unit and pkg.package_unit:
                canon_pkg = normalize_unit(pkg.package_unit)
                inv_item.quantity_unit = canon_pkg
                inv_item.unit_type = classify_unit_type(canon_pkg)

        if shopping_item.ingredient_id:
            record_purchase(
                db,
                ingredient_id=shopping_item.ingredient_id,
                package_label=pkg.package_label,
                package_size=pkg.package_size,
                package_unit=pkg.package_unit,
                package_type=pkg.package_type,
                store=pkg.store,
                price=pkg.price,
            )
    elif inv_item.package_size is None:
        # Use auto_pkg_meta from recommend_purchase_unit() if available,
        # otherwise fall back to find_conversion lookup
        if auto_pkg_meta:
            canon_auto_unit = normalize_unit(auto_pkg_meta["package_unit"]) if auto_pkg_meta["package_unit"] else auto_pkg_meta["package_unit"]
            inv_item.package_size = auto_pkg_meta["package_size"]
            inv_item.package_unit = canon_auto_unit
            inv_item.package_label = auto_pkg_meta["package_label"]
            inv_item.packages_count = (inv_item.packages_count or 0) + 1.0
            inv_item.amount_used = 0.0
            inv_item.amount_used_unit = canon_auto_unit
        elif shopping_item.ingredient_id:
            conv = find_conversion(db, shopping_item.name)
            if conv:
                canon_conv_unit = normalize_unit(conv.package_unit) if conv.package_unit else conv.package_unit
                inv_item.package_size = conv.package_size
                inv_item.package_unit = canon_conv_unit
                inv_item.package_label = f"{conv.package_size}{conv.package_unit} {conv.package_type}"
                inv_item.packages_count = (inv_item.packages_count or 0) + 1.0
                inv_item.amount_used = 0.0
                inv_item.amount_used_unit = canon_conv_unit

"""
Inventory Service — Business logic extracted from inventory router.

Handles:
- Item creation with auto-filled expiration (shared by single + bulk create)
- Post-cooking depletion (ingredient-level inventory subtraction)
- Depletion undo (5-second window reversal)
- Leftover creation from meal plans
"""

import logging
import json

log = logging.getLogger("weekly_review")
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.inventory import (
    InventoryItem, ItemSource
)
from app.models.meal import MealPlanEntry
from app.models.recipe import Recipe, RecipeIngredient, Ingredient, TrackingMode
from app.services.ingredient_service import find_or_create_ingredient
from app.services.expiration_defaults import (
    get_default_expiration,
    get_leftover_expiration,
    detect_food_category,
    expiration_learner,
    FoodCategory,
)
from app.services.parsing.quantity_parser import (
    parse_quantity, normalize_unit, classify_unit_type,
)


logger = logging.getLogger("weekly_review")


# =============================================================================
# Item Creation Helpers
# =============================================================================

def prepare_item_data(item_data: dict, db: Session) -> dict:
    """
    Prepare inventory item data with auto-filled expiration and ingredient linking.

    Shared logic between single create and bulk create endpoints.
    Mutates item_data in place and returns it.
    """
    # Set purchase date to today if not provided
    if item_data.get("purchase_date") is None:
        item_data["purchase_date"] = date.today()

    # Auto-fill expiration date if not provided
    expiration_auto_filled = False
    if item_data.get("expiration_date") is None:
        if item_data.get("source") == ItemSource.LEFTOVER.value:
            exp_date, shelf_life = get_leftover_expiration(
                meal_name=item_data.get("original_meal_name"),
                cooked_date=item_data["purchase_date"]
            )
            food_cat = FoodCategory.LEFTOVERS
        else:
            exp_date, food_cat, shelf_life = get_default_expiration(
                name=item_data["name"],
                location=item_data["location"],
                purchase_date=item_data["purchase_date"]
            )

            # Check for learned adjustments (Conservative Gating: 3+ confirmations)
            adjusted_days = expiration_learner.get_adjusted_days(
                item_name=item_data["name"],
                category=food_cat,
                default_days=shelf_life
            )
            if adjusted_days != shelf_life:
                shelf_life = adjusted_days
                exp_date = item_data["purchase_date"] + timedelta(days=shelf_life)

        item_data["expiration_date"] = exp_date
        item_data["default_shelf_life"] = shelf_life
        item_data["food_category"] = food_cat.value
        expiration_auto_filled = True
    else:
        # User provided expiration - detect category anyway for feedback
        food_cat = detect_food_category(item_data["name"])
        item_data["food_category"] = food_cat.value
        if item_data.get("purchase_date"):
            delta = (item_data["expiration_date"] - item_data["purchase_date"]).days
            item_data["default_shelf_life"] = max(0, delta)

    item_data["expiration_auto_filled"] = expiration_auto_filled

    # Link to ingredient master
    ingredient = find_or_create_ingredient(db, item_data["name"], item_data.get("unit"))
    item_data["ingredient_id"] = ingredient.id

    return item_data


def upsert_inventory_item(
    db: Session,
    item_data: dict,
    match_any_location: bool = False,
) -> Tuple[InventoryItem, bool]:
    """
    Create or merge an inventory item — single entry point for ALL creation paths.

    Matching strategy:
      match_any_location=False (default): ingredient_id + location (unique slot per location)
      match_any_location=True:  ingredient_id only (shopping trip — merge into wherever it lives)

    If match found: add quantities (with unit conversion), update timestamps,
                    backfill any null fields.
    If no match: create new InventoryItem.

    Returns (item, merged) — merged=True if existing item was updated.
    """
    from app.services.parsing.quantity_consolidator import convert_same_type

    ingredient_id = item_data.get("ingredient_id")
    location = item_data.get("location")

    existing: Optional[InventoryItem] = None

    # PASS 1: Match by ingredient_id (+ location unless match_any_location)
    if ingredient_id:
        q = db.query(InventoryItem).filter(
            InventoryItem.ingredient_id == ingredient_id,
        )
        if not match_any_location and location:
            q = q.filter(InventoryItem.location == location)
        existing = q.first()

    # PASS 2: Fallback — name ILIKE (+ location unless match_any_location)
    if not existing:
        name = item_data.get("name", "")
        if name.strip():
            safe_name = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            q = db.query(InventoryItem).filter(InventoryItem.name.ilike(safe_name, escape="\\"))
            if not match_any_location and location:
                q = q.filter(InventoryItem.location == location)
            existing = q.first()

    if existing:
        # --- Merge into existing item ---
        incoming_qty = item_data.get("quantity", 0) or 0
        incoming_unit = normalize_unit(item_data.get("unit") or "")
        existing_unit = normalize_unit(existing.unit or "")

        if incoming_unit == existing_unit or not incoming_unit or not existing_unit:
            # Same or missing unit → direct addition
            existing.quantity = (existing.quantity or 0) + incoming_qty
            if not existing_unit and incoming_unit:
                existing.unit = item_data.get("unit")
        else:
            # Different units → attempt cross-unit conversion (oz→lbs, ml→L, etc.)
            converted = convert_same_type(incoming_qty, item_data.get("unit") or "", existing.unit or "")
            if converted is not None:
                existing.quantity = (existing.quantity or 0) + converted
            else:
                # Try reverse conversion
                reverse = convert_same_type(
                    existing.quantity or 0, existing.unit or "", item_data.get("unit") or ""
                )
                if reverse is not None:
                    existing.quantity = reverse + incoming_qty
                    existing.unit = item_data.get("unit")
                else:
                    # Truly incompatible — add raw (lossy but avoids duplicate)
                    existing.quantity = (existing.quantity or 0) + incoming_qty

        # Update timestamps
        existing.purchase_date = date.today()
        existing.last_restocked_at = datetime.now(timezone.utc)

        # Backfill nulls from incoming data
        if not existing.ingredient_id and ingredient_id:
            existing.ingredient_id = ingredient_id
        if not existing.food_category and item_data.get("food_category"):
            existing.food_category = item_data["food_category"]
        if not existing.category_id and item_data.get("category_id"):
            existing.category_id = item_data["category_id"]
        if existing.expiration_date is None and item_data.get("expiration_date"):
            existing.expiration_date = item_data["expiration_date"]
        if existing.default_shelf_life is None and item_data.get("default_shelf_life"):
            existing.default_shelf_life = item_data["default_shelf_life"]

        # Backfill unified fields from incoming data
        if not existing.unit_type and item_data.get("unit_type"):
            existing.unit_type = item_data["unit_type"]
        if not existing.quantity_unit and item_data.get("quantity_unit"):
            existing.quantity_unit = normalize_unit(item_data["quantity_unit"])
        if existing.reorder_threshold is None and item_data.get("reorder_threshold") is not None:
            existing.reorder_threshold = item_data["reorder_threshold"]

        db.flush()
        logger.info("Merged inventory item %s (id=%d, qty=%s)", existing.name, existing.id, existing.quantity)
        return existing, True

    # --- Create new item ---
    # Normalize raw unit before deriving quantity_unit
    if item_data.get("unit"):
        item_data["unit"] = normalize_unit(item_data["unit"])

    # Auto-derive unified fields if not provided
    is_percentage = item_data.get("tracking_mode_override") == "percentage"
    if not item_data.get("quantity_unit"):
        if is_percentage:
            item_data["quantity_unit"] = "percent"
        else:
            canon = item_data.get("unit") or "count"
            item_data["quantity_unit"] = canon
    if not item_data.get("unit_type"):
        item_data["unit_type"] = classify_unit_type(item_data.get("quantity_unit"))
    if item_data.get("reorder_threshold") is None:
        if is_percentage:
            item_data["reorder_threshold"] = 25  # 25% threshold for percentage items
        else:
            ut = item_data.get("unit_type", "discrete")
            if ut == "discrete":
                item_data["reorder_threshold"] = 1
            elif item_data.get("package_size") and item_data["package_size"] > 0:
                item_data["reorder_threshold"] = round(item_data["package_size"] * 0.20, 2)

    # Sync quantity from percent_full for percentage items (quantity IS the source of truth)
    if is_percentage and item_data.get("percent_full") is not None:
        item_data["quantity"] = item_data["percent_full"]

    # Calculate packages_backup from packages_count if not explicitly set
    # packages_count = total including the open one, so backup = count - 1
    if item_data.get("packages_backup") is None and item_data.get("packages_count"):
        pc = item_data["packages_count"]
        if isinstance(pc, (int, float)) and pc > 1:
            item_data["packages_backup"] = pc - 1

    # Strip keys that aren't InventoryItem columns
    safe_keys = {c.name for c in InventoryItem.__table__.columns}
    clean_data = {k: v for k, v in item_data.items() if k in safe_keys}
    new_item = InventoryItem(**clean_data)
    db.add(new_item)
    db.flush()
    logger.info("Created inventory item %s (id=%d)", new_item.name, new_item.id)
    return new_item, False


# =============================================================================
# Post-Cooking Depletion
# =============================================================================

# Count-compatible units — interchangeable with empty unit
_COUNT_UNITS = {"piece", "whole", "each", "unit", "count", ""}

# Container units — items stored as package counts (1 jar, 1 bag, etc.)
_CONTAINER_UNITS = {
    "bottle", "jar", "can", "bag", "box", "carton",
    "container", "stick", "block", "loaf", "tube",
    "pack", "bunch", "head", "wedge", "pint", "canister",
}


def deplete_from_cooking(
    db: Session,
    meal_id: int,
    adjustments: list,
) -> dict:
    """
    Auto-deplete inventory based on recipe ingredients after cooking.

    Behaviour: non-blocking ambient notification with a 5-second undo window.
    Strategy: assumed consumption with exception handling.

    Behavior:
    - For PERCENTAGE mode ingredients: Default assumes 10% used per cooking
    - For COUNT mode ingredients: Default assumes recipe quantity used
    - User can provide adjustments for exceptions
    - Records consumption in history for Reference Class Forecasting

    Returns dict with depleted list and undo_available_for_seconds.
    """
    meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == meal_id).first()
    if not meal:
        return {"error": "Meal not found", "status_code": 404}

    # Idempotency guard
    if getattr(meal, 'inventory_depleted', False):
        return {"depleted": [], "undo_available_for_seconds": 0}

    if not meal.recipe_id:
        return {"error": "Meal has no associated recipe", "status_code": 400}

    recipe = db.query(Recipe).filter(Recipe.id == meal.recipe_id).first()
    if not recipe:
        return {"error": "Recipe not found", "status_code": 404}

    adjustment_map = {a.ingredient_id: a for a in adjustments}

    # Scale depletion by planned vs default servings.
    # Coupling note: planned_servings is set by the frontend when the user
    # adjusts servings in the cooking session (ServingStepper component).
    # The frontend persists this to the meal entry via mealsApi.completeCooking(),
    # and we read it here at depletion time to scale ingredient amounts.
    default_servings = recipe.servings or 4
    planned_servings = meal.planned_servings or default_servings
    scale_factor = planned_servings / default_servings

    depletion_log = []
    skipped_log = []

    recipe_ingredients = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id == recipe.id
    ).all()

    for ri in recipe_ingredients:
        if not ri.ingredient_id:
            skipped_log.append({
                "ingredient_name": ri.notes or "unknown",
                "reason": "no_ingredient_link",
            })
            continue

        inventory_item = db.query(InventoryItem).filter(
            InventoryItem.ingredient_id == ri.ingredient_id
        ).first()

        if not inventory_item:
            ingredient_for_skip = db.query(Ingredient).filter(
                Ingredient.id == ri.ingredient_id
            ).first()
            skipped_log.append({
                "ingredient_name": ingredient_for_skip.name if ingredient_for_skip else "unknown",
                "reason": "not_in_inventory",
            })
            continue

        ingredient = db.query(Ingredient).filter(
            Ingredient.id == ri.ingredient_id
        ).first()

        if not ingredient:
            continue

        adjustment = adjustment_map.get(ri.ingredient_id)

        # Unified depletion — single path for all items
        result = _deplete_item(
            db, inventory_item, ri, ingredient, adjustment,
            scale_factor, depletion_log,
        )
        if result is None:
            # Check if _try_unit_conversion already logged with status:"skipped"
            # If not (zero-amount case), add to skipped_log
            already_logged = any(
                entry.get("ingredient_id") == ingredient.id and entry.get("status") == "skipped"
                for entry in depletion_log
            )
            if not already_logged:
                skipped_log.append({
                    "ingredient_name": ingredient.name,
                    "reason": "zero_amount_or_conversion_failed",
                })
            continue

        amount_used, remaining, package_amount_depleted = result

        # Record consumption for Reference Class Forecasting
        _record_consumption(
            inventory_item, amount_used, meal_id, package_amount_depleted,
        )

        depletion_log.append({
            "ingredient_id": ingredient.id,
            "ingredient_name": ingredient.name,
            "mode": inventory_item.get_tracking_mode().value,
            "amount_depleted": amount_used,
            "remaining": remaining,
            "status": inventory_item.get_status_level(),
        })

    # ATOMIC: Set idempotency flag in same transaction as depletion
    meal.inventory_depleted = True
    db.commit()

    return {
        "depleted": depletion_log,
        "skipped": skipped_log,
        "undo_available_for_seconds": 5,
    }


def _deplete_item(
    db: Session,
    inventory_item: InventoryItem,
    ri: RecipeIngredient,
    ingredient: Ingredient,
    adjustment,
    scale_factor: float,
    depletion_log: list,
) -> Optional[Tuple[float, float, Optional[float]]]:
    """
    Unified depletion for all inventory items.

    For quantity_unit=None (Tier 2/3 pseudo-scale): proportional 10% fallback.
    For real unit items: convert recipe amount and subtract.
    Auto-opens a backup package when quantity reaches 0.

    Returns (amount_used, remaining, package_amount_depleted) or None if skipped.
    """

    # --- Legacy percent items (quantity_unit='percent'): proportional fallback ---
    # Skip this fallback if the item has package tracking data — those use
    # the package-tracked depletion path below instead.
    if inventory_item.quantity_unit == "percent" and not (
        inventory_item.package_size and inventory_item.package_unit
    ):
        if adjustment and adjustment.percent_used is not None:
            deplete_amount = adjustment.percent_used
        else:
            deplete_amount = max((inventory_item.quantity or 0) * 0.10, 1.0)

        old_qty = inventory_item.quantity or 0
        inventory_item.quantity = max(0, old_qty - deplete_amount)

        # Sync percent_full for legacy compatibility
        inventory_item.percent_full = inventory_item.quantity

        return deplete_amount, inventory_item.quantity, None

    # --- Package-tracked items (container units: jar, bag, pack, etc.) ---
    # Package-tracked depletion: update amount_used proportionally via
    # cooking_equivalent. Applies to container-unit items AND measurable-unit
    # items that have package metadata (e.g., "tablespoon" with "fl oz" package).
    if (
        inventory_item.package_size
        and inventory_item.package_unit
        and inventory_item.unit
        and (
            normalize_unit(inventory_item.unit) in _CONTAINER_UNITS
            or inventory_item.amount_used_unit  # has active package tracking
        )
    ):
        pkg_depletion = _deplete_package_tracked(
            db, inventory_item, ri, ingredient, adjustment, scale_factor
        )
        if pkg_depletion is not None:
            return pkg_depletion

    # --- Real unit items ---
    recipe_unit = normalize_unit(ri.unit or "") if ri.unit else ""
    item_unit = normalize_unit(inventory_item.unit or "")

    # Step 1: Determine amount_used
    if adjustment and adjustment.count_used is not None:
        amount_used = adjustment.count_used
    else:
        if ri.quantity:
            try:
                parsed = parse_quantity(ri.quantity)
                amount_used = parsed.amount * scale_factor
            except (ValueError, AttributeError):
                amount_used = 1.0 * scale_factor
        else:
            amount_used = 1.0 * scale_factor

    # Step 2: Skip zero-quantity ingredients
    if amount_used <= 0:
        log.debug("Depletion skipped for %s: zero amount after scaling", ingredient.name)
        return None

    # Step 3: Check unit compatibility
    units_compatible = (
        recipe_unit == item_unit
        or (recipe_unit in _COUNT_UNITS and item_unit in _COUNT_UNITS)
    )

    # Step 4: Try conversion if units don't match
    if not units_compatible:
        converted = _try_unit_conversion(
            db, amount_used, ri, ingredient, inventory_item,
            recipe_unit, item_unit, depletion_log,
        )
        if converted is None:
            log.info(
                "Depletion skipped for %s: incompatible units (%s -> %s)",
                ingredient.name, recipe_unit, item_unit,
            )
            return None  # skipped — already logged to depletion_log by _try_unit_conversion
        amount_used = converted

    # Step 5: Subtract from inventory
    old_quantity = inventory_item.quantity or 0
    inventory_item.quantity = max(0, old_quantity - amount_used)
    remaining = inventory_item.quantity

    # V2: Update package tracking
    package_amount_depleted = None
    if inventory_item.package_size and inventory_item.package_unit:
        from app.services.package_converter import convert_cooking_to_package_unit
        package_depleted = convert_cooking_to_package_unit(
            db, amount_used, inventory_item.unit or ri.unit or "", ingredient.name,
        )
        if package_depleted is not None:
            package_amount_depleted = round(package_depleted, 4)
            old_pkg_used = inventory_item.amount_used or 0.0
            inventory_item.amount_used = round(old_pkg_used + package_amount_depleted, 4)
            inventory_item.amount_used_unit = inventory_item.package_unit

    # DQ-4: Auto-open backup package when depleted
    if inventory_item.quantity <= 0 and (inventory_item.packages_backup or 0) > 0:
        pkg_qty = convert_package_to_item_unit(
            inventory_item.package_size or 0,
            inventory_item.package_unit,
            inventory_item,
            db,
        )
        if pkg_qty is not None:
            inventory_item.quantity = pkg_qty
            inventory_item.packages_backup -= 1
            inventory_item.amount_used = 0.0  # Reset for new package
        else:
            log.warning(
                "Cannot auto-open backup for %s: unit conversion failed (%s -> %s)",
                inventory_item.name,
                inventory_item.package_unit,
                inventory_item.quantity_unit,
            )

    return amount_used, remaining, package_amount_depleted


def convert_package_to_item_unit(
    pkg_size: float,
    pkg_unit: Optional[str],
    item: InventoryItem,
    db: Session,
) -> Optional[float]:
    """
    Convert package_size from package_unit to item's quantity_unit.

    Used by auto-open and the shopping-completion package override.
    Chains: adopt if no item unit -> direct match -> same-type -> cross-type.
    """
    from app.services.parsing.quantity_consolidator import convert_same_type, convert_volume_to_weight

    canon_pkg = normalize_unit(pkg_unit) if pkg_unit else None
    item_unit = item.quantity_unit

    if not item_unit or item_unit == "percent":
        # Item has no quantity_unit (or legacy percent) — adopt package unit if available
        if canon_pkg:
            item.quantity_unit = canon_pkg
            item.unit_type = classify_unit_type(canon_pkg)
        return pkg_size

    if canon_pkg == item_unit or not canon_pkg:
        return pkg_size

    # Same-type conversion (oz->lb, ml->L, etc.)
    converted = convert_same_type(pkg_size, pkg_unit or "", item.unit or item_unit)
    if converted is not None:
        return converted

    # Cross-type via COMMON_CONVERSIONS (volume->weight for known ingredients)
    ingredient_name = item.ingredient.name if item.ingredient else item.name
    if ingredient_name:
        result = convert_volume_to_weight(pkg_size, pkg_unit or "", ingredient_name)
        if result:
            grams, _ = result
            inv_converted = convert_same_type(grams, "gram", item.unit or item_unit)
            if inv_converted is not None:
                return inv_converted

    return None


def _deplete_package_tracked(
    db: Session,
    inventory_item: InventoryItem,
    ri: RecipeIngredient,
    ingredient: Ingredient,
    adjustment,
    scale_factor: float,
) -> Optional[Tuple[float, float, float]]:
    """Deplete a package-tracked item (stored in container units like jar, bag).

    Uses PackageConversion's cooking_equivalent to calculate proportional depletion.
    Example: cumin jar = 1.5oz / 25 tsp. Recipe: "2 tsp cumin" ->
    2/25 * 1.5 = 0.12 oz added to amount_used.

    Returns (amount_used, remaining_qty, package_amount_depleted) or None if
    conversion is not possible (falls through to standard depletion).
    """
    from app.services.package_converter import find_conversion
    from app.services.parsing.quantity_consolidator import convert_same_type

    # Allow manual override from adjustment
    if adjustment and adjustment.count_used is not None:
        # Manual adjustment treats count_used as package_unit amount
        pkg_depletion = adjustment.count_used
    else:
        # Look up PackageConversion for cooking_equivalent
        name = ingredient.canonical_name or ingredient.name
        conv = find_conversion(db, name)
        if not conv or not conv.cooking_equivalent or not conv.cooking_unit:
            return None  # No conversion data — fall through to standard depletion

        # Parse recipe quantity
        if ri.quantity:
            try:
                parsed = parse_quantity(ri.quantity)
                recipe_amount = parsed.amount * scale_factor
            except (ValueError, AttributeError):
                recipe_amount = 1.0 * scale_factor
        else:
            recipe_amount = 1.0 * scale_factor

        if recipe_amount <= 0:
            return None

        # Convert recipe amount to cooking_unit
        recipe_unit = normalize_unit(ri.unit or "") if ri.unit else ""
        cooking_unit = normalize_unit(conv.cooking_unit)

        if recipe_unit == cooking_unit:
            recipe_in_cooking = recipe_amount
        else:
            recipe_in_cooking = convert_same_type(recipe_amount, recipe_unit, cooking_unit)

        if recipe_in_cooking is None:
            return None  # Can't convert — fall through to standard depletion

        # Proportional: (recipe_in_cooking / cooking_equivalent) * package_size
        if not inventory_item.package_size:
            return None  # No package_size — fall through to standard depletion
        pkg_depletion = (recipe_in_cooking / conv.cooking_equivalent) * inventory_item.package_size

    # Subtract from quantity (single source of truth)
    old_qty = inventory_item.quantity or 0.0
    inventory_item.quantity = max(0.0, round(old_qty - pkg_depletion, 4))

    # Sync amount_used as audit trail
    pkg_size = inventory_item.package_size or 0
    if pkg_size > 0:
        inventory_item.amount_used = max(0.0, round(pkg_size - inventory_item.quantity, 4))
    inventory_item.amount_used_unit = inventory_item.package_unit

    # Auto-open backup package when depleted (DQ-4)
    if inventory_item.quantity <= 0 and (inventory_item.packages_backup or 0) > 0:
        inventory_item.packages_backup -= 1
        inventory_item.quantity = pkg_size if pkg_size > 0 else 0
        inventory_item.amount_used = 0.0

    remaining = inventory_item.quantity
    return (round(pkg_depletion, 4), remaining, round(pkg_depletion, 4))


def _try_unit_conversion(
    db: Session,
    amount_used: float,
    ri: RecipeIngredient,
    ingredient: Ingredient,
    inventory_item: InventoryItem,
    recipe_unit: str,
    inventory_unit: str,
    depletion_log: list,
) -> Optional[float]:
    """
    Try converting between incompatible units.
    Returns converted amount or None if conversion impossible (skipped).
    """
    from app.services.parsing.quantity_consolidator import convert_same_type, convert_volume_to_weight

    # Same-type conversion (tsp->tbsp, oz->lb)
    converted = convert_same_type(amount_used, recipe_unit, inventory_unit)
    if converted is not None:
        return converted

    # Cross-type: recipe volume -> weight -> inventory weight unit
    recipe_in_weight = convert_volume_to_weight(
        amount_used, ri.unit or "", ingredient.name
    )
    if recipe_in_weight:
        grams_needed, _ = recipe_in_weight
        inv_converted = convert_same_type(grams_needed, "gram", inventory_unit)
        if inv_converted is not None:
            return inv_converted

    # Reverse: inventory volume -> weight, recipe weight -> grams
    inv_in_weight = convert_volume_to_weight(
        inventory_item.quantity or 0, inventory_item.unit or "", ingredient.name,
    )
    recipe_in_grams = convert_same_type(amount_used, recipe_unit, "gram")
    if inv_in_weight and recipe_in_grams is not None:
        inv_grams, _ = inv_in_weight
        proportion = recipe_in_grams / inv_grams if inv_grams > 0 else 1
        return (inventory_item.quantity or 0) * proportion

    # Truly incompatible — skip
    depletion_log.append({
        "ingredient_id": ingredient.id,
        "ingredient_name": ingredient.name,
        "mode": inventory_item.get_tracking_mode().value,
        "amount_depleted": 0,
        "remaining": inventory_item.quantity or 0,
        "status": "skipped",
    })
    return None


def _record_consumption(
    inventory_item: InventoryItem,
    amount_used: float,
    meal_id: int,
    package_amount_depleted: Optional[float],
) -> None:
    """Record consumption history entry for Reference Class Forecasting."""
    history_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "amount_used": amount_used,
        "meal_id": meal_id,
    }
    if package_amount_depleted is not None:
        history_entry["package_amount_used"] = package_amount_depleted

    if inventory_item.last_restocked_at:
        last_restock = inventory_item.last_restocked_at
        if last_restock.tzinfo is None:
            last_restock = last_restock.replace(tzinfo=timezone.utc)
        days_since_restock = (datetime.now(timezone.utc) - last_restock).days
        history_entry["days_since_restock"] = days_since_restock

    existing_history = inventory_item.consumption_history or []
    if isinstance(existing_history, str):
        try:
            existing_history = json.loads(existing_history)
        except json.JSONDecodeError as e:
            logger.warning("Corrupted consumption_history for item %d: %s", inventory_item.id, e)
            existing_history = []

    MAX_HISTORY_ENTRIES = 50
    existing_history = existing_history[-(MAX_HISTORY_ENTRIES - 1):] if existing_history else []
    inventory_item.consumption_history = existing_history + [history_entry]


# =============================================================================
# Undo Depletion
# =============================================================================

def undo_depletion(db: Session, meal_id: int) -> dict:
    """
    Undo the last depletion for a meal within the 5-second window.

    Restores inventory levels by reversing the consumption_history entries
    for the given meal_id.

    Returns dict with restored_count and message.
    """
    restored_count = 0
    failed_items = []

    all_items = db.query(InventoryItem).filter(
        InventoryItem.consumption_history != None,
        InventoryItem.consumption_history != '[]'
    ).all()

    for item in all_items:
        history = item.consumption_history or []
        if isinstance(history, str):
            try:
                history = json.loads(history)
            except json.JSONDecodeError as e:
                logger.error("Cannot parse consumption_history for item %d: %s", item.id, e)
                failed_items.append(item.name)
                continue

        if not isinstance(history, list):
            logger.warning("consumption_history for item %d is not a list", item.id)
            continue

        entries_to_remove = [e for e in history if e.get("meal_id") == meal_id]
        if not entries_to_remove:
            continue

        for entry in entries_to_remove:
            amount_used = entry.get("amount_used", 0)
            # Pre-Phase-18 entries may contain mode='percentage'; post-Phase-18
            # entries have no 'mode' key — default 'count' is correct for the
            # unified quantity model where all depletions use item.quantity.
            mode_str = entry.get("mode", "count")

            if mode_str == "percentage":
                new_qty = min(100, (item.quantity or 0) + amount_used)
                item.quantity = new_qty
                item.percent_full = new_qty
            else:
                item.quantity = (item.quantity or 0) + amount_used

            # Sync amount_used as audit trail for package items
            if item.package_size and item.package_size > 0:
                item.amount_used = max(0.0, round(item.package_size - (item.quantity or 0), 4))

            restored_count += 1

        item.consumption_history = [e for e in history if e.get("meal_id") != meal_id]

    # Reset idempotency flag
    meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == meal_id).first()
    if meal and getattr(meal, 'inventory_depleted', False):
        meal.inventory_depleted = False

    db.commit()

    message = f"Restored {restored_count} ingredient(s) to previous levels"
    if failed_items:
        message += f". Warning: Could not process {len(failed_items)} item(s) due to data issues."

    return {
        "restored_count": restored_count,
        "message": message,
    }


# =============================================================================
# Unified Column Backfill
# =============================================================================

def backfill_unified_columns(db: Session) -> None:
    """
    One-time backfill for unit_type, quantity_unit, packages_backup, reorder_threshold.

    Idempotent: skips items where unit_type IS NOT NULL (already backfilled).

    COUNT items: derive quantity_unit from item.unit, classify, set packages_backup.
    PERCENTAGE items — three tiers:
      Tier 1: Has package_size/package_unit → convert percent_full to real quantity.
      Tier 1b: Ingredient matches PackageConversion table → adopt package data.
      Tier 2: Has ingredient link but no conversion → 0-100 pseudo-scale.
      Tier 3: No ingredient → same as Tier 2.
    """
    items = db.query(InventoryItem).filter(
        InventoryItem.unit_type == None  # noqa: E711
    ).all()

    if not items:
        return

    # Pre-load package conversions for Tier 1b matching
    from app.models.package_conversion import PackageConversion
    all_pkg_conversions = db.query(PackageConversion).all()

    count = 0
    for item in items:
        mode = item.get_tracking_mode()

        # --- packages_backup from packages_count ---
        # packages_count = total including open one (see GAP-2)
        # None → 0, 0 → 0, 1 → 0, 3 → 2
        pc = item.packages_count
        item.packages_backup = max(0, (pc if pc is not None and pc > 0 else 0) - 1)

        if mode == TrackingMode.COUNT:
            _backfill_count_item(item)
        else:
            _backfill_percentage_item(item, all_pkg_conversions)

        count += 1

    if count > 0:
        db.commit()
        log.info("Backfill: unified columns for %d inventory items", count)


def _backfill_count_item(item: InventoryItem) -> None:
    """Backfill unified columns for a COUNT-mode item."""
    canon = normalize_unit(item.unit) if item.unit else 'count'
    item.quantity_unit = canon
    item.unit_type = classify_unit_type(canon)

    if item.unit_type == 'discrete':
        item.reorder_threshold = 1
    elif item.package_size and item.package_size > 0:
        item.reorder_threshold = round(item.package_size * 0.20, 2)
    else:
        item.reorder_threshold = None  # Let Reference Class Forecasting handle it


def _backfill_percentage_item(item: InventoryItem, pkg_conversions: list) -> None:
    """
    Backfill unified columns for a PERCENTAGE-mode item.

    Tier 1: Has package_size + package_unit already → convert to real quantity.
    Tier 1b: Ingredient matches PackageConversion → adopt package data + convert.
    Tier 2/3: No conversion possible → 0-100 pseudo-scale.
    """
    pct = item.percent_full if item.percent_full is not None else 100

    # Tier 1: Item already has package data
    if item.package_size and item.package_size > 0 and item.package_unit:
        canon = normalize_unit(item.package_unit)
        item.quantity = round(pct / 100.0 * item.package_size, 2)
        item.quantity_unit = canon
        item.unit_type = classify_unit_type(canon)
        item.reorder_threshold = round(item.package_size * 0.20, 2)
        return

    # Tier 1b: Try matching ingredient name against PackageConversion table
    ingredient_name = None
    if item.ingredient:
        ingredient_name = item.ingredient.name
    elif item.name:
        ingredient_name = item.name

    if ingredient_name:
        pkg_match = _find_matching_package_conversion(
            ingredient_name, pkg_conversions,
        )
        if pkg_match:
            canon = normalize_unit(pkg_match.package_unit)
            item.quantity = round(pct / 100.0 * pkg_match.package_size, 2)
            item.quantity_unit = canon
            item.unit_type = classify_unit_type(canon)
            item.package_size = pkg_match.package_size
            item.package_unit = pkg_match.package_unit
            item.reorder_threshold = round(pkg_match.package_size * 0.20, 2)
            return

    # Tier 2/3: No conversion available → 0-100 pseudo-scale
    item.quantity = pct
    item.quantity_unit = None
    item.unit_type = 'continuous'
    item.reorder_threshold = 25  # Matches old percent_full < 25 logic


def _find_matching_package_conversion(ingredient_name: str, conversions: list):
    """Find a PackageConversion whose ingredient_pattern matches the ingredient name."""
    lower_name = ingredient_name.lower().strip()
    for conv in conversions:
        if conv.ingredient_pattern.lower() in lower_name:
            return conv
    return None


# =============================================================================
# Data Repair: Orphaned Package-Tracked Items
# =============================================================================

def repair_orphaned_package_items(db: Session) -> None:
    """
    One-time repair for items that have package_size + package_unit but
    quantity_unit is still None (orphaned after backfill classified them as
    Tier 2/3 pseudo-scale before package data was added).

    For each orphaned item:
    - Sets quantity_unit from package_unit via normalize_unit()
    - Sets unit_type via classify_unit_type()
    - Syncs quantity = total_capacity - amount_used
    - Sets reorder_threshold to 20% of package_size

    Idempotent: only touches items matching all three conditions.
    """
    items = db.query(InventoryItem).filter(
        InventoryItem.package_size != None,   # noqa: E711
        InventoryItem.package_unit != None,    # noqa: E711
        InventoryItem.quantity_unit == None,    # noqa: E711
    ).all()

    if not items:
        return

    count = 0
    for item in items:
        canon = normalize_unit(item.package_unit)
        if not canon:
            continue

        item.quantity_unit = canon
        item.unit_type = classify_unit_type(canon)

        # Sync quantity to remaining capacity
        total_capacity = (item.package_size or 0) * (item.packages_count or 1)
        used = item.amount_used or 0.0
        item.quantity = max(0.0, round(total_capacity - used, 2))

        item.reorder_threshold = round((item.package_size or 0) * 0.20, 2)
        count += 1

    if count > 0:
        db.commit()
        logger.info("Repair: fixed %d orphaned package-tracked inventory items", count)

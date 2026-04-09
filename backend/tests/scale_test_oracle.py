"""
Independent validation oracle for multi-recipe scale tests.

This module computes expected results WITHOUT using any production code
(except generate_canonical_name for name normalization, and convert_same_type
+ normalize_unit for unit conversion — these are pure math functions with
no DB/ORM/side effects). It's intentionally naive and literal — if the oracle
and production disagree, one of them has a bug, and the dumb one is easier
to verify by hand.

The oracle replicates the documented V1 behavior:
- Shopping list consolidates by canonical name, converts units when possible
- PERCENTAGE mode: 10% default depletion per cooking, clamp to 0
- COUNT mode: qty * scale_factor depletion, clamp to 0
- Household items (water, ice) are skipped
"""

from app.models.recipe import generate_canonical_name
from app.services.parsing.quantity_parser import normalize_unit
from app.services.parsing.quantity_consolidator import convert_same_type

# ═══════════════════════════════════════════════════════════════════════════════
# Constants (replicated from production, NOT imported)
# ═══════════════════════════════════════════════════════════════════════════════

HOUSEHOLD_SKIP = {
    "water", "ice", "ice water", "tap water", "cold water", "warm water",
    "hot water", "boiling water", "lukewarm water", "filtered water",
    "ice cube", "ice cubes",
}

# Replicated from infer_category_from_name() in recipe.py
_LIQUID_KEYWORDS = [
    "oil", "sauce", "vinegar", "milk", "cream", "broth", "stock",
    "juice", "syrup", "honey",
]
_SPICE_KEYWORDS = [
    "salt", "pepper", "cumin", "paprika", "oregano", "basil", "thyme",
    "cinnamon", "nutmeg", "cayenne", "chili powder", "garlic powder",
    "onion powder", "seasoning",
]


def _infer_mode(ingredient_name: str) -> str:
    """Replicate cold-start tracking mode inference.

    LIQUID or SPICE → 'percentage', everything else → 'count'.
    """
    name_lower = ingredient_name.lower()
    if any(kw in name_lower for kw in _LIQUID_KEYWORDS):
        return "percentage"
    if any(kw in name_lower for kw in _SPICE_KEYWORDS):
        return "percentage"
    return "count"


def _parse_quantity_simple(qty_str: str | None) -> float | None:
    """Naive quantity parser for archetype fixtures.

    Handles: integers ("3"), decimals ("1.5"), None/empty.
    Does NOT handle fractions ("1/2") or ranges ("1-2") — archetype
    fixtures use only simple decimals by design.
    """
    if not qty_str:
        return None
    qty_str = qty_str.strip()
    if not qty_str:
        return None
    try:
        return float(qty_str)
    except ValueError:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# Oracle Functions
# ═══════════════════════════════════════════════════════════════════════════════

def compute_scale_factor(planned_servings: int, base_servings: int) -> float:
    """Simple division: planned / base."""
    return planned_servings / (base_servings or 4)


def compute_shopping_list(meal_entries):
    """Compute expected shopping list from meal plan entries.

    Args:
        meal_entries: list of dicts, each with:
            - 'recipe': recipe fixture dict (name, ingredients, servings)
            - 'planned_servings': int

    Returns:
        dict: {canonical_name: {'amount': float, 'unit': str, 'mode': str, 'name': str}}
        Items with None/zero quantity (e.g., "to taste") are included with amount=0.

    Algorithm (matches shopping_list.py consolidation logic):
    1. Group meal entries by recipe (simulating recipe_meal_plans dict)
    2. For each recipe group, compute total_scale_factor
    3. For each ingredient, compute scaled amount
    4. Consolidate by canonical name (first unit seen wins)
    5. Skip household items
    """
    # Group by recipe name (simulates recipe_id grouping)
    recipe_groups = {}
    for entry in meal_entries:
        recipe = entry["recipe"]
        rname = recipe["name"]
        if rname not in recipe_groups:
            recipe_groups[rname] = {"recipe": recipe, "entries": []}
        recipe_groups[rname]["entries"].append(entry)

    # Consolidate ingredients across all recipes
    ingredient_map = {}  # canonical_name -> {amount, unit, mode, name}

    for rname, group in recipe_groups.items():
        recipe = group["recipe"]
        base_servings = recipe.get("servings") or 4

        # Sum scale factors across all meal plans for this recipe
        total_scale = sum(
            compute_scale_factor(e["planned_servings"], base_servings)
            for e in group["entries"]
        )

        for ing in recipe.get("ingredients", []):
            name = ing["name"].strip()
            canonical = generate_canonical_name(name)

            if canonical in HOUSEHOLD_SKIP:
                continue

            qty = _parse_quantity_simple(ing.get("quantity"))
            unit = ing.get("unit") or ""
            mode = _infer_mode(name)

            scaled_amount = qty * total_scale if qty else None

            if canonical in ingredient_map:
                existing = ingredient_map[canonical]
                if scaled_amount and existing["amount"] is not None:
                    existing_unit_norm = normalize_unit(existing["unit"] or "")
                    new_unit_norm = normalize_unit(unit or "")

                    if existing_unit_norm == new_unit_norm or (not existing_unit_norm and not new_unit_norm):
                        # Same unit — direct add
                        existing["amount"] += scaled_amount
                    else:
                        # Try converting NEW to EXISTING unit
                        converted = convert_same_type(scaled_amount, unit or "", existing["unit"] or "")
                        if converted is not None:
                            existing["amount"] += converted
                        else:
                            # Try converting EXISTING to NEW unit (prefer larger)
                            reverse = convert_same_type(existing["amount"], existing["unit"] or "", unit or "")
                            if reverse is not None:
                                existing["amount"] = reverse + scaled_amount
                                existing["unit"] = unit
                            else:
                                # Truly incompatible — blind add fallback
                                existing["amount"] += scaled_amount
                elif scaled_amount:
                    existing["amount"] = scaled_amount
            else:
                ingredient_map[canonical] = {
                    "amount": scaled_amount,
                    "unit": unit,
                    "mode": mode,
                    "name": name,
                }

    return ingredient_map


def compute_inventory_after_stocking(shopping_list):
    """Compute expected inventory state after shopping trip completion.

    Args:
        shopping_list: dict from compute_shopping_list()

    Returns:
        dict: {canonical_name: {'quantity': float, 'unit': str, 'percent_full': int, 'mode': str}}

    Simulates complete_shopping_trip:
    - PERCENTAGE items get percent_full=100, quantity stays as-is
    - COUNT items get quantity = shopping list amount, percent_full=None
    """
    inventory = {}
    for canonical, data in shopping_list.items():
        mode = data["mode"]
        if mode == "percentage":
            inventory[canonical] = {
                "quantity": data["amount"] or 0,
                "unit": data["unit"],
                "percent_full": 100,
                "mode": "percentage",
                "name": data["name"],
            }
        else:
            inventory[canonical] = {
                "quantity": data["amount"] or 0,
                "unit": data["unit"],
                "percent_full": None,
                "mode": "count",
                "name": data["name"],
            }
    return inventory


def compute_inventory_after_depletion(inventory, recipe, planned_servings, base_servings):
    """Compute expected inventory state after cooking depletion.

    Args:
        inventory: dict from compute_inventory_after_stocking() (will be mutated!)
        recipe: recipe fixture dict
        planned_servings: int
        base_servings: int

    Returns:
        dict: updated inventory (same reference, mutated in place)

    Simulates deplete_from_cooking:
    - PERCENTAGE: subtract 10%, clamp to 0
    - COUNT: subtract qty * scale_factor, clamp to 0
    - Skip zero-quantity ("to taste", "as needed")
    """
    scale_factor = compute_scale_factor(planned_servings, base_servings)

    for ing in recipe.get("ingredients", []):
        name = ing["name"].strip()
        canonical = generate_canonical_name(name)

        if canonical not in inventory:
            continue

        inv_item = inventory[canonical]
        qty = _parse_quantity_simple(ing.get("quantity"))

        if inv_item["mode"] == "percentage":
            # Default 10% per cooking session
            old_pf = inv_item["percent_full"] or 100
            inv_item["percent_full"] = max(0, old_pf - 10)
        else:
            # COUNT mode
            if qty and qty > 0:
                amount_used = qty * scale_factor
                old_quantity = inv_item["quantity"] or 0
                inv_item["quantity"] = max(0, old_quantity - amount_used)
            # Zero/None quantity → skip (to taste)

    return inventory


def compute_depletion_sequence(inventory, meal_sequence):
    """Compute inventory snapshots after each sequential cooking session.

    Args:
        inventory: initial inventory state (will be mutated!)
        meal_sequence: list of (recipe_fixture, planned_servings, base_servings) tuples

    Returns:
        list of inventory snapshots (deep copies), one per meal
    """
    import copy
    snapshots = []
    for recipe, planned, base in meal_sequence:
        compute_inventory_after_depletion(inventory, recipe, planned, base)
        snapshots.append(copy.deepcopy(inventory))
    return snapshots

"""
Quantity Consolidator Service

Consolidates ingredient quantities for shopping lists and checks inventory coverage.

Key Features:
1. Merge multiple quantities of same ingredient into single total
2. Convert between units when possible
3. Check if inventory covers recipe requirements
4. Handle unknowns gracefully (don't break the list)

Examples:
- Recipe A: "2 tsp salt" + Recipe B: "1 tbsp salt" → "5 tsp salt" (consolidated)
- Need: "5 tsp italian seasoning", Have: "1 bottle (2.5 oz)" → "In Stock" (converted)

Part of the smart unit conversion layer.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from app.services.parsing.quantity_parser import (
    ParsedQuantity,
    parse_quantity,
    normalize_unit,
)
from app.utils.unit_conversion import (
    UnitType,
    VOLUME_UNITS,
    WEIGHT_UNITS,
    COUNT_UNITS,
    COMMON_CONVERSIONS,
)


@dataclass
class ConsolidatedItem:
    """A consolidated shopping list item."""
    ingredient_name: str
    total_amount: float
    unit: Optional[str]
    source_recipes: List[str] = field(default_factory=list)
    in_stock: bool = False
    stock_amount: Optional[float] = None
    stock_unit: Optional[str] = None
    need_to_buy: Optional[float] = None
    conversion_note: Optional[str] = None


@dataclass
class InventoryCheck:
    """Result of checking if inventory covers a need."""
    has_enough: bool
    inventory_amount: float
    inventory_unit: str
    needed_amount: float
    needed_unit: str
    converted_inventory: Optional[float] = None
    conversion_note: Optional[str] = None


# Build unit lookup tables
def _build_unit_info() -> Dict[str, Tuple[UnitType, float]]:
    """Build a lookup table of unit name → (type, base_multiplier)."""
    info = {}

    for unit_data in VOLUME_UNITS:
        name = unit_data["name"]
        mult = unit_data["base_multiplier"]
        info[name] = (UnitType.VOLUME, mult)
        for abbr in unit_data["abbreviations"]:
            info[abbr.lower()] = (UnitType.VOLUME, mult)

    for unit_data in WEIGHT_UNITS:
        name = unit_data["name"]
        mult = unit_data["base_multiplier"]
        info[name] = (UnitType.WEIGHT, mult)
        for abbr in unit_data["abbreviations"]:
            info[abbr.lower()] = (UnitType.WEIGHT, mult)

    for unit_data in COUNT_UNITS:
        name = unit_data["name"]
        mult = unit_data["base_multiplier"]
        info[name] = (UnitType.COUNT, mult)
        for abbr in unit_data["abbreviations"]:
            info[abbr.lower()] = (UnitType.COUNT, mult)

    return info


UNIT_INFO = _build_unit_info()


def get_unit_info(unit: str) -> Optional[Tuple[UnitType, float]]:
    """Get unit type and base multiplier for a unit."""
    normalized = normalize_unit(unit)
    return UNIT_INFO.get(normalized)


def convert_same_type(amount: float, from_unit: str, to_unit: str) -> Optional[float]:
    """
    Convert between units of the same type.

    Example: 1 cup → 48 tsp

    Returns None if conversion not possible.
    """
    from_info = get_unit_info(from_unit)
    to_info = get_unit_info(to_unit)

    if not from_info or not to_info:
        return None

    from_type, from_mult = from_info
    to_type, to_mult = to_info

    # Must be same type
    if from_type != to_type:
        return None

    # Convert: amount * from_mult / to_mult
    return amount * from_mult / to_mult


def convert_volume_to_weight(
    amount: float,
    unit: str,
    ingredient_name: str
) -> Optional[Tuple[float, str]]:
    """
    Convert volume to weight for a specific ingredient.

    Uses COMMON_CONVERSIONS which stores grams per cup.

    Returns (amount_in_grams, "gram") or None if not possible.
    """
    # Normalize ingredient name
    normalized_ingredient = ingredient_name.lower().strip()

    # Check if we have a conversion for this ingredient
    grams_per_cup = None
    for name, gpc in COMMON_CONVERSIONS.items():
        if name in normalized_ingredient or normalized_ingredient in name:
            grams_per_cup = gpc
            break

    if grams_per_cup is None:
        return None

    # Convert the volume to cups first
    cups = convert_same_type(amount, unit, "cup")
    if cups is None:
        return None

    # Then convert cups to grams
    grams = cups * grams_per_cup
    return (grams, "gram")


def consolidate_quantities(
    items: List[Tuple[str, str]]  # List of (ingredient_name, quantity_string)
) -> List[ConsolidatedItem]:
    """
    Consolidate multiple quantity strings for the same ingredients.

    Args:
        items: List of (ingredient_name, quantity_string) tuples

    Returns:
        List of ConsolidatedItem with totals per ingredient
    """
    # Group by normalized ingredient name
    groups: Dict[str, List[Tuple[str, ParsedQuantity]]] = {}

    for ingredient_name, quantity_str in items:
        normalized_name = ingredient_name.lower().strip()
        parsed = parse_quantity(quantity_str)

        if normalized_name not in groups:
            groups[normalized_name] = []
        groups[normalized_name].append((ingredient_name, parsed))

    # Consolidate each group
    results: List[ConsolidatedItem] = []

    for normalized_name, group_items in groups.items():
        # Use the first ingredient name as canonical (preserves casing)
        canonical_name = group_items[0][0]

        # Collect all quantities
        quantities = [item[1] for item in group_items]

        # If all have the same unit, just sum
        units = set(q.unit for q in quantities if q.unit)
        if len(units) <= 1:
            total = sum(q.amount for q in quantities)
            unit = next(iter(units)) if units else None
            results.append(ConsolidatedItem(
                ingredient_name=canonical_name,
                total_amount=total,
                unit=unit,
            ))
        else:
            # Different units - try to convert to common unit
            consolidated = _consolidate_different_units(quantities, canonical_name)
            results.append(consolidated)

    return results


def _consolidate_different_units(
    quantities: List[ParsedQuantity],
    ingredient_name: str
) -> ConsolidatedItem:
    """
    Consolidate quantities with different units.

    Strategy:
    1. Find the most common unit type
    2. Try to convert all to a common unit within that type
    3. If can't convert, list separately with note
    """
    # Determine unit types
    volume_qty = []
    weight_qty = []
    count_qty = []
    other_qty = []

    for q in quantities:
        if not q.unit:
            other_qty.append(q)
            continue

        info = get_unit_info(q.unit)
        if info:
            unit_type, _ = info
            if unit_type == UnitType.VOLUME:
                volume_qty.append(q)
            elif unit_type == UnitType.WEIGHT:
                weight_qty.append(q)
            elif unit_type == UnitType.COUNT:
                count_qty.append(q)
            else:
                other_qty.append(q)
        else:
            other_qty.append(q)

    # Use the most common type
    type_counts = [
        (len(volume_qty), volume_qty, "teaspoon"),
        (len(weight_qty), weight_qty, "gram"),
        (len(count_qty), count_qty, "count"),
    ]
    type_counts.sort(reverse=True)

    primary_count, primary_qty, target_unit = type_counts[0]

    if primary_count == 0:
        # No convertible units - sum amounts and note
        total = sum(q.amount for q in quantities)
        return ConsolidatedItem(
            ingredient_name=ingredient_name,
            total_amount=total,
            unit=None,
            conversion_note="Mixed units, amounts summed"
        )

    # Convert all primary type to target unit
    total = 0.0
    conversion_failures = []

    for q in primary_qty:
        converted = convert_same_type(q.amount, q.unit or target_unit, target_unit)
        if converted is not None:
            total += converted
        else:
            conversion_failures.append(q)

    # Try to convert other types if possible
    for q in type_counts[1][1] + type_counts[2][1]:
        # Skip if already processed
        if q in primary_qty:
            continue

        # Try cross-type conversion
        if target_unit in ["teaspoon", "tablespoon", "cup"]:
            converted = convert_volume_to_weight(q.amount, q.unit, ingredient_name)
            if converted:
                # Have grams, need volume - reverse isn't straightforward
                conversion_failures.append(q)
        else:
            conversion_failures.append(q)

    # Format result
    note = None
    if conversion_failures:
        extras = ", ".join(f"{q.amount} {q.unit or ''}" for q in conversion_failures)
        note = f"Plus: {extras}"

    # Pick a nicer unit if total is large
    display_unit = target_unit
    display_amount = total

    if target_unit == "teaspoon" and total >= 48:
        display_amount = total / 48
        display_unit = "cup"
    elif target_unit == "teaspoon" and total >= 3:
        display_amount = total / 3
        display_unit = "tablespoon"
    elif target_unit == "gram" and total >= 1000:
        display_amount = total / 1000
        display_unit = "kilogram"

    return ConsolidatedItem(
        ingredient_name=ingredient_name,
        total_amount=round(display_amount, 2),
        unit=display_unit,
        conversion_note=note
    )


def check_inventory_coverage(
    needed: ConsolidatedItem,
    inventory_amount: float,
    inventory_unit: str,
    ingredient_name: Optional[str] = None
) -> InventoryCheck:
    """
    Check if inventory amount covers the needed amount.

    Handles:
    - Same units: direct comparison
    - Same type units: convert and compare
    - Cross-type: use ingredient-specific conversion

    Returns InventoryCheck with coverage status.
    """
    needed_unit = needed.unit or "count"
    ingredient_name = ingredient_name or needed.ingredient_name

    # Same unit - direct comparison
    if normalize_unit(needed_unit) == normalize_unit(inventory_unit):
        return InventoryCheck(
            has_enough=inventory_amount >= needed.total_amount,
            inventory_amount=inventory_amount,
            inventory_unit=inventory_unit,
            needed_amount=needed.total_amount,
            needed_unit=needed_unit,
        )

    # Try same-type conversion
    converted = convert_same_type(inventory_amount, inventory_unit, needed_unit)
    if converted is not None:
        return InventoryCheck(
            has_enough=converted >= needed.total_amount,
            inventory_amount=inventory_amount,
            inventory_unit=inventory_unit,
            needed_amount=needed.total_amount,
            needed_unit=needed_unit,
            converted_inventory=round(converted, 2),
            conversion_note=f"{inventory_amount} {inventory_unit} = {converted:.1f} {needed_unit}"
        )

    # Try cross-type conversion (volume → weight for needed)
    needed_in_weight = convert_volume_to_weight(
        needed.total_amount,
        needed_unit,
        ingredient_name
    )
    if needed_in_weight:
        needed_grams, _ = needed_in_weight
        inventory_in_grams = convert_same_type(inventory_amount, inventory_unit, "gram")
        if inventory_in_grams is not None:
            return InventoryCheck(
                has_enough=inventory_in_grams >= needed_grams,
                inventory_amount=inventory_amount,
                inventory_unit=inventory_unit,
                needed_amount=needed.total_amount,
                needed_unit=needed_unit,
                converted_inventory=round(inventory_in_grams, 1),
                conversion_note=f"{inventory_amount} {inventory_unit} ≈ {inventory_in_grams:.0f}g, need {needed_grams:.0f}g"
            )

    # Conversion not possible - return unknown
    return InventoryCheck(
        has_enough=False,  # Assume not enough if can't compare
        inventory_amount=inventory_amount,
        inventory_unit=inventory_unit,
        needed_amount=needed.total_amount,
        needed_unit=needed_unit,
        conversion_note=f"Cannot convert {inventory_unit} to {needed_unit}"
    )

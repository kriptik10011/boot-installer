"""
Inventory Unit Recommender

Converts recipe units (cup, tsp, slice) to sensible inventory tracking
units (oz, lb, count) based on food category. Used at shopping completion
time and during backfill migrations.

Part of the unified inventory tracking system.
"""

import math
import re
from typing import Optional, Tuple

from app.services.expiration_defaults import (
    detect_food_category,
    PREFERRED_INVENTORY_UNIT,
    FoodCategory,
)
from app.services.parsing.quantity_parser import normalize_unit
from app.services.parsing.quantity_consolidator import (
    convert_same_type,
    convert_volume_to_weight,
)


# Patterns that indicate section headers, not real ingredients
_SECTION_HEADER_RE = re.compile(
    r'^(optional\s*toppings|for the\s|toppings|garnish|serving suggestion|'
    r'sauce|dressing|marinade|glaze|for serving|to serve|for garnish)\s*:?\s*$',
    re.IGNORECASE,
)

# Embedded quantity patterns: "2lbs", "500g", "16oz", "1.5 lb"
_EMBEDDED_QTY_RE = re.compile(
    r'\b\d+(\.\d+)?\s*(lbs?|oz|g|kg|ml|fl\s*oz|gal|cups?|tbsp|tsp)\b',
    re.IGNORECASE,
)

# Compound metric pattern: "1lb/500g"
_COMPOUND_METRIC_RE = re.compile(
    r'\b\d+(\.\d+)?\s*\w+/\d+(\.\d+)?\s*\w+\b',
)

# Prep method descriptors to strip (beyond what generate_canonical_name handles)
_PREP_DESCRIPTORS = [
    "chopped", "minced", "diced", "sliced", "grated", "shredded", "crushed",
    "julienned", "cubed", "halved", "quartered", "torn", "crumbled",
    "sauteed", "roasted", "grilled", "fried", "baked", "steamed",
    "blanched", "poached", "braised", "smoked", "cured", "pickled",
    "melted", "softened", "room temperature", "warmed", "chilled",
    "packed", "loosely packed", "firmly packed", "lightly packed",
    "divided", "separated", "beaten", "whisked", "sifted",
    "peeled", "deveined", "trimmed", "cored", "seeded", "pitted",
    "rinsed", "drained", "patted dry", "squeezed",
    "finely", "roughly", "coarsely", "thinly",
]

# Size/quality descriptors
_SIZE_DESCRIPTORS = [
    "small", "medium", "large", "extra-large", "jumbo", "mini",
    "thin", "thick", "baby",
    "fresh", "freshly", "dried", "organic", "raw", "cooked", "canned",
    "frozen", "whole", "boneless", "skinless", "unsalted", "salted",
    "extra-virgin", "extra virgin", "extra", "low-fat", "fat-free",
    "light", "reduced-fat", "full-fat", "all-purpose",
]


def is_section_header(name: str) -> bool:
    """Check if a name is a section header rather than a real ingredient."""
    return bool(_SECTION_HEADER_RE.match(name.strip()))


def clean_display_name(raw_name: str) -> str:
    """Clean recipe ingredient name for inventory display.

    Strips prep methods, size descriptors, embedded quantities,
    nested parens, and section headers. Returns title-cased clean name.

    Examples:
        "chopped onion" -> "Onion"
        "minced garlic" -> "Garlic"
        "1lb/500g boneless, skinless chicken breast" -> "Chicken Breast"
        "bacon ((cooked until crispy))" -> "Bacon"
        "Ground Turkey 2lbs" -> "Ground Turkey"
        "fresh basil leaves" -> "Basil Leaves"
    """
    name = raw_name.strip()
    if not name:
        return name

    # Strip ALL parenthetical content (nested too)
    iterations = 0
    while '(' in name and iterations < 5:
        name = re.sub(r'\([^()]*\)', '', name).strip()
        iterations += 1

    # Strip compound metric FIRST: "1lb/500g" pattern (before embedded qty)
    name = _COMPOUND_METRIC_RE.sub('', name).strip()

    # Strip embedded quantities: "Ground Turkey 2lbs" -> "Ground Turkey"
    name = _EMBEDDED_QTY_RE.sub('', name).strip()

    # Remove commas (join descriptor lists): "boneless, skinless chicken" -> "boneless skinless chicken"
    # Descriptor stripping below handles the individual words.
    name = name.replace(",", " ")

    # Lowercase for prefix stripping
    lower = re.sub(r'\s+', ' ', name).lower().strip()

    # Strip prep descriptors and size descriptors (longest first to match multi-word)
    all_descriptors = sorted(
        _PREP_DESCRIPTORS + _SIZE_DESCRIPTORS, key=len, reverse=True
    )
    changed = True
    while changed:
        changed = False
        for desc in all_descriptors:
            if lower.startswith(desc + " "):
                lower = lower[len(desc) + 1:]
                changed = True
            elif lower.endswith(" " + desc):
                lower = lower[:-(len(desc) + 1)]
                changed = True

    # Normalize whitespace
    lower = re.sub(r'\s+', ' ', lower).strip()

    # Guard: if all words were stripped, fall back to original
    if not lower:
        lower = raw_name.lower().strip()
        lower = lower.replace(",", " ")
        lower = re.sub(r'\([^()]*\)', '', lower).strip()
        lower = re.sub(r'\s+', ' ', lower).strip()

    # Title case for display
    return lower.title()


# Slice/strip-to-weight ratios (ounces per slice, raw weight)
_SLICE_OZ_RATIOS: dict[str, float] = {
    "bacon": 1.0,
    "ham": 1.5,
    "turkey": 1.0,
    "salami": 0.5,
    "pepperoni": 0.17,
    "prosciutto": 0.5,
}

# Cup-to-count ratios for produce (count per cup)
_CUP_TO_COUNT: dict[str, float] = {
    "onion": 1.0,
    "bell pepper": 0.5,
    "tomato": 0.67,
    "potato": 1.0,
    "carrot": 2.0,
}

# Units that represent recipe-specific measurements, not inventory quantities
_RECIPE_ONLY_UNITS = {"slice", "strip", "slices", "strips"}


def recommend_inventory_unit(ingredient_name: str) -> Optional[str]:
    """Return the preferred inventory unit for an ingredient based on food category.

    Returns None if no preference exists, meaning the original recipe unit
    should be kept unchanged.
    """
    category = detect_food_category(ingredient_name)
    if category == FoodCategory.OTHER:
        return None
    return PREFERRED_INVENTORY_UNIT.get(category)


def convert_to_inventory_unit(
    ingredient_name: str,
    quantity: float,
    from_unit: str,
) -> Tuple[float, str]:
    """Convert a recipe quantity+unit to the preferred inventory unit.

    Falls back to (quantity, from_unit) unchanged if conversion is not possible.

    Args:
        ingredient_name: Raw ingredient name (e.g. "Mozzarella Cheese")
        quantity: Numeric quantity in from_unit
        from_unit: Current unit string (e.g. "cup", "slice", "tsp")

    Returns:
        (converted_quantity, target_unit) tuple
    """
    if not from_unit:
        return quantity, from_unit

    canonical_from = normalize_unit(from_unit)
    category = detect_food_category(ingredient_name)

    if category == FoodCategory.OTHER:
        return quantity, from_unit

    target_unit = PREFERRED_INVENTORY_UNIT.get(category)
    if target_unit is None:
        return quantity, from_unit

    # Already in preferred unit — return canonical form
    if canonical_from == target_unit:
        return quantity, target_unit

    name_lower = ingredient_name.lower().strip()

    # Strategy 1: Slice/strip -> weight
    if canonical_from in _RECIPE_ONLY_UNITS or from_unit.lower() in _RECIPE_ONLY_UNITS:
        result = _convert_slices_to_weight(name_lower, quantity, target_unit)
        if result is not None:
            return result

    # Strategy 2: Spices — any recipe qty maps to whole containers
    if category == FoodCategory.SPICES and target_unit == "count":
        return (1.0 if quantity > 0 else 0.0), "count"

    # Strategy 3: Volume -> count (produce)
    if target_unit == "count" and canonical_from in (
        "cup", "tablespoon", "teaspoon", "fluid_ounce",
    ):
        result = _convert_volume_to_count(name_lower, quantity, canonical_from)
        if result is not None:
            return result
        # For produce with no specific ratio, approximate using ceil
        cups = convert_same_type(quantity, canonical_from, "cup")
        if cups is not None:
            return max(1.0, float(math.ceil(cups))), "count"
        return 1.0, "count"

    # Strategy 4: Same measurement system (volume->volume or weight->weight)
    same_type_result = convert_same_type(quantity, canonical_from, target_unit)
    if same_type_result is not None:
        return round(same_type_result, 3), target_unit

    # Strategy 5: Volume -> weight via density (e.g. cup cheese -> oz)
    weight_result = convert_volume_to_weight(quantity, canonical_from, name_lower)
    if weight_result is not None:
        grams, _ = weight_result
        final = convert_same_type(grams, "gram", target_unit)
        if final is not None:
            return round(final, 2), target_unit

    # Fallback: return original
    return quantity, from_unit


def _convert_slices_to_weight(
    name_lower: str, quantity: float, target_unit: str
) -> Optional[Tuple[float, str]]:
    """Convert slice/strip count to weight (oz or lb)."""
    for keyword, oz_per_slice in _SLICE_OZ_RATIOS.items():
        if keyword in name_lower:
            total_oz = quantity * oz_per_slice
            # Convert oz to target unit
            result = convert_same_type(total_oz, "ounce", target_unit)
            if result is not None:
                return round(result, 2), target_unit
            # If target isn't a weight unit, return as oz
            return round(total_oz, 2), "ounce"
    return None


def _convert_volume_to_count(
    name_lower: str, quantity: float, canonical_from: str
) -> Optional[Tuple[float, str]]:
    """Convert volume of produce to a count approximation."""
    for keyword, count_per_cup in _CUP_TO_COUNT.items():
        if keyword in name_lower:
            # First convert to cups, then multiply by count_per_cup
            cups = convert_same_type(quantity, canonical_from, "cup")
            if cups is not None:
                count = cups * count_per_cup
                return max(1.0, round(count, 1)), "count"
            # If already in cups (shouldn't reach here but safety)
            return max(1.0, round(quantity * count_per_cup, 1)), "count"
    return None


def recommend_purchase_unit(
    db,
    ingredient_name: str,
    recipe_qty: float,
    recipe_unit: str,
) -> Tuple[float, str, Optional[dict]]:
    """Recommend how to store an ingredient in inventory.

    Returns: (quantity, unit, package_metadata_or_None)

    Priority:
    1. PackageConversion match -> return package info (1 jar, 1 bag, 1 pack)
    2. No match -> keep recipe units UNCHANGED

    NEVER force-converts units. Unknown items stay in recipe units.
    """
    from app.services.package_converter import find_conversion
    from app.models.recipe import generate_canonical_name

    canonical = generate_canonical_name(ingredient_name)

    # Priority 1: PackageConversion lookup (canonical first, then raw name)
    conv = find_conversion(db, canonical)
    if not conv:
        conv = find_conversion(db, ingredient_name)

    if conv:
        # Calculate how many packages needed
        if conv.cooking_equivalent and conv.cooking_unit:
            recipe_in_cooking = _convert_to_cooking_unit(
                recipe_qty, recipe_unit, conv.cooking_unit
            )
            if recipe_in_cooking is not None:
                packages_needed = max(1, math.ceil(
                    recipe_in_cooking / conv.cooking_equivalent
                ))
                pkg_meta = {
                    "package_type": conv.package_type,
                    "package_size": conv.package_size,
                    "package_unit": conv.package_unit,
                    "cooking_equivalent": conv.cooking_equivalent,
                    "cooking_unit": conv.cooking_unit,
                    "package_label": (
                        f"{conv.package_size}{conv.package_unit} "
                        f"{conv.package_type}"
                    ),
                }
                return (packages_needed, conv.package_type, pkg_meta)

    # Priority 2: Keep recipe units unchanged
    return (recipe_qty, recipe_unit, None)


def _convert_to_cooking_unit(
    qty: float, from_unit: str, to_cooking_unit: str
) -> Optional[float]:
    """Convert a recipe quantity to the PackageConversion's cooking unit.

    Handles unit normalization and same-type conversion.
    Returns None if conversion is not possible.
    """
    if not from_unit:
        return None

    norm_from = normalize_unit(from_unit)
    norm_to = normalize_unit(to_cooking_unit)

    if norm_from == norm_to:
        return qty

    result = convert_same_type(qty, norm_from, norm_to)
    return result

"""
Quantity Parser Service

Parses quantity strings from recipes and inventory into structured data.
Handles fractions, ranges, compound quantities, and various formats.

Examples:
- "2 tsp" → ParsedQuantity(amount=2.0, unit="tsp")
- "1/2 cup" → ParsedQuantity(amount=0.5, unit="cup")
- "1-2 cups" → ParsedQuantity(amount=2.0, unit="cup")  # Uses higher value
- "1 bottle (2.5 oz)" → ParsedQuantity(amount=2.5, unit="oz")
- "½ cup" → ParsedQuantity(amount=0.5, unit="cup")

Part of the smart unit conversion layer.
"""

import re
from dataclasses import dataclass
from typing import Optional, Tuple
from fractions import Fraction


@dataclass
class ParsedQuantity:
    """Structured representation of a parsed quantity."""
    amount: float
    unit: Optional[str]
    original: str
    confidence: float = 1.0  # How confident we are in the parse


# Unicode fraction characters to decimal
UNICODE_FRACTIONS = {
    '½': 0.5,
    '⅓': 1/3,
    '⅔': 2/3,
    '¼': 0.25,
    '¾': 0.75,
    '⅕': 0.2,
    '⅖': 0.4,
    '⅗': 0.6,
    '⅘': 0.8,
    '⅙': 1/6,
    '⅚': 5/6,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875,
}

# Common unit aliases for normalization
UNIT_ALIASES = {
    # Volume
    'tsp': 'teaspoon',
    't': 'teaspoon',
    'teaspoons': 'teaspoon',
    'tbsp': 'tablespoon',
    'T': 'tablespoon',
    'Tbsp': 'tablespoon',
    'tablespoons': 'tablespoon',
    'c': 'cup',
    'C': 'cup',
    'cups': 'cup',
    'fl oz': 'fluid_ounce',
    'fl. oz': 'fluid_ounce',
    'fl. oz.': 'fluid_ounce',
    'fluid ounce': 'fluid_ounce',
    'fluid ounces': 'fluid_ounce',
    'pt': 'pint',
    'pints': 'pint',
    'qt': 'quart',
    'quarts': 'quart',
    'gal': 'gallon',
    'gallons': 'gallon',
    'ml': 'milliliter',
    'mL': 'milliliter',
    'milliliters': 'milliliter',
    'L': 'liter',
    'l': 'liter',
    'liters': 'liter',
    'litre': 'liter',
    'litres': 'liter',

    # Weight
    'g': 'gram',
    'grams': 'gram',
    'kg': 'kilogram',
    'kilograms': 'kilogram',
    'oz': 'ounce',
    'ounces': 'ounce',
    'lb': 'pound',
    'lbs': 'pound',
    'pounds': 'pound',

    # Count
    'piece': 'count',
    'pieces': 'count',
    'item': 'count',
    'items': 'count',
    'each': 'count',
    'doz': 'dozen',
    'pairs': 'pair',

    # Container plurals
    'bags': 'bag',
    'boxes': 'box',
    'cans': 'can',
    'bottles': 'bottle',
    'jars': 'jar',
    'cartons': 'carton',
    'containers': 'container',
    'sticks': 'stick',
    'blocks': 'block',
    'loaves': 'loaf',
    'tubes': 'tube',
    'packs': 'pack',
    'bunches': 'bunch',
    'heads': 'head',
    'wedges': 'wedge',
    'canisters': 'canister',

    # V2: Additional multi-word units
    'fl. ounce': 'fluid_ounce',
    'fl ounce': 'fluid_ounce',
    'fl ounces': 'fluid_ounce',
    'fluid oz': 'fluid_ounce',
    'fluid oz.': 'fluid_ounce',
}

# --- Unit classification sets (used by classify_unit_type, get_default_step_size) ---

DISCRETE_UNITS = {'count', 'dozen', 'pair'}
CONTAINER_UNITS = {
    'bottle', 'jar', 'can', 'bag', 'box', 'carton',
    'container', 'stick', 'block', 'loaf', 'tube',
    'pack', 'bunch', 'head', 'wedge', 'canister',
}
CONTINUOUS_VOLUME = {
    'teaspoon', 'tablespoon', 'cup', 'fluid_ounce',
    'pint', 'quart', 'gallon', 'milliliter', 'liter',
}
CONTINUOUS_WEIGHT = {'gram', 'kilogram', 'ounce', 'pound'}

STEP_SIZE_DEFAULTS = {
    # Volume
    'teaspoon': 0.25, 'tablespoon': 0.5, 'cup': 0.25, 'fluid_ounce': 1.0,
    'pint': 0.5, 'quart': 0.5, 'gallon': 0.25, 'milliliter': 25, 'liter': 0.25,
    # Weight
    'gram': 5, 'kilogram': 0.1, 'ounce': 1.0, 'pound': 0.25,
    # Discrete
    'count': 1, 'dozen': 1, 'pair': 1,
}


def classify_unit_type(canonical_unit: Optional[str]) -> str:
    """
    Classify a canonical unit as 'discrete' or 'continuous'.

    Container units (bottle, jar, etc.) are discrete.
    None/unknown defaults to discrete.
    """
    if not canonical_unit or canonical_unit in DISCRETE_UNITS or canonical_unit in CONTAINER_UNITS:
        return 'discrete'
    if canonical_unit in CONTINUOUS_VOLUME or canonical_unit in CONTINUOUS_WEIGHT:
        return 'continuous'
    return 'discrete'


def get_default_step_size(canonical_unit: Optional[str]) -> float:
    """
    Get the default +/- step size for a given canonical unit.

    Returns 10 for None (legacy 0-100 percentage scale).
    Returns 1 for unknown/container units.
    """
    if not canonical_unit:
        return 10  # Legacy percentage scale
    return STEP_SIZE_DEFAULTS.get(canonical_unit, 1)


# Multi-word units that must be matched BEFORE splitting on whitespace.
# Sorted longest-first so "fl. oz." matches before "fl".
MULTI_WORD_UNITS = sorted(
    [alias for alias in UNIT_ALIASES if ' ' in alias or '.' in alias],
    key=len,
    reverse=True,
)


def parse_fraction(fraction_str: str) -> Optional[float]:
    """
    Parse a fraction string like "1/2" or "3/4" to float.

    Returns None if parsing fails.
    """
    try:
        # Handle mixed fractions like "1 1/2"
        parts = fraction_str.strip().split()
        if len(parts) == 2:
            whole = float(parts[0])
            frac = Fraction(parts[1])
            return whole + float(frac)
        else:
            return float(Fraction(fraction_str))
    except (ValueError, ZeroDivisionError):
        return None


def parse_number(num_str: str) -> Optional[float]:
    """
    Parse a number string that may contain fractions or unicode fractions.

    Returns None if parsing fails.
    """
    num_str = num_str.strip()

    if not num_str:
        return None

    # Check for unicode fractions
    for char, value in UNICODE_FRACTIONS.items():
        if char in num_str:
            # Handle "1½" (whole number + unicode fraction)
            prefix = num_str.replace(char, '').strip()
            if prefix:
                try:
                    return float(prefix) + value
                except ValueError:
                    return value
            return value

    # Check for regular fractions like "1/2" or "1 1/2"
    if '/' in num_str:
        result = parse_fraction(num_str)
        if result is not None:
            return result

    # Try plain number
    try:
        return float(num_str)
    except ValueError:
        return None


def normalize_unit(unit: str) -> str:
    """
    Normalize a unit string to its canonical form.

    Example: "tbsp" → "tablespoon", "lbs" → "pound", "T" → "tablespoon", "t" → "teaspoon"
    """
    stripped = unit.strip()

    # Check case-sensitive aliases FIRST (T=tablespoon vs t=teaspoon)
    if stripped in UNIT_ALIASES:
        return UNIT_ALIASES[stripped]

    # Then try lowercase
    lower = stripped.lower()
    if lower in UNIT_ALIASES:
        return UNIT_ALIASES[lower]

    # Fallback: case-insensitive scan for remaining aliases
    for alias, canonical in UNIT_ALIASES.items():
        if lower == alias.lower():
            return canonical

    return lower


def parse_quantity(quantity_str: str) -> ParsedQuantity:
    """
    Parse a quantity string into structured data.

    Handles:
    - Simple: "2 cups", "1.5 oz"
    - Fractions: "1/2 cup", "1 1/2 tsp"
    - Unicode fractions: "½ cup", "1½ cups"
    - Ranges: "1-2 cups" (uses higher value)
    - Compound: "1 bottle (2.5 oz)" (extracts inner quantity)
    - No unit: "3" → amount=3, unit=None

    Args:
        quantity_str: The quantity string to parse

    Returns:
        ParsedQuantity with parsed amount, unit, and confidence
    """
    original = quantity_str
    quantity_str = quantity_str.strip()

    if not quantity_str:
        return ParsedQuantity(amount=0, unit=None, original=original, confidence=0)

    # Check for compound quantities like "1 bottle (2.5 oz)"
    paren_match = re.search(r'\(([^)]+)\)', quantity_str)
    if paren_match:
        inner = paren_match.group(1)
        # Try to parse the inner quantity (more specific)
        inner_parsed = _parse_simple_quantity(inner)
        if inner_parsed.amount > 0 and inner_parsed.unit:
            inner_parsed.original = original
            inner_parsed.confidence *= 0.9  # Slightly lower confidence for compound
            return inner_parsed

    # Check for ranges like "1-2 cups" or "1 to 2 cups"
    range_match = re.match(r'([\d./\s]+)\s*[-–—to]+\s*([\d./\s]+)\s*(\S+.*)?', quantity_str)
    if range_match:
        low_str, high_str, unit_str = range_match.groups()
        high = parse_number(high_str)
        if high is not None:
            unit = normalize_unit(unit_str.strip()) if unit_str else None
            return ParsedQuantity(
                amount=high,  # Use higher value for safety
                unit=unit,
                original=original,
                confidence=0.85
            )

    # Parse simple quantity
    return _parse_simple_quantity(quantity_str, original)


def _parse_simple_quantity(quantity_str: str, original: str = None) -> ParsedQuantity:
    """Parse a simple quantity like '2 cups' or '1/2 tsp'."""
    if original is None:
        original = quantity_str

    quantity_str = quantity_str.strip()

    # V2: Try multi-word unit matching FIRST (before regex splits on whitespace).
    # This handles "2 fl oz", "1.5 fluid ounces", "3 fl. oz." correctly.
    lower_str = quantity_str.lower()
    for mw_unit in MULTI_WORD_UNITS:
        if mw_unit.lower() in lower_str:
            # Extract the number part before the multi-word unit
            idx = lower_str.index(mw_unit.lower())
            num_part = quantity_str[:idx].strip()
            if num_part:
                amount = parse_number(num_part)
                if amount is not None:
                    unit = normalize_unit(mw_unit)
                    return ParsedQuantity(
                        amount=amount,
                        unit=unit if unit else None,
                        original=original,
                        confidence=0.95,  # Slightly lower for multi-word match
                    )

    # Pattern: number(s) followed by optional unit
    # Handles: "2", "2 cups", "1/2 cup", "1 1/2 tsp", "1.5oz"
    pattern = r'^([\d\s./½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(.*)$'
    match = re.match(pattern, quantity_str)

    if match:
        num_str, unit_str = match.groups()
        amount = parse_number(num_str)

        if amount is not None:
            unit = normalize_unit(unit_str) if unit_str.strip() else None
            return ParsedQuantity(
                amount=amount,
                unit=unit if unit else None,
                original=original,
                confidence=1.0 if unit else 0.8
            )

    # Couldn't parse - return with low confidence
    return ParsedQuantity(
        amount=0,
        unit=None,
        original=original,
        confidence=0
    )


# Build set of recognized unit strings for parenthetical notes parsing.
# Includes both aliases ("oz", "lbs") and canonical forms ("ounce", "pound").
_NOTES_KNOWN_UNITS: set[str] = set()
for _alias in UNIT_ALIASES:
    _NOTES_KNOWN_UNITS.add(_alias.lower().rstrip('.'))
for _canonical in UNIT_ALIASES.values():
    _NOTES_KNOWN_UNITS.add(_canonical.lower())

_NOTES_UNIT_PATTERN = re.compile(
    r'(?:about\s+|approximately\s+|approx\.?\s+|~\s*)?'
    r'(\d+\.?\d*)\s+'
    r'([a-zA-Z]+\.?)',
    re.IGNORECASE,
)


def extract_effective_shopping_quantity(
    outer_qty: float,
    unit: Optional[str],
    notes: Optional[str],
) -> Optional[Tuple[float, str]]:
    """
    Compute effective shopping quantity from parenthetical notes.

    When recipe parser stores "4 (6 oz each) salmon filets" as
    quantity=4, unit=None, notes="6 oz each", the cooking display is
    correct but the shopping system needs the total weight: 24 oz.

    Returns (total_amount, unit_string) or None if no extraction possible.

    Examples:
        (4.0, None, "6 oz each")      → (24.0, "oz")
        (2.0, None, "8 ounce")        → (16.0, "ounce")
        (1.0, "can", "14.5 oz")       → None  (already has unit)
        (3.0, None, None)             → None  (no notes)
        (1.0, None, "room temperature") → None  (no unit in notes)
        (2.0, None, "about 1 lb each") → (2.0, "lb")
    """
    if unit and unit.strip():
        return None
    if not notes or not notes.strip():
        return None

    match = _NOTES_UNIT_PATTERN.search(notes)
    if not match:
        return None

    inner_amount_str = match.group(1)
    inner_unit_str = match.group(2).rstrip('.')

    if inner_unit_str.lower() not in _NOTES_KNOWN_UNITS:
        return None

    try:
        inner_amount = float(inner_amount_str)
    except ValueError:
        return None

    if inner_amount <= 0:
        return None

    return (outer_qty * inner_amount, normalize_unit(inner_unit_str))


def can_convert(from_unit: str, to_unit: str, ingredient_name: Optional[str] = None) -> bool:
    """
    Check if a conversion is possible between two units.

    Same-type conversions (tsp → cup) are always possible.
    Cross-type conversions (cup → gram) require ingredient-specific data.
    """
    from_norm = normalize_unit(from_unit)
    to_norm = normalize_unit(to_unit)

    # Same unit - no conversion needed
    if from_norm == to_norm:
        return True

    # Check if same type (both volume, both weight, etc.)
    from_is_volume = from_norm in CONTINUOUS_VOLUME
    to_is_volume = to_norm in CONTINUOUS_VOLUME
    from_is_weight = from_norm in CONTINUOUS_WEIGHT
    to_is_weight = to_norm in CONTINUOUS_WEIGHT
    from_is_count = from_norm in DISCRETE_UNITS
    to_is_count = to_norm in DISCRETE_UNITS

    # Same type - can convert
    if (from_is_volume and to_is_volume) or \
       (from_is_weight and to_is_weight) or \
       (from_is_count and to_is_count):
        return True

    # Cross-type requires ingredient name
    if ingredient_name:
        # Would check database for ingredient-specific conversion
        # For now, check our common conversions dict
        from app.utils.unit_conversion import COMMON_CONVERSIONS
        normalized_ingredient = ingredient_name.lower().strip()
        return normalized_ingredient in COMMON_CONVERSIONS

    return False

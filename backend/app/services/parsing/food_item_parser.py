"""
Unified Food Item Parser Service

Single backend parsing service for all food item text entry points.
Extracts and enhances parse_ingredient_line() from recipe_scraper.py,
adding package extraction, date parsing, CSV detection, and multi-line handling.

Used by:
- recipe_scraper.py (ingredient parsing during recipe import)
- food_parser router (preview endpoint for frontend)
- inventory bulk add (server-side parsing)
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import List, Optional, Tuple


# === Constants for ingredient line parsing ===

_UNICODE_FRACTIONS = {
    '\u00bd': 0.5, '\u00bc': 0.25, '\u00be': 0.75,
    '\u2153': 1.0 / 3.0, '\u2154': 2.0 / 3.0,
    '\u215b': 0.125, '\u215c': 0.375, '\u215d': 0.625, '\u215e': 0.875,
}

_WORD_NUMBERS = {
    'a': 1.0, 'an': 1.0, 'one': 1.0, 'two': 2.0, 'three': 3.0,
    'four': 4.0, 'five': 5.0, 'six': 6.0, 'seven': 7.0, 'eight': 8.0,
    'nine': 9.0, 'ten': 10.0, 'eleven': 11.0, 'twelve': 12.0,
    'half': 0.5, 'quarter': 0.25, 'dozen': 12.0,
}

_SIZE_DESCRIPTORS = {
    'small', 'medium', 'large', 'extra-large', 'extra', 'jumbo', 'thin', 'thick',
    'xl', 'mini', 'heaping', 'scant', 'rounded', 'level', 'generous', 'light', 'heavy',
}

_KNOWN_UNITS = {
    # Volume
    'cup', 'cups', 'c',
    'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tb',
    'teaspoon', 'teaspoons', 'tsp', 'ts',
    'quart', 'quarts', 'qt',
    'pint', 'pints', 'pt',
    'gallon', 'gallons', 'gal',
    'milliliter', 'milliliters', 'ml',
    'liter', 'liters', 'litre', 'litres', 'l',
    'fl',
    # Weight
    'ounce', 'ounces', 'oz',
    'pound', 'pounds', 'lb', 'lbs',
    'gram', 'grams', 'g',
    'kilogram', 'kilograms', 'kg',
    # Count
    'piece', 'pieces', 'pcs',
    'clove', 'cloves',
    'slice', 'slices',
    'sprig', 'sprigs',
    'stalk', 'stalks',
    'head', 'heads',
    'ear', 'ears',
    'stick', 'sticks',
    'strip', 'strips',
    'bunch', 'bunches',
    'pinch', 'pinches',
    'dash', 'dashes',
    'drop', 'drops',
    'handful', 'handfuls',
    'splash', 'knob', 'cube', 'sheet', 'sheets', 'rack',
    'loaf', 'loaves', 'link', 'links',
    # Containers
    'can', 'cans',
    'bag', 'bags',
    'bottle', 'bottles',
    'box', 'boxes',
    'jar', 'jars',
    'package', 'packages', 'pkg',
    'packet', 'packets',
    'envelope', 'envelopes',
    'carton', 'cartons',
    'container', 'containers',
    'tube', 'tubes',
    'whole',
}

_COUNT_UNIT_SINGULAR = {
    'cloves': 'clove', 'slices': 'slice', 'sprigs': 'sprig',
    'stalks': 'stalk', 'heads': 'head', 'ears': 'ear',
    'sticks': 'stick', 'strips': 'strip', 'bunches': 'bunch',
    'pinches': 'pinch', 'dashes': 'dash', 'drops': 'drop',
    'handfuls': 'handful', 'loaves': 'loaf', 'pieces': 'piece',
    'packages': 'package', 'sheets': 'sheet', 'links': 'link',
}

_ZERO_QTY_SUFFIXES = [
    'to taste', 'for garnish', 'as needed', 'for serving',
    'for decoration', 'for dusting', 'for topping',
    'for drizzling', 'for frying',
]

_SECTION_HEADER_RE = re.compile(
    r'^(?:for\s+the\s+|the\s+)?[\w\s]+:\s*$', re.IGNORECASE
)

# Container units where parenthetical notes should promote to package info
_CONTAINER_UNITS = {
    'can', 'cans', 'bottle', 'bottles', 'jar', 'jars',
    'box', 'boxes', 'bag', 'bags', 'package', 'packages', 'pkg',
    'packet', 'packets', 'carton', 'cartons', 'container', 'containers',
    'tube', 'tubes', 'envelope', 'envelopes',
}

# Units that indicate a package size (weight/volume inside a container)
_PACKAGE_SIZE_UNITS = {
    'oz', 'ounce', 'ounces', 'fl oz',
    'g', 'gram', 'grams',
    'kg', 'kilogram', 'kilograms',
    'ml', 'milliliter', 'milliliters',
    'l', 'liter', 'liters', 'litre', 'litres',
    'lb', 'lbs', 'pound', 'pounds',
}

# CSV header patterns to detect and skip
_CSV_HEADER_PATTERNS = [
    re.compile(r'^category\b', re.IGNORECASE),
    re.compile(r'^item\b', re.IGNORECASE),
    re.compile(r'^name\b', re.IGNORECASE),
    re.compile(r'^product\b', re.IGNORECASE),
]


# === Dataclasses ===

@dataclass
class ExtractedIngredient:
    """A single extracted ingredient (recipe context)."""
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    raw_text: str = ""


@dataclass
class ParsedFoodItem:
    """A parsed food item with full structured data (inventory/shopping context)."""
    name: str
    quantity: float = 1.0
    unit: Optional[str] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[str] = None
    category_hint: Optional[str] = None
    raw_text: str = ""
    confidence: float = 1.0


# === Core parsing functions (extracted from recipe_scraper.py) ===

def _parse_qty_token(s: str) -> Optional[float]:
    """Convert a single quantity token to a float.

    Handles integers, decimals, fractions, unicode fractions, mixed int+unicode.
    """
    s = s.strip()
    if not s:
        return None

    # Pure unicode fraction
    if s in _UNICODE_FRACTIONS:
        return _UNICODE_FRACTIONS[s]

    # Integer + unicode fraction, no space (e.g. "1\u00bd")
    if len(s) >= 2 and s[-1] in _UNICODE_FRACTIONS:
        try:
            return int(s[:-1]) + _UNICODE_FRACTIONS[s[-1]]
        except ValueError:
            pass

    # Decimal or integer
    try:
        return float(s)
    except ValueError:
        pass

    # Fraction (e.g. "1/2", "3/4")
    if '/' in s:
        parts = s.split('/')
        if len(parts) == 2:
            try:
                return float(parts[0]) / float(parts[1])
            except (ValueError, ZeroDivisionError):
                pass

    return None


def _extract_quantity(text: str):
    """Extract leading quantity from text.

    Returns (quantity_as_float_or_None, remaining_text).
    """
    text = text.strip()
    if not text:
        return None, text

    # Normalize Unicode fraction slash (U+2044) to regular slash (U+002F)
    text = text.replace('\u2044', '/')

    # 1a. Compound metric: "1lb/500g", "500g/1lb" (dual measurement — use first)
    compound_m = re.match(
        r'^(\d+\.?\d*)\s*(g|kg|ml|l|lb|lbs|oz)\s*/\s*\d+\.?\d*\s*(?:g|kg|ml|l|lb|lbs|oz)\b',
        text, re.IGNORECASE
    )
    if compound_m:
        qty = float(compound_m.group(1))
        unit_str = compound_m.group(2).lower()
        rest = text[compound_m.end():].strip()
        return qty, (unit_str + ' ' + rest).strip()

    # 1b. Metric no-space: "200g", "100ml", "1.5kg", "2lb", "16oz"
    metric_m = re.match(r'^(\d+\.?\d*)\s*(g|kg|ml|l|lb|lbs|oz)\b', text, re.IGNORECASE)
    if metric_m:
        qty = float(metric_m.group(1))
        unit_str = metric_m.group(2).lower()
        rest = text[metric_m.end():].strip()
        return qty, (unit_str + ' ' + rest).strip()

    # 2. Word numbers: "a pinch", "one cup", "half cup", "an egg", "dozen eggs"
    words = text.split(None, 1)
    first_word = words[0].lower() if words else ""
    if first_word in _WORD_NUMBERS:
        rest = words[1] if len(words) > 1 else ""
        return _WORD_NUMBERS[first_word], rest

    # 3a. Mixed number: "1 1/2 cups" (integer space fraction)
    mixed_m = re.match(r'^(\d+)\s+(\d+/\d+)(?:\s+|$)', text)
    if mixed_m:
        whole = float(mixed_m.group(1))
        frac_parts = mixed_m.group(2).split('/')
        frac = float(frac_parts[0]) / float(frac_parts[1])
        return whole + frac, text[mixed_m.end():]

    # 3b. Mixed number with unicode fraction: "1 \u00bd cups", "2 \u00bc cups"
    unicode_frac_chars = ''.join(_UNICODE_FRACTIONS.keys())
    mixed_unicode_m = re.match(
        r'^(\d+)\s+([' + unicode_frac_chars + r'])(?:\s+|$)', text
    )
    if mixed_unicode_m:
        whole = float(mixed_unicode_m.group(1))
        frac = _UNICODE_FRACTIONS.get(mixed_unicode_m.group(2), 0)
        return whole + frac, text[mixed_unicode_m.end():]

    # 4a. Range with dash where high side is mixed number: "1 - 1 1/2 cups"
    range_mixed_m = re.match(
        r'^([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)\s*[-\u2013]\s*(\d+)\s+(\d+/\d+)(?:\s+|$)', text
    )
    if range_mixed_m:
        low = _parse_qty_token(range_mixed_m.group(1))
        high_whole = float(range_mixed_m.group(2))
        frac_parts = range_mixed_m.group(3).split('/')
        high = high_whole + float(frac_parts[0]) / float(frac_parts[1])
        if low is not None:
            return (low + high) / 2.0, text[range_mixed_m.end():]

    # 4b. Range with dash/en-dash: "2-3", "1/2-3/4", "\u00bd-\u00be"
    range_m = re.match(
        r'^([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)\s*[-\u2013]\s*([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)(?:\s+|$)', text
    )
    if range_m:
        low = _parse_qty_token(range_m.group(1))
        high = _parse_qty_token(range_m.group(2))
        if low is not None and high is not None:
            return (low + high) / 2.0, text[range_m.end():]

    # 5a. Range with "to" where high side is mixed number: "1 to 1 1/2 tablespoons"
    to_mixed_m = re.match(
        r'^([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)\s+to\s+(\d+)\s+(\d+/\d+)(?:\s+|$)', text
    )
    if to_mixed_m:
        low = _parse_qty_token(to_mixed_m.group(1))
        high_whole = float(to_mixed_m.group(2))
        frac_parts = to_mixed_m.group(3).split('/')
        high = high_whole + float(frac_parts[0]) / float(frac_parts[1])
        if low is not None:
            return (low + high) / 2.0, text[to_mixed_m.end():]

    # 5b. Range with "to": "2 to 3 tablespoons"
    to_range_m = re.match(
        r'^([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)\s+to\s+([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)(?:\s+|$)', text
    )
    if to_range_m:
        low = _parse_qty_token(to_range_m.group(1))
        high = _parse_qty_token(to_range_m.group(2))
        if low is not None and high is not None:
            return (low + high) / 2.0, text[to_range_m.end():]

    # 6. Simple quantity: integer, decimal, fraction, unicode fraction, mixed int+unicode
    qty_m = re.match(r'^([\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+)(?:\s+|$)', text)
    if qty_m:
        qty = _parse_qty_token(qty_m.group(1))
        if qty is not None:
            return qty, text[qty_m.end():]

    return None, text


def _extract_trailing_notes(name: str):
    """Extract trailing modifiers from ingredient name.

    Handles: comma-separated notes, "or" alternatives, "divided",
    "plus more for...", trailing parenthetical notes.
    Returns (clean_name, notes_or_None).
    """
    notes_parts = []

    # 1. Trailing parenthetical: "butter (room temperature)"
    paren_m = re.search(r'\s*\(([^)]+)\)\s*$', name)
    if paren_m:
        notes_parts.append(paren_m.group(1).strip().lstrip(',').strip())
        name = name[:paren_m.start()].strip().rstrip(',').rstrip(';').strip()

    # 2a. Comma-separated trailing modifiers: "flour, sifted"
    comma_m = re.search(r',\s*(.+)$', name)
    if comma_m:
        notes_parts.append(comma_m.group(1).strip())
        name = name[:comma_m.start()].strip()

    # 2b. Semicolon-separated trailing notes: "kosher salt; for table salt use half"
    semi_m = re.search(r';\s*(.+)$', name)
    if semi_m:
        notes_parts.append(semi_m.group(1).strip())
        name = name[:semi_m.start()].strip()

    # 3. "or" alternatives (only if NOT already handled by comma):
    if not notes_parts:
        or_m = re.search(r'\s+or\s+(.+)$', name, re.IGNORECASE)
        if or_m:
            notes_parts.append('or ' + or_m.group(1).strip())
            name = name[:or_m.start()].strip()

    combined = '; '.join(notes_parts) if notes_parts else None
    return name, combined


def parse_ingredient_line(line: str) -> ExtractedIngredient:
    """Parse an ingredient line into structured data.

    Comprehensive parser handling 19+ categories of real-world recipe formats.
    Quantity is returned as Optional[float] (fractions, ranges -> midpoint, etc.).

    Examples:
    - "2 cups all-purpose flour" -> qty=2.0, unit="cups", name="all-purpose flour"
    - "1/2 teaspoon salt" -> qty=0.5, unit="teaspoon", name="salt"
    - "1 1/2 cups sugar" -> qty=1.5, unit="cups", name="sugar"
    - "1 (14.5 oz) can diced tomatoes" -> qty=1, unit="can", notes="14.5 oz"
    - "salt to taste" -> qty=0, unit=None, name="salt", notes="to taste"
    """
    original = line
    line = line.strip()
    if not line:
        return ExtractedIngredient(name="", raw_text="")

    # --- Step 1: Section header detection ---
    if _SECTION_HEADER_RE.match(line):
        return ExtractedIngredient(name="", raw_text=original)

    if line.upper() == line and line.endswith(':'):
        return ExtractedIngredient(name="", raw_text=original)

    if line.upper() == line and 2 <= len(line) <= 20 and re.match(r'^[A-Z\s]+$', line):
        return ExtractedIngredient(name="", raw_text=original)

    if re.match(r'^[-=_]+$', line):
        return ExtractedIngredient(name="", raw_text=original)

    # --- Step 1b: Section header with inline content ---
    # "Optional toppings: Sour cream, cubed avocado" -> strip known header prefix
    _header_inline_m = re.match(
        r'^(?:optional(?:\s+(?:toppings?|ingredients?|add-?ins?|garnish(?:es)?))?|'
        r'for\s+the\s+\w[\w\s]*|'
        r'toppings?|garnish(?:es)?|add-?ins?):\s+',
        line, re.IGNORECASE
    )
    if _header_inline_m:
        line = line[_header_inline_m.end():].strip()
        if not line:
            return ExtractedIngredient(name="", raw_text=original)

    # --- Step 2: Zero-quantity patterns (no leading number) ---
    line_lower = line.lower()
    if not line[0].isdigit() and line[0] not in _UNICODE_FRACTIONS:
        for suffix in _ZERO_QTY_SUFFIXES:
            if line_lower.endswith(suffix):
                ingredient_name = line[:len(line) - len(suffix)].strip().rstrip(',').rstrip('(').strip()
                if ingredient_name:
                    return ExtractedIngredient(
                        name=ingredient_name,
                        quantity=0.0,
                        notes=suffix,
                        raw_text=original,
                    )
        if line_lower.endswith('optional'):
            name_part = line[:len(line) - len('optional')].strip().rstrip(',').rstrip('(').strip()
            if name_part:
                return ExtractedIngredient(
                    name=name_part,
                    quantity=0.0,
                    notes='optional',
                    raw_text=original,
                )

    # --- Step 3: Extract quantity ---
    quantity, rest = _extract_quantity(line)

    # --- Step 4: Extract parenthetical size info (before unit) ---
    notes = None
    paren_m = re.match(r'^\(([^)]+)\)\s*', rest)
    if paren_m:
        notes = paren_m.group(1).strip()
        rest = rest[paren_m.end():]

    # --- Step 5: Extract unit ---
    unit = None
    words = rest.split(None, 1)
    if words:
        candidate = words[0].lower().rstrip('.,;')
        if candidate in _SIZE_DESCRIPTORS:
            pass
        elif candidate in _KNOWN_UNITS:
            unit = candidate
            rest = words[1] if len(words) > 1 else ""
            if unit == 'fl':
                next_words = rest.split(None, 1)
                if next_words and next_words[0].lower().rstrip('.,;') == 'oz':
                    unit = 'fl oz'
                    rest = next_words[1] if len(next_words) > 1 else ""

    # --- Step 5a: Trailing unit detection ---
    if unit is None and rest:
        comma_parts = rest.split(',', 1)
        pre_comma = comma_parts[0].strip()
        pre_words = pre_comma.split()
        if len(pre_words) >= 2:
            last_word = pre_words[-1].lower().rstrip('.,;')
            if last_word in _KNOWN_UNITS:
                unit = last_word
                name_part = ' '.join(pre_words[:-1])
                if len(comma_parts) > 1:
                    rest = name_part + ',' + comma_parts[1]
                else:
                    rest = name_part

    # --- Step 5b: Trailing quantity+unit — "Ground Turkey 2lbs" ---
    if quantity is None and unit is None and rest:
        trailing_m = re.search(
            r'\s(\d+\.?\d*)\s*(g|kg|ml|l|lb|lbs|oz)\s*$',
            rest, re.IGNORECASE
        )
        if trailing_m:
            quantity = float(trailing_m.group(1))
            unit = trailing_m.group(2).lower()
            rest = rest[:trailing_m.start()].strip()

    # --- Step 5.5: Parenthetical after unit ---
    rest = rest.strip()
    paren_after = re.match(r'^\(([^)]+)\)\s*', rest)
    if paren_after:
        after_note = paren_after.group(1).strip()
        if notes:
            notes = notes + '; ' + after_note
        else:
            notes = after_note
        rest = rest[paren_after.end():]

    # --- Step 5.6: "plus/minus QUANTITY UNIT" compound measurements ---
    rest = rest.strip()
    pm_m = re.match(
        r'^((?:plus|minus)\s+[\d\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e/.]+\s+\S+)\s+', rest, re.IGNORECASE
    )
    if pm_m:
        pm_note = pm_m.group(1).strip()
        if notes:
            notes = notes + '; ' + pm_note
        else:
            notes = pm_note
        rest = rest[pm_m.end():]

    # --- Step 6: Strip "of" connector ---
    rest = rest.strip()
    if rest.lower().startswith('of '):
        rest = rest[3:]

    # --- Step 7: Extract trailing notes from name ---
    name = rest.strip()
    trailing_notes = None
    if name:
        name, trailing_notes = _extract_trailing_notes(name)

    # Merge notes: parenthetical size info + trailing notes
    all_notes = []
    if notes:
        all_notes.append(notes)
    if trailing_notes:
        all_notes.append(trailing_notes)
    final_notes = '; '.join(all_notes) if all_notes else None

    # --- Step 8: Singularize count units ---
    if unit and unit in _COUNT_UNIT_SINGULAR:
        unit = _COUNT_UNIT_SINGULAR[unit]

    # --- Step 9: Final assembly ---
    if quantity is None and unit is None:
        return ExtractedIngredient(
            name=name.strip() if name else line,
            quantity=None,
            unit=None,
            notes=final_notes,
            raw_text=original,
        )

    return ExtractedIngredient(
        name=name.strip() if name else line,
        quantity=quantity,
        unit=unit,
        notes=final_notes,
        raw_text=original,
    )


# === New wrapper functions for food item parsing ===

def _extract_package_from_notes(
    notes: Optional[str], unit: Optional[str]
) -> Tuple[Optional[float], Optional[str], Optional[str]]:
    """Promote package size from notes to structured fields.

    When unit is a container type (can, bottle, jar, etc.) and notes contain
    a quantity+unit like "14.5 oz", promote to package_size/package_unit.

    Returns (package_size, package_unit, remaining_notes).
    """
    if not notes or not unit:
        return None, None, notes

    # Only extract package info when outer unit is a container
    if unit.lower() not in _CONTAINER_UNITS:
        return None, None, notes

    # Try to match "14.5 oz", "16 oz", "2.5 lb", etc. in notes
    # Notes may contain multiple parts separated by "; "
    note_parts = [p.strip() for p in notes.split(';')]
    remaining_parts = []
    pkg_size = None
    pkg_unit = None

    for part in note_parts:
        # Match: "14.5 oz", "16 ounces", "2.5 lb", "500 g", "1 liter"
        m = re.match(
            r'^(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|fl\s*oz|g|gram|grams|'
            r'kg|kilogram|kilograms|lb|lbs|pound|pounds|'
            r'ml|milliliter|milliliters|l|liter|liters|litre|litres)$',
            part.strip(), re.IGNORECASE
        )
        if m and pkg_size is None:
            pkg_size = float(m.group(1))
            pkg_unit = m.group(2).lower().strip()
            # Normalize "fl oz" variants
            if pkg_unit.startswith('fl'):
                pkg_unit = 'fl oz'
        else:
            remaining_parts.append(part)

    remaining = '; '.join(remaining_parts) if remaining_parts else None
    return pkg_size, pkg_unit, remaining


def _extract_expiration(text: str) -> Tuple[Optional[str], str]:
    """Extract expiration date from text.

    Supports MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD.
    Strips trailing "(Est.)" or similar.
    Returns (iso_date_string_or_None, remaining_text).
    """
    if not text:
        return None, text

    # Pattern: date at end of line, possibly with (Est.) suffix
    # Look for MM/DD/YYYY or MM/DD/YY
    slash_pattern = re.compile(
        r'\b(\d{1,2}/\d{1,2}/\d{2,4})\s*(?:\([^)]*\))?\s*$'
    )
    m = slash_pattern.search(text)
    if m:
        date_str = m.group(1)
        remaining = text[:m.start()].strip().rstrip(',').strip()
        iso = _parse_date_string(date_str)
        if iso:
            return iso, remaining

    # Pattern: YYYY-MM-DD
    iso_pattern = re.compile(
        r'\b(\d{4}-\d{2}-\d{2})\s*(?:\([^)]*\))?\s*$'
    )
    m = iso_pattern.search(text)
    if m:
        date_str = m.group(1)
        remaining = text[:m.start()].strip().rstrip(',').strip()
        return date_str, remaining

    return None, text


def _parse_date_string(raw: str) -> Optional[str]:
    """Convert a date string to ISO format (YYYY-MM-DD)."""
    cleaned = raw.replace('(Est.)', '').replace('(est.)', '').strip()
    if not cleaned:
        return None

    # MM/DD/YYYY or MM/DD/YY
    slash_m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', cleaned)
    if slash_m:
        month = slash_m.group(1).zfill(2)
        day = slash_m.group(2).zfill(2)
        year = slash_m.group(3)
        if len(year) == 2:
            year = '20' + year
        try:
            date(int(year), int(month), int(day))
            return f"{year}-{month}-{day}"
        except ValueError:
            return None

    # Already ISO
    if re.match(r'^\d{4}-\d{2}-\d{2}$', cleaned):
        try:
            parts = cleaned.split('-')
            date(int(parts[0]), int(parts[1]), int(parts[2]))
            return cleaned
        except ValueError:
            return None

    return None


def _is_csv_format(lines: List[str]) -> bool:
    """Detect if input looks like CSV with 4+ fields per line."""
    for line in lines:
        field_count = len(line.split(','))
        if field_count >= 4:
            return True
        break
    return False


def _is_csv_header(line: str) -> bool:
    """Check if a line is a CSV header row."""
    return any(p.search(line.strip()) for p in _CSV_HEADER_PATTERNS)


def _parse_csv_line(line: str) -> ParsedFoodItem:
    """Parse a CSV line into a ParsedFoodItem.

    Expected format: Category, Item, Size, Quantity, Expiration, Note
    """
    fields = [f.strip() for f in line.split(',')]

    category = fields[0] if len(fields) > 0 else None
    name = fields[1] if len(fields) > 1 else (fields[0] if fields else '')
    size_raw = fields[2] if len(fields) > 2 else ''
    qty_raw = fields[3] if len(fields) > 3 else ''
    exp_raw = fields[4] if len(fields) > 4 else ''
    note_raw = ', '.join(fields[5:]).strip() if len(fields) > 5 else ''

    # Parse quantity from quantity field
    qty = 1.0
    unit = None
    if qty_raw:
        m = re.match(r'^(\d+(?:\.\d+)?)\s*(.*)?$', qty_raw.strip())
        if m:
            qty = float(m.group(1)) if m.group(1) else 1.0
            unit = m.group(2).strip() or None

    # Parse size field for unit if not found in quantity
    pkg_size = None
    pkg_unit = None
    if size_raw:
        size_m = re.match(r'^(\d+(?:\.\d+)?)\s*(.+)?$', size_raw.strip())
        if size_m:
            size_val = float(size_m.group(1)) if size_m.group(1) else None
            size_unit = (size_m.group(2) or '').strip() or None
            if unit is None and size_unit:
                # If no unit from qty field, use size as the unit
                unit = size_unit
                if qty == 1.0 and size_val:
                    qty = size_val
            elif size_val and size_unit:
                # Size field becomes package info
                pkg_size = size_val
                pkg_unit = size_unit
        elif not unit:
            unit = size_raw.strip() or None

    # Parse expiration
    exp_date = _parse_date_string(exp_raw) if exp_raw else None

    return ParsedFoodItem(
        name=name or 'Unknown Item',
        quantity=qty,
        unit=unit,
        package_size=pkg_size,
        package_unit=pkg_unit,
        notes=note_raw or None,
        expiration_date=exp_date,
        category_hint=category,
        raw_text=line,
        confidence=0.9 if name else 0.5,
    )


def parse_food_item(text: str, context: str = "inventory") -> ParsedFoodItem:
    """Parse a single food item line into structured data.

    Wraps parse_ingredient_line() with package extraction and date parsing.
    Context can be "inventory" or "recipe" to adjust behavior.
    """
    text = text.strip()
    if not text:
        return ParsedFoodItem(name="", raw_text="", confidence=0.0)

    # First, try to extract an expiration date from the end
    exp_date, remaining = _extract_expiration(text)

    # Parse with the core ingredient parser
    result = parse_ingredient_line(remaining)

    # Build the food item
    pkg_size, pkg_unit, clean_notes = _extract_package_from_notes(
        result.notes, result.unit
    )

    return ParsedFoodItem(
        name=result.name,
        quantity=result.quantity if result.quantity is not None else 1.0,
        unit=result.unit,
        package_size=pkg_size,
        package_unit=pkg_unit,
        notes=clean_notes,
        expiration_date=exp_date,
        raw_text=text,
        confidence=1.0 if result.name else 0.0,
    )


def parse_food_items(text: str, context: str = "inventory") -> List[ParsedFoodItem]:
    """Parse multi-line text into a list of ParsedFoodItems.

    Auto-detects CSV vs simple format. Skips headers and blank lines.
    """
    lines = [line for line in text.split('\n') if line.strip()]
    if not lines:
        return []

    is_csv = _is_csv_format(lines)

    items: List[ParsedFoodItem] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if is_csv and _is_csv_header(stripped):
            continue

        if is_csv:
            item = _parse_csv_line(stripped)
        else:
            item = parse_food_item(stripped, context)

        if item.name:
            items.append(item)

    return items


def detect_format(text: str) -> str:
    """Detect input format: 'csv' or 'simple'."""
    lines = [line for line in text.split('\n') if line.strip()]
    return 'csv' if _is_csv_format(lines) else 'simple'

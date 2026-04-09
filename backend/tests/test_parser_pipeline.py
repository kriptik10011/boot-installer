"""
Parser Pipeline Integration Tests

Tests the full data flow: parse → store as string → re-parse → scale.
Tests canonical name dedup to prevent duplicate Ingredient records.

These tests prevent the Bug 8C class of regressions where bad data at one
stage corrupts everything downstream:
  parse_ingredient_line() → ExtractedIngredient (float)
  → ExtractedIngredientSchema (str)  ← FLOAT→STRING CONVERSION
  → RecipeIngredient (str qty, str unit)
  → parse_quantity() (back to float)  ← STRING→FLOAT RE-PARSE
  → shopping list scaling
  → inventory transfer
"""

import pytest
from app.services.parsing.food_item_parser import parse_ingredient_line
from app.services.parsing.quantity_parser import parse_quantity, normalize_unit
from app.models.recipe import generate_canonical_name


# =============================================================================
# ROUND-TRIP TESTS: parse → store → re-parse → scale
# =============================================================================

class TestRoundTripPipeline:
    """
    Simulate the actual data flow through the system:
    1. parse_ingredient_line() produces ExtractedIngredient (float qty)
    2. Quantity stored as string in RecipeIngredient.quantity
    3. parse_quantity() re-parses for shopping list scaling
    4. Scaled amount must be mathematically correct
    """

    def _round_trip(self, line: str, scale_factor: float = 1.0):
        """Parse → store as string → re-parse → scale. Return final amount."""
        # Step 1: Parser produces float
        parsed = parse_ingredient_line(line)
        if parsed.quantity is None:
            return None, parsed

        # Step 2: Store as string (what import_confirm does)
        stored_qty_str = str(parsed.quantity)
        stored_unit = parsed.unit or ""

        # Step 3: Re-parse for shopping list (what generate_shopping_list does)
        reparsed = parse_quantity(
            f"{stored_qty_str} {stored_unit}".strip()
        )

        # Step 4: Scale
        scaled_amount = reparsed.amount * scale_factor
        return scaled_amount, parsed

    @pytest.mark.parametrize("line, expected_base, scale, expected_scaled", [
        # Simple integers
        ("2 cups flour", 2.0, 2.0, 4.0),
        ("1 tablespoon oil", 1.0, 3.0, 3.0),
        # Fractions
        ("1/2 cup sugar", 0.5, 2.0, 1.0),
        ("1 1/2 cups milk", 1.5, 2.0, 3.0),
        # Unicode fractions
        ("½ cup butter", 0.5, 4.0, 2.0),
        ("1½ cups cream", 1.5, 2.0, 3.0),
        ("⅓ cup honey", 1.0 / 3.0, 3.0, 1.0),
        # Ranges (midpoint)
        ("2-3 tablespoons oil", 2.5, 2.0, 5.0),
        ("1 to 2 cups broth", 1.5, 2.0, 3.0),
        # Parenthetical packages
        ("4 (6 oz each) salmon filets", 4.0, 2.0, 8.0),
        ("2 (15 ounce) cans black beans, drained", 2.0, 1.5, 3.0),
        # Metric no-space
        ("200g flour", 200.0, 0.5, 100.0),
        ("100ml cream", 100.0, 2.0, 200.0),
        # Food-specific units
        ("3 cloves garlic", 3.0, 2.0, 6.0),
        ("2 stalks celery", 2.0, 3.0, 6.0),
        # Word numbers
        ("one cup flour", 1.0, 4.0, 4.0),
        ("a pinch of salt", 1.0, 2.0, 2.0),
        # Size descriptors (no unit)
        ("3 large eggs", 3.0, 2.0, 6.0),
    ])
    def test_round_trip_scaling(self, line, expected_base, scale, expected_scaled):
        """Full pipeline: parse → string → re-parse → scale produces correct result."""
        scaled, parsed = self._round_trip(line, scale_factor=scale)
        assert scaled is not None, f"Quantity should not be None for '{line}'"
        assert scaled == pytest.approx(expected_scaled, abs=0.05), \
            f"Round-trip scaling failed for '{line}': parsed={parsed.quantity}, " \
            f"stored='{parsed.quantity}', scaled={scaled}, expected={expected_scaled}"

    @pytest.mark.parametrize("line", [
        "salt and pepper to taste",
        "cooking spray",
        "fresh parsley for garnish",
        "olive oil, as needed",
    ])
    def test_zero_qty_round_trip(self, line):
        """Zero-quantity items should not produce scaling artifacts."""
        scaled, parsed = self._round_trip(line, scale_factor=2.0)
        # Zero-qty or None-qty items — scaling should produce 0 or None
        assert scaled is None or scaled == pytest.approx(0.0, abs=0.01), \
            f"Zero-qty item '{line}' should remain 0 after scaling, got {scaled}"


# =============================================================================
# UNIT NORMALIZATION ROUND-TRIP
# =============================================================================

class TestUnitNormalizationRoundTrip:
    """
    Verify that units survive the full pipeline:
    parse_ingredient_line → store → normalize_unit → compare
    """

    @pytest.mark.parametrize("line, expected_normalized", [
        ("2 tbsp butter", "tablespoon"),
        ("1 tsp salt", "teaspoon"),
        ("3 cups flour", "cup"),
        ("1 lb chicken", "pound"),
        ("8 oz cream cheese", "ounce"),
        ("250 g butter", "gram"),
        ("500 ml stock", "milliliter"),
        ("1 lbs beef", "pound"),
    ])
    def test_unit_normalizes(self, line, expected_normalized):
        """Units from parse should normalize to canonical form via normalize_unit."""
        parsed = parse_ingredient_line(line)
        assert parsed.unit is not None, f"unit should not be None for '{line}'"
        normalized = normalize_unit(parsed.unit)
        assert normalized == expected_normalized, \
            f"Unit '{parsed.unit}' from '{line}' should normalize to '{expected_normalized}', got '{normalized}'"


# =============================================================================
# CANONICAL NAME DEDUP TESTS
# =============================================================================

class TestCanonicalNameDedup:
    """
    Verify that different forms of the same ingredient produce the same
    canonical name. This prevents duplicate Ingredient records (Bug 8C class).
    """

    @pytest.mark.parametrize("name1, name2", [
        # Case insensitivity
        ("Olive Oil", "olive oil"),
        ("CHICKEN BREAST", "chicken breast"),
        # Prefix stripping
        ("fresh basil", "basil"),
        ("dried oregano", "oregano"),
        ("organic milk", "milk"),
        ("frozen peas", "peas"),
        ("freshly ground black pepper", "black pepper"),
        ("finely chopped onion", "onion"),
        ("thinly sliced garlic", "garlic"),
        # Parenthetical removal
        ("olive oil (extra virgin)", "olive oil"),
        ("flour (all-purpose)", "flour"),
        # Trailing descriptor removal
        ("flour, all-purpose", "flour"),
        ("chicken, boneless", "chicken"),
        # Multi-prefix stripping
        ("freshly ground black pepper", "ground black pepper"),
        ("extra virgin olive oil", "olive oil"),
        # Whitespace normalization
        ("  olive   oil  ", "olive oil"),
    ])
    def test_canonical_matches(self, name1, name2):
        """These name pairs should produce the same canonical name."""
        c1 = generate_canonical_name(name1)
        c2 = generate_canonical_name(name2)
        assert c1 == c2, \
            f"'{name1}' → '{c1}' should match '{name2}' → '{c2}'"

    @pytest.mark.parametrize("name1, name2", [
        # These SHOULD be different ingredients
        ("olive oil", "sesame oil"),
        ("chicken breast", "chicken thigh"),
        ("white sugar", "brown sugar"),
        ("butter", "peanut butter"),
        ("black pepper", "cayenne pepper"),
        ("garlic", "garlic powder"),
    ])
    def test_canonical_differs(self, name1, name2):
        """These name pairs should produce DIFFERENT canonical names."""
        c1 = generate_canonical_name(name1)
        c2 = generate_canonical_name(name2)
        assert c1 != c2, \
            f"'{name1}' → '{c1}' should NOT match '{name2}' → '{c2}'"

    def test_canonical_rejects_empty(self):
        """Empty/whitespace names should produce empty canonical."""
        assert generate_canonical_name("") == ""
        assert generate_canonical_name("   ") == ""

    @pytest.mark.parametrize("name, expected_canonical", [
        ("Extra Virgin Olive Oil", "olive oil"),
        ("olive oil (cold pressed)", "olive oil"),
        ("fresh basil leaves", "basil leaf"),
        ("flour, all-purpose", "flour"),
        ("freshly ground black pepper", "black pepper"),
        ("unsalted butter", "butter"),
        ("boneless skinless chicken thighs", "chicken thigh"),
    ])
    def test_canonical_expected_output(self, name, expected_canonical):
        """Verify specific canonical name outputs match expected values."""
        result = generate_canonical_name(name)
        assert result == expected_canonical, \
            f"generate_canonical_name('{name}') = '{result}', expected '{expected_canonical}'"


# =============================================================================
# PARSER → CANONICAL NAME INTEGRATION
# =============================================================================

class TestParserToCanonical:
    """
    Verify that parsed ingredient names produce correct canonical names.
    This is the full path: raw text → parser → ingredient name → canonical name.
    """

    @pytest.mark.parametrize("line, expected_canonical", [
        ("2 cups all-purpose flour, sifted", "all-purpose flour"),
        ("1 tablespoon extra-virgin olive oil", "olive oil"),
        ("3 large eggs, beaten", "egg"),
        ("1/2 cup unsalted butter, melted", "butter"),
        ("2 cloves garlic, minced", "garlic"),
        ("1 cup fresh basil leaves, torn", "basil leaf"),
    ])
    def test_parser_to_canonical(self, line, expected_canonical):
        """Parsed name should produce the expected canonical name for dedup."""
        parsed = parse_ingredient_line(line)
        canonical = generate_canonical_name(parsed.name)
        assert canonical == expected_canonical, \
            f"'{line}' → name='{parsed.name}' → canonical='{canonical}', " \
            f"expected '{expected_canonical}'"


# =============================================================================
# SHOPPING LIST CONSOLIDATION SIMULATION
# =============================================================================

class TestShoppingListConsolidation:
    """
    Simulate how the shopping list consolidates ingredients from multiple recipes.
    Two recipes using the same ingredient (by canonical name) should consolidate.
    """

    def test_consolidation_same_unit(self):
        """Same ingredient from two recipes should add up correctly."""
        # Recipe 1: "2 cups flour" scaled 1x
        r1 = parse_ingredient_line("2 cups flour")
        r1_qty = parse_quantity(f"{r1.quantity} {r1.unit or ''}".strip())

        # Recipe 2: "1 cup flour" scaled 1x
        r2 = parse_ingredient_line("1 cup flour")
        r2_qty = parse_quantity(f"{r2.quantity} {r2.unit or ''}".strip())

        # Consolidation: should be 3 cups
        total = r1_qty.amount + r2_qty.amount
        assert total == pytest.approx(3.0, abs=0.01)

        # Canonical names should match (so consolidation triggers)
        c1 = generate_canonical_name(r1.name)
        c2 = generate_canonical_name(r2.name)
        assert c1 == c2, f"'{r1.name}' and '{r2.name}' should consolidate"

    def test_consolidation_different_forms(self):
        """Same ingredient in different forms should consolidate by canonical name."""
        # Recipe 1: "1 cup unsalted butter, melted"
        r1 = parse_ingredient_line("1 cup unsalted butter, melted")
        # Recipe 2: "2 tablespoons butter, softened"
        r2 = parse_ingredient_line("2 tablespoons butter, softened")

        # Canonical names should match
        c1 = generate_canonical_name(r1.name)
        c2 = generate_canonical_name(r2.name)
        assert c1 == c2, \
            f"'{r1.name}' → '{c1}' and '{r2.name}' → '{c2}' should consolidate"

    def test_no_false_consolidation(self):
        """Different ingredients should NOT consolidate."""
        r1 = parse_ingredient_line("1 cup olive oil")
        r2 = parse_ingredient_line("1 tablespoon sesame oil")

        c1 = generate_canonical_name(r1.name)
        c2 = generate_canonical_name(r2.name)
        assert c1 != c2, \
            f"'{r1.name}' → '{c1}' and '{r2.name}' → '{c2}' should NOT consolidate"

"""
Parser Specification Test Suite

Derived from parser-spec.md — 19 categories of real-world recipe ingredient formats.
Every pattern from the spec has a test case. All must pass.

This is a V1 requirement: bad parsing → bad ingredients → bad shopping lists → drifting inventory.
"""

import pytest
from app.services.recipe_scraper import parse_ingredient_line


# =============================================================================
# CATEGORY 1: Quantity formats
# =============================================================================

class TestCategory1QuantityFormats:
    """Basic quantity formats: integers, fractions, unicode fractions, decimals."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name", [
        ("1 cup flour", 1.0, "cup", "flour"),
        ("1/2 cup sugar", 0.5, "cup", "sugar"),
        ("1 1/2 cups milk", 1.5, "cups", "milk"),
        ("1½ cups milk", 1.5, "cups", "milk"),
        ("1 ½ cups milk", 1.5, "cups", "milk"),
        ("½ cup sugar", 0.5, "cup", "sugar"),
        ("¼ teaspoon salt", 0.25, "teaspoon", "salt"),
        ("¾ cup butter", 0.75, "cup", "butter"),
        ("⅓ cup honey", 1.0 / 3.0, "cup", "honey"),
        ("⅔ cup cream", 2.0 / 3.0, "cup", "cream"),
        ("⅛ teaspoon nutmeg", 0.125, "teaspoon", "nutmeg"),
        (".5 cups cream", 0.5, "cups", "cream"),
        ("0.5 cups cream", 0.5, "cups", "cream"),
    ])
    def test_quantity_format(self, line, expected_qty, expected_unit, expected_name):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}, expected {expected_qty}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert result.name.strip().lower() == expected_name.lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected '{expected_name}'"


# =============================================================================
# CATEGORY 2: Range quantities (use midpoint)
# =============================================================================

class TestCategory2RangeQuantities:
    """Range quantities — parser should return the midpoint."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name", [
        ("1-2 tablespoons oil", 1.5, "tablespoons", "oil"),
        ("1 - 2 tablespoons oil", 1.5, "tablespoons", "oil"),
        ("1 to 2 tablespoons oil", 1.5, "tablespoons", "oil"),
        ("2-3 cloves garlic", 2.5, "clove", "garlic"),
        ("3 to 4 cups chicken broth", 3.5, "cups", "chicken broth"),
    ])
    def test_range_quantity(self, line, expected_qty, expected_unit, expected_name):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}, expected {expected_qty}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name}'"

    @pytest.mark.parametrize("line, expected_qty", [
        ("1 - 1 1/2 cups broth", 1.25),
        ("1-1½ cups broth", 1.25),
        ("1/2-1 teaspoon chili flakes", 0.75),
    ])
    def test_range_with_fractions(self, line, expected_qty):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}, expected {expected_qty}"


# =============================================================================
# CATEGORY 3: Parenthetical package sizes
# =============================================================================

class TestCategory3ParentheticalPackages:
    """Parenthetical package sizes like '1 (14.5 oz) can diced tomatoes'."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name_contains, expected_notes_contains", [
        ("1 (14.5 ounce) can diced tomatoes", 1.0, "can", "diced tomatoes", "14.5 ounce"),
        ("2 (15 ounce) cans black beans, drained", 2.0, "can", "black beans", "15 ounce"),
        ("1 (8 ounce) package cream cheese", 1.0, "package", "cream cheese", "8 ounce"),
        ("1 (8-ounce) package cream cheese", 1.0, "package", "cream cheese", "8-ounce"),
        ("4 (6 oz each) salmon filets", 4.0, None, "salmon filets", "6 oz each"),
        ("1 (16 ounce) box lasagna noodles", 1.0, "box", "lasagna noodles", "16 ounce"),
        ("2 (28 oz) cans crushed tomatoes", 2.0, "can", "crushed tomatoes", "28 oz"),
        ("1 (1 ounce) envelope dry onion soup mix", 1.0, "envelope", "dry onion soup mix", "1 ounce"),
        ("1 (6 ounce) can tomato paste", 1.0, "can", "tomato paste", "6 ounce"),
        ("1 (10.75 oz) can condensed cream of mushroom soup", 1.0, "can", "condensed cream of mushroom soup", "10.75 oz"),
    ])
    def test_parenthetical_package(self, line, expected_qty, expected_unit, expected_name_contains, expected_notes_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        if expected_unit is not None:
            assert result.unit == expected_unit or result.unit in (expected_unit + 's', expected_unit), \
                f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name_contains.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name_contains}'"
        assert result.notes is not None, f"notes should not be None for '{line}'"
        assert expected_notes_contains.lower() in result.notes.lower(), \
            f"notes mismatch for '{line}': got '{result.notes}', expected to contain '{expected_notes_contains}'"


# =============================================================================
# CATEGORY 4: Compound/food-specific units
# =============================================================================

class TestCategory4CompoundUnits:
    """Food-specific units like cloves, stalks, heads, sprigs, etc."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name", [
        ("3 cloves garlic", 3.0, "clove", "garlic"),
        ("1 clove garlic, minced", 1.0, "clove", "garlic"),
        ("2 stalks celery", 2.0, "stalk", "celery"),
        ("2 stalks celery, diced", 2.0, "stalk", "celery"),
        ("1 head lettuce", 1.0, "head", "lettuce"),
        ("1 bunch cilantro", 1.0, "bunch", "cilantro"),
        ("1 sprig rosemary", 1.0, "sprig", "rosemary"),
        ("2 sprigs fresh thyme", 2.0, "sprig", "fresh thyme"),
        ("1 stick butter", 1.0, "stick", "butter"),
        ("1 ear corn", 1.0, "ear", "corn"),
        ("3 ears corn, husked", 3.0, "ear", "corn"),
        ("1 rack baby back ribs", 1.0, "rack", "baby back ribs"),
        ("1 sheet puff pastry", 1.0, "sheet", "puff pastry"),
        ("1 loaf French bread", 1.0, "loaf", "French bread"),
        ("2 slices bacon", 2.0, "slice", "bacon"),
        ("1 knob fresh ginger", 1.0, "knob", "fresh ginger"),
        ("1 cube beef bouillon", 1.0, "cube", "beef bouillon"),
    ])
    def test_compound_unit(self, line, expected_qty, expected_unit, expected_name):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name}'"


# =============================================================================
# CATEGORY 5: "of" connector
# =============================================================================

class TestCategory5OfConnector:
    """Strip 'of' between unit and ingredient name."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name", [
        ("1 cup of flour", 1.0, "cup", "flour"),
        ("2 tablespoons of butter", 2.0, "tablespoons", "butter"),
        ("a pinch of salt", 1.0, "pinch", "salt"),
        ("a handful of basil", 1.0, "handful", "basil"),
        ("a dash of hot sauce", 1.0, "dash", "hot sauce"),
        ("a splash of vanilla", 1.0, "splash", "vanilla"),
    ])
    def test_of_connector(self, line, expected_qty, expected_unit, expected_name):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name}'"


# =============================================================================
# CATEGORY 6: Size/quality descriptors (keep in name, NOT as unit)
# =============================================================================

class TestCategory6SizeDescriptors:
    """Size descriptors like large, medium, small should stay in the name."""

    @pytest.mark.parametrize("line, expected_qty, expected_name_contains", [
        ("1 large onion", 1.0, "large onion"),
        ("2 medium potatoes", 2.0, "medium potatoes"),
        ("1 small shallot", 1.0, "small shallot"),
        ("3 large eggs", 3.0, "large eggs"),
        ("2 large egg yolks", 2.0, "large egg yolks"),
        ("1 extra-large egg", 1.0, "extra-large egg"),
        ("6 boneless skinless chicken thighs", 6.0, "chicken thighs"),
    ])
    def test_size_descriptor(self, line, expected_qty, expected_name_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        # Size descriptors should NOT be consumed as units
        assert result.unit is None or result.unit in ('', None), \
            f"unit should be None for '{line}': got {result.unit}"
        assert expected_name_contains.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name_contains}'"


# =============================================================================
# CATEGORY 7: Trailing modifiers after comma
# =============================================================================

class TestCategory7TrailingModifiers:
    """Trailing modifiers after comma should move to notes."""

    @pytest.mark.parametrize("line, expected_name, expected_notes_contains", [
        ("1 cup butter, melted", "butter", "melted"),
        ("2 cups cheese, shredded", "cheese", "shredded"),
        ("1 onion, diced", "onion", "diced"),
        ("3 eggs, beaten", "eggs", "beaten"),
        ("1 pound ground beef, browned", "ground beef", "browned"),
        ("2 cups all-purpose flour, sifted", "all-purpose flour", "sifted"),
        ("1 cup fresh basil leaves, torn", "fresh basil leaves", "torn"),
        ("3 green onions, sliced", "green onions", "sliced"),
        ("1/2 cup pecans, toasted and chopped", "pecans", "toasted and chopped"),
    ])
    def test_trailing_modifier(self, line, expected_name, expected_notes_contains):
        result = parse_ingredient_line(line)
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name}'"
        assert result.notes is not None, f"notes should not be None for '{line}'"
        assert expected_notes_contains.lower() in result.notes.lower(), \
            f"notes mismatch for '{line}': got '{result.notes}', expected to contain '{expected_notes_contains}'"


# =============================================================================
# CATEGORY 8: "divided" keyword
# =============================================================================

class TestCategory8Divided:
    """'divided' keyword should go to notes, quantity stays total."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name, expected_notes_contains", [
        ("1 3/4 cups sugar, divided", 1.75, "cups", "sugar", "divided"),
        ("1 cup fresh parsley, divided", 1.0, "cup", "fresh parsley", "divided"),
        ("4 tablespoons butter, divided", 4.0, "tablespoons", "butter", "divided"),
        ("2 teaspoons salt, divided", 2.0, "teaspoons", "salt", "divided"),
    ])
    def test_divided(self, line, expected_qty, expected_unit, expected_name, expected_notes_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}"
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}'"
        assert result.notes is not None and expected_notes_contains.lower() in result.notes.lower(), \
            f"notes mismatch for '{line}': got '{result.notes}'"


# =============================================================================
# CATEGORY 9: "to taste" / "for garnish" / "as needed" / "optional"
# =============================================================================

class TestCategory9ZeroQuantityPatterns:
    """Zero-quantity patterns: to taste, for garnish, cooking spray, etc."""

    @pytest.mark.parametrize("line, expected_name_contains", [
        ("salt and pepper to taste", "salt and pepper"),
        ("salt and pepper, to taste", "salt and pepper"),
        ("red pepper flakes, to taste", "red pepper flakes"),
        ("fresh parsley for garnish", "fresh parsley"),
        ("fresh parsley, for garnish", "fresh parsley"),
        ("cooking spray", "cooking spray"),
        ("nonstick cooking spray", "nonstick cooking spray"),
        ("olive oil, as needed", "olive oil"),
    ])
    def test_zero_qty_pattern(self, line, expected_name_contains):
        result = parse_ingredient_line(line)
        # These should have qty=0 or qty=None (no leading number)
        assert result.quantity is None or result.quantity == 0.0, \
            f"qty should be 0 or None for '{line}': got {result.quantity}"
        assert expected_name_contains.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name_contains}'"

    def test_optional_with_quantity(self):
        """Optional items WITH a quantity should preserve the quantity."""
        result = parse_ingredient_line("1/2 teaspoon cayenne pepper (optional)")
        assert result.quantity == pytest.approx(0.5, abs=0.01)
        assert result.unit == "teaspoon"
        assert "cayenne pepper" in result.name.strip().lower()
        assert result.notes is not None and "optional" in result.notes.lower()

    def test_or_alternative_with_quantity(self):
        """Items with 'or' alternative should keep primary ingredient."""
        result = parse_ingredient_line("1 teaspoon vanilla extract (or almond extract)")
        assert result.quantity == pytest.approx(1.0, abs=0.01)
        assert result.unit == "teaspoon"
        assert "vanilla extract" in result.name.strip().lower()
        assert result.notes is not None and "almond extract" in result.notes.lower()

    def test_hot_sauce_to_taste_optional(self):
        result = parse_ingredient_line("hot sauce, to taste (optional)")
        # Should not crash, name should contain "hot sauce"
        assert "hot sauce" in result.name.strip().lower()


# =============================================================================
# CATEGORY 10: Words-as-numbers
# =============================================================================

class TestCategory10WordNumbers:
    """Word numbers: one, two, three, a, an, half, etc."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name", [
        ("one clove garlic", 1.0, "clove", "garlic"),
        ("two large eggs", 2.0, None, "large eggs"),
        ("three tablespoons butter", 3.0, "tablespoons", "butter"),
        ("a pinch of salt", 1.0, "pinch", "salt"),
        ("an egg", 1.0, None, "egg"),
        ("a handful of spinach", 1.0, "handful", "spinach"),
        ("half a lemon", 0.5, None, "lemon"),
    ])
    def test_word_number(self, line, expected_qty, expected_unit, expected_name):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        if expected_unit is not None:
            assert result.unit == expected_unit, \
                f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name}'"


# =============================================================================
# CATEGORY 11: Metric measurements
# =============================================================================

class TestCategory11Metric:
    """Metric measurements including no-space patterns (200g, 100ml)."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name", [
        ("200g plain flour", 200.0, "g", "plain flour"),
        ("100ml double cream", 100.0, "ml", "double cream"),
        ("1kg chicken thighs", 1.0, "kg", "chicken thighs"),
        ("250 g butter, softened", 250.0, "g", "butter"),
        ("500 ml vegetable stock", 500.0, "ml", "vegetable stock"),
        ("1.5 kg pork shoulder", 1.5, "kg", "pork shoulder"),
        ("150g caster sugar", 150.0, "g", "caster sugar"),
        ("2 litres water", 2.0, "litres", "water"),
    ])
    def test_metric(self, line, expected_qty, expected_unit, expected_name):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}', expected to contain '{expected_name}'"


# =============================================================================
# CATEGORY 12: Mixed US/Metric with alternates
# =============================================================================

class TestCategory12MixedUSMetric:
    """Mixed US/Metric with parenthetical conversions."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name_contains, expected_notes_contains", [
        ("1 cup (240ml) whole milk", 1.0, "cup", "whole milk", "240ml"),
        ("8 ounces (225g) cream cheese", 8.0, "ounce", "cream cheese", "225g"),
        ("1 pound (450g) ground beef", 1.0, "pound", "ground beef", "450g"),
    ])
    def test_mixed_measurement(self, line, expected_qty, expected_unit, expected_name_contains, expected_notes_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        # Unit could be singular or plural
        assert expected_unit in (result.unit or "").lower() or (result.unit or "").lower().rstrip('s') == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}, expected {expected_unit}"
        assert expected_name_contains.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}'"
        assert result.notes is not None and expected_notes_contains.lower() in result.notes.lower(), \
            f"notes mismatch for '{line}': got '{result.notes}'"


# =============================================================================
# CATEGORY 13: Preparation before ingredient
# =============================================================================

class TestCategory13PreparationBefore:
    """Preparation words before the ingredient stay in the name."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name_contains", [
        ("1 cup sifted flour", 1.0, "cup", "sifted flour"),
        ("2 cups cooked rice", 2.0, "cups", "cooked rice"),
        ("1/4 cup melted butter", 0.25, "cup", "melted butter"),
        ("1 cup packed brown sugar", 1.0, "cup", "packed brown sugar"),
        ("1 can drained chickpeas", 1.0, "can", "drained chickpeas"),
    ])
    def test_preparation_before(self, line, expected_qty, expected_unit, expected_name_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"qty mismatch for '{line}': got {result.quantity}"
        assert result.unit == expected_unit, \
            f"unit mismatch for '{line}': got {result.unit}"
        assert expected_name_contains.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}'"


# =============================================================================
# CATEGORY 14: Brand names and specific products
# =============================================================================

class TestCategory14BrandNames:
    """Brand names should stay in the ingredient name."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name_contains", [
        ("1 jar Rao's marinara sauce", 1.0, "jar", "Rao's marinara sauce"),
        ("1 box Barilla lasagna noodles", 1.0, "box", "Barilla lasagna noodles"),
        ("2 tablespoons Worcestershire sauce", 2.0, "tablespoons", "Worcestershire sauce"),
        ("1 tablespoon Dijon mustard", 1.0, "tablespoon", "Dijon mustard"),
    ])
    def test_brand_name(self, line, expected_qty, expected_unit, expected_name_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01)
        assert result.unit == expected_unit
        assert expected_name_contains.lower() in result.name.strip().lower()

    def test_brand_in_parens(self):
        """Brand in parenthetical should go to notes."""
        result = parse_ingredient_line('1 tablespoon soy sauce (like Kikkoman)')
        assert result.quantity == pytest.approx(1.0, abs=0.01)
        assert result.unit == "tablespoon"
        assert "soy sauce" in result.name.strip().lower()
        assert result.notes is not None and "kikkoman" in result.notes.lower()


# =============================================================================
# CATEGORY 15: Hyphenated ingredients
# =============================================================================

class TestCategory15HyphenatedIngredients:
    """Hyphenated ingredient names should be preserved."""

    @pytest.mark.parametrize("line, expected_qty, expected_unit, expected_name_contains", [
        ("1 cup all-purpose flour", 1.0, "cup", "all-purpose flour"),
        ("2 tablespoons extra-virgin olive oil", 2.0, "tablespoons", "extra-virgin olive oil"),
        ("1 teaspoon garlic powder", 1.0, "teaspoon", "garlic powder"),
        ("1/4 cup low-sodium soy sauce", 0.25, "cup", "low-sodium soy sauce"),
        ("1 pound bone-in skin-on chicken thighs", 1.0, "pound", "bone-in skin-on chicken thighs"),
    ])
    def test_hyphenated(self, line, expected_qty, expected_unit, expected_name_contains):
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01)
        assert result.unit == expected_unit
        assert expected_name_contains.lower() in result.name.strip().lower()


# =============================================================================
# CATEGORY 16: Edge cases that should NOT crash
# =============================================================================

class TestCategory16EdgeCases:
    """Edge cases: empty lines, bare ingredients, section headers."""

    def test_empty_string(self):
        result = parse_ingredient_line("")
        assert result.name == ""

    def test_whitespace_only(self):
        result = parse_ingredient_line("   ")
        assert result.name == ""

    def test_bare_ingredient_garlic(self):
        """Bare ingredient with no quantity."""
        result = parse_ingredient_line("garlic")
        assert "garlic" in result.name.lower()
        assert result.quantity is None

    def test_bare_ingredient_salt(self):
        result = parse_ingredient_line("salt")
        assert "salt" in result.name.lower()

    def test_bare_ingredient_water(self):
        result = parse_ingredient_line("water")
        assert "water" in result.name.lower()

    def test_section_header_with_colon(self):
        result = parse_ingredient_line("Sauce:")
        assert result.name == ""

    def test_section_header_for_the(self):
        result = parse_ingredient_line("For the marinade:")
        assert result.name == ""

    def test_section_header_all_caps(self):
        result = parse_ingredient_line("FROSTING")
        assert result.name == ""

    def test_section_header_ingredients_colon(self):
        result = parse_ingredient_line("Ingredients:")
        assert result.name == ""

    def test_dashes_only(self):
        result = parse_ingredient_line("---")
        assert result.name == ""

    def test_equals_only(self):
        result = parse_ingredient_line("===")
        assert result.name == ""

    def test_underscores_only(self):
        result = parse_ingredient_line("___")
        assert result.name == ""


# =============================================================================
# CATEGORY 17: Multiple quantities per line
# =============================================================================

class TestCategory17MultipleQuantities:
    """Multiple quantities — take the primary, rest goes to notes."""

    def test_plus_extra(self):
        result = parse_ingredient_line("2 tablespoons butter + 1 tablespoon for greasing")
        assert result.quantity == pytest.approx(2.0, abs=0.01)
        assert result.unit == "tablespoons"
        assert "butter" in result.name.strip().lower()

    def test_plus_more_for(self):
        result = parse_ingredient_line("1 cup sugar plus more for sprinkling")
        assert result.quantity == pytest.approx(1.0, abs=0.01)
        assert result.unit == "cup"
        assert "sugar" in result.name.strip().lower()


# =============================================================================
# CATEGORY 18: Vulgar fraction edge cases
# =============================================================================

class TestCategory18VulgarFractions:
    """Unicode fraction edge cases including fraction slash U+2044."""

    def test_fraction_slash_u2044(self):
        """Fraction slash U+2044 should be treated like regular slash."""
        result = parse_ingredient_line("1\u2044" + "2 cup milk")  # 1⁄2 with U+2044
        assert result.quantity == pytest.approx(0.5, abs=0.01)
        assert result.unit == "cup"
        assert "milk" in result.name.strip().lower()

    def test_integer_space_unicode_fraction(self):
        result = parse_ingredient_line("2 ¼ cups flour")
        assert result.quantity == pytest.approx(2.25, abs=0.01)
        assert result.unit == "cups"
        assert "flour" in result.name.strip().lower()

    def test_integer_attached_unicode_fraction(self):
        result = parse_ingredient_line("3⅓ cups water")
        assert result.quantity == pytest.approx(3.333, abs=0.01)
        assert result.unit == "cups"
        assert "water" in result.name.strip().lower()


# =============================================================================
# CATEGORY 19: "or" alternatives
# =============================================================================

class TestCategory19OrAlternatives:
    """'or' alternatives — keep primary, put alternative in notes."""

    @pytest.mark.parametrize("line, expected_name_contains, expected_notes_contains", [
        ("1 cup heavy cream or half-and-half", "heavy cream", "half-and-half"),
        ("2 cups spinach or kale", "spinach", "kale"),
    ])
    def test_or_alternative(self, line, expected_name_contains, expected_notes_contains):
        result = parse_ingredient_line(line)
        assert expected_name_contains.lower() in result.name.strip().lower(), \
            f"name mismatch for '{line}': got '{result.name}'"
        assert result.notes is not None and expected_notes_contains.lower() in result.notes.lower(), \
            f"notes mismatch for '{line}': got '{result.notes}'"

    def test_or_with_measurement(self):
        """'or' with a different measurement should go to notes."""
        result = parse_ingredient_line("1 tablespoon fresh thyme or 1 teaspoon dried")
        assert result.quantity == pytest.approx(1.0, abs=0.01)
        assert result.unit == "tablespoon"
        assert "fresh thyme" in result.name.strip().lower() or "thyme" in result.name.strip().lower()
        assert result.notes is not None and "dried" in result.notes.lower()


# =============================================================================
# KNOWN UNIT SET: Verify all spec-listed units are recognized
# =============================================================================

class TestKnownUnits:
    """Verify all units listed in the spec are recognized by the parser."""

    @pytest.mark.parametrize("unit", [
        # Volume
        "cup", "cups", "tablespoon", "tablespoons", "tbsp",
        "teaspoon", "teaspoons", "tsp",
        "ml", "milliliter", "milliliters",
        "liter", "liters", "litre", "litres", "l",
        "gallon", "gallons", "gal",
        "quart", "quarts", "qt",
        "pint", "pints", "pt",
        # Weight
        "ounce", "ounces", "oz",
        "pound", "pounds", "lb", "lbs",
        "g", "gram", "grams",
        "kg", "kilogram", "kilograms",
        # Count/Produce
        "pinch", "dash", "splash", "handful",
        "clove", "cloves", "stalk", "stalks",
        "head", "heads", "bunch", "bunches",
        "sprig", "sprigs", "stick", "sticks",
        "ear", "ears", "slice", "slices",
        "piece", "pieces", "strip", "strips",
        "knob", "cube", "rack", "sheet", "sheets",
        "loaf", "loaves", "pcs", "link", "links",
        # Container
        "can", "cans", "jar", "jars", "bottle", "bottles",
        "bag", "bags", "box", "boxes",
        "package", "packages", "pkg", "packet", "packets",
        "envelope", "envelopes", "carton", "cartons",
        "container", "containers", "tube", "tubes",
    ])
    def test_unit_recognized(self, unit):
        """Each unit from the spec should be parsed as a unit, not as part of the name."""
        line = f"2 {unit} test ingredient"
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(2.0, abs=0.01), \
            f"qty should be 2.0 for '2 {unit} test ingredient': got {result.quantity}"
        # Unit should be extracted (possibly singularized)
        assert result.unit is not None, \
            f"unit should not be None for '2 {unit} test ingredient'"
        assert "test ingredient" in result.name.strip().lower(), \
            f"name mismatch for '2 {unit} test ingredient': got '{result.name}'"


# =============================================================================
# SIZE DESCRIPTORS: Verify they are NOT consumed as units
# =============================================================================

class TestSizeDescriptorsNotUnits:
    """Size descriptors should stay in the ingredient name, not be consumed as units."""

    @pytest.mark.parametrize("descriptor", [
        "small", "medium", "large", "extra-large", "jumbo", "mini",
        "thin", "thick", "heaping", "scant", "rounded", "level",
        "generous", "light", "heavy",
    ])
    def test_size_not_unit(self, descriptor):
        line = f"2 {descriptor} potatoes"
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(2.0, abs=0.01)
        # Size descriptor should NOT be consumed as the unit
        assert result.unit is None or result.unit == "", \
            f"'{descriptor}' should not be a unit, got unit={result.unit}"
        assert descriptor in result.name.strip().lower(), \
            f"'{descriptor}' should remain in name, got name='{result.name}'"


# =============================================================================
# WORD-TO-NUMBER MAP: Verify all spec-listed words are recognized
# =============================================================================

class TestWordToNumberMap:
    """Verify all word numbers from the spec map correctly."""

    @pytest.mark.parametrize("word, expected_qty", [
        ("a", 1.0),
        ("an", 1.0),
        ("one", 1.0),
        ("two", 2.0),
        ("three", 3.0),
        ("four", 4.0),
        ("five", 5.0),
        ("six", 6.0),
        ("seven", 7.0),
        ("eight", 8.0),
        ("nine", 9.0),
        ("ten", 10.0),
        ("eleven", 11.0),
        ("twelve", 12.0),
        ("dozen", 12.0),
        ("half", 0.5),
        ("quarter", 0.25),
    ])
    def test_word_number_map(self, word, expected_qty):
        line = f"{word} cup flour"
        result = parse_ingredient_line(line)
        assert result.quantity == pytest.approx(expected_qty, abs=0.01), \
            f"word '{word}' should map to {expected_qty}, got {result.quantity}"


# =============================================================================
# NO-CRASH GUARANTEE: Random garbage input should never raise
# =============================================================================

class TestNoCrashGuarantee:
    """Parser must never crash on any input. Return sensible defaults for garbage."""

    @pytest.mark.parametrize("garbage", [
        "",
        "   ",
        "---",
        "===",
        "___",
        "🍕🍔🌮",
        "a" * 500,
        "1/0 cups flour",
        "999999999999 cups flour",
        "-1 cup flour",
        "1.2.3 cups flour",
        "NaN cups flour",
        "inf cups flour",
        "null",
        "undefined",
        "<script>alert('xss')</script>",
        "1 cup; DROP TABLE ingredients;--",
    ])
    def test_no_crash(self, garbage):
        """Parser should never raise an exception, regardless of input."""
        result = parse_ingredient_line(garbage)
        assert result is not None
        assert isinstance(result.name, str)
        assert isinstance(result.raw_text, str)


# =============================================================================
# COMPREHENSIVE PARSER FIXES — Regression tests for 14 failure modes
# =============================================================================

class TestComprehensiveParserFixes:
    """Regression tests for failure modes discovered in parser audit.

    Covers: dual metric, trailing qty, section headers, semicolons,
    orphaned parens, Phase 9 fallback, and metric no-space extensions.
    """

    # --- Tier 1: Data loss fixes ---

    def test_dual_metric_lb_g(self):
        """F5: '1lb/500g chicken' — compound metric, use first measurement."""
        r = parse_ingredient_line("1lb/500g boneless, skinless chicken thighs, diced")
        assert r.quantity == pytest.approx(1.0)
        assert r.unit == "lb"
        assert "500g" not in r.name
        assert "1lb" not in r.name

    def test_trailing_quantity_lbs(self):
        """F1: 'Ground Turkey 2lbs' — trailing qty+unit extraction."""
        r = parse_ingredient_line("Ground Turkey 2lbs")
        assert r.quantity == pytest.approx(2.0)
        assert r.unit == "lbs"
        assert r.name.strip().lower() == "ground turkey"

    def test_section_header_inline_items(self):
        """F2: 'Optional toppings: Sour cream...' — strip header prefix."""
        r = parse_ingredient_line("Optional toppings: Sour cream, cubed avocado, diced jalapeno")
        assert "Optional toppings:" not in r.name

    def test_semicolon_notes(self):
        """F4: 'kosher salt; for table salt...' — semicolon as note delimiter."""
        r = parse_ingredient_line("Diamond Crystal kosher salt; for table salt use half")
        assert ";" not in r.name
        assert r.name.strip().lower() == "diamond crystal kosher salt"

    def test_no_qty_still_cleans_name(self):
        """F3: Phase 9 fallback must use cleaned name, not raw line."""
        r = parse_ingredient_line("chopped nuts (walnuts, pecans, almonds)")
        assert "(" not in r.name
        assert ")" not in r.name

    def test_optional_prefix_with_range(self):
        """F6: 'Optional: 8 to 16 ounces pasta' — strip Optional: prefix."""
        r = parse_ingredient_line("Optional: 8 to 16 ounces pasta")
        assert "Optional:" not in r.name

    # --- Tier 2: Malformed output fixes ---

    def test_orphaned_paren_for_serving(self):
        """F7: 'Lemon wedges (for serving)' — no orphaned '(' in name."""
        r = parse_ingredient_line("Lemon wedges (for serving)")
        assert "(" not in r.name
        assert r.name.strip() == "Lemon wedges"

    def test_orphaned_paren_comma_optional(self):
        """F8: 'Blue Cheese Crumbles (, optional)' — clean orphaned parens."""
        r = parse_ingredient_line("Blue Cheese Crumbles (, optional)")
        assert "(" not in r.name
        assert "," not in r.name
        assert r.name.strip() == "Blue Cheese Crumbles"

    # --- Metric no-space extensions ---

    def test_simple_lb_no_space(self):
        """RC4: '2lb chicken breast' — lb recognized without space."""
        r = parse_ingredient_line("2lb chicken breast")
        assert r.quantity == pytest.approx(2.0)
        assert r.unit == "lb"

    def test_simple_oz_no_space(self):
        """RC4: '16oz pasta' — oz recognized without space."""
        r = parse_ingredient_line("16oz pasta")
        assert r.quantity == pytest.approx(16.0)
        assert r.unit == "oz"

    # --- Edge cases ---

    def test_no_qty_no_unit_simple(self):
        """No qty/unit should still return clean name via Phase 9."""
        r = parse_ingredient_line("Kosher salt")
        assert r.name == "Kosher salt"

    def test_fresh_basil_for_garnish(self):
        """Zero-qty suffix with orphaned paren guard."""
        r = parse_ingredient_line("Fresh basil (for garnish)")
        assert r.name.strip() == "Fresh basil"
        assert "(" not in r.name

    # --- Negative tests: colon prep notes must NOT strip ingredient name ---

    def test_colon_prep_garlic_minced(self):
        """'garlic: minced' must NOT destroy 'garlic' — not a section header."""
        r = parse_ingredient_line("garlic: minced")
        assert "garlic" in r.name.lower(), f"'garlic' destroyed, got name={r.name!r}"

    def test_colon_prep_brown_sugar(self):
        """'brown sugar: packed' must keep 'brown sugar' in name."""
        r = parse_ingredient_line("brown sugar: packed")
        assert "brown sugar" in r.name.lower(), f"name={r.name!r}"

    def test_colon_prep_butter_softened(self):
        """'butter: softened' must keep 'butter' in name."""
        r = parse_ingredient_line("butter: softened")
        assert "butter" in r.name.lower(), f"name={r.name!r}"

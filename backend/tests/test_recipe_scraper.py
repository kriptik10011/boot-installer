"""
Tests for Recipe Scraper Service.

Phase 16: Recipe Import from URL
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

# Configure pytest-asyncio
pytestmark = pytest.mark.anyio

from app.services.recipe_scraper import (
    parse_time_string,
    parse_servings_string,
    parse_ingredient_line,
    generate_ai_prompt,
    scrape_recipe_url,
    scrape_with_library,
    scrape_generic_html,
    ExtractedRecipe,
    ExtractedIngredient,
    FallbackResponse,
)


class TestParseTimeString:
    """Tests for parse_time_string function."""

    def test_iso_duration_minutes_only(self):
        """Test ISO 8601 format with minutes only."""
        assert parse_time_string("PT30M") == 30
        assert parse_time_string("PT15M") == 15
        assert parse_time_string("PT5M") == 5

    def test_iso_duration_hours_only(self):
        """Test ISO 8601 format with hours only."""
        assert parse_time_string("PT1H") == 60
        assert parse_time_string("PT2H") == 120

    def test_iso_duration_hours_and_minutes(self):
        """Test ISO 8601 format with hours and minutes."""
        assert parse_time_string("PT1H30M") == 90
        assert parse_time_string("PT2H15M") == 135

    def test_natural_language_minutes(self):
        """Test natural language format with minutes."""
        assert parse_time_string("30 minutes") == 30
        assert parse_time_string("15 min") == 15
        assert parse_time_string("5 mins") == 5

    def test_natural_language_hours(self):
        """Test natural language format with hours."""
        assert parse_time_string("1 hour") == 60
        assert parse_time_string("2 hours") == 120
        assert parse_time_string("1 hr") == 60

    def test_natural_language_hours_and_minutes(self):
        """Test natural language format with hours and minutes."""
        assert parse_time_string("1 hour 30 minutes") == 90
        assert parse_time_string("2 hrs 15 min") == 135

    def test_empty_string(self):
        """Test empty or None input."""
        assert parse_time_string("") is None
        assert parse_time_string(None) is None

    def test_invalid_format(self):
        """Test invalid time formats return None."""
        assert parse_time_string("some text") is None
        assert parse_time_string("abc") is None


class TestParseServingsString:
    """Tests for parse_servings_string function."""

    def test_integer_string(self):
        """Test integer string input."""
        assert parse_servings_string("4") == 4
        assert parse_servings_string("12") == 12

    def test_integer_input(self):
        """Test integer input."""
        assert parse_servings_string(4) == 4
        assert parse_servings_string(8) == 8

    def test_with_text(self):
        """Test servings with text."""
        assert parse_servings_string("4 servings") == 4
        assert parse_servings_string("6-8 servings") == 6
        assert parse_servings_string("Makes 12") == 12

    def test_empty_string(self):
        """Test empty or None input."""
        assert parse_servings_string("") is None
        assert parse_servings_string(None) is None


class TestParseIngredientLine:
    """Comprehensive tests for parse_ingredient_line — 19 categories."""

    # ============================================================
    # Category 1: Empty / Section headers
    # ============================================================

    def test_empty_line(self):
        result = parse_ingredient_line("")
        assert result.name == ""
        assert result.raw_text == ""

    def test_whitespace_only(self):
        result = parse_ingredient_line("   ")
        assert result.name == ""

    def test_section_header_for_the(self):
        result = parse_ingredient_line("For the sauce:")
        assert result.name == ""

    def test_section_header_all_caps(self):
        result = parse_ingredient_line("FOR THE DRESSING:")
        assert result.name == ""

    def test_section_header_simple(self):
        result = parse_ingredient_line("Sauce:")
        assert result.name == ""

    # ============================================================
    # Category 2: Integer quantities
    # ============================================================

    def test_integer_cups(self):
        r = parse_ingredient_line("2 cups all-purpose flour")
        assert r.quantity == 2.0
        assert r.unit == "cups"
        assert r.name == "all-purpose flour"

    def test_integer_tbsp(self):
        r = parse_ingredient_line("2 tbsp olive oil")
        assert r.quantity == 2.0
        assert r.unit == "tbsp"
        assert r.name == "olive oil"

    def test_integer_oz(self):
        r = parse_ingredient_line("8 oz cream cheese")
        assert r.quantity == 8.0
        assert r.unit == "oz"
        assert r.name == "cream cheese"

    def test_integer_lb(self):
        r = parse_ingredient_line("1 lb ground beef")
        assert r.quantity == 1.0
        assert r.unit == "lb"
        assert r.name == "ground beef"

    def test_integer_lbs(self):
        r = parse_ingredient_line("2 lbs salmon")
        assert r.quantity == 2.0
        assert r.unit == "lbs"
        assert r.name == "salmon"

    # ============================================================
    # Category 3: Fraction quantities
    # ============================================================

    def test_fraction_half(self):
        r = parse_ingredient_line("1/2 teaspoon salt")
        assert r.quantity == pytest.approx(0.5)
        assert r.unit == "teaspoon"
        assert r.name == "salt"

    def test_fraction_tsp(self):
        r = parse_ingredient_line("1/2 tsp kosher salt")
        assert r.quantity == pytest.approx(0.5)
        assert r.unit == "tsp"
        assert r.name == "kosher salt"

    def test_fraction_quarter(self):
        r = parse_ingredient_line("1/4 cup sugar")
        assert r.quantity == pytest.approx(0.25)
        assert r.unit == "cup"
        assert r.name == "sugar"

    def test_fraction_three_quarters(self):
        r = parse_ingredient_line("3/4 cup milk")
        assert r.quantity == pytest.approx(0.75)
        assert r.unit == "cup"
        assert r.name == "milk"

    # ============================================================
    # Category 4: Mixed numbers
    # ============================================================

    def test_mixed_number(self):
        r = parse_ingredient_line("1 1/2 cups sugar")
        assert r.quantity == pytest.approx(1.5)
        assert r.unit == "cups"
        assert r.name == "sugar"

    def test_mixed_number_two_and_three_quarters(self):
        r = parse_ingredient_line("2 3/4 teaspoons baking powder")
        assert r.quantity == pytest.approx(2.75)
        assert r.unit == "teaspoons"
        assert r.name == "baking powder"

    # ============================================================
    # Category 5: Unicode fractions
    # ============================================================

    def test_unicode_half(self):
        r = parse_ingredient_line("½ cup milk")
        assert r.quantity == pytest.approx(0.5)
        assert r.unit == "cup"
        assert r.name == "milk"

    def test_unicode_quarter(self):
        r = parse_ingredient_line("¼ teaspoon nutmeg")
        assert r.quantity == pytest.approx(0.25)
        assert r.unit == "teaspoon"
        assert r.name == "nutmeg"

    def test_unicode_three_quarters(self):
        r = parse_ingredient_line("¾ cup cream")
        assert r.quantity == pytest.approx(0.75)
        assert r.unit == "cup"
        assert r.name == "cream"

    def test_unicode_third(self):
        r = parse_ingredient_line("⅓ cup honey")
        assert r.quantity == pytest.approx(1.0 / 3.0)
        assert r.unit == "cup"
        assert r.name == "honey"

    def test_unicode_mixed_int_plus_fraction(self):
        """1½ (no space) → 1.5"""
        r = parse_ingredient_line("1½ cups water")
        assert r.quantity == pytest.approx(1.5)
        assert r.unit == "cups"
        assert r.name == "water"

    # ============================================================
    # Category 6: Decimal quantities
    # ============================================================

    def test_decimal(self):
        r = parse_ingredient_line("2.5 tablespoons oil")
        assert r.quantity == pytest.approx(2.5)
        assert r.unit == "tablespoons"
        assert r.name == "oil"

    def test_decimal_small(self):
        r = parse_ingredient_line("0.5 cup broth")
        assert r.quantity == pytest.approx(0.5)
        assert r.unit == "cup"
        assert r.name == "broth"

    # ============================================================
    # Category 7: Range quantities (midpoint)
    # ============================================================

    def test_range_dash(self):
        r = parse_ingredient_line("2-3 tablespoons olive oil")
        assert r.quantity == pytest.approx(2.5)
        assert r.unit == "tablespoons"
        assert r.name == "olive oil"

    def test_range_fraction(self):
        r = parse_ingredient_line("1/2-3/4 cup cream")
        assert r.quantity == pytest.approx(0.625)
        assert r.unit == "cup"
        assert r.name == "cream"

    def test_range_to(self):
        r = parse_ingredient_line("2 to 3 cups flour")
        assert r.quantity == pytest.approx(2.5)
        assert r.unit == "cups"
        assert r.name == "flour"

    def test_range_to_mixed_number_high(self):
        """'1 to 1 1/2 tablespoons' → midpoint of 1 and 1.5 = 1.25"""
        r = parse_ingredient_line("1 to 1 1/2 tablespoons Dijon mustard")
        assert r.quantity == pytest.approx(1.25)
        assert r.unit == "tablespoons"
        assert r.name == "Dijon mustard"

    # ============================================================
    # Category 8: Word numbers
    # ============================================================

    def test_word_one(self):
        r = parse_ingredient_line("one clove garlic")
        assert r.quantity == 1.0
        assert r.unit == "clove"
        assert r.name == "garlic"

    def test_word_a(self):
        r = parse_ingredient_line("a pinch of salt")
        assert r.quantity == 1.0
        assert r.unit == "pinch"
        assert r.name == "salt"

    def test_word_an(self):
        r = parse_ingredient_line("an egg")
        assert r.quantity == 1.0
        assert r.unit is None
        assert r.name == "egg"

    def test_word_half(self):
        r = parse_ingredient_line("half cup flour")
        assert r.quantity == pytest.approx(0.5)
        assert r.unit == "cup"
        assert r.name == "flour"

    def test_word_dozen(self):
        r = parse_ingredient_line("dozen eggs")
        assert r.quantity == 12.0
        assert r.unit is None
        assert r.name == "eggs"

    def test_word_two(self):
        r = parse_ingredient_line("two cups rice")
        assert r.quantity == 2.0
        assert r.unit == "cups"
        assert r.name == "rice"

    # ============================================================
    # Category 9: Parenthetical package sizes
    # ============================================================

    def test_paren_size_can(self):
        r = parse_ingredient_line("1 (14.5 oz) can diced tomatoes")
        assert r.quantity == 1.0
        assert r.unit == "can"
        assert r.name == "diced tomatoes"
        assert "14.5 oz" in r.notes

    def test_paren_size_no_unit(self):
        r = parse_ingredient_line("4 (6 oz each) salmon filets")
        assert r.quantity == 4.0
        assert r.unit is None
        assert r.name == "salmon filets"
        assert "6 oz each" in r.notes

    def test_paren_size_package(self):
        r = parse_ingredient_line("2 (8 oz) packages cream cheese")
        assert r.quantity == 2.0
        assert r.unit == "package"  # singularized
        assert r.name == "cream cheese"
        assert "8 oz" in r.notes

    # ============================================================
    # Category 10: Size descriptors (NOT units)
    # ============================================================

    def test_size_large_eggs(self):
        r = parse_ingredient_line("3 large eggs")
        assert r.quantity == 3.0
        assert r.unit is None
        assert r.name == "large eggs"

    def test_size_medium_onion(self):
        r = parse_ingredient_line("1 medium onion")
        assert r.quantity == 1.0
        assert r.unit is None
        assert r.name == "medium onion"

    def test_size_small_potato(self):
        r = parse_ingredient_line("2 small potatoes")
        assert r.quantity == 2.0
        assert r.unit is None
        assert r.name == "small potatoes"

    # ============================================================
    # Category 11: Trailing comma modifiers → notes
    # ============================================================

    def test_trailing_sifted(self):
        r = parse_ingredient_line("2 cups flour, sifted")
        assert r.quantity == 2.0
        assert r.unit == "cups"
        assert r.name == "flour"
        assert r.notes == "sifted"

    def test_trailing_chopped(self):
        r = parse_ingredient_line("1 cup parsley, chopped")
        assert r.quantity == 1.0
        assert r.unit == "cup"
        assert r.name == "parsley"
        assert r.notes == "chopped"

    def test_trailing_divided(self):
        r = parse_ingredient_line("1 cup sugar, divided")
        assert r.quantity == 1.0
        assert r.unit == "cup"
        assert r.name == "sugar"
        assert "divided" in r.notes

    def test_trailing_plus_more(self):
        r = parse_ingredient_line("2 tbsp oil, plus more for greasing")
        assert r.quantity == 2.0
        assert r.unit == "tbsp"
        assert r.name == "oil"
        assert "plus more for greasing" in r.notes

    # ============================================================
    # Category 12: Trailing parenthetical notes
    # ============================================================

    def test_paren_room_temp(self):
        r = parse_ingredient_line("2 cups butter (room temperature)")
        assert r.quantity == 2.0
        assert r.unit == "cups"
        assert r.name == "butter"
        assert "room temperature" in r.notes

    def test_paren_diced(self):
        r = parse_ingredient_line("1 lb chicken (diced)")
        assert r.quantity == 1.0
        assert r.unit == "lb"
        assert r.name == "chicken"
        assert "diced" in r.notes

    # ============================================================
    # Category 13: Zero-quantity patterns
    # ============================================================

    def test_salt_to_taste(self):
        r = parse_ingredient_line("salt to taste")
        assert r.quantity == 0.0
        assert r.name == "salt"
        assert r.notes == "to taste"

    def test_pepper_to_taste(self):
        r = parse_ingredient_line("black pepper to taste")
        assert r.quantity == 0.0
        assert r.name == "black pepper"
        assert r.notes == "to taste"

    def test_salt_and_pepper_to_taste(self):
        r = parse_ingredient_line("salt and pepper to taste")
        assert r.quantity == 0.0
        assert r.name == "salt and pepper"
        assert r.notes == "to taste"

    def test_for_garnish(self):
        r = parse_ingredient_line("fresh parsley for garnish")
        assert r.quantity == 0.0
        assert r.name == "fresh parsley"
        assert r.notes == "for garnish"

    def test_as_needed(self):
        r = parse_ingredient_line("cooking spray as needed")
        assert r.quantity == 0.0
        assert r.name == "cooking spray"
        assert r.notes == "as needed"

    def test_optional(self):
        r = parse_ingredient_line("fresh basil, optional")
        assert r.quantity == 0.0
        assert r.name == "fresh basil"
        assert r.notes == "optional"

    # ============================================================
    # Category 14: "of" connector stripping
    # ============================================================

    def test_of_connector(self):
        r = parse_ingredient_line("1 cup of flour")
        assert r.quantity == 1.0
        assert r.unit == "cup"
        assert r.name == "flour"

    def test_of_connector_pinch(self):
        r = parse_ingredient_line("a pinch of salt")
        assert r.quantity == 1.0
        assert r.unit == "pinch"
        assert r.name == "salt"

    def test_of_connector_splash(self):
        r = parse_ingredient_line("1 splash of lemon juice")
        assert r.quantity == 1.0
        assert r.unit == "splash"
        assert r.name == "lemon juice"

    # ============================================================
    # Category 15: Metric no-space
    # ============================================================

    def test_metric_grams(self):
        r = parse_ingredient_line("200g flour")
        assert r.quantity == 200.0
        assert r.unit == "g"
        assert r.name == "flour"

    def test_metric_ml(self):
        r = parse_ingredient_line("100ml cream")
        assert r.quantity == 100.0
        assert r.unit == "ml"
        assert r.name == "cream"

    def test_metric_kg(self):
        r = parse_ingredient_line("1.5kg chicken")
        assert r.quantity == pytest.approx(1.5)
        assert r.unit == "kg"
        assert r.name == "chicken"

    # ============================================================
    # Category 16: "or" alternatives → notes
    # ============================================================

    def test_or_alternative(self):
        r = parse_ingredient_line("1 cup butter or margarine")
        assert r.quantity == 1.0
        assert r.unit == "cup"
        assert r.name == "butter"
        assert "or margarine" in r.notes

    def test_or_alternative_herb(self):
        r = parse_ingredient_line("2 tbsp basil or oregano")
        assert r.quantity == 2.0
        assert r.unit == "tbsp"
        assert r.name == "basil"
        assert "or oregano" in r.notes

    # ============================================================
    # Category 17: Common unit recognition (comprehensive)
    # ============================================================

    def test_tsp(self):
        r = parse_ingredient_line("1/2 tsp kosher salt")
        assert r.quantity == pytest.approx(0.5)
        assert r.unit == "tsp"

    def test_can(self):
        r = parse_ingredient_line("1 can black beans")
        assert r.quantity == 1.0
        assert r.unit == "can"
        assert r.name == "black beans"

    def test_bag(self):
        r = parse_ingredient_line("1 bag frozen peas")
        assert r.quantity == 1.0
        assert r.unit == "bag"
        assert r.name == "frozen peas"

    def test_bottle(self):
        r = parse_ingredient_line("1 bottle red wine")
        assert r.quantity == 1.0
        assert r.unit == "bottle"
        assert r.name == "red wine"

    def test_bunch(self):
        r = parse_ingredient_line("1 bunch cilantro")
        assert r.quantity == 1.0
        assert r.unit == "bunch"
        assert r.name == "cilantro"

    def test_pinch(self):
        r = parse_ingredient_line("1 pinch cayenne pepper")
        assert r.quantity == 1.0
        assert r.unit == "pinch"
        assert r.name == "cayenne pepper"

    def test_dash(self):
        r = parse_ingredient_line("1 dash worcestershire sauce")
        assert r.quantity == 1.0
        assert r.unit == "dash"
        assert r.name == "worcestershire sauce"

    def test_jar(self):
        r = parse_ingredient_line("1 jar marinara sauce")
        assert r.quantity == 1.0
        assert r.unit == "jar"
        assert r.name == "marinara sauce"

    def test_quart(self):
        r = parse_ingredient_line("1 quart chicken broth")
        assert r.quantity == 1.0
        assert r.unit == "quart"
        assert r.name == "chicken broth"

    def test_head(self):
        r = parse_ingredient_line("1 head garlic")
        assert r.quantity == 1.0
        assert r.unit == "head"
        assert r.name == "garlic"

    def test_packet(self):
        r = parse_ingredient_line("1 packet yeast")
        assert r.quantity == 1.0
        assert r.unit == "packet"
        assert r.name == "yeast"

    def test_envelope(self):
        r = parse_ingredient_line("1 envelope gelatin")
        assert r.quantity == 1.0
        assert r.unit == "envelope"
        assert r.name == "gelatin"

    def test_carton(self):
        r = parse_ingredient_line("1 carton chicken stock")
        assert r.quantity == 1.0
        assert r.unit == "carton"
        assert r.name == "chicken stock"

    def test_loaf(self):
        r = parse_ingredient_line("1 loaf bread")
        assert r.quantity == 1.0
        assert r.unit == "loaf"
        assert r.name == "bread"

    def test_whole(self):
        r = parse_ingredient_line("1 whole chicken")
        assert r.quantity == 1.0
        assert r.unit == "whole"
        assert r.name == "chicken"

    # ============================================================
    # Category 18: Unit singularization (count units)
    # ============================================================

    def test_singular_cloves(self):
        r = parse_ingredient_line("3 cloves garlic")
        assert r.quantity == 3.0
        assert r.unit == "clove"
        assert r.name == "garlic"

    def test_singular_stalks(self):
        r = parse_ingredient_line("2 stalks celery")
        assert r.quantity == 2.0
        assert r.unit == "stalk"
        assert r.name == "celery"

    def test_singular_sprigs(self):
        r = parse_ingredient_line("3 sprigs fresh thyme")
        assert r.quantity == 3.0
        assert r.unit == "sprig"
        assert r.name == "fresh thyme"

    def test_singular_slices(self):
        r = parse_ingredient_line("4 slices bacon")
        assert r.quantity == 4.0
        assert r.unit == "slice"
        assert r.name == "bacon"

    def test_singular_pieces(self):
        r = parse_ingredient_line("6 pieces chicken thighs")
        assert r.quantity == 6.0
        assert r.unit == "piece"
        assert r.name == "chicken thighs"

    def test_singular_loaves(self):
        r = parse_ingredient_line("2 loaves bread")
        assert r.quantity == 2.0
        assert r.unit == "loaf"
        assert r.name == "bread"

    def test_singular_drops(self):
        r = parse_ingredient_line("3 drops vanilla extract")
        assert r.quantity == 3.0
        assert r.unit == "drop"
        assert r.name == "vanilla extract"

    # Volume/weight/container units should NOT singularize
    def test_no_singular_cups(self):
        r = parse_ingredient_line("2 cups flour")
        assert r.unit == "cups"  # stays plural

    def test_no_singular_cans(self):
        r = parse_ingredient_line("2 cans beans")
        assert r.unit == "cans"  # stays plural

    # ============================================================
    # Category 19: No quantity / fallback
    # ============================================================

    def test_no_quantity_no_unit(self):
        r = parse_ingredient_line("salt and pepper")
        assert r.name == "salt and pepper"
        assert r.quantity is None
        assert r.unit is None

    def test_raw_text_preserved(self):
        original = "3 large eggs"
        r = parse_ingredient_line(original)
        assert r.raw_text == original

    def test_raw_text_preserved_complex(self):
        original = "1 (14.5 oz) can diced tomatoes"
        r = parse_ingredient_line(original)
        assert r.raw_text == original

    # ============================================================
    # Edge cases / real-world examples
    # ============================================================

    def test_fl_oz_compound(self):
        r = parse_ingredient_line("4 fl oz heavy cream")
        assert r.quantity == 4.0
        assert r.unit == "fl oz"
        assert r.name == "heavy cream"

    def test_complex_paren_and_comma(self):
        r = parse_ingredient_line("1 (14.5 oz) can diced tomatoes, drained")
        assert r.quantity == 1.0
        assert r.unit == "can"
        assert r.name == "diced tomatoes"
        assert "14.5 oz" in r.notes
        assert "drained" in r.notes

    def test_multiple_word_ingredient(self):
        r = parse_ingredient_line("2 cups extra-virgin olive oil")
        assert r.quantity == 2.0
        assert r.unit == "cups"
        assert r.name == "extra-virgin olive oil"

    def test_hyphenated_ingredient(self):
        r = parse_ingredient_line("1 cup all-purpose flour")
        assert r.quantity == 1.0
        assert r.unit == "cup"
        assert r.name == "all-purpose flour"

    def test_strip(self):
        r = parse_ingredient_line("2 strips bacon")
        assert r.quantity == 2.0
        assert r.unit == "strip"
        assert r.name == "bacon"

    def test_sheet(self):
        r = parse_ingredient_line("1 sheet puff pastry")
        assert r.quantity == 1.0
        assert r.unit == "sheet"
        assert r.name == "puff pastry"

    def test_cube(self):
        r = parse_ingredient_line("1 cube chicken bouillon")
        assert r.quantity == 1.0
        assert r.unit == "cube"
        assert r.name == "chicken bouillon"

    def test_knob(self):
        r = parse_ingredient_line("1 knob butter")
        assert r.quantity == 1.0
        assert r.unit == "knob"
        assert r.name == "butter"

    # ============================================================
    # Edge cases found from real-world 50-site testing
    # ============================================================

    def test_paren_after_unit(self):
        """'1 package (2 1/4 tsp) active dry yeast' → paren goes to notes"""
        r = parse_ingredient_line("1 package (2 1/4 teaspoons) active dry yeast")
        assert r.quantity == 1.0
        assert r.unit == "package"
        assert r.name == "active dry yeast"
        assert "2 1/4 teaspoons" in r.notes

    def test_plus_compound_qty(self):
        """'2 tablespoons plus ½ teaspoon oil' → 'plus ½ teaspoon' in notes"""
        r = parse_ingredient_line("2 tablespoons plus ½ teaspoon neutral oil")
        assert r.quantity == 2.0
        assert r.unit == "tablespoons"
        assert r.name == "neutral oil"
        assert "plus ½ teaspoon" in r.notes

    def test_minus_compound_qty(self):
        """'2 cups minus 2 tablespoons cake flour' → 'minus 2 tablespoons' in notes"""
        r = parse_ingredient_line("2 cups minus 2 tablespoons cake flour (8 1/2 ounces)")
        assert r.quantity == 2.0
        assert r.unit == "cups"
        assert r.name == "cake flour"
        assert "minus 2 tablespoons" in r.notes

    def test_plus_compound_sugar(self):
        """'1 cup plus 2 tablespoons granulated sugar' → notes"""
        r = parse_ingredient_line("1 cup plus 2 tablespoons granulated sugar (8 ounces)")
        assert r.quantity == 1.0
        assert r.unit == "cup"
        assert r.name == "granulated sugar"
        assert "plus 2 tablespoons" in r.notes


class TestGenerateAIPrompt:
    """Tests for generate_ai_prompt function."""

    def test_includes_url(self):
        """Test that prompt includes the URL."""
        url = "https://example.com/recipe"
        prompt = generate_ai_prompt(url)
        assert url in prompt

    def test_includes_json_template(self):
        """Test that prompt includes JSON template."""
        prompt = generate_ai_prompt("https://example.com")
        assert '"name"' in prompt
        assert '"instructions"' in prompt
        assert '"ingredients"' in prompt

    def test_includes_error_message(self):
        """Test that error message is included when provided."""
        error = "Site not supported"
        prompt = generate_ai_prompt("https://example.com", error)
        assert error in prompt


class TestScrapeWithLibrary:
    """Tests for scrape_with_library function."""

    def test_returns_none_when_library_unavailable(self):
        """Test returns None when recipe-scrapers not available."""
        with patch('app.services.recipe_scraper.SCRAPERS_AVAILABLE', False):
            result = scrape_with_library("<html></html>", "https://example.com")
            assert result is None

    def test_returns_none_on_unsupported_site(self):
        """Test returns None for unsupported sites."""
        # Mock the scrape_html to raise WebsiteNotImplementedError
        with patch('app.services.recipe_scraper.SCRAPERS_AVAILABLE', True):
            with patch('app.services.recipe_scraper.scrape_html') as mock_scrape:
                from app.services.recipe_scraper import WebsiteNotImplementedError
                mock_scrape.side_effect = WebsiteNotImplementedError("test")
                result = scrape_with_library("<html></html>", "https://unknown-site.com")
                assert result is None


class TestScrapeGenericHtml:
    """Tests for scrape_generic_html function."""

    def test_returns_none_when_bs4_unavailable(self):
        """Test returns None when beautifulsoup not available."""
        with patch('app.services.recipe_scraper.BS4_AVAILABLE', False):
            result = scrape_generic_html("<html></html>", "https://example.com")
            assert result is None

    def test_extracts_schema_org_recipe(self):
        """Test extraction from schema.org structured data."""
        html = '''
        <html>
        <head>
        <script type="application/ld+json">
        {
            "@type": "Recipe",
            "name": "Test Recipe",
            "recipeInstructions": "Mix and bake.",
            "recipeIngredient": ["1 cup flour", "2 eggs"],
            "prepTime": "PT15M",
            "cookTime": "PT30M",
            "recipeYield": "4 servings"
        }
        </script>
        </head>
        <body></body>
        </html>
        '''
        result = scrape_generic_html(html, "https://example.com")

        if result:  # BS4 is available
            assert result.name == "Test Recipe"
            assert result.instructions == "Mix and bake."
            assert len(result.ingredients) == 2
            assert result.prep_time_minutes == 15
            assert result.cook_time_minutes == 30
            assert result.servings == 4
            assert result.extraction_method == "schema.org"
            assert result.confidence == 0.85


class TestScrapeRecipeUrl:
    """Tests for scrape_recipe_url async function."""

    @pytest.mark.anyio
    async def test_invalid_url_format(self):
        """Test invalid URL returns fallback response (SSRF or format error)."""
        result = await scrape_recipe_url("not-a-valid-url")
        assert isinstance(result, FallbackResponse)
        assert result.success is False
        # SSRF validation catches missing scheme before URL format check
        assert "HTTP" in result.error_message or "Invalid URL" in result.error_message

    @pytest.mark.anyio
    async def test_url_without_scheme(self):
        """Test URL without scheme returns fallback."""
        result = await scrape_recipe_url("example.com/recipe")
        assert isinstance(result, FallbackResponse)
        assert result.success is False

    @pytest.mark.anyio
    async def test_http_error_returns_fallback(self):
        """Test HTTP errors return fallback with AI prompt."""
        with patch('app.services.recipe_scraper.fetch_url') as mock_fetch:
            mock_fetch.side_effect = httpx.HTTPError("Connection failed")
            result = await scrape_recipe_url("https://example.com/recipe")

            assert isinstance(result, FallbackResponse)
            assert result.success is False
            assert "Failed to fetch recipe URL" in result.error_message
            assert result.ai_prompt != ""

    @pytest.mark.anyio
    async def test_successful_scrape_returns_extracted_recipe(self):
        """Test successful scrape returns ExtractedRecipe."""
        mock_recipe = ExtractedRecipe(
            name="Test Recipe",
            instructions="Test instructions",
            ingredients=[ExtractedIngredient(name="flour", quantity=2.0, unit="cups")],
            source_url="https://example.com",
            source_site="example.com",
            confidence=0.95,
            extraction_method="recipe-scrapers"
        )

        with patch('app.services.recipe_scraper.fetch_url', new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = ("<html></html>", "https://example.com")

            with patch('app.services.recipe_scraper.scrape_with_library') as mock_scrape:
                mock_scrape.return_value = mock_recipe

                result = await scrape_recipe_url("https://example.com/recipe")

                assert isinstance(result, ExtractedRecipe)
                assert result.name == "Test Recipe"
                assert result.confidence == 0.95

    @pytest.mark.anyio
    async def test_fallback_to_generic_parsing(self):
        """Test falls back to generic parsing when library fails."""
        mock_recipe = ExtractedRecipe(
            name="Schema Recipe",
            instructions="1. Preheat oven to 375F. 2. Mix ingredients together.",
            ingredients=[ExtractedIngredient(name="flour", quantity="2", unit="cups", notes=None, raw_text="2 cups flour")],
            source_url="https://example.com",
            source_site="example.com",
            confidence=0.85,
            extraction_method="schema.org"
        )

        with patch('app.services.recipe_scraper.fetch_url', new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = ("<html></html>", "https://example.com")

            with patch('app.services.recipe_scraper.scrape_with_library') as mock_lib:
                mock_lib.return_value = None  # Library fails

                with patch('app.services.recipe_scraper.scrape_generic_html') as mock_generic:
                    mock_generic.return_value = mock_recipe

                    result = await scrape_recipe_url("https://example.com/recipe")

                    assert isinstance(result, ExtractedRecipe)
                    assert result.extraction_method == "schema.org"

    @pytest.mark.anyio
    async def test_returns_ai_prompt_when_all_fail(self):
        """Test returns AI prompt when all extraction methods fail."""
        with patch('app.services.recipe_scraper.fetch_url', new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = ("<html></html>", "https://example.com")

            with patch('app.services.recipe_scraper.scrape_with_library') as mock_lib:
                mock_lib.return_value = None

                with patch('app.services.recipe_scraper.scrape_generic_html') as mock_generic:
                    mock_generic.return_value = None

                    result = await scrape_recipe_url("https://example.com/recipe")

                    assert isinstance(result, FallbackResponse)
                    assert result.success is False
                    assert result.ai_prompt != ""
                    assert "https://example.com" in result.ai_prompt

"""
Tests for the Quantity Parser Service.

Phase 16: Smart Unit Conversion
"""

import pytest
from app.services.parsing.quantity_parser import (
    parse_quantity,
    parse_number,
    parse_fraction,
    normalize_unit,
    can_convert,
    extract_effective_shopping_quantity,
    ParsedQuantity,
)


class TestParseNumber:
    """Test number parsing including fractions."""

    def test_simple_integer(self):
        assert parse_number("2") == 2.0

    def test_simple_float(self):
        assert parse_number("1.5") == 1.5

    def test_simple_fraction(self):
        assert parse_number("1/2") == 0.5

    def test_mixed_fraction(self):
        assert parse_number("1 1/2") == 1.5

    def test_unicode_fraction_half(self):
        assert parse_number("½") == 0.5

    def test_unicode_fraction_quarter(self):
        assert parse_number("¼") == 0.25

    def test_unicode_fraction_three_quarters(self):
        assert parse_number("¾") == 0.75

    def test_whole_plus_unicode_fraction(self):
        assert parse_number("1½") == 1.5

    def test_empty_string(self):
        assert parse_number("") is None

    def test_invalid_string(self):
        assert parse_number("abc") is None


class TestParseFraction:
    """Test fraction string parsing."""

    def test_simple_fraction(self):
        assert parse_fraction("1/2") == 0.5

    def test_improper_fraction(self):
        assert parse_fraction("3/2") == 1.5

    def test_mixed_fraction(self):
        assert parse_fraction("1 1/2") == 1.5

    def test_invalid_fraction(self):
        assert parse_fraction("abc") is None

    def test_zero_denominator(self):
        assert parse_fraction("1/0") is None


class TestNormalizeUnit:
    """Test unit normalization."""

    def test_tsp_to_teaspoon(self):
        assert normalize_unit("tsp") == "teaspoon"

    def test_tbsp_to_tablespoon(self):
        assert normalize_unit("tbsp") == "tablespoon"

    def test_cups_to_cup(self):
        assert normalize_unit("cups") == "cup"

    def test_oz_to_ounce(self):
        assert normalize_unit("oz") == "ounce"

    def test_lbs_to_pound(self):
        assert normalize_unit("lbs") == "pound"

    def test_g_to_gram(self):
        assert normalize_unit("g") == "gram"

    def test_unknown_unit_passthrough(self):
        assert normalize_unit("unknown") == "unknown"

    def test_case_insensitive(self):
        assert normalize_unit("TSP") == "teaspoon"
        assert normalize_unit("TBSP") == "tablespoon"


class TestParseQuantity:
    """Test full quantity string parsing."""

    def test_simple_quantity(self):
        result = parse_quantity("2 tsp")
        assert result.amount == 2.0
        assert result.unit == "teaspoon"
        assert result.confidence == 1.0

    def test_fraction_quantity(self):
        result = parse_quantity("1/2 cup")
        assert result.amount == 0.5
        assert result.unit == "cup"

    def test_unicode_fraction_quantity(self):
        result = parse_quantity("½ cup")
        assert result.amount == 0.5
        assert result.unit == "cup"

    def test_mixed_fraction_quantity(self):
        result = parse_quantity("1 1/2 cups")
        assert result.amount == 1.5
        assert result.unit == "cup"

    def test_no_space_quantity(self):
        result = parse_quantity("1.5oz")
        assert result.amount == 1.5
        assert result.unit == "ounce"

    def test_compound_quantity_extracts_inner(self):
        result = parse_quantity("1 bottle (2.5 oz)")
        assert result.amount == 2.5
        assert result.unit == "ounce"

    def test_range_quantity_uses_higher(self):
        result = parse_quantity("1-2 cups")
        assert result.amount == 2.0
        assert result.unit == "cup"

    def test_range_with_to(self):
        result = parse_quantity("1 to 2 cups")
        assert result.amount == 2.0
        assert result.unit == "cup"

    def test_quantity_no_unit(self):
        result = parse_quantity("3")
        assert result.amount == 3.0
        assert result.unit is None

    def test_empty_string(self):
        result = parse_quantity("")
        assert result.amount == 0
        assert result.unit is None
        assert result.confidence == 0

    def test_preserves_original(self):
        result = parse_quantity("2 tsp")
        assert result.original == "2 tsp"


class TestCanConvert:
    """Test conversion possibility checking."""

    def test_same_unit(self):
        assert can_convert("teaspoon", "teaspoon") is True

    def test_same_type_volume(self):
        assert can_convert("teaspoon", "tablespoon") is True
        assert can_convert("cup", "tablespoon") is True

    def test_same_type_weight(self):
        assert can_convert("gram", "kilogram") is True
        assert can_convert("ounce", "pound") is True

    def test_cross_type_without_ingredient(self):
        # Without ingredient name, cross-type is not possible
        assert can_convert("cup", "gram") is False

    def test_cross_type_with_known_ingredient(self):
        # With known ingredient, cross-type is possible
        assert can_convert("cup", "gram", "flour") is True

    def test_cross_type_with_unknown_ingredient(self):
        # Unknown ingredient cannot be converted
        assert can_convert("cup", "gram", "random stuff xyz") is False


class TestExtractEffectiveShoppingQuantity:
    """Test extraction of effective shopping quantity from parenthetical notes."""

    def test_basic_oz_each(self):
        """'4 (6 oz each) salmon filets' → 24 ounce (normalized)."""
        result = extract_effective_shopping_quantity(4.0, None, "6 oz each")
        assert result == (24.0, "ounce")

    def test_ounce_full_word(self):
        """'2 (8 ounce) steaks' → 16 ounce."""
        result = extract_effective_shopping_quantity(2.0, None, "8 ounce")
        assert result == (16.0, "ounce")

    def test_already_has_unit_returns_none(self):
        """If unit is already set ('can'), no extraction needed."""
        result = extract_effective_shopping_quantity(1.0, "can", "14.5 oz")
        assert result is None

    def test_no_notes_returns_none(self):
        """No notes → None."""
        result = extract_effective_shopping_quantity(3.0, None, None)
        assert result is None

    def test_empty_notes_returns_none(self):
        """Empty notes → None."""
        result = extract_effective_shopping_quantity(3.0, None, "")
        assert result is None

    def test_no_unit_in_notes(self):
        """Notes without a recognized unit → None."""
        result = extract_effective_shopping_quantity(1.0, None, "room temperature")
        assert result is None

    def test_about_prefix(self):
        """'about 1 lb each' → handles 'about' prefix (normalized)."""
        result = extract_effective_shopping_quantity(2.0, None, "about 1 lb each")
        assert result == (2.0, "pound")

    def test_approximately_prefix(self):
        """'approximately 8 oz' → handles 'approximately' prefix (normalized)."""
        result = extract_effective_shopping_quantity(3.0, None, "approximately 8 oz")
        assert result == (24.0, "ounce")

    def test_decimal_amount(self):
        """'14.5 oz' → handles decimal amounts (normalized)."""
        result = extract_effective_shopping_quantity(1.0, None, "14.5 oz")
        assert result == (14.5, "ounce")

    def test_gram_unit(self):
        """'200 g each' → handles grams (normalized)."""
        result = extract_effective_shopping_quantity(3.0, None, "200 g each")
        assert result == (600.0, "gram")

    def test_pound_unit(self):
        """'1.5 lbs' → handles pounds (normalized)."""
        result = extract_effective_shopping_quantity(2.0, None, "1.5 lbs")
        assert result == (3.0, "pound")

    def test_empty_unit_string(self):
        """Empty string unit treated same as None (normalized)."""
        result = extract_effective_shopping_quantity(4.0, "", "6 oz each")
        assert result == (24.0, "ounce")

    def test_notes_with_unrecognized_word_only(self):
        """'divided' has no number+unit pattern → None."""
        result = extract_effective_shopping_quantity(2.0, None, "divided")
        assert result is None

    def test_notes_with_thinly_sliced(self):
        """'thinly sliced' has no number+unit → None."""
        result = extract_effective_shopping_quantity(1.0, None, "thinly sliced")
        assert result is None

"""
Tests for the Inventory Unit Recommender.

Phase 18: Unified Inventory Tracking — verifies that recipe units
(cup, tsp, slice) are correctly converted to inventory units (oz, lb, count).
"""

import pytest
from app.services.inventory_unit_recommender import (
    recommend_inventory_unit,
    convert_to_inventory_unit,
)
from app.services.expiration_defaults import detect_food_category, FoodCategory


class TestRecommendInventoryUnit:
    """Test category-based unit recommendations."""

    def test_dairy_recommends_ounce(self):
        assert recommend_inventory_unit("Mozzarella Cheese") == "ounce"

    def test_meat_recommends_pound(self):
        assert recommend_inventory_unit("Ground Turkey") == "pound"

    def test_produce_recommends_count(self):
        assert recommend_inventory_unit("onion") == "count"

    def test_spice_recommends_count(self):
        assert recommend_inventory_unit("garlic powder") == "count"

    def test_eggs_recommends_count(self):
        assert recommend_inventory_unit("eggs") == "count"

    def test_bread_recommends_count(self):
        assert recommend_inventory_unit("sourdough bread") == "count"

    def test_oil_recommends_fluid_ounce(self):
        assert recommend_inventory_unit("olive oil") == "fluid_ounce"

    def test_unknown_returns_none(self):
        assert recommend_inventory_unit("xyzzy_unknown_thing") is None

    def test_condiment_recommends_ounce(self):
        assert recommend_inventory_unit("ketchup") == "ounce"


class TestConvertToInventoryUnit:
    """Test full conversion pipeline."""

    # --- Dairy: cup -> ounce ---

    def test_mozzarella_cup_to_ounce(self):
        qty, unit = convert_to_inventory_unit("Mozzarella Cheese", 1.0, "cup")
        assert unit == "ounce"
        assert qty == pytest.approx(4.0, abs=0.5)

    def test_cheddar_cup_to_ounce(self):
        qty, unit = convert_to_inventory_unit("Sharp Cheddar Cheese", 0.5, "cup")
        assert unit == "ounce"
        assert qty > 0

    def test_pepper_jack_cup_to_ounce(self):
        qty, unit = convert_to_inventory_unit("Pepper Jack Cheese", 1.0, "cup")
        assert unit == "ounce"
        assert qty == pytest.approx(4.0, abs=0.5)

    # --- Meat: slice -> pound ---

    def test_bacon_slices_to_pound(self):
        qty, unit = convert_to_inventory_unit("bacon", 10, "slice")
        assert unit == "pound"
        assert qty == pytest.approx(0.63, abs=0.1)

    def test_bacon_strips_to_pound(self):
        qty, unit = convert_to_inventory_unit("bacon", 6, "strips")
        assert unit == "pound"
        assert qty == pytest.approx(0.38, abs=0.1)

    def test_ham_slices_to_pound(self):
        qty, unit = convert_to_inventory_unit("ham", 4, "slice")
        assert unit == "pound"
        assert qty == pytest.approx(0.38, abs=0.1)

    # --- Spices: tsp -> count ---

    def test_garlic_powder_tsp_to_count(self):
        qty, unit = convert_to_inventory_unit("garlic powder", 0.125, "tsp")
        assert unit == "count"
        assert qty == 1.0

    def test_garlic_powder_tbsp_to_count(self):
        qty, unit = convert_to_inventory_unit("garlic powder", 1.0, "tbsp")
        assert unit == "count"
        assert qty == 1.0

    def test_spice_zero_quantity(self):
        qty, unit = convert_to_inventory_unit("garlic powder", 0, "tsp")
        assert unit == "count"
        assert qty == 0.0

    # --- Produce: cup -> count ---

    def test_onion_cup_to_count(self):
        qty, unit = convert_to_inventory_unit("chopped onion", 0.75, "cup")
        assert unit == "count"
        assert qty >= 1.0

    def test_bell_pepper_cup_to_count(self):
        qty, unit = convert_to_inventory_unit("bell pepper", 1.0, "cup")
        assert unit == "count"
        assert qty >= 1.0

    def test_carrot_cup_to_count(self):
        qty, unit = convert_to_inventory_unit("carrot", 0.5, "cup")
        assert unit == "count"
        assert qty >= 1.0

    # --- Passthrough / edge cases ---

    def test_already_preferred_unit(self):
        """Item already in preferred unit should return canonical form."""
        qty, unit = convert_to_inventory_unit("Mozzarella Cheese", 8.0, "oz")
        assert unit == "ounce"  # canonical form, not alias "oz"
        assert qty == 8.0

    def test_empty_unit_passthrough(self):
        """Empty from_unit returns unchanged."""
        qty, unit = convert_to_inventory_unit("anything", 5.0, "")
        assert qty == 5.0
        assert unit == ""

    def test_unknown_ingredient_passthrough(self):
        """Unknown ingredient (OTHER category) returns unchanged."""
        qty, unit = convert_to_inventory_unit("xyzzy_unknown", 2.0, "cup")
        assert qty == 2.0
        assert unit == "cup"

    # --- Weight-to-weight same-type ---

    def test_meat_oz_to_pound(self):
        qty, unit = convert_to_inventory_unit("Ground Turkey", 16.0, "oz")
        assert unit == "pound"
        assert qty == pytest.approx(1.0, abs=0.05)

    def test_meat_gram_to_pound(self):
        qty, unit = convert_to_inventory_unit("chicken breast", 454.0, "g")
        assert unit == "pound"
        assert qty == pytest.approx(1.0, abs=0.05)

    # --- Herbs volume -> weight ---

    def test_parsley_tsp_to_count(self):
        """Parsley is SPICES -> count (1 container)."""
        qty, unit = convert_to_inventory_unit("parsley", 1.0, "tsp")
        assert unit == "count"
        assert qty == 1.0

    # --- Frozen items ---

    def test_meat_large_oz_to_pound(self):
        qty, unit = convert_to_inventory_unit("chicken breast", 32.0, "oz")
        assert unit == "pound"
        assert qty == pytest.approx(2.0, abs=0.05)


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_very_small_quantity(self):
        """Very small quantities should not produce 0."""
        qty, unit = convert_to_inventory_unit("garlic powder", 0.01, "tsp")
        assert unit == "count"
        assert qty == 1.0  # Spices always map to 1 container

    def test_large_quantity_cheese(self):
        """Large quantities should scale correctly."""
        qty, unit = convert_to_inventory_unit("cheddar", 4.0, "cup")
        assert unit == "ounce"
        assert qty == pytest.approx(16.0, abs=2.0)

    def test_case_insensitive_ingredient(self):
        """Ingredient matching should be case-insensitive."""
        qty, unit = convert_to_inventory_unit("BACON", 5, "slice")
        assert unit == "pound"
        assert qty > 0

    def test_pluralized_slice_unit(self):
        """Handle 'slices' (plural) correctly."""
        qty, unit = convert_to_inventory_unit("bacon", 3, "slices")
        assert unit == "pound"
        assert qty > 0


class TestNewMappings:
    """Tests for newly added FOOD_CATEGORY_MAPPING entries."""

    @pytest.mark.parametrize("name,expected_category", [
        ("chili powder", FoodCategory.SPICES),
        ("chili", FoodCategory.SPICES),
        ("cloves", FoodCategory.SPICES),
        ("ground cloves", FoodCategory.SPICES),
        ("parsley", FoodCategory.SPICES),
        ("cocoa powder", FoodCategory.DRY_GOODS),
        ("cocoa", FoodCategory.DRY_GOODS),
        ("flaxseed", FoodCategory.DRY_GOODS),
        ("ground flaxseed", FoodCategory.DRY_GOODS),
        ("strawberry", FoodCategory.PRODUCE_FRUIT),
        ("strawberries", FoodCategory.PRODUCE_FRUIT),
        ("tzatziki", FoodCategory.CONDIMENTS),
        ("buffalo sauce", FoodCategory.CONDIMENTS),
        ("pecans", FoodCategory.SNACKS),
        ("Chopped Pecans", FoodCategory.SNACKS),
        ("roasted peanuts", FoodCategory.SNACKS),
        ("peanuts", FoodCategory.SNACKS),
    ])
    def test_new_category_detection(self, name, expected_category):
        assert detect_food_category(name) == expected_category

    def test_pepper_jack_detects_dairy(self):
        """'Pepper Jack Cheese' must be DAIRY, not SPICES from 'pepper' token."""
        assert detect_food_category("Pepper Jack Cheese") == FoodCategory.DAIRY

    def test_pepper_jack_recommends_ounce(self):
        assert recommend_inventory_unit("Pepper Jack Cheese") == "ounce"


class TestDriedOverrideFix:
    """Tests for the 'dried' storage override spice fix."""

    def test_dried_oregano_is_spice(self):
        assert detect_food_category("dried oregano") == FoodCategory.SPICES

    def test_dried_thyme_is_spice(self):
        assert detect_food_category("Dried Thyme") == FoodCategory.SPICES

    def test_dried_oregano_tsp_to_count(self):
        qty, unit = convert_to_inventory_unit("dried oregano", 1.0, "tsp")
        assert unit == "count"
        assert qty == 1.0

    def test_dried_thyme_tsp_to_count(self):
        qty, unit = convert_to_inventory_unit("Dried Thyme", 0.5, "tsp")
        assert unit == "count"
        assert qty == 1.0

    def test_dried_cranberries_stays_dry_goods(self):
        """'dried cranberries' has no spice token — should remain DRY_GOODS."""
        assert detect_food_category("dried cranberries") == FoodCategory.DRY_GOODS

    def test_frozen_corn_still_frozen(self):
        """Frozen override should still work normally."""
        assert detect_food_category("frozen corn") == FoodCategory.FROZEN_VEGETABLES

    def test_canned_beans_still_canned(self):
        """Canned override should still work normally."""
        assert detect_food_category("canned beans") == FoodCategory.CANNED


class TestNewMappingConversions:
    """Test conversions for newly-mapped items."""

    def test_chili_powder_to_count(self):
        qty, unit = convert_to_inventory_unit("chili powder", 1.0, "tsp")
        assert unit == "count"
        assert qty == 1.0

    def test_cocoa_powder_to_ounce(self):
        qty, unit = convert_to_inventory_unit("cocoa powder", 0.5, "cup")
        assert unit == "ounce"

    def test_strawberries_to_count(self):
        assert recommend_inventory_unit("strawberries") == "count"

    def test_tzatziki_to_ounce(self):
        assert recommend_inventory_unit("tzatziki") == "ounce"

    def test_buffalo_sauce_to_ounce(self):
        assert recommend_inventory_unit("Buffalo Sauce") == "ounce"

    def test_pecans_to_ounce(self):
        assert recommend_inventory_unit("Chopped Pecans") == "ounce"

    def test_peanuts_to_ounce(self):
        assert recommend_inventory_unit("roasted peanuts") == "ounce"

    def test_flaxseed_to_ounce(self):
        assert recommend_inventory_unit("ground flaxseed") == "ounce"

    def test_parsley_to_count(self):
        qty, unit = convert_to_inventory_unit("Parsley", 1.0, "tsp")
        assert unit == "count"
        assert qty == 1.0

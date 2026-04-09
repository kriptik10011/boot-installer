"""
Tests for the Quantity Consolidator Service.

Phase 16: Smart Unit Conversion
"""

import pytest
from app.services.parsing.quantity_consolidator import (
    consolidate_quantities,
    check_inventory_coverage,
    convert_same_type,
    convert_volume_to_weight,
    get_unit_info,
    ConsolidatedItem,
    InventoryCheck,
)
from app.utils.unit_conversion import UnitType


class TestGetUnitInfo:
    """Test unit info lookup."""

    def test_teaspoon_info(self):
        info = get_unit_info("teaspoon")
        assert info is not None
        assert info[0] == UnitType.VOLUME
        assert info[1] == 1  # base unit

    def test_tablespoon_info(self):
        info = get_unit_info("tablespoon")
        assert info is not None
        assert info[0] == UnitType.VOLUME
        assert info[1] == 3  # 1 tbsp = 3 tsp

    def test_cup_info(self):
        info = get_unit_info("cup")
        assert info is not None
        assert info[0] == UnitType.VOLUME
        assert info[1] == 48  # 1 cup = 48 tsp

    def test_gram_info(self):
        info = get_unit_info("gram")
        assert info is not None
        assert info[0] == UnitType.WEIGHT
        assert info[1] == 1  # base unit

    def test_unknown_unit(self):
        info = get_unit_info("unknown_xyz")
        assert info is None


class TestConvertSameType:
    """Test same-type unit conversions."""

    def test_tsp_to_tbsp(self):
        result = convert_same_type(3, "teaspoon", "tablespoon")
        assert result == pytest.approx(1.0)

    def test_tbsp_to_tsp(self):
        result = convert_same_type(1, "tablespoon", "teaspoon")
        assert result == pytest.approx(3.0)

    def test_cup_to_tsp(self):
        result = convert_same_type(1, "cup", "teaspoon")
        assert result == pytest.approx(48.0)

    def test_gram_to_kg(self):
        result = convert_same_type(1000, "gram", "kilogram")
        assert result == pytest.approx(1.0)

    def test_cross_type_fails(self):
        # Volume to weight should return None
        result = convert_same_type(1, "cup", "gram")
        assert result is None

    def test_unknown_unit_fails(self):
        result = convert_same_type(1, "unknown", "teaspoon")
        assert result is None


class TestConvertVolumeToWeight:
    """Test volume to weight conversions for specific ingredients."""

    def test_flour_conversion(self):
        result = convert_volume_to_weight(1, "cup", "flour")
        assert result is not None
        amount, unit = result
        assert amount == pytest.approx(120.0)  # 1 cup flour = 120g
        assert unit == "gram"

    def test_sugar_conversion(self):
        result = convert_volume_to_weight(1, "cup", "sugar")
        assert result is not None
        amount, unit = result
        assert amount == pytest.approx(200.0)  # 1 cup sugar = 200g

    def test_butter_conversion(self):
        result = convert_volume_to_weight(1, "cup", "butter")
        assert result is not None
        amount, unit = result
        assert amount == pytest.approx(227.0)  # 1 cup butter = 227g

    def test_half_cup_flour(self):
        result = convert_volume_to_weight(0.5, "cup", "flour")
        assert result is not None
        amount, unit = result
        assert amount == pytest.approx(60.0)  # 1/2 cup flour = 60g

    def test_unknown_ingredient(self):
        result = convert_volume_to_weight(1, "cup", "random ingredient xyz")
        assert result is None

    def test_weight_unit_fails(self):
        # Can't convert from gram (weight) to weight
        result = convert_volume_to_weight(1, "gram", "flour")
        assert result is None


class TestConsolidateQuantities:
    """Test quantity consolidation."""

    def test_same_unit_consolidation(self):
        items = [("salt", "2 tsp"), ("salt", "3 tsp")]
        result = consolidate_quantities(items)
        assert len(result) == 1
        assert result[0].ingredient_name == "salt"
        assert result[0].total_amount == 5.0
        assert result[0].unit == "teaspoon"

    def test_same_type_different_units(self):
        items = [("salt", "2 tsp"), ("salt", "1 tbsp")]
        result = consolidate_quantities(items)
        assert len(result) == 1
        # 2 tsp + 1 tbsp = 2 tsp + 3 tsp = 5 tsp = 1.67 tbsp
        assert result[0].total_amount == pytest.approx(1.67, rel=0.1)
        assert result[0].unit == "tablespoon"

    def test_different_ingredients(self):
        items = [("salt", "1 tsp"), ("pepper", "2 tsp")]
        result = consolidate_quantities(items)
        assert len(result) == 2
        salt_item = next(i for i in result if i.ingredient_name.lower() == "salt")
        pepper_item = next(i for i in result if i.ingredient_name.lower() == "pepper")
        assert salt_item.total_amount == 1.0
        assert pepper_item.total_amount == 2.0

    def test_case_insensitive_grouping(self):
        items = [("Salt", "1 tsp"), ("salt", "2 tsp"), ("SALT", "3 tsp")]
        result = consolidate_quantities(items)
        assert len(result) == 1
        assert result[0].total_amount == 6.0

    def test_large_amount_converted_to_cup(self):
        # 48 tsp = 1 cup - unit optimization happens when consolidating different units
        # Mix tsp and tbsp to trigger the consolidation with different units
        # 24 tsp + 8 tbsp = 24 tsp + 24 tsp = 48 tsp = 1 cup
        items = [("sugar", "24 tsp"), ("sugar", "8 tbsp")]
        result = consolidate_quantities(items)
        assert len(result) == 1
        assert result[0].total_amount == pytest.approx(1.0)
        assert result[0].unit == "cup"

    def test_empty_input(self):
        result = consolidate_quantities([])
        assert len(result) == 0


class TestCheckInventoryCoverage:
    """Test inventory coverage checking."""

    def test_same_unit_sufficient(self):
        needed = ConsolidatedItem(
            ingredient_name="salt",
            total_amount=5.0,
            unit="teaspoon"
        )
        result = check_inventory_coverage(needed, 10.0, "teaspoon")
        assert result.has_enough is True

    def test_same_unit_insufficient(self):
        needed = ConsolidatedItem(
            ingredient_name="salt",
            total_amount=10.0,
            unit="teaspoon"
        )
        result = check_inventory_coverage(needed, 5.0, "teaspoon")
        assert result.has_enough is False

    def test_convertible_units_sufficient(self):
        # Need 5 tsp, have 2 tbsp (= 6 tsp)
        needed = ConsolidatedItem(
            ingredient_name="salt",
            total_amount=5.0,
            unit="teaspoon"
        )
        result = check_inventory_coverage(needed, 2.0, "tablespoon")
        assert result.has_enough is True
        assert result.conversion_note is not None

    def test_convertible_units_insufficient(self):
        # Need 10 tsp, have 1 tbsp (= 3 tsp)
        needed = ConsolidatedItem(
            ingredient_name="salt",
            total_amount=10.0,
            unit="teaspoon"
        )
        result = check_inventory_coverage(needed, 1.0, "tablespoon")
        assert result.has_enough is False

    def test_cross_type_with_known_ingredient(self):
        # Need 1 cup flour, have 150g flour
        # 1 cup flour = 120g, so 150g > 120g
        needed = ConsolidatedItem(
            ingredient_name="flour",
            total_amount=1.0,
            unit="cup"
        )
        result = check_inventory_coverage(needed, 150.0, "gram", "flour")
        assert result.has_enough is True

    def test_inconvertible_units(self):
        # Can't convert between cup and gram for unknown ingredient
        needed = ConsolidatedItem(
            ingredient_name="mystery spice",
            total_amount=1.0,
            unit="cup"
        )
        result = check_inventory_coverage(needed, 100.0, "gram")
        assert result.has_enough is False
        assert "Cannot convert" in result.conversion_note

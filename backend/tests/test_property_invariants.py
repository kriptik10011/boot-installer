"""
Property-based tests for unified food system invariants.

Uses Hypothesis to verify properties that must hold for ALL valid inputs,
not just specific test cases. Each property test runs 200+ examples.
"""

import pytest
from hypothesis import given, assume, settings, HealthCheck
from hypothesis import strategies as st

from app.services.parsing.quantity_consolidator import (
    convert_same_type,
    get_unit_info,
)
from app.services.parsing.quantity_parser import normalize_unit
from app.services.shopping_service import _consolidate_quantity


# =============================================================================
# Convertible unit pairs (same-type units that should roundtrip)
# =============================================================================

VOLUME_PAIRS = [
    ("teaspoon", "tablespoon"),
    ("tablespoon", "cup"),
    ("teaspoon", "cup"),
    ("cup", "pint"),
    ("cup", "quart"),
    ("cup", "gallon"),
    ("milliliter", "liter"),
    ("teaspoon", "fluid_ounce"),
]

WEIGHT_PAIRS = [
    ("gram", "kilogram"),
    ("gram", "ounce"),
    ("gram", "pound"),
    ("ounce", "pound"),
]

COUNT_PAIRS = [
    ("count", "dozen"),
    ("count", "pair"),
]

ALL_CONVERTIBLE_PAIRS = VOLUME_PAIRS + WEIGHT_PAIRS + COUNT_PAIRS


# =============================================================================
# Property 1: Roundtrip Unit Conversion
# convert(convert(x, A->B), B->A) ~ x
# =============================================================================

class TestRoundtripConversion:
    """For any convertible unit pair, converting A->B->A returns original value."""

    @given(
        qty=st.floats(min_value=0.01, max_value=10000, allow_nan=False, allow_infinity=False),
        pair_idx=st.integers(min_value=0, max_value=len(ALL_CONVERTIBLE_PAIRS) - 1),
    )
    @settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
    def test_roundtrip_within_tolerance(self, qty, pair_idx):
        """convert(convert(x, A->B), B->A) should equal x within 0.1% tolerance."""
        unit_a, unit_b = ALL_CONVERTIBLE_PAIRS[pair_idx]

        forward = convert_same_type(qty, unit_a, unit_b)
        assert forward is not None, f"Forward conversion {unit_a}->{unit_b} failed"

        back = convert_same_type(forward, unit_b, unit_a)
        assert back is not None, f"Reverse conversion {unit_b}->{unit_a} failed"

        # Allow 0.1% tolerance for floating point
        assert abs(back - qty) < max(0.001 * qty, 0.001), \
            f"Roundtrip {unit_a}->{unit_b}->{unit_a}: {qty} -> {forward} -> {back}"


# =============================================================================
# Property 2: Consolidation Idempotency
# consolidate(consolidate(x)) == consolidate(x)
# =============================================================================

class TestConsolidationIdempotency:
    """Consolidating the same quantity twice should not double-count."""

    @given(
        qty=st.floats(min_value=0.1, max_value=1000, allow_nan=False, allow_infinity=False),
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    def test_same_unit_idempotent_recipe_id(self, qty):
        """Adding same recipe_id twice should not increase source_recipe_ids."""
        existing = {
            "name": "test",
            "quantity": f"{qty} cup",
            "quantity_amount": qty,
            "quantity_unit": "cup",
            "source_recipe_ids": [1],
        }
        # Consolidate with same recipe_id
        _consolidate_quantity(existing, qty, "cup", f"{qty} cup", recipe_id=1)

        # Recipe ID should NOT be duplicated
        assert existing["source_recipe_ids"].count(1) == 1


# =============================================================================
# Property 3: Conversion Monotonicity
# If a > b, then convert(a) > convert(b) for same units
# =============================================================================

class TestConversionMonotonicity:
    """Larger input always produces larger output for same conversion."""

    @given(
        a=st.floats(min_value=0.01, max_value=5000, allow_nan=False, allow_infinity=False),
        b=st.floats(min_value=0.01, max_value=5000, allow_nan=False, allow_infinity=False),
        pair_idx=st.integers(min_value=0, max_value=len(ALL_CONVERTIBLE_PAIRS) - 1),
    )
    @settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
    def test_larger_input_larger_output(self, a, b, pair_idx):
        """If a > b, convert(a) > convert(b) for any valid conversion."""
        assume(a != b)
        unit_from, unit_to = ALL_CONVERTIBLE_PAIRS[pair_idx]

        conv_a = convert_same_type(a, unit_from, unit_to)
        conv_b = convert_same_type(b, unit_from, unit_to)

        assert conv_a is not None
        assert conv_b is not None

        if a > b:
            assert conv_a > conv_b, f"{a} {unit_from} -> {conv_a} {unit_to}, but {b} {unit_from} -> {conv_b} {unit_to}"
        else:
            assert conv_a < conv_b


# =============================================================================
# Property 4: Non-Negative Results
# Conversion of positive input is always positive
# =============================================================================

class TestNonNegativeConversion:
    """Positive inputs always produce positive outputs."""

    @given(
        qty=st.floats(min_value=0.001, max_value=100000, allow_nan=False, allow_infinity=False),
        pair_idx=st.integers(min_value=0, max_value=len(ALL_CONVERTIBLE_PAIRS) - 1),
    )
    @settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
    def test_positive_in_positive_out(self, qty, pair_idx):
        """Positive quantity always converts to positive result."""
        unit_from, unit_to = ALL_CONVERTIBLE_PAIRS[pair_idx]
        result = convert_same_type(qty, unit_from, unit_to)
        assert result is not None
        assert result > 0, f"{qty} {unit_from} -> {result} {unit_to} (should be positive)"


# =============================================================================
# Property 5: Normalize Unit Stability
# normalize(normalize(x)) == normalize(x)
# =============================================================================

class TestNormalizeStability:
    """Normalizing an already-normalized unit returns the same value."""

    KNOWN_UNITS = [
        "tsp", "tbsp", "cup", "oz", "lb", "g", "kg", "ml", "L",
        "teaspoon", "tablespoon", "ounce", "pound", "gram", "kilogram",
        "fl oz", "pint", "quart", "gallon", "liter", "milliliter",
        "count", "dozen", "pair", "piece", "each",
    ]

    @pytest.mark.parametrize("unit", KNOWN_UNITS)
    def test_double_normalize_stable(self, unit):
        """normalize(normalize(x)) == normalize(x) for all known units."""
        first = normalize_unit(unit)
        second = normalize_unit(first)
        assert first == second, f"normalize('{unit}') = '{first}', normalize('{first}') = '{second}'"


# =============================================================================
# Property 6: Cross-Type Conversion Fails Gracefully
# Incompatible types return None, never crash
# =============================================================================

class TestCrossTypeGraceful:
    """Incompatible unit conversions return None, never raise."""

    INCOMPATIBLE_PAIRS = [
        ("cup", "gram"),      # volume -> weight (no ingredient context)
        ("ounce", "teaspoon"),  # weight -> volume
        ("count", "cup"),      # count -> volume
        ("dozen", "pound"),    # count -> weight
        ("gram", "each"),      # weight -> count
    ]

    @pytest.mark.parametrize("from_unit,to_unit", INCOMPATIBLE_PAIRS)
    def test_incompatible_returns_none(self, from_unit, to_unit):
        """Cross-type conversion without density context returns None."""
        result = convert_same_type(5.0, from_unit, to_unit)
        assert result is None, f"Expected None for {from_unit}->{to_unit}, got {result}"


# =============================================================================
# Boundary Value Tests (Equivalence Class Partitioning)
# =============================================================================

class TestBoundaryValues:
    """Exact boundary values for unit conversion breakpoints."""

    # Volume: base unit = teaspoon
    # 1 tbsp = 3 tsp, 1 cup = 48 tsp, 1 fl oz = 6 tsp

    @pytest.mark.parametrize("tsp,expected_cups", [
        (48, 1.0),       # exact boundary
        (47, 47 / 48),   # just below
        (49, 49 / 48),   # just above
        (96, 2.0),       # double
        (24, 0.5),       # half
        (1, 1 / 48),     # minimum meaningful
    ])
    def test_tsp_to_cup_boundaries(self, tsp, expected_cups):
        result = convert_same_type(tsp, "teaspoon", "cup")
        assert result is not None
        assert abs(result - expected_cups) < 0.001

    @pytest.mark.parametrize("tbsp,expected_cups", [
        (16, 1.0),       # exact: 16 tbsp = 1 cup
        (15, 15 / 16),   # just below
        (17, 17 / 16),   # just above
        (8, 0.5),        # half cup
        (1, 1 / 16),     # 1 tbsp
    ])
    def test_tbsp_to_cup_boundaries(self, tbsp, expected_cups):
        result = convert_same_type(tbsp, "tablespoon", "cup")
        assert result is not None
        assert abs(result - expected_cups) < 0.001

    # Weight: base unit = gram
    # 1 oz = 28.35g, 1 lb = 453.6g, 1 kg = 1000g

    @pytest.mark.parametrize("oz,expected_lb", [
        (16, 16 * 28.35 / 453.6),   # ~1 lb
        (1, 28.35 / 453.6),          # 1 oz
        (32, 32 * 28.35 / 453.6),    # 2 lb
        (8, 8 * 28.35 / 453.6),      # half lb
    ])
    def test_oz_to_lb_boundaries(self, oz, expected_lb):
        result = convert_same_type(oz, "ounce", "pound")
        assert result is not None
        assert abs(result - expected_lb) < 0.01

    @pytest.mark.parametrize("g,expected_kg", [
        (1000, 1.0),      # exact
        (999, 0.999),     # just below
        (1001, 1.001),    # just above
        (500, 0.5),       # half
        (1, 0.001),       # minimum
    ])
    def test_gram_to_kg_boundaries(self, g, expected_kg):
        result = convert_same_type(g, "gram", "kilogram")
        assert result is not None
        assert abs(result - expected_kg) < 0.0001

    # Metric volume: 1 L = 202.9 tsp, 1 ml = 0.2029 tsp

    @pytest.mark.parametrize("ml,expected_l", [
        (1000, 1.0),
        (500, 0.5),
        (1, 0.001),
        (250, 0.25),
    ])
    def test_ml_to_liter_boundaries(self, ml, expected_l):
        result = convert_same_type(ml, "milliliter", "liter")
        assert result is not None
        assert abs(result - expected_l) < 0.01

    # Count: 1 dozen = 12

    @pytest.mark.parametrize("count,expected_dozen", [
        (12, 1.0),
        (6, 0.5),
        (24, 2.0),
        (1, 1 / 12),
    ])
    def test_count_to_dozen_boundaries(self, count, expected_dozen):
        result = convert_same_type(count, "count", "dozen")
        assert result is not None
        assert abs(result - expected_dozen) < 0.001

    # Zero and near-zero

    def test_zero_quantity_returns_zero(self):
        result = convert_same_type(0, "cup", "teaspoon")
        assert result is not None
        assert result == 0.0

    def test_very_small_quantity(self):
        result = convert_same_type(0.001, "cup", "teaspoon")
        assert result is not None
        assert result > 0

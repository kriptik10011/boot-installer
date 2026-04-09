"""
Tests for the food category resolver (detect_food_category).

Validates the token-based resolution pipeline:
  Step 0: Exact match
  Step 1: Storage override tokens (frozen/canned/dried)
  Step 2: Multi-word keyword match with word boundaries (longest first)
  Step 3: Single-token match against noise-stripped token set
  Special: Fresh reclassification (fresh + SPICES -> PRODUCE_LEAFY)
"""

import pytest

from app.services.expiration_defaults import detect_food_category, FoodCategory


# ---------------------------------------------------------------------------
# Step 0: Exact match — common items resolve on the first lookup
# ---------------------------------------------------------------------------
class TestExactMatch:
    """Direct hits in FOOD_CATEGORY_MAPPING."""

    @pytest.mark.parametrize("name, expected", [
        ("milk", FoodCategory.DAIRY),
        ("cheese", FoodCategory.DAIRY),
        ("yogurt", FoodCategory.DAIRY),
        ("butter", FoodCategory.DAIRY),
        ("chicken", FoodCategory.MEAT_POULTRY),
        ("beef", FoodCategory.MEAT_POULTRY),
        ("pork", FoodCategory.MEAT_POULTRY),
        ("salmon", FoodCategory.SEAFOOD),
        ("shrimp", FoodCategory.SEAFOOD),
        ("rice", FoodCategory.DRY_GOODS),
        ("pasta", FoodCategory.DRY_GOODS),
        ("flour", FoodCategory.DRY_GOODS),
        ("bread", FoodCategory.BREAD),
        ("eggs", FoodCategory.EGGS),
        ("lettuce", FoodCategory.PRODUCE_LEAFY),
        ("spinach", FoodCategory.PRODUCE_LEAFY),
        ("apple", FoodCategory.PRODUCE_FRUIT),
        ("banana", FoodCategory.PRODUCE_FRUIT),
        ("potato", FoodCategory.PRODUCE_ROOT),
        ("carrot", FoodCategory.PRODUCE_ROOT),
        ("ketchup", FoodCategory.CONDIMENTS),
        ("mustard", FoodCategory.CONDIMENTS),
        ("oil", FoodCategory.OILS),
    ])
    def test_exact_match(self, name, expected):
        assert detect_food_category(name) == expected

    def test_case_insensitive(self):
        assert detect_food_category("Milk") == FoodCategory.DAIRY
        assert detect_food_category("CHICKEN") == FoodCategory.MEAT_POULTRY
        assert detect_food_category("Rice") == FoodCategory.DRY_GOODS

    def test_whitespace_stripped(self):
        assert detect_food_category("  milk  ") == FoodCategory.DAIRY


# ---------------------------------------------------------------------------
# Step 2: Multi-word keyword match — longest match wins, word boundaries apply
# ---------------------------------------------------------------------------
class TestMultiWordMatch:
    """Multi-word keys beat single-token keys; word boundaries prevent partials."""

    @pytest.mark.parametrize("name, expected", [
        ("sour cream", FoodCategory.DAIRY),
        ("cream cheese", FoodCategory.DAIRY),
        ("heavy cream", FoodCategory.DAIRY),
        ("cottage cheese", FoodCategory.DAIRY),
        ("chicken broth", FoodCategory.CANNED),
        ("chicken stock", FoodCategory.CANNED),
        ("beef broth", FoodCategory.CANNED),
        ("beef stock", FoodCategory.CANNED),
        ("vegetable broth", FoodCategory.CANNED),
        ("vegetable stock", FoodCategory.CANNED),
        ("bone broth", FoodCategory.CANNED),
        ("olive oil", FoodCategory.OILS),
        ("coconut oil", FoodCategory.OILS),
        ("sesame oil", FoodCategory.OILS),
        ("tomato paste", FoodCategory.CANNED),
        ("tomato sauce", FoodCategory.CANNED),
        ("diced tomatoes", FoodCategory.CANNED),
        ("soy sauce", FoodCategory.CONDIMENTS),
        ("hot sauce", FoodCategory.CONDIMENTS),
        ("fish sauce", FoodCategory.CONDIMENTS),
        ("curry powder", FoodCategory.SPICES),
        ("red pepper flakes", FoodCategory.SPICES),
        ("bay leaves", FoodCategory.SPICES),
        ("ground beef", FoodCategory.MEAT_POULTRY),
        ("chicken breast", FoodCategory.MEAT_POULTRY),
        ("green beans", FoodCategory.PRODUCE_FRUIT),
        ("bell pepper", FoodCategory.PRODUCE_FRUIT),
        ("sweet potato", FoodCategory.PRODUCE_ROOT),
        ("deli meat", FoodCategory.DELI),
    ])
    def test_multi_word_exact(self, name, expected):
        assert detect_food_category(name) == expected

    def test_word_boundary_no_partial(self):
        """'creamy sauce' must NOT match the 'cream' keyword."""
        result = detect_food_category("creamy sauce")
        assert result != FoodCategory.DAIRY

    def test_word_boundary_no_partial_icy(self):
        """'icy chicken wings' should still match 'chicken' (whole word)."""
        result = detect_food_category("icy chicken wings")
        assert result == FoodCategory.MEAT_POULTRY


# ---------------------------------------------------------------------------
# Compound resolution — multi-word entry beats conflicting single token
# ---------------------------------------------------------------------------
class TestCompoundResolution:
    """Multi-word entries like 'chicken broth' must beat 'chicken' alone."""

    @pytest.mark.parametrize("name, expected", [
        ("chicken broth", FoodCategory.CANNED),
        ("beef stock", FoodCategory.CANNED),
        ("vegetable broth", FoodCategory.CANNED),
        ("coconut milk", FoodCategory.CANNED),
    ])
    def test_compound_beats_single_token(self, name, expected):
        assert detect_food_category(name) == expected


# ---------------------------------------------------------------------------
# Step 3: Token fallback — noise words stripped, single tokens resolved
# ---------------------------------------------------------------------------
class TestTokenFallback:
    """Noise-stripped single-token matching."""

    @pytest.mark.parametrize("name, expected", [
        # Noise words stripped, "chicken" + "broth" multi-word match in step 2
        ("low-sodium chicken broth", FoodCategory.CANNED),
        # Noise words stripped, "butter" token found
        ("organic unsalted butter", FoodCategory.DAIRY),
        # Noise words stripped, "salmon" token found
        ("raw boneless salmon", FoodCategory.SEAFOOD),
        # Noise words stripped, "flour" token found
        ("organic whole wheat flour", FoodCategory.DRY_GOODS),
        # Noise words stripped, "eggs" token found
        ("large free range eggs", FoodCategory.EGGS),
    ])
    def test_noise_word_stripping(self, name, expected):
        assert detect_food_category(name) == expected

    def test_extra_virgin_olive_oil(self):
        """'extra virgin olive oil' — 'olive oil' multi-word match in step 2."""
        assert detect_food_category("extra virgin olive oil") == FoodCategory.OILS


# ---------------------------------------------------------------------------
# Step 1: Storage override tokens — "frozen"/"canned"/"dried" override base
# ---------------------------------------------------------------------------
class TestStorageOverride:
    """Storage-prefix tokens override the base category."""

    @pytest.mark.parametrize("name, expected", [
        ("frozen chicken breast", FoodCategory.FROZEN_VEGETABLES),
        ("frozen peas", FoodCategory.FROZEN_VEGETABLES),
        ("frozen shrimp", FoodCategory.FROZEN_VEGETABLES),
        ("frozen berries", FoodCategory.FROZEN_VEGETABLES),
        ("canned tomatoes", FoodCategory.CANNED),
        ("canned beans", FoodCategory.CANNED),
        ("canned tuna", FoodCategory.CANNED),
        ("dried ginger", FoodCategory.SPICES),  # ginger is a spice; dried ginger stays SPICES
        ("dried herbs", FoodCategory.DRY_GOODS),
        ("dried lentils", FoodCategory.DRY_GOODS),
    ])
    def test_storage_override(self, name, expected):
        assert detect_food_category(name) == expected


# ---------------------------------------------------------------------------
# Fresh reclassification — "fresh" + SPICES base → PRODUCE_LEAFY
# ---------------------------------------------------------------------------
class TestFreshReclassification:
    """Fresh herbs/spices reclassify from SPICES to PRODUCE_LEAFY."""

    @pytest.mark.parametrize("name, expected", [
        ("fresh ginger", FoodCategory.PRODUCE_LEAFY),
        ("fresh rosemary", FoodCategory.PRODUCE_LEAFY),
        ("fresh thyme", FoodCategory.PRODUCE_LEAFY),
        ("fresh oregano", FoodCategory.PRODUCE_LEAFY),
        ("fresh dill", FoodCategory.PRODUCE_LEAFY),
    ])
    def test_fresh_reclassifies_spice_to_produce(self, name, expected):
        assert detect_food_category(name) == expected

    def test_fresh_does_not_reclassify_non_spice(self):
        """'fresh' should NOT reclassify items that are already produce."""
        assert detect_food_category("fresh spinach") == FoodCategory.PRODUCE_LEAFY
        assert detect_food_category("fresh salmon") == FoodCategory.SEAFOOD

    def test_dried_prevents_fresh_reclassification(self):
        """'dried ginger' → SPICES (ginger is a spice, dried keeps it there)."""
        assert detect_food_category("dried ginger") == FoodCategory.SPICES


# ---------------------------------------------------------------------------
# Oil detection
# ---------------------------------------------------------------------------
class TestOilDetection:

    @pytest.mark.parametrize("name, expected", [
        ("olive oil", FoodCategory.OILS),
        ("extra virgin olive oil", FoodCategory.OILS),
        ("vegetable oil", FoodCategory.OILS),
        ("coconut oil", FoodCategory.OILS),
        ("sesame oil", FoodCategory.OILS),
        ("canola oil", FoodCategory.OILS),
        ("avocado oil", FoodCategory.OILS),
    ])
    def test_oil_detection(self, name, expected):
        assert detect_food_category(name) == expected


# ---------------------------------------------------------------------------
# Spice detection
# ---------------------------------------------------------------------------
class TestSpiceDetection:

    @pytest.mark.parametrize("name, expected", [
        ("cumin", FoodCategory.SPICES),
        ("curry powder", FoodCategory.SPICES),
        ("paprika", FoodCategory.SPICES),
        ("cinnamon", FoodCategory.SPICES),
        ("nutmeg", FoodCategory.SPICES),
        ("turmeric", FoodCategory.SPICES),
        ("oregano", FoodCategory.SPICES),
        ("thyme", FoodCategory.SPICES),
        ("salt", FoodCategory.SPICES),
        ("pepper", FoodCategory.SPICES),
    ])
    def test_spice_detection(self, name, expected):
        assert detect_food_category(name) == expected


# ---------------------------------------------------------------------------
# Fallthrough — completely unknown items resolve to OTHER
# ---------------------------------------------------------------------------
class TestFallthrough:

    def test_unknown_item_returns_other(self):
        assert detect_food_category("widget sprocket") == FoodCategory.OTHER

    def test_empty_string_returns_other(self):
        assert detect_food_category("") == FoodCategory.OTHER

    def test_gibberish_returns_other(self):
        assert detect_food_category("xyzzy plugh") == FoodCategory.OTHER

    def test_numbers_only_returns_other(self):
        assert detect_food_category("12345") == FoodCategory.OTHER

"""
Unit Conversion Constants for Ingredient Quantities

Supports:
- Standard volume units (tsp, tbsp, cup, fl oz, ml, L)
- Standard weight units (oz, lb, g, kg)
- Count units (count, dozen, etc.)
- Cross-type conversions for specific ingredients (e.g., 1 cup flour = 120g)

Part of the smart unit conversion layer.
"""

import enum


class UnitType(str, enum.Enum):
    """Categories of measurement units."""
    VOLUME = "volume"
    WEIGHT = "weight"
    COUNT = "count"
    CUSTOM = "custom"


# =============================================================================
# DEFAULT UNITS DATA
# =============================================================================

# Base units are assigned multiplier=1, other units are relative to base

VOLUME_UNITS = [
    # Base unit: teaspoon
    {"name": "teaspoon", "abbreviations": ["tsp", "t", "teaspoon", "teaspoons"], "base_multiplier": 1},
    {"name": "tablespoon", "abbreviations": ["tbsp", "T", "Tbsp", "tablespoon", "tablespoons"], "base_multiplier": 3},
    {"name": "fluid_ounce", "abbreviations": ["fl oz", "fl. oz", "fluid ounce", "fluid ounces"], "base_multiplier": 6},
    {"name": "cup", "abbreviations": ["cup", "cups", "c", "C"], "base_multiplier": 48},
    {"name": "pint", "abbreviations": ["pt", "pint", "pints"], "base_multiplier": 96},
    {"name": "quart", "abbreviations": ["qt", "quart", "quarts"], "base_multiplier": 192},
    {"name": "gallon", "abbreviations": ["gal", "gallon", "gallons"], "base_multiplier": 768},
    {"name": "milliliter", "abbreviations": ["ml", "mL", "milliliter", "milliliters"], "base_multiplier": 0.2029},
    {"name": "liter", "abbreviations": ["L", "l", "liter", "liters"], "base_multiplier": 202.9},
]

WEIGHT_UNITS = [
    # Base unit: gram
    {"name": "gram", "abbreviations": ["g", "gram", "grams"], "base_multiplier": 1},
    {"name": "kilogram", "abbreviations": ["kg", "kilogram", "kilograms"], "base_multiplier": 1000},
    {"name": "ounce", "abbreviations": ["oz", "ounce", "ounces"], "base_multiplier": 28.35},
    {"name": "pound", "abbreviations": ["lb", "lbs", "pound", "pounds"], "base_multiplier": 453.6},
]

COUNT_UNITS = [
    # Base unit: count
    {"name": "count", "abbreviations": ["count", "piece", "pieces", "item", "items", "each"], "base_multiplier": 1},
    {"name": "dozen", "abbreviations": ["dozen", "doz"], "base_multiplier": 12},
    {"name": "pair", "abbreviations": ["pair", "pairs"], "base_multiplier": 2},
]

# Common ingredient volume-to-weight conversions (1 cup = X grams)
COMMON_CONVERSIONS = {
    # Flour types
    "flour": 120,
    "all-purpose flour": 120,
    "bread flour": 127,
    "cake flour": 114,
    "whole wheat flour": 120,

    # Sugars
    "sugar": 200,
    "granulated sugar": 200,
    "brown sugar": 220,
    "powdered sugar": 120,
    "confectioners sugar": 120,

    # Dairy
    "butter": 227,
    "milk": 245,
    "cream": 240,
    "sour cream": 230,
    "yogurt": 245,

    # Liquids
    "water": 237,
    "oil": 218,
    "olive oil": 216,
    "vegetable oil": 218,
    "honey": 340,
    "maple syrup": 315,

    # Dry goods
    "rice": 185,
    "oats": 80,
    "cornmeal": 150,

    # Others
    "salt": 288,
    "baking powder": 230,
    "cocoa powder": 86,

    # Cheese (shredded, grams per cup)
    "mozzarella": 113,
    "cheddar": 113,
    "pepper jack": 113,
    "parmesan": 100,
    "cream cheese": 230,

    # Herbs (chopped, grams per cup)
    "parsley": 15,
    "cilantro": 16,
    "basil": 24,

    # Spices (ground, grams per cup)
    "garlic powder": 96,
    "onion powder": 96,
}

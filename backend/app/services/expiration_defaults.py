"""
Expiration Defaults Service

Provides food safety-based default expiration dates.
Learns from user feedback to adjust defaults over time.

Learning strategy:
- Template Switch Strategy for cold start
- Reference Class Forecasting by food category
- Bayesian Updating with Conservative Gating (3+ confirmations)
- ADWIN Drift Detection for habit changes
"""

import re
from datetime import date, timedelta
from typing import Dict, Optional, Tuple
from enum import Enum


class FoodCategory(str, Enum):
    """Food categories with associated storage types."""
    # Fridge items
    DAIRY = "dairy"
    MEAT_POULTRY = "meat_poultry"
    SEAFOOD = "seafood"
    EGGS = "eggs"
    PRODUCE_LEAFY = "produce_leafy"
    PRODUCE_FRUIT = "produce_fruit"
    PRODUCE_ROOT = "produce_root"
    DELI = "deli"
    LEFTOVERS = "leftovers"
    CONDIMENTS = "condiments"

    # Pantry items
    CANNED = "canned"
    DRY_GOODS = "dry_goods"
    BREAD = "bread"
    SNACKS = "snacks"
    OILS = "oils"
    SPICES = "spices"

    # Freezer items
    FROZEN_MEAT = "frozen_meat"
    FROZEN_VEGETABLES = "frozen_vegetables"
    FROZEN_MEALS = "frozen_meals"
    ICE_CREAM = "ice_cream"

    # Other
    BEVERAGES = "beverages"
    OTHER = "other"


# Default expiration days by category and storage location
# Based on USDA food safety guidelines
EXPIRATION_DEFAULTS: Dict[FoodCategory, Dict[str, int]] = {
    # Fridge items (days)
    FoodCategory.DAIRY: {"fridge": 7, "freezer": 90},
    FoodCategory.MEAT_POULTRY: {"fridge": 3, "freezer": 120},
    FoodCategory.SEAFOOD: {"fridge": 2, "freezer": 90},
    FoodCategory.EGGS: {"fridge": 21, "freezer": 365},
    FoodCategory.PRODUCE_LEAFY: {"fridge": 5, "pantry": 1},
    FoodCategory.PRODUCE_FRUIT: {"fridge": 7, "pantry": 3},
    FoodCategory.PRODUCE_ROOT: {"fridge": 14, "pantry": 7},
    FoodCategory.DELI: {"fridge": 5},
    FoodCategory.LEFTOVERS: {"fridge": 4, "freezer": 90},
    FoodCategory.CONDIMENTS: {"fridge": 180, "pantry": 365},

    # Pantry items (days)
    FoodCategory.CANNED: {"pantry": 730},  # 2 years
    FoodCategory.DRY_GOODS: {"pantry": 365},
    FoodCategory.BREAD: {"pantry": 7, "fridge": 14, "freezer": 90},
    FoodCategory.SNACKS: {"pantry": 60},
    FoodCategory.OILS: {"pantry": 180},
    FoodCategory.SPICES: {"pantry": 365},

    # Freezer items (days)
    FoodCategory.FROZEN_MEAT: {"freezer": 180},
    FoodCategory.FROZEN_VEGETABLES: {"freezer": 240},
    FoodCategory.FROZEN_MEALS: {"freezer": 90},
    FoodCategory.ICE_CREAM: {"freezer": 60},

    # Other
    FoodCategory.BEVERAGES: {"fridge": 14, "pantry": 365},
    FoodCategory.OTHER: {"fridge": 7, "pantry": 30, "freezer": 90},
}

# Common food items mapped to categories for auto-detection
FOOD_CATEGORY_MAPPING: Dict[str, FoodCategory] = {
    # Dairy
    "milk": FoodCategory.DAIRY,
    "cheese": FoodCategory.DAIRY,
    "yogurt": FoodCategory.DAIRY,
    "butter": FoodCategory.DAIRY,
    "cream": FoodCategory.DAIRY,
    "sour cream": FoodCategory.DAIRY,
    "cottage cheese": FoodCategory.DAIRY,
    "pepper jack": FoodCategory.DAIRY,
    "pepper jack cheese": FoodCategory.DAIRY,
    "cream cheese": FoodCategory.DAIRY,
    "cheddar cheese": FoodCategory.DAIRY,
    "mozzarella cheese": FoodCategory.DAIRY,

    # Meat/Poultry
    "chicken": FoodCategory.MEAT_POULTRY,
    "beef": FoodCategory.MEAT_POULTRY,
    "pork": FoodCategory.MEAT_POULTRY,
    "turkey": FoodCategory.MEAT_POULTRY,
    "ground beef": FoodCategory.MEAT_POULTRY,
    "steak": FoodCategory.MEAT_POULTRY,
    "bacon": FoodCategory.MEAT_POULTRY,
    "sausage": FoodCategory.MEAT_POULTRY,
    "ham": FoodCategory.MEAT_POULTRY,

    # Seafood
    "fish": FoodCategory.SEAFOOD,
    "salmon": FoodCategory.SEAFOOD,
    "shrimp": FoodCategory.SEAFOOD,
    "tuna": FoodCategory.SEAFOOD,
    "cod": FoodCategory.SEAFOOD,
    "tilapia": FoodCategory.SEAFOOD,

    # Eggs
    "eggs": FoodCategory.EGGS,
    "egg": FoodCategory.EGGS,

    # Leafy produce
    "lettuce": FoodCategory.PRODUCE_LEAFY,
    "spinach": FoodCategory.PRODUCE_LEAFY,
    "kale": FoodCategory.PRODUCE_LEAFY,
    "arugula": FoodCategory.PRODUCE_LEAFY,
    "salad": FoodCategory.PRODUCE_LEAFY,
    "herbs": FoodCategory.PRODUCE_LEAFY,
    "cilantro": FoodCategory.PRODUCE_LEAFY,
    "parsley": FoodCategory.PRODUCE_LEAFY,
    "basil": FoodCategory.PRODUCE_LEAFY,

    # Fruit produce
    "apple": FoodCategory.PRODUCE_FRUIT,
    "banana": FoodCategory.PRODUCE_FRUIT,
    "orange": FoodCategory.PRODUCE_FRUIT,
    "berries": FoodCategory.PRODUCE_FRUIT,
    "strawberries": FoodCategory.PRODUCE_FRUIT,
    "grapes": FoodCategory.PRODUCE_FRUIT,
    "melon": FoodCategory.PRODUCE_FRUIT,
    "avocado": FoodCategory.PRODUCE_FRUIT,
    "tomato": FoodCategory.PRODUCE_FRUIT,

    # Root produce
    "potato": FoodCategory.PRODUCE_ROOT,
    "carrot": FoodCategory.PRODUCE_ROOT,
    "onion": FoodCategory.PRODUCE_ROOT,
    "garlic": FoodCategory.PRODUCE_ROOT,
    "celery": FoodCategory.PRODUCE_ROOT,
    "beet": FoodCategory.PRODUCE_ROOT,

    # Deli
    "deli meat": FoodCategory.DELI,
    "lunch meat": FoodCategory.DELI,
    "sliced turkey": FoodCategory.DELI,
    "sliced ham": FoodCategory.DELI,

    # Leftovers (special)
    "leftover": FoodCategory.LEFTOVERS,
    "leftovers": FoodCategory.LEFTOVERS,

    # Condiments
    "ketchup": FoodCategory.CONDIMENTS,
    "mustard": FoodCategory.CONDIMENTS,
    "mayonnaise": FoodCategory.CONDIMENTS,
    "salsa": FoodCategory.CONDIMENTS,
    "hot sauce": FoodCategory.CONDIMENTS,
    "soy sauce": FoodCategory.CONDIMENTS,

    # Pantry
    "rice": FoodCategory.DRY_GOODS,
    "pasta": FoodCategory.DRY_GOODS,
    "cereal": FoodCategory.DRY_GOODS,
    "flour": FoodCategory.DRY_GOODS,
    "sugar": FoodCategory.DRY_GOODS,
    "oats": FoodCategory.DRY_GOODS,

    # Bread
    "bread": FoodCategory.BREAD,
    "bagel": FoodCategory.BREAD,
    "tortilla": FoodCategory.BREAD,
    "pita": FoodCategory.BREAD,

    # Canned
    "canned": FoodCategory.CANNED,
    "beans": FoodCategory.CANNED,
    "soup": FoodCategory.CANNED,

    # Oils & vinegar
    "olive oil": FoodCategory.OILS,
    "vegetable oil": FoodCategory.OILS,
    "coconut oil": FoodCategory.OILS,
    "sesame oil": FoodCategory.OILS,
    "canola oil": FoodCategory.OILS,
    "avocado oil": FoodCategory.OILS,
    "oil": FoodCategory.OILS,
    "vinegar": FoodCategory.CONDIMENTS,
    "balsamic vinegar": FoodCategory.CONDIMENTS,
    "rice vinegar": FoodCategory.CONDIMENTS,
    "apple cider vinegar": FoodCategory.CONDIMENTS,

    # Pantry staples
    "honey": FoodCategory.DRY_GOODS,
    "maple syrup": FoodCategory.CONDIMENTS,
    "brown sugar": FoodCategory.DRY_GOODS,
    "powdered sugar": FoodCategory.DRY_GOODS,
    "baking powder": FoodCategory.DRY_GOODS,
    "baking soda": FoodCategory.DRY_GOODS,
    "cornstarch": FoodCategory.DRY_GOODS,
    "cocoa": FoodCategory.DRY_GOODS,
    "cocoa powder": FoodCategory.DRY_GOODS,
    "vanilla extract": FoodCategory.CONDIMENTS,
    "vanilla": FoodCategory.CONDIMENTS,
    "worcestershire": FoodCategory.CONDIMENTS,
    "worcestershire sauce": FoodCategory.CONDIMENTS,

    # Canned/jarred
    "broth": FoodCategory.CANNED,
    "stock": FoodCategory.CANNED,
    "tomato paste": FoodCategory.CANNED,
    "tomato sauce": FoodCategory.CANNED,
    "diced tomatoes": FoodCategory.CANNED,
    "coconut milk": FoodCategory.CANNED,

    # Broth/stock compounds (multi-word to beat single-token "chicken"/"beef")
    "chicken broth": FoodCategory.CANNED,
    "chicken stock": FoodCategory.CANNED,
    "beef broth": FoodCategory.CANNED,
    "beef stock": FoodCategory.CANNED,
    "vegetable broth": FoodCategory.CANNED,
    "vegetable stock": FoodCategory.CANNED,
    "bone broth": FoodCategory.CANNED,

    # Dry goods (additional)
    "lentils": FoodCategory.DRY_GOODS,
    "quinoa": FoodCategory.DRY_GOODS,
    "noodles": FoodCategory.DRY_GOODS,
    "couscous": FoodCategory.DRY_GOODS,
    "breadcrumbs": FoodCategory.DRY_GOODS,
    "panko": FoodCategory.DRY_GOODS,
    "cornmeal": FoodCategory.DRY_GOODS,

    # Spices (additional)
    "turmeric": FoodCategory.SPICES,
    "ginger": FoodCategory.SPICES,
    "rosemary": FoodCategory.SPICES,
    "sage": FoodCategory.SPICES,
    "dill": FoodCategory.SPICES,
    "bay leaf": FoodCategory.SPICES,
    "bay leaves": FoodCategory.SPICES,
    "garlic powder": FoodCategory.SPICES,
    "onion powder": FoodCategory.SPICES,
    "curry powder": FoodCategory.SPICES,
    "chili flakes": FoodCategory.SPICES,
    "red pepper flakes": FoodCategory.SPICES,
    "thyme": FoodCategory.SPICES,
    "oregano": FoodCategory.SPICES,
    "cumin": FoodCategory.SPICES,
    "paprika": FoodCategory.SPICES,
    "cinnamon": FoodCategory.SPICES,
    "nutmeg": FoodCategory.SPICES,
    "salt": FoodCategory.SPICES,
    "pepper": FoodCategory.SPICES,

    # More produce
    "bell pepper": FoodCategory.PRODUCE_FRUIT,
    "zucchini": FoodCategory.PRODUCE_FRUIT,
    "squash": FoodCategory.PRODUCE_FRUIT,
    "eggplant": FoodCategory.PRODUCE_FRUIT,
    "cucumber": FoodCategory.PRODUCE_FRUIT,
    "corn": FoodCategory.PRODUCE_FRUIT,
    "peas": FoodCategory.PRODUCE_FRUIT,
    "green beans": FoodCategory.PRODUCE_FRUIT,
    "broccoli": FoodCategory.PRODUCE_FRUIT,
    "cauliflower": FoodCategory.PRODUCE_FRUIT,
    "cabbage": FoodCategory.PRODUCE_LEAFY,
    "sweet potato": FoodCategory.PRODUCE_ROOT,
    "turnip": FoodCategory.PRODUCE_ROOT,
    "parsnip": FoodCategory.PRODUCE_ROOT,
    "radish": FoodCategory.PRODUCE_ROOT,
    "mushroom": FoodCategory.PRODUCE_FRUIT,

    # More proteins
    "tofu": FoodCategory.MEAT_POULTRY,
    "tempeh": FoodCategory.MEAT_POULTRY,
    "lamb": FoodCategory.MEAT_POULTRY,
    "duck": FoodCategory.MEAT_POULTRY,
    "ground turkey": FoodCategory.MEAT_POULTRY,
    "ground pork": FoodCategory.MEAT_POULTRY,
    "pork chop": FoodCategory.MEAT_POULTRY,
    "chicken breast": FoodCategory.MEAT_POULTRY,
    "chicken thigh": FoodCategory.MEAT_POULTRY,

    # More dairy
    "cream cheese": FoodCategory.DAIRY,
    "parmesan": FoodCategory.DAIRY,
    "mozzarella": FoodCategory.DAIRY,
    "cheddar": FoodCategory.DAIRY,
    "ricotta": FoodCategory.DAIRY,
    "feta": FoodCategory.DAIRY,
    "heavy cream": FoodCategory.DAIRY,
    "half and half": FoodCategory.DAIRY,
    "whipping cream": FoodCategory.DAIRY,

    # Condiments (additional)
    "fish sauce": FoodCategory.CONDIMENTS,
    "oyster sauce": FoodCategory.CONDIMENTS,
    "hoisin sauce": FoodCategory.CONDIMENTS,
    "teriyaki sauce": FoodCategory.CONDIMENTS,
    "bbq sauce": FoodCategory.CONDIMENTS,
    "ranch": FoodCategory.CONDIMENTS,
    "mayo": FoodCategory.CONDIMENTS,
    "peanut butter": FoodCategory.CONDIMENTS,
    "jam": FoodCategory.CONDIMENTS,
    "jelly": FoodCategory.CONDIMENTS,
    "syrup": FoodCategory.CONDIMENTS,
    "tahini": FoodCategory.CONDIMENTS,
    "miso": FoodCategory.CONDIMENTS,

    # More seafood
    "crab": FoodCategory.SEAFOOD,
    "lobster": FoodCategory.SEAFOOD,
    "scallop": FoodCategory.SEAFOOD,
    "scallops": FoodCategory.SEAFOOD,
    "clams": FoodCategory.SEAFOOD,
    "mussels": FoodCategory.SEAFOOD,
    "anchovy": FoodCategory.SEAFOOD,
    "anchovies": FoodCategory.SEAFOOD,

    # Spices (additional)
    "chili powder": FoodCategory.SPICES,
    "chili": FoodCategory.SPICES,
    "cloves": FoodCategory.SPICES,
    "clove": FoodCategory.SPICES,
    "parsley": FoodCategory.SPICES,

    # Dry goods (additional)
    "cocoa powder": FoodCategory.DRY_GOODS,
    "cocoa": FoodCategory.DRY_GOODS,
    "flaxseed": FoodCategory.DRY_GOODS,

    # Produce (additional)
    "strawberry": FoodCategory.PRODUCE_FRUIT,
    "strawberries": FoodCategory.PRODUCE_FRUIT,
    "blueberries": FoodCategory.PRODUCE_FRUIT,
    "blueberry": FoodCategory.PRODUCE_FRUIT,
    "raspberries": FoodCategory.PRODUCE_FRUIT,
    "raspberry": FoodCategory.PRODUCE_FRUIT,
    "blackberries": FoodCategory.PRODUCE_FRUIT,
    "blackberry": FoodCategory.PRODUCE_FRUIT,
    "cranberries": FoodCategory.PRODUCE_FRUIT,
    "mango": FoodCategory.PRODUCE_FRUIT,
    "peach": FoodCategory.PRODUCE_FRUIT,
    "pear": FoodCategory.PRODUCE_FRUIT,
    "plum": FoodCategory.PRODUCE_FRUIT,
    "cherry": FoodCategory.PRODUCE_FRUIT,
    "cherries": FoodCategory.PRODUCE_FRUIT,
    "lemon": FoodCategory.PRODUCE_FRUIT,
    "lime": FoodCategory.PRODUCE_FRUIT,
    "pineapple": FoodCategory.PRODUCE_FRUIT,
    "jalapeño": FoodCategory.PRODUCE_FRUIT,
    "jalapeno": FoodCategory.PRODUCE_FRUIT,
    "green onion": FoodCategory.PRODUCE_LEAFY,
    "green onions": FoodCategory.PRODUCE_LEAFY,
    "scallion": FoodCategory.PRODUCE_LEAFY,
    "scallions": FoodCategory.PRODUCE_LEAFY,
    "chives": FoodCategory.PRODUCE_LEAFY,
    "asparagus": FoodCategory.PRODUCE_FRUIT,
    "artichoke": FoodCategory.PRODUCE_FRUIT,

    # Condiments (additional)
    "tzatziki": FoodCategory.CONDIMENTS,
    "buffalo sauce": FoodCategory.CONDIMENTS,
    "dijon mustard": FoodCategory.CONDIMENTS,
    "sriracha": FoodCategory.CONDIMENTS,
    "relish": FoodCategory.CONDIMENTS,
    "horseradish": FoodCategory.CONDIMENTS,
    "marinara": FoodCategory.CONDIMENTS,
    "marinara sauce": FoodCategory.CONDIMENTS,
    "pasta sauce": FoodCategory.CONDIMENTS,

    # Snacks — nuts
    "pecans": FoodCategory.SNACKS,
    "pecan": FoodCategory.SNACKS,
    "peanuts": FoodCategory.SNACKS,
    "peanut": FoodCategory.SNACKS,
    "almonds": FoodCategory.SNACKS,
    "almond": FoodCategory.SNACKS,
    "walnuts": FoodCategory.SNACKS,
    "walnut": FoodCategory.SNACKS,
    "cashews": FoodCategory.SNACKS,
    "pine nuts": FoodCategory.SNACKS,

    # Dairy (multi-word to prevent "pepper" token → SPICES)
    "pepper jack": FoodCategory.DAIRY,
    "buttermilk": FoodCategory.DAIRY,
    "goat cheese": FoodCategory.DAIRY,
    "gruyere": FoodCategory.DAIRY,
    "provolone": FoodCategory.DAIRY,
    "swiss cheese": FoodCategory.DAIRY,
    "whipped cream": FoodCategory.DAIRY,
    "greek yogurt": FoodCategory.DAIRY,
    "milk of choice": FoodCategory.DAIRY,

    # Spices (additional)
    "cayenne": FoodCategory.SPICES,
    "cayenne pepper": FoodCategory.SPICES,
    "allspice": FoodCategory.SPICES,
    "italian seasoning": FoodCategory.SPICES,
    "seasoning": FoodCategory.SPICES,
    "parsley flakes": FoodCategory.SPICES,
    "crushed red pepper": FoodCategory.SPICES,
    "smoked paprika": FoodCategory.SPICES,
    "black pepper": FoodCategory.SPICES,
    "white pepper": FoodCategory.SPICES,
    "cardamom": FoodCategory.SPICES,
    "coriander": FoodCategory.SPICES,
    "fennel seed": FoodCategory.SPICES,
    "mustard powder": FoodCategory.SPICES,
    "old bay": FoodCategory.SPICES,
    "everything bagel seasoning": FoodCategory.SPICES,

    # More proteins
    "chicken wing": FoodCategory.MEAT_POULTRY,
    "chicken wings": FoodCategory.MEAT_POULTRY,
    "pork loin": FoodCategory.MEAT_POULTRY,
    "pork tenderloin": FoodCategory.MEAT_POULTRY,
    "beef stew meat": FoodCategory.MEAT_POULTRY,
    "brisket": FoodCategory.MEAT_POULTRY,
    "ribs": FoodCategory.MEAT_POULTRY,
    "Italian sausage": FoodCategory.MEAT_POULTRY,

    # Dry goods (additional)
    "bread crumbs": FoodCategory.DRY_GOODS,
    "croutons": FoodCategory.DRY_GOODS,
    "granola": FoodCategory.DRY_GOODS,
    "dried cranberries": FoodCategory.DRY_GOODS,
    "raisins": FoodCategory.DRY_GOODS,
    "chocolate chips": FoodCategory.DRY_GOODS,

    # Beverages
    "juice": FoodCategory.BEVERAGES,
    "orange juice": FoodCategory.BEVERAGES,
    "apple juice": FoodCategory.BEVERAGES,
    "lemon juice": FoodCategory.CONDIMENTS,
    "lime juice": FoodCategory.CONDIMENTS,
    "wine": FoodCategory.BEVERAGES,
    "beer": FoodCategory.BEVERAGES,
    "coffee": FoodCategory.BEVERAGES,
    "tea": FoodCategory.BEVERAGES,
}

# Preferred inventory unit per food category.
# Used by inventory_unit_recommender to convert recipe units (cup, tsp, slice)
# into sensible tracking units (oz, lb, count) at shopping completion time.
# None = keep whatever unit the recipe provided.
PREFERRED_INVENTORY_UNIT: Dict[FoodCategory, Optional[str]] = {
    FoodCategory.DAIRY:              "ounce",
    FoodCategory.MEAT_POULTRY:       "pound",
    FoodCategory.SEAFOOD:            "pound",
    FoodCategory.EGGS:               "count",
    FoodCategory.PRODUCE_LEAFY:      "count",
    FoodCategory.PRODUCE_FRUIT:      "count",
    FoodCategory.PRODUCE_ROOT:       "count",
    FoodCategory.DELI:               "ounce",
    FoodCategory.LEFTOVERS:          None,
    FoodCategory.CONDIMENTS:         "ounce",
    FoodCategory.CANNED:             "ounce",
    FoodCategory.DRY_GOODS:          "ounce",
    FoodCategory.BREAD:              "count",
    FoodCategory.SNACKS:             "ounce",
    FoodCategory.OILS:               "fluid_ounce",
    FoodCategory.SPICES:             "count",
    FoodCategory.FROZEN_MEAT:        "pound",
    FoodCategory.FROZEN_VEGETABLES:  "ounce",
    FoodCategory.FROZEN_MEALS:       "count",
    FoodCategory.ICE_CREAM:          "count",
    FoodCategory.BEVERAGES:          "fluid_ounce",
    FoodCategory.OTHER:              None,
}


# Display-friendly category names for inventory UI grouping
CATEGORY_DISPLAY_MAP: Dict[FoodCategory, str] = {
    FoodCategory.DAIRY:              "Dairy & Eggs",
    FoodCategory.EGGS:               "Dairy & Eggs",
    FoodCategory.MEAT_POULTRY:       "Meat & Seafood",
    FoodCategory.SEAFOOD:            "Meat & Seafood",
    FoodCategory.PRODUCE_LEAFY:      "Produce",
    FoodCategory.PRODUCE_FRUIT:      "Produce",
    FoodCategory.PRODUCE_ROOT:       "Produce",
    FoodCategory.DELI:               "Deli",
    FoodCategory.LEFTOVERS:          "Leftovers",
    FoodCategory.CONDIMENTS:         "Condiments",
    FoodCategory.CANNED:             "Pantry",
    FoodCategory.DRY_GOODS:          "Pantry",
    FoodCategory.BREAD:              "Bakery & Bread",
    FoodCategory.SNACKS:             "Snacks",
    FoodCategory.OILS:               "Oils & Vinegars",
    FoodCategory.SPICES:             "Spices & Seasonings",
    FoodCategory.FROZEN_MEAT:        "Frozen",
    FoodCategory.FROZEN_VEGETABLES:  "Frozen",
    FoodCategory.FROZEN_MEALS:       "Frozen",
    FoodCategory.ICE_CREAM:          "Frozen",
    FoodCategory.BEVERAGES:          "Beverages",
    FoodCategory.OTHER:              "Other",
}


# Storage override tokens — checked BEFORE noise stripping
# TODO: Add generic FROZEN category post-V1. Using FROZEN_VEGETABLES as proxy —
# this is a known simplification. Storage location will still be correct because
# _infer_storage_location() maps ALL frozen categories to FREEZER storage.
_STORAGE_OVERRIDES = {
    "frozen": FoodCategory.FROZEN_VEGETABLES,
    "canned": FoodCategory.CANNED,
    "dried": FoodCategory.DRY_GOODS,
}


def detect_food_category(name: str) -> FoodCategory:
    """
    Token-based food category detection with word-boundary matching.

    Three-pass resolution:
    0. Exact match (highest priority)
    1. Storage override tokens ("frozen"/"canned"/"dried") override base category
    2. Multi-word keyword match with word boundaries (longest first)
    3. Single-token match against noise-stripped token set
    """
    name_lower = name.lower().strip()

    # 0. Exact match (highest priority)
    if name_lower in FOOD_CATEGORY_MAPPING:
        return FOOD_CATEGORY_MAPPING[name_lower]

    # 1. Storage override check — "frozen"/"canned" tokens override base category
    tokens_all = set(re.sub(r'[^a-z\s]', '', name_lower).split())
    for override_token, override_cat in _STORAGE_OVERRIDES.items():
        if override_token in tokens_all:
            # "dried oregano" should stay SPICES, not become DRY_GOODS
            if override_token == "dried":
                for t in (tokens_all - {"dried"}):
                    if t in FOOD_CATEGORY_MAPPING and FOOD_CATEGORY_MAPPING[t] == FoodCategory.SPICES:
                        return FoodCategory.SPICES
            return override_cat

    # 2. Multi-word keyword match with word boundaries (longest first)
    # Prevents "cream" matching inside "creamy" or "ice cream maker"
    multi_word_keys = [k for k in FOOD_CATEGORY_MAPPING if ' ' in k]
    multi_word_keys.sort(key=len, reverse=True)
    for keyword in multi_word_keys:
        if re.search(rf'\b{re.escape(keyword)}\b', name_lower):
            return FOOD_CATEGORY_MAPPING[keyword]

    # 3. Single-token matching against noise-stripped token set
    # NOTE: For ambiguous multi-token ingredients (e.g., "chicken broth"),
    # add explicit multi-word entries to FOOD_CATEGORY_MAPPING so step 2
    # resolves them before reaching this step.
    noise = {"organic", "raw", "whole", "large", "small", "medium", "extra",
             "low", "high", "no", "free", "sodium", "fat", "added",
             "reduced", "unsalted", "salted", "boneless", "skinless"}
    # NOTE: "fresh", "frozen", "canned", "dried" are NOT noise — they carry meaning
    clean_tokens = tokens_all - noise

    for token in clean_tokens:
        if token in FOOD_CATEGORY_MAPPING:
            category = FOOD_CATEGORY_MAPPING[token]
            # Fresh reclassification: "fresh ginger" → PRODUCE, not SPICES
            if "fresh" in tokens_all and category == FoodCategory.SPICES:
                return FoodCategory.PRODUCE_LEAFY
            return category

    return FoodCategory.OTHER


def get_default_expiration(
    name: str,
    location: str = "fridge",
    purchase_date: Optional[date] = None,
) -> Tuple[date, FoodCategory, int]:
    """
    Get the default expiration date for a food item.

    Args:
        name: Name of the food item
        location: Storage location (pantry, fridge, freezer)
        purchase_date: Date of purchase (defaults to today)

    Returns:
        Tuple of (expiration_date, detected_category, shelf_life_days)
    """
    if purchase_date is None:
        purchase_date = date.today()

    # Detect category
    category = detect_food_category(name)

    # Get shelf life for this category and location
    defaults = EXPIRATION_DEFAULTS.get(category, {})
    location_lower = location.lower()

    # Try exact location, then fallback
    if location_lower in defaults:
        days = defaults[location_lower]
    elif "fridge" in defaults:
        days = defaults["fridge"]
    elif "pantry" in defaults:
        days = defaults["pantry"]
    else:
        days = 7  # Ultimate fallback

    expiration_date = purchase_date + timedelta(days=days)

    return expiration_date, category, days


def get_leftover_expiration(
    meal_name: Optional[str] = None,
    cooked_date: Optional[date] = None,
) -> Tuple[date, int]:
    """
    Get expiration date for leftovers.

    Standard food safety: 3-4 days in fridge.

    Args:
        meal_name: Optional name of the original meal
        cooked_date: Date the food was cooked (defaults to today)

    Returns:
        Tuple of (expiration_date, shelf_life_days)
    """
    if cooked_date is None:
        cooked_date = date.today()

    # Standard leftover shelf life: 4 days
    # (USDA recommends eating within 3-4 days)
    days = 4

    expiration_date = cooked_date + timedelta(days=days)

    return expiration_date, days


class ExpirationLearner:
    """
    Learns and adjusts expiration defaults from user feedback.

    Uses Conservative Gating (3+ confirmations) before adjusting.
    Tracks both early spoilage and extended freshness feedback.
    """

    # Minimum feedback count before adjusting defaults
    MIN_FEEDBACK_COUNT = 3

    def __init__(self):
        # In-memory storage for feedback
        # In production, this would be persisted to database
        self.feedback_counts: Dict[str, Dict[str, int]] = {}
        self.feedback_days: Dict[str, Dict[str, list]] = {}

    def record_feedback(
        self,
        item_name: str,
        category: FoodCategory,
        actual_days: int,
        expected_days: int,
        feedback_type: str,  # "spoiled_early" or "lasted_longer"
    ) -> bool:
        """
        Record user feedback about item freshness.

        Args:
            item_name: Name of the food item
            category: Food category
            actual_days: Actual days the item lasted
            expected_days: Expected days (from defaults)
            feedback_type: Type of feedback

        Returns:
            True if feedback triggered a default adjustment
        """
        key = f"{category.value}:{item_name.lower()}"

        if key not in self.feedback_counts:
            self.feedback_counts[key] = {"spoiled_early": 0, "lasted_longer": 0}
            self.feedback_days[key] = {"spoiled_early": [], "lasted_longer": []}

        self.feedback_counts[key][feedback_type] += 1
        self.feedback_days[key][feedback_type].append(actual_days)

        # Check if we have enough feedback to adjust
        count = self.feedback_counts[key][feedback_type]
        if count >= self.MIN_FEEDBACK_COUNT:
            return True  # Signal that adjustment is warranted

        return False

    def get_adjusted_days(
        self,
        item_name: str,
        category: FoodCategory,
        default_days: int,
    ) -> int:
        """
        Get adjusted shelf life days based on feedback.

        Args:
            item_name: Name of the food item
            category: Food category
            default_days: Default shelf life in days

        Returns:
            Adjusted shelf life in days
        """
        key = f"{category.value}:{item_name.lower()}"

        if key not in self.feedback_days:
            return default_days

        # Check for early spoilage adjustments
        early_count = self.feedback_counts[key].get("spoiled_early", 0)
        if early_count >= self.MIN_FEEDBACK_COUNT:
            early_days = self.feedback_days[key]["spoiled_early"]
            # Use median of reported spoilage days, minus 1 for safety margin
            median_days = sorted(early_days)[len(early_days) // 2]
            return max(1, median_days - 1)

        # Check for extended freshness adjustments
        longer_count = self.feedback_counts[key].get("lasted_longer", 0)
        if longer_count >= self.MIN_FEEDBACK_COUNT:
            longer_days = self.feedback_days[key]["lasted_longer"]
            # Use median of reported extended days
            median_days = sorted(longer_days)[len(longer_days) // 2]
            # Cap at 1.5x default to avoid unsafe suggestions
            return min(int(default_days * 1.5), median_days)

        return default_days


# Global learner instance (would be per-user in production)
expiration_learner = ExpirationLearner()

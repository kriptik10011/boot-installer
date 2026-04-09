"""
Archetype week definitions for multi-recipe scale tests.

Each archetype represents a real-world meal planning pattern designed to
exercise specific code paths. Fixtures use simple decimal quantities
(no fractions) so the oracle can validate exact amounts.

All recipes use consistent units per ingredient within each archetype
to avoid the known V1 mixed-unit consolidation limitation.
"""

from datetime import date, timedelta


WEEK_START = date(2025, 1, 6)  # Monday


def _recipe(name, ingredients, servings=4, prep=15, cook=30, url=None):
    """Helper to build recipe fixture dicts."""
    return {
        "name": name,
        "instructions": f"Cook {name} according to recipe.",
        "ingredients": ingredients,
        "servings": servings,
        "prep_time_minutes": prep,
        "cook_time_minutes": cook,
        "source_url": url or f"https://example.com/{name.lower().replace(' ', '-')}",
    }


def _ing(name, quantity=None, unit=None, notes=None):
    """Helper to build ingredient dicts."""
    return {"name": name, "quantity": quantity, "unit": unit, "notes": notes}


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype A: Busy Family
# 5 recipes, 12 meals, heavy shared staples
# ═══════════════════════════════════════════════════════════════════════════════

BUSY_FAMILY_RECIPES = [
    # Recipe 0: Garlic Chicken Tacos
    _recipe("Garlic Chicken Tacos", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "4", "clove"),
        _ing("chicken breast", "1.5", "pound"),
        _ing("onion", "1"),
        _ing("salt", None, None, "to taste"),
        _ing("taco seasoning", "2", "tablespoon"),
        _ing("tortilla", "8"),
    ], servings=4),

    # Recipe 1: Garlic Pasta
    _recipe("Garlic Pasta", [
        _ing("olive oil", "3", "tablespoon"),
        _ing("garlic", "4", "clove"),
        _ing("salt", None, None, "to taste"),
        _ing("pasta", "1", "pound"),
        _ing("parmesan cheese", "0.5", "cup"),
    ], servings=4),

    # Recipe 2: Chicken Stir Fry
    _recipe("Chicken Stir Fry", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "3", "clove"),
        _ing("chicken breast", "1.5", "pound"),
        _ing("onion", "1"),
        _ing("soy sauce", "3", "tablespoon"),
        _ing("rice", "2", "cup"),
    ], servings=4),

    # Recipe 3: Rice and Beans
    _recipe("Rice and Beans", [
        _ing("olive oil", "1", "tablespoon"),
        _ing("onion", "1"),
        _ing("garlic", "2", "clove"),
        _ing("salt", None, None, "to taste"),
        _ing("rice", "1.5", "cup"),
        _ing("black beans", "2", "cup"),
        _ing("cumin", "1", "teaspoon"),
    ], servings=4),

    # Recipe 4: Lemon Salad
    _recipe("Lemon Salad", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("salt", None, None, "to taste"),
        _ing("lemon juice", "2", "tablespoon"),
        _ing("lettuce", "1", "head"),
        _ing("tomato", "2"),
        _ing("onion", "0.5"),
    ], servings=2),
]

# Meal plan: (recipe_index, day_offset, meal_type, planned_servings)
BUSY_FAMILY_MEALS = [
    (0, 0, "dinner", 4),   # Mon dinner: Tacos (1x)
    (1, 0, "lunch", 2),    # Mon lunch: Pasta (0.5x)
    (0, 1, "dinner", 4),   # Tue dinner: Tacos again (1x)
    (2, 2, "dinner", 6),   # Wed dinner: Stir Fry (1.5x)
    (3, 2, "lunch", 2),    # Wed lunch: Rice & Beans (0.5x)
    (1, 3, "dinner", 4),   # Thu dinner: Pasta (1x)
    (3, 3, "lunch", 4),    # Thu lunch: Rice & Beans (1x)
    (4, 4, "dinner", 2),   # Fri dinner: Salad (1x)
    (2, 5, "dinner", 4),   # Sat dinner: Stir Fry (1x)
    (0, 5, "lunch", 6),    # Sat lunch: Tacos (1.5x)
    (3, 6, "dinner", 4),   # Sun dinner: Rice & Beans (1x)
    (4, 6, "lunch", 2),    # Sun lunch: Salad (1x)
]

# Oracle: total_scale_factor per recipe (grouped by recipe_id)
# Recipe 0 (Tacos, base 4): meals at 4,4,6 → sf = 1.0+1.0+1.5 = 3.5
# Recipe 1 (Pasta, base 4): meals at 2,4 → sf = 0.5+1.0 = 1.5
# Recipe 2 (Stir Fry, base 4): meals at 6,4 → sf = 1.5+1.0 = 2.5
# Recipe 3 (R&B, base 4): meals at 2,4,4 → sf = 0.5+1.0+1.0 = 2.5
# Recipe 4 (Salad, base 2): meals at 2,2 → sf = 1.0+1.0 = 2.0

# Expected shopping list (canonical_name → amount):
# olive oil: R0(2*3.5) + R1(3*1.5) + R2(2*2.5) + R3(1*2.5) + R4(2*2.0) = 7+4.5+5+2.5+4 = 23 tbsp
# garlic: R0(4*3.5) + R1(4*1.5) + R2(3*2.5) + R3(2*2.5) = 14+6+7.5+5 = 32.5 clove
# chicken breast: R0(1.5*3.5) + R2(1.5*2.5) = 5.25+3.75 = 9 pound
# onion: R0(1*3.5) + R2(1*2.5) + R3(1*2.5) + R4(0.5*2.0) = 3.5+2.5+2.5+1.0 = 9.5
# salt: to taste (amount=None, still in list)
# taco seasoning: R0(2*3.5) = 7 tbsp
# tortilla: R0(8*3.5) = 28
# pasta: R1(1*1.5) = 1.5 pound
# parmesan cheese: R1(0.5*1.5) = 0.75 cup
# soy sauce: R2(3*2.5) = 7.5 tbsp
# rice: R2(2*2.5) + R3(1.5*2.5) = 5+3.75 = 8.75 cup
# black beans: R3(2*2.5) = 5 cup
# cumin: R3(1*2.5) = 2.5 tsp
# lemon juice: R4(2*2.0) = 4 tbsp
# lettuce: R4(1*2.0) = 2 head
# tomato: R4(2*2.0) = 4

BUSY_FAMILY_EXPECTED_SHOPPING = {
    "olive oil": (23.0, "tablespoon"),
    "garlic": (32.5, "clove"),
    "chicken breast": (9.0, "pound"),
    "onion": (9.5, ""),
    "taco seasoning": (7.0, "tablespoon"),
    "tortilla": (28.0, ""),
    "pasta": (1.5, "pound"),
    "parmesan cheese": (0.75, "cup"),
    "soy sauce": (7.5, "tablespoon"),
    "rice": (8.75, "cup"),
    "black beans": (5.0, "cup"),
    "cumin": (2.5, "teaspoon"),
    "lemon juice": (4.0, "tablespoon"),
    "lettuce": (2.0, "head"),
    "tomato": (4.0, ""),
}
# Note: "salt" excluded from expected_shopping — it has no quantity ("to taste")
# but production DOES include it. We track it separately.
BUSY_FAMILY_SALT_IN_LIST = True  # salt (to taste) should appear once


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype B: Meal Prepper
# 1 recipe planned 3 times at different servings
# ═══════════════════════════════════════════════════════════════════════════════

MEAL_PREPPER_RECIPE = _recipe("Chicken Rice Bowl", [
    _ing("chicken breast", "2", "pound"),
    _ing("rice", "3", "cup"),
    _ing("olive oil", "2", "tablespoon"),
    _ing("garlic", "4", "clove"),
    _ing("soy sauce", "3", "tablespoon"),
    _ing("broccoli", "2", "cup"),
    _ing("sesame oil", "1", "tablespoon"),
    _ing("salt", None, None, "to taste"),
], servings=4)

# Plan: Sun=8 (2x), Wed=4 (1x), Fri=2 (0.5x)
# total_scale_factor = 2.0 + 1.0 + 0.5 = 3.5
MEAL_PREPPER_MEALS = [
    (0, 6, "dinner", 8),   # Sun: batch cook (2x)
    (0, 2, "dinner", 4),   # Wed: standard (1x)
    (0, 4, "dinner", 2),   # Fri: half batch (0.5x)
]

MEAL_PREPPER_TOTAL_SCALE = 3.5

# Expected: each ingredient * 3.5
MEAL_PREPPER_EXPECTED_SHOPPING = {
    "chicken breast": (7.0, "pound"),     # 2 * 3.5
    "rice": (10.5, "cup"),                # 3 * 3.5
    "olive oil": (7.0, "tablespoon"),     # 2 * 3.5
    "garlic": (14.0, "clove"),            # 4 * 3.5
    "soy sauce": (10.5, "tablespoon"),    # 3 * 3.5
    "broccoli": (7.0, "cup"),             # 2 * 3.5
    "sesame oil": (3.5, "tablespoon"),    # 1 * 3.5
}
# salt (to taste) has no amount


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype C: Adventurous Cook
# 7 different cuisines, minimal overlap, diverse units
# ═══════════════════════════════════════════════════════════════════════════════

ADVENTUROUS_COOK_RECIPES = [
    # Thai
    _recipe("Thai Basil Stir Fry", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "3", "clove"),
        _ing("thai basil", "1", "cup"),
        _ing("fish sauce", "2", "tablespoon"),
        _ing("chicken thigh", "1", "pound"),
    ], servings=2),

    # Mexican
    _recipe("Enchiladas", [
        _ing("olive oil", "1", "tablespoon"),
        _ing("onion", "1"),
        _ing("enchilada sauce", "2", "cup"),
        _ing("corn tortilla", "12"),
        _ing("cheddar cheese", "2", "cup"),
    ], servings=4),

    # Indian
    _recipe("Dal Tadka", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "4", "clove"),
        _ing("onion", "1"),
        _ing("red lentils", "1.5", "cup"),
        _ing("turmeric", "1", "teaspoon"),
        _ing("cumin", "1", "teaspoon"),
    ], servings=4),

    # Japanese
    _recipe("Miso Soup", [
        _ing("miso paste", "3", "tablespoon"),
        _ing("tofu", "0.5", "pound"),
        _ing("green onion", "3"),
        _ing("seaweed", "2", "tablespoon"),
    ], servings=2),

    # Italian
    _recipe("Bruschetta", [
        _ing("olive oil", "3", "tablespoon"),
        _ing("garlic", "2", "clove"),
        _ing("tomato", "4"),
        _ing("baguette", "1"),
        _ing("basil", "0.25", "cup"),
    ], servings=4),

    # Korean
    _recipe("Kimchi Fried Rice", [
        _ing("sesame oil", "2", "tablespoon"),
        _ing("garlic", "2", "clove"),
        _ing("rice", "3", "cup"),
        _ing("kimchi", "1", "cup"),
        _ing("egg", "2"),
    ], servings=2),

    # Mediterranean
    _recipe("Falafel Bowl", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "3", "clove"),
        _ing("chickpeas", "2", "cup"),
        _ing("tahini", "3", "tablespoon"),
        _ing("lemon juice", "2", "tablespoon"),
    ], servings=4),
]

# Each planned once, Mon-Sun dinner, at base servings
ADVENTUROUS_COOK_MEALS = [
    (i, i, "dinner", ADVENTUROUS_COOK_RECIPES[i]["servings"])
    for i in range(7)
]

# Shared ingredients:
# olive oil: R0(2)+R1(1)+R2(2)+R4(3)+R6(2) = 10 tbsp (5 recipes)
# garlic: R0(3)+R2(4)+R4(2)+R5(2)+R6(3) = 14 clove (5 recipes)
# onion: R1(1)+R2(1) = 2 (2 recipes)
# Everything else is unique per recipe
ADVENTUROUS_COOK_EXPECTED_ITEM_COUNT = 24  # 24 unique canonical names


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype D: Pantry Depleter
# 7 recipes all using olive oil (PERCENTAGE mode), many using flour/butter (COUNT)
# Designed so resources are nearly exhausted by final cook
# ═══════════════════════════════════════════════════════════════════════════════

PANTRY_DEPLETER_RECIPES = [
    _recipe("Garlic Bread", [
        _ing("olive oil", "3", "tablespoon"),
        _ing("butter", "2", "tablespoon"),
        _ing("garlic", "4", "clove"),
        _ing("flour", "0.5", "cup"),
        _ing("bread", "1", "loaf"),
    ], servings=4),

    _recipe("Pancakes", [
        _ing("olive oil", "1", "tablespoon"),
        _ing("butter", "2", "tablespoon"),
        _ing("flour", "1.5", "cup"),
        _ing("egg", "2"),
        _ing("milk", "1", "cup"),
    ], servings=4),

    _recipe("Pasta Aglio e Olio", [
        _ing("olive oil", "4", "tablespoon"),
        _ing("garlic", "6", "clove"),
        _ing("pasta", "1", "pound"),
        _ing("red pepper flakes", "1", "teaspoon"),
    ], servings=4),

    _recipe("Butter Cookies", [
        _ing("butter", "4", "tablespoon"),
        _ing("flour", "2", "cup"),
        _ing("sugar", "0.5", "cup"),
        _ing("egg", "1"),
        _ing("vanilla extract", "1", "teaspoon"),
    ], servings=4),

    _recipe("Fried Rice", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "3", "clove"),
        _ing("rice", "3", "cup"),
        _ing("egg", "2"),
        _ing("soy sauce", "2", "tablespoon"),
    ], servings=4),

    _recipe("Roux Gravy", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("butter", "3", "tablespoon"),
        _ing("flour", "3", "cup"),
        _ing("chicken broth", "2", "cup"),
    ], servings=4),

    _recipe("Olive Oil Cake", [
        _ing("olive oil", "6", "tablespoon"),
        _ing("flour", "2", "cup"),
        _ing("sugar", "1", "cup"),
        _ing("egg", "3"),
        _ing("lemon juice", "2", "tablespoon"),
    ], servings=4),
]

# All 7 planned at base servings (1x), Mon-Sun
PANTRY_DEPLETER_MEALS = [
    (i, i, "dinner", 4) for i in range(7)
]

# olive oil: R0 ✓, R1 ✓, R2 ✓, R3 ✗ (no oil), R4 ✓, R5 ✓, R6 ✓ = 6 uses
# Each use → 10% of CURRENT quantity (geometric decay, not flat 10)
# Sequence: 100→90→81→72.9→72.9(skip)→65.6→59.0→53.1
PANTRY_DEPLETER_OIL_SEQUENCE = [90, 81, 73, 73, 66, 59, 53]

# butter: R0(2)+R1(2)+R3(4)+R5(3) = 11 tbsp total in shopping list
# Depletion: R0=-2, R1=-2, R3=-4, R5=-3 → 11-2-2-4-3 = 0
# But: R2,R4,R6 don't use butter (no depletion those meals)
# Sequence: 11, 9, 7, 7, 3, 3, 0, 0 (R0-2, R1-2, R2=0, R3-4, R4=0, R5-3, R6=0)
PANTRY_DEPLETER_BUTTER_SEQUENCE = [9, 7, 7, 3, 3, 0, 0]

# flour: R0(0.5)+R1(1.5)+R3(2)+R5(3)+R6(2) = 9 cup total
# R0=-0.5, R1=-1.5, R2=0, R3=-2, R4=0, R5=-3, R6=-2 → 9-0.5-1.5-0-2-0-3-2 = 0
PANTRY_DEPLETER_FLOUR_SEQUENCE = [8.5, 7.0, 7.0, 5.0, 5.0, 2.0, 0.0]


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype E: Duplicate Planner
# 3 recipes, each planned multiple times at varying servings
# ═══════════════════════════════════════════════════════════════════════════════

DUPLICATE_PLANNER_RECIPES = [
    # Recipe 0: Simple Pasta (base 4)
    _recipe("Simple Pasta", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "3", "clove"),
        _ing("pasta", "1", "pound"),
        _ing("tomato sauce", "2", "cup"),
        _ing("parmesan cheese", "0.5", "cup"),
    ], servings=4),

    # Recipe 1: Chicken Salad (base 2)
    _recipe("Chicken Salad", [
        _ing("olive oil", "1", "tablespoon"),
        _ing("chicken breast", "1", "pound"),
        _ing("lettuce", "1", "head"),
        _ing("tomato", "2"),
        _ing("lemon juice", "1", "tablespoon"),
    ], servings=2),

    # Recipe 2: Bean Soup (base 4)
    _recipe("Bean Soup", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "4", "clove"),
        _ing("onion", "1"),
        _ing("black beans", "3", "cup"),
        _ing("chicken broth", "4", "cup"),
        _ing("cumin", "2", "teaspoon"),
    ], servings=4),
]

# Recipe 0: planned 5 times at 2,4,6,4,8 servings
# sf = 0.5+1.0+1.5+1.0+2.0 = 6.0
# Recipe 1: planned 4 times at 2,4,2,6 servings
# sf = 1.0+2.0+1.0+3.0 = 7.0
# Recipe 2: planned 5 times at 4,8,4,2,4 servings
# sf = 1.0+2.0+1.0+0.5+1.0 = 5.5
DUPLICATE_PLANNER_MEALS = [
    # Recipe 0 — 5 entries
    (0, 0, "dinner", 2),   # Mon dinner
    (0, 0, "lunch", 4),    # Mon lunch
    (0, 1, "dinner", 6),   # Tue dinner
    (0, 2, "lunch", 4),    # Wed lunch
    (0, 3, "dinner", 8),   # Thu dinner
    # Recipe 1 — 4 entries
    (1, 1, "lunch", 2),    # Tue lunch
    (1, 2, "dinner", 4),   # Wed dinner
    (1, 4, "dinner", 2),   # Fri dinner
    (1, 5, "dinner", 6),   # Sat dinner
    # Recipe 2 — 5 entries
    (2, 3, "lunch", 4),    # Thu lunch
    (2, 4, "lunch", 8),    # Fri lunch
    (2, 5, "lunch", 4),    # Sat lunch
    (2, 6, "dinner", 2),   # Sun dinner
    (2, 6, "lunch", 4),    # Sun lunch
]

DUPLICATE_PLANNER_SCALE_FACTORS = {
    0: 6.0,   # (0.5+1.0+1.5+1.0+2.0)
    1: 7.0,   # (1.0+2.0+1.0+3.0)
    2: 5.5,   # (1.0+2.0+1.0+0.5+1.0)
}

# Expected shopping list:
# olive oil: R0(2*6.0)+R1(1*7.0)+R2(2*5.5) = 12+7+11 = 30 tbsp
# garlic: R0(3*6.0)+R2(4*5.5) = 18+22 = 40 clove
# pasta: R0(1*6.0) = 6 pound
# tomato sauce: R0(2*6.0) = 12 cup
# parmesan cheese: R0(0.5*6.0) = 3 cup
# chicken breast: R1(1*7.0) = 7 pound
# lettuce: R1(1*7.0) = 7 head
# tomato: R1(2*7.0) = 14
# lemon juice: R1(1*7.0) = 7 tbsp
# onion: R2(1*5.5) = 5.5
# black beans: R2(3*5.5) = 16.5 cup
# chicken broth: R2(4*5.5) = 22 cup
# cumin: R2(2*5.5) = 11 tsp
DUPLICATE_PLANNER_EXPECTED_SHOPPING = {
    "olive oil": (30.0, "tablespoon"),
    "garlic": (40.0, "clove"),
    "pasta": (6.0, "pound"),
    "tomato sauce": (12.0, "cup"),
    "parmesan cheese": (3.0, "cup"),
    "chicken breast": (7.0, "pound"),
    "lettuce": (7.0, "head"),
    "tomato": (14.0, ""),
    "lemon juice": (7.0, "tablespoon"),
    "onion": (5.5, ""),
    "black beans": (16.5, "cup"),
    "chicken broth": (22.0, "cup"),
    "cumin": (11.0, "teaspoon"),
}


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype B: Meal Prepper (helper to build meal entries for oracle)
# ═══════════════════════════════════════════════════════════════════════════════

MEAL_PREPPER_RECIPES = [MEAL_PREPPER_RECIPE]


# ═══════════════════════════════════════════════════════════════════════════════
# Archetype F: Cross-Unit Consolidation
# 3 recipes using same ingredients in different units (tbsp vs cup, tsp vs tbsp)
# Tests that shopping list converts units before summing
# ═══════════════════════════════════════════════════════════════════════════════

CROSS_UNIT_RECIPES = [
    # Recipe 0: Pasta Sauce (olive oil in tbsp, salt in tsp)
    _recipe("Pasta Sauce", [
        _ing("olive oil", "2", "tablespoon"),
        _ing("garlic", "3", "clove"),
        _ing("salt", "1", "teaspoon"),
    ], servings=4),

    # Recipe 1: Salad Dressing (olive oil in cup, salt in tbsp)
    _recipe("Salad Dressing", [
        _ing("olive oil", "0.25", "cup"),       # Cross-unit: cup vs tablespoon
        _ing("salt", "0.5", "tablespoon"),       # Cross-unit: tbsp vs tsp
    ], servings=4),

    # Recipe 2: Roasted Vegetables (olive oil in tbsp, salt in tbsp)
    _recipe("Roasted Vegetables", [
        _ing("olive oil", "3", "tablespoon"),
        _ing("garlic", "4", "clove"),
        _ing("salt", "0.25", "tablespoon"),      # Cross-unit: tbsp vs tsp
    ], servings=4),
]

# All planned at base servings (scale factor = 1.0 each)
CROSS_UNIT_MEALS = [
    (0, 0, "dinner", 4),   # Mon: Pasta Sauce
    (1, 2, "dinner", 4),   # Wed: Salad Dressing
    (2, 4, "dinner", 4),   # Fri: Roasted Vegetables
]

# Expected shopping list WITH cross-unit conversion:
# olive oil: R0=2 tbsp, R1=0.25 cup=4 tbsp (0.25*48/3), R2=3 tbsp → Total: 9 tbsp
# garlic: R0=3, R2=4 → Total: 7 clove
# salt: R0=1 tsp, R1=0.5 tbsp=1.5 tsp (0.5*3/1), R2=0.25 tbsp=0.75 tsp (0.25*3/1) → Total: 3.25 tsp
CROSS_UNIT_EXPECTED_SHOPPING = {
    "olive oil": (9.0, "tablespoon"),
    "garlic": (7.0, "clove"),
    "salt": (3.25, "teaspoon"),
}

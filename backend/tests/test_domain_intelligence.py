"""
Phase 4B-2: Domain Intelligence Tests (TDD - RED phase)

Tests new DomainPatternDetector methods for Meals, Shopping, and Inventory
domain intelligence:
- get_recurring_meal_patterns(): Detect recurring meals by day-of-week
- get_ingredient_variety_for_week(): Detect repeated/narrow ingredient usage
- get_restocking_predictions(): RCF-based restocking predictions
- get_low_stock_in_upcoming_meals(): Cross-reference low stock with meal plan
- get_tracking_mode_suggestions(): Surface LinUCB tracking mode suggestions
"""

import pytest
from datetime import date, timedelta, datetime, timezone

from app.services.pattern_detection.domain_patterns import DomainPatternDetector
from app.models.meal import MealPlanEntry, MealType
from app.models.recipe import Recipe, Ingredient, RecipeIngredient, TrackingMode, IngredientCategory
from app.models.inventory import InventoryItem, StorageLocation, ItemSource


# =============================================================================
# HELPERS
# =============================================================================

def _monday(weeks_ago: int = 0) -> date:
    """Get a Monday N weeks ago from current date."""
    today = date.today()
    # Find most recent Monday
    days_since_monday = today.weekday()  # Monday=0
    this_monday = today - timedelta(days=days_since_monday)
    return this_monday - timedelta(weeks=weeks_ago)


def _create_recipe(db, name: str, ingredients: list[tuple[str, str, str]] | None = None) -> Recipe:
    """
    Create a recipe with optional ingredients.

    ingredients: list of (name, quantity, unit) tuples
    """
    recipe = Recipe(
        name=name,
        instructions=f"Instructions for {name}",
        servings=4,
    )
    db.add(recipe)
    db.flush()

    if ingredients:
        for ing_name, qty, unit in ingredients:
            # Create or find ingredient
            existing = db.query(Ingredient).filter(
                Ingredient.canonical_name == ing_name.lower()
            ).first()
            if not existing:
                existing = Ingredient(
                    name=ing_name,
                    canonical_name=ing_name.lower(),
                    category=IngredientCategory.OTHER,
                )
                db.add(existing)
                db.flush()

            ri = RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_id=existing.id,
                quantity=qty,
                unit=unit,
            )
            db.add(ri)

    db.flush()
    return recipe


def _plan_meal(db, recipe: Recipe, meal_date: date, meal_type: str = "dinner",
               servings: int = 4, cooked: bool = False) -> MealPlanEntry:
    """Plan a meal for a date."""
    entry = MealPlanEntry(
        date=meal_date,
        meal_type=MealType(meal_type),
        recipe_id=recipe.id,
        planned_servings=servings,
    )
    if cooked:
        entry.cooked_at = datetime.now(timezone.utc)
        entry.actual_servings = servings
    db.add(entry)
    db.flush()
    return entry


def _create_inventory_item(db, name: str, quantity: float = 1.0, unit: str = "unit",
                           ingredient: Ingredient | None = None,
                           percent_full: int | None = None,
                           consumption_history: list | None = None,
                           last_restocked_at: datetime | None = None,
                           quantity_unit: str | None = None) -> InventoryItem:
    """Create an inventory item."""
    item = InventoryItem(
        name=name,
        quantity=quantity,
        unit=unit,
        quantity_unit=quantity_unit or unit,
        ingredient_id=ingredient.id if ingredient else None,
        location=StorageLocation.PANTRY,
        source=ItemSource.PURCHASED,
        percent_full=percent_full,
        consumption_history=consumption_history or [],
        last_restocked_at=last_restocked_at,
    )
    db.add(item)
    db.flush()
    return item


# =============================================================================
# MEAL PATTERN DETECTION
# =============================================================================

class TestRecurringMealPatterns:
    """Test get_recurring_meal_patterns() — detect meals repeated on same day-of-week."""

    def test_no_meals_returns_empty(self, test_db):
        """With no meal history, returns empty list."""
        detector = DomainPatternDetector(test_db)
        result = detector.get_recurring_meal_patterns(weeks_back=4)
        assert result == []

    def test_single_week_insufficient_data(self, test_db):
        """A single week of meals is not enough to detect patterns (need 2+)."""
        detector = DomainPatternDetector(test_db)
        recipe = _create_recipe(test_db, "Taco Tuesday")
        monday = _monday(0)
        tuesday = monday + timedelta(days=1)
        _plan_meal(test_db, recipe, tuesday, cooked=True)
        test_db.commit()

        result = detector.get_recurring_meal_patterns(weeks_back=4)
        assert result == []

    def test_detects_recurring_dinner_pattern(self, test_db):
        """Same recipe on same day-of-week for 2+ weeks = pattern."""
        detector = DomainPatternDetector(test_db)
        recipe = _create_recipe(test_db, "Taco Tuesday")

        # Plan tacos every Tuesday for 3 weeks
        for weeks_ago in range(3):
            tuesday = _monday(weeks_ago) + timedelta(days=1)
            _plan_meal(test_db, recipe, tuesday, cooked=True)
        test_db.commit()

        result = detector.get_recurring_meal_patterns(weeks_back=4)
        assert len(result) >= 1
        pattern = result[0]
        assert pattern["recipe_name"] == "Taco Tuesday"
        assert pattern["day_of_week"] == 1  # Tuesday = 1 (Monday=0)
        assert pattern["occurrences"] >= 2
        assert "meal_type" in pattern

    def test_different_days_not_a_pattern(self, test_db):
        """Same recipe on different days each week is not a recurring pattern."""
        detector = DomainPatternDetector(test_db)
        recipe = _create_recipe(test_db, "Random Pasta")

        # Monday week 0, Wednesday week 1, Friday week 2
        _plan_meal(test_db, recipe, _monday(0), cooked=True)
        _plan_meal(test_db, recipe, _monday(1) + timedelta(days=2), cooked=True)
        _plan_meal(test_db, recipe, _monday(2) + timedelta(days=4), cooked=True)
        test_db.commit()

        result = detector.get_recurring_meal_patterns(weeks_back=4)
        # No single day-of-week has 2+ occurrences of this recipe
        matching = [p for p in result if p["recipe_name"] == "Random Pasta"]
        assert len(matching) == 0

    def test_multiple_patterns_detected(self, test_db):
        """Detects multiple recurring patterns simultaneously."""
        detector = DomainPatternDetector(test_db)
        tacos = _create_recipe(test_db, "Tacos")
        pizza = _create_recipe(test_db, "Pizza Night")

        # Tacos every Tuesday, Pizza every Friday for 3 weeks
        for weeks_ago in range(3):
            _plan_meal(test_db, tacos, _monday(weeks_ago) + timedelta(days=1), cooked=True)
            _plan_meal(test_db, pizza, _monday(weeks_ago) + timedelta(days=4), cooked=True)
        test_db.commit()

        result = detector.get_recurring_meal_patterns(weeks_back=4)
        recipe_names = [p["recipe_name"] for p in result]
        assert "Tacos" in recipe_names
        assert "Pizza Night" in recipe_names

    def test_uncooked_meals_excluded(self, test_db):
        """Only cooked meals count for pattern detection (planned but uneaten don't count)."""
        detector = DomainPatternDetector(test_db)
        recipe = _create_recipe(test_db, "Planned But Never Made")

        for weeks_ago in range(3):
            tuesday = _monday(weeks_ago) + timedelta(days=1)
            _plan_meal(test_db, recipe, tuesday, cooked=False)
        test_db.commit()

        result = detector.get_recurring_meal_patterns(weeks_back=4)
        matching = [p for p in result if p["recipe_name"] == "Planned But Never Made"]
        assert len(matching) == 0


# =============================================================================
# INGREDIENT VARIETY
# =============================================================================

class TestIngredientVariety:
    """Test get_ingredient_variety_for_week() — detect ingredient repetition."""

    def test_no_meals_returns_neutral(self, test_db):
        """With no meals planned, returns neutral variety score."""
        detector = DomainPatternDetector(test_db)
        result = detector.get_ingredient_variety_for_week(_monday(0).isoformat())
        assert "variety_score" in result
        assert "repeated_ingredients" in result
        assert result["repeated_ingredients"] == []

    def test_detects_repeated_ingredients(self, test_db):
        """Same ingredient in multiple recipes = flagged as repeated."""
        detector = DomainPatternDetector(test_db)

        recipe_a = _create_recipe(test_db, "Garlic Pasta", [
            ("garlic", "4", "cloves"),
            ("pasta", "1", "pound"),
            ("olive oil", "2", "tablespoons"),
        ])
        recipe_b = _create_recipe(test_db, "Garlic Bread", [
            ("garlic", "3", "cloves"),
            ("bread", "1", "loaf"),
            ("butter", "2", "tablespoons"),
        ])
        recipe_c = _create_recipe(test_db, "Garlic Chicken", [
            ("garlic", "6", "cloves"),
            ("chicken", "2", "pounds"),
            ("olive oil", "1", "tablespoon"),
        ])

        monday = _monday(0)
        _plan_meal(test_db, recipe_a, monday, "dinner")
        _plan_meal(test_db, recipe_b, monday + timedelta(days=1), "dinner")
        _plan_meal(test_db, recipe_c, monday + timedelta(days=2), "dinner")
        test_db.commit()

        result = detector.get_ingredient_variety_for_week(monday.isoformat())
        repeated = result["repeated_ingredients"]
        repeated_names = [r["ingredient_name"] for r in repeated]
        assert "garlic" in repeated_names
        assert "olive oil" in repeated_names

    def test_unique_ingredients_high_variety(self, test_db):
        """All unique ingredients = high variety score."""
        detector = DomainPatternDetector(test_db)

        recipe_a = _create_recipe(test_db, "Pasta", [
            ("pasta", "1", "pound"),
            ("tomato sauce", "1", "cup"),
        ])
        recipe_b = _create_recipe(test_db, "Salad", [
            ("lettuce", "1", "head"),
            ("cucumber", "1", "unit"),
        ])

        monday = _monday(0)
        _plan_meal(test_db, recipe_a, monday, "dinner")
        _plan_meal(test_db, recipe_b, monday + timedelta(days=1), "dinner")
        test_db.commit()

        result = detector.get_ingredient_variety_for_week(monday.isoformat())
        assert result["variety_score"] >= 0.8  # High variety
        assert result["repeated_ingredients"] == []

    def test_repeated_ingredient_includes_count(self, test_db):
        """Repeated ingredients include occurrence count and recipe names."""
        detector = DomainPatternDetector(test_db)

        recipe_a = _create_recipe(test_db, "Dish A", [("salt", "1", "tsp")])
        recipe_b = _create_recipe(test_db, "Dish B", [("salt", "1", "tsp")])

        monday = _monday(0)
        _plan_meal(test_db, recipe_a, monday, "dinner")
        _plan_meal(test_db, recipe_b, monday + timedelta(days=1), "dinner")
        test_db.commit()

        result = detector.get_ingredient_variety_for_week(monday.isoformat())
        salt_matches = [r for r in result["repeated_ingredients"] if r["ingredient_name"] == "salt"]
        if salt_matches:
            assert salt_matches[0]["count"] >= 2
            assert "recipe_names" in salt_matches[0]


# =============================================================================
# RESTOCKING PREDICTIONS
# =============================================================================

class TestRestockingPredictions:
    """Test get_restocking_predictions() — RCF-based inventory predictions."""

    def test_no_inventory_returns_empty(self, test_db):
        """With no inventory items, returns empty list."""
        detector = DomainPatternDetector(test_db)
        result = detector.get_restocking_predictions()
        assert result == []

    def test_low_count_item_flagged(self, test_db):
        """COUNT-mode item with low quantity flagged for restocking."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Eggs", canonical_name="eggs",
            category=IngredientCategory.PROTEIN,
        )
        test_db.add(ingredient)
        test_db.flush()

        _create_inventory_item(test_db, "Eggs", quantity=0.0, unit="unit",
                               ingredient=ingredient)
        test_db.commit()

        result = detector.get_restocking_predictions()
        assert len(result) >= 1
        assert any(r["item_name"] == "Eggs" for r in result)

    def test_low_percentage_item_flagged(self, test_db):
        """PERCENTAGE-mode item with low percent_full flagged for restocking."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Olive Oil", canonical_name="olive oil",
            category=IngredientCategory.LIQUID,
        )
        test_db.add(ingredient)
        test_db.flush()

        _create_inventory_item(test_db, "Olive Oil", quantity=1.0, unit="bottle",
                               ingredient=ingredient, percent_full=10)
        test_db.commit()

        result = detector.get_restocking_predictions()
        assert len(result) >= 1
        oil_pred = next((r for r in result if r["item_name"] == "Olive Oil"), None)
        assert oil_pred is not None
        assert "tracking_mode" in oil_pred

    def test_full_item_not_flagged(self, test_db):
        """Fully stocked item should NOT be flagged."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Rice", canonical_name="rice",
            category=IngredientCategory.SOLID,
        )
        test_db.add(ingredient)
        test_db.flush()

        _create_inventory_item(test_db, "Rice", quantity=5.0, unit="pound",
                               ingredient=ingredient)
        test_db.commit()

        result = detector.get_restocking_predictions()
        rice_pred = [r for r in result if r["item_name"] == "Rice"]
        assert len(rice_pred) == 0

    def test_rcf_history_influences_prediction(self, test_db):
        """Items with consumption history use RCF median for prediction."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Milk", canonical_name="milk",
            category=IngredientCategory.DAIRY,
        )
        test_db.add(ingredient)
        test_db.flush()

        # Milk with consumption history: lasts ~5 days, restocked 4 days ago
        # Use timezone-aware datetime to match needs_restock() comparison
        history = [
            {"days_lasted": 5, "amount_used": 1.0},
            {"days_lasted": 6, "amount_used": 1.0},
            {"days_lasted": 4, "amount_used": 1.0},
        ]
        # needs_restock() uses datetime.now(timezone.utc), so last_restocked_at
        # must also be timezone-aware
        restocked_at = datetime(2025, 1, 1, tzinfo=timezone.utc)  # Very old — triggers restock
        _create_inventory_item(
            test_db, "Milk", quantity=1.0, unit="gallon",
            ingredient=ingredient,
            consumption_history=history,
            last_restocked_at=restocked_at,
        )
        test_db.commit()

        result = detector.get_restocking_predictions()
        # Milk should be flagged: 4 days since restock + 7 days until shopping > 5 day median
        milk_pred = next((r for r in result if r["item_name"] == "Milk"), None)
        assert milk_pred is not None
        assert "predicted_depletion_days" in milk_pred or "needs_restock" in milk_pred


# =============================================================================
# LOW STOCK + UPCOMING MEALS CROSS-REFERENCE
# =============================================================================

class TestLowStockInUpcomingMeals:
    """Test get_low_stock_in_upcoming_meals() — cross-ref low stock with meal plan."""

    def test_no_meals_returns_empty(self, test_db):
        """No upcoming meals = no cross-reference results."""
        detector = DomainPatternDetector(test_db)
        result = detector.get_low_stock_in_upcoming_meals(_monday(0).isoformat())
        assert result == []

    def test_detects_low_stock_for_planned_meal(self, test_db):
        """Planned meal with a low-stock ingredient is flagged."""
        detector = DomainPatternDetector(test_db)

        # Create ingredient + recipe
        chicken = Ingredient(
            name="Chicken", canonical_name="chicken",
            category=IngredientCategory.PROTEIN,
        )
        test_db.add(chicken)
        test_db.flush()

        recipe = _create_recipe(test_db, "Roast Chicken", [
            ("chicken", "2", "pounds"),
        ])

        # Plan meal this week
        monday = _monday(0)
        _plan_meal(test_db, recipe, monday + timedelta(days=3), "dinner")

        # Inventory: low stock chicken
        _create_inventory_item(test_db, "Chicken", quantity=0.0, unit="pound",
                               ingredient=chicken)
        test_db.commit()

        result = detector.get_low_stock_in_upcoming_meals(monday.isoformat())
        assert len(result) >= 1
        alert = result[0]
        assert alert["ingredient_name"] == "Chicken"
        assert alert["recipe_name"] == "Roast Chicken"
        assert "meal_date" in alert

    def test_sufficient_stock_not_flagged(self, test_db):
        """Planned meal with sufficient stock is NOT flagged."""
        detector = DomainPatternDetector(test_db)

        chicken = Ingredient(
            name="Chicken", canonical_name="chicken",
            category=IngredientCategory.PROTEIN,
        )
        test_db.add(chicken)
        test_db.flush()

        recipe = _create_recipe(test_db, "Roast Chicken", [
            ("chicken", "2", "pounds"),
        ])

        monday = _monday(0)
        _plan_meal(test_db, recipe, monday + timedelta(days=3), "dinner")

        # Inventory: plenty of chicken
        _create_inventory_item(test_db, "Chicken", quantity=5.0, unit="pound",
                               ingredient=chicken)
        test_db.commit()

        result = detector.get_low_stock_in_upcoming_meals(monday.isoformat())
        chicken_alerts = [r for r in result if r["ingredient_name"] == "Chicken"]
        assert len(chicken_alerts) == 0

    def test_multiple_meals_share_low_stock(self, test_db):
        """Multiple meals needing the same low-stock ingredient are all flagged."""
        detector = DomainPatternDetector(test_db)

        garlic = Ingredient(
            name="Garlic", canonical_name="garlic",
            category=IngredientCategory.PRODUCE,
        )
        test_db.add(garlic)
        test_db.flush()

        recipe_a = _create_recipe(test_db, "Garlic Pasta", [("garlic", "4", "cloves")])
        recipe_b = _create_recipe(test_db, "Garlic Bread", [("garlic", "3", "cloves")])

        monday = _monday(0)
        _plan_meal(test_db, recipe_a, monday + timedelta(days=1), "dinner")
        _plan_meal(test_db, recipe_b, monday + timedelta(days=3), "dinner")

        # No garlic in inventory at all
        test_db.commit()

        result = detector.get_low_stock_in_upcoming_meals(monday.isoformat())
        garlic_alerts = [r for r in result if r["ingredient_name"] == "Garlic"]
        assert len(garlic_alerts) >= 1

    def test_no_inventory_item_means_missing(self, test_db):
        """Ingredient with no inventory entry at all is flagged as missing."""
        detector = DomainPatternDetector(test_db)

        salt = Ingredient(
            name="Salt", canonical_name="salt",
            category=IngredientCategory.SPICE,
        )
        test_db.add(salt)
        test_db.flush()

        recipe = _create_recipe(test_db, "Salty Dish", [("salt", "1", "tsp")])
        monday = _monday(0)
        _plan_meal(test_db, recipe, monday, "dinner")
        test_db.commit()

        result = detector.get_low_stock_in_upcoming_meals(monday.isoformat())
        salt_alerts = [r for r in result if r["ingredient_name"] == "Salt"]
        assert len(salt_alerts) >= 1


# =============================================================================
# TRACKING MODE SUGGESTIONS (LinUCB)
# =============================================================================

class TestTrackingModeSuggestions:
    """Test get_tracking_mode_suggestions() — surface LinUCB tracking mode suggestions."""

    def test_no_ingredients_returns_empty(self, test_db):
        """No ingredients = no suggestions."""
        detector = DomainPatternDetector(test_db)
        result = detector.get_tracking_mode_suggestions()
        assert result == []

    def test_insufficient_interactions_no_suggestion(self, test_db):
        """Ingredients with < 5 interactions don't get suggestions."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Flour", canonical_name="flour",
            category=IngredientCategory.SOLID,
            count_interactions=2,
            percentage_interactions=1,
        )
        test_db.add(ingredient)
        test_db.commit()

        result = detector.get_tracking_mode_suggestions()
        flour_suggestions = [s for s in result if s["ingredient_name"] == "Flour"]
        assert len(flour_suggestions) == 0

    def test_suggests_mode_when_clear_majority(self, test_db):
        """With 5+ interactions and clear majority, suggests the winning mode."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Olive Oil", canonical_name="olive oil",
            category=IngredientCategory.LIQUID,
            count_interactions=1,
            percentage_interactions=6,
            # preferred_tracking_mode is None — not yet set by user
        )
        test_db.add(ingredient)
        test_db.commit()

        result = detector.get_tracking_mode_suggestions()
        oil_suggestions = [s for s in result if s["ingredient_name"] == "Olive Oil"]
        assert len(oil_suggestions) == 1
        assert oil_suggestions[0]["suggested_mode"] == TrackingMode.PERCENTAGE.value

    def test_no_suggestion_when_preference_already_set(self, test_db):
        """If user already set preferred_tracking_mode, no suggestion needed."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Eggs", canonical_name="eggs",
            category=IngredientCategory.PROTEIN,
            count_interactions=8,
            percentage_interactions=2,
            preferred_tracking_mode=TrackingMode.COUNT,  # Already set!
        )
        test_db.add(ingredient)
        test_db.commit()

        result = detector.get_tracking_mode_suggestions()
        egg_suggestions = [s for s in result if s["ingredient_name"] == "Eggs"]
        assert len(egg_suggestions) == 0

    def test_tied_interactions_no_suggestion(self, test_db):
        """Equal count and percentage interactions = no clear suggestion."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Butter", canonical_name="butter",
            category=IngredientCategory.DAIRY,
            count_interactions=5,
            percentage_interactions=5,
        )
        test_db.add(ingredient)
        test_db.commit()

        result = detector.get_tracking_mode_suggestions()
        butter_suggestions = [s for s in result if s["ingredient_name"] == "Butter"]
        assert len(butter_suggestions) == 0

    def test_suggestion_includes_current_mode(self, test_db):
        """Suggestion includes the current effective mode for comparison."""
        detector = DomainPatternDetector(test_db)
        ingredient = Ingredient(
            name="Sugar", canonical_name="sugar",
            category=IngredientCategory.SOLID,  # Cold start = COUNT
            count_interactions=2,
            percentage_interactions=7,  # Majority = PERCENTAGE
        )
        test_db.add(ingredient)
        test_db.commit()

        result = detector.get_tracking_mode_suggestions()
        sugar_suggestions = [s for s in result if s["ingredient_name"] == "Sugar"]
        assert len(sugar_suggestions) == 1
        suggestion = sugar_suggestions[0]
        assert suggestion["suggested_mode"] == TrackingMode.PERCENTAGE.value
        assert suggestion["current_mode"] == TrackingMode.COUNT.value


# =============================================================================
# INTEGRATION: get_all_domain_patterns includes new methods
# =============================================================================

class TestAllDomainPatternsIncludesNew:
    """Verify get_all_domain_patterns() includes the new intelligence data."""

    def test_all_patterns_includes_new_keys(self, test_db):
        """get_all_domain_patterns returns the new intelligence keys."""
        detector = DomainPatternDetector(test_db)
        monday = _monday(0)
        result = detector.get_all_domain_patterns(monday.isoformat())

        # Original keys
        assert "week_summary" in result
        assert "conflicts" in result
        assert "spending_trend" in result
        assert "meal_gaps" in result

        # New 4B-2 keys
        assert "recurring_meal_patterns" in result
        assert "ingredient_variety" in result
        assert "restocking_predictions" in result
        assert "low_stock_meals" in result
        assert "tracking_suggestions" in result

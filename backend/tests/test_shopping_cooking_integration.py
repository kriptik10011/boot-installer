"""
Integration tests for shopping list + cooking pipeline.

Verifies that cooked/depleted meals are excluded from shopping list generation.
Phase 0B of Backend Architecture Plan v3.
"""

import pytest
from datetime import date, timedelta

from app.models.recipe import Recipe, RecipeIngredient, Ingredient
from app.models.meal import MealPlanEntry


WEEK_START = date(2026, 3, 23)  # A Monday


@pytest.fixture
def recipe_with_ingredients(test_db):
    """Create a recipe with 2 ingredients via DB and return recipe ID."""
    db = test_db

    ing_pasta = Ingredient(name="spaghetti", canonical_name="spaghetti")
    ing_sauce = Ingredient(name="tomato sauce", canonical_name="tomato sauce")
    db.add_all([ing_pasta, ing_sauce])
    db.flush()

    recipe = Recipe(name="Test Pasta", servings=2, instructions="Cook pasta. Add sauce.")
    db.add(recipe)
    db.flush()

    db.add_all([
        RecipeIngredient(recipe_id=recipe.id, ingredient_id=ing_pasta.id, quantity="200", unit="g"),
        RecipeIngredient(recipe_id=recipe.id, ingredient_id=ing_sauce.id, quantity="1", unit="cup"),
    ])
    db.commit()
    return recipe.id


@pytest.fixture
def second_recipe(test_db):
    """Create a second recipe with a different ingredient."""
    db = test_db

    ing_lettuce = Ingredient(name="lettuce", canonical_name="lettuce")
    db.add(ing_lettuce)
    db.flush()

    recipe = Recipe(name="Test Salad", servings=1, instructions="Chop. Toss. Serve.")
    db.add(recipe)
    db.flush()

    db.add(RecipeIngredient(recipe_id=recipe.id, ingredient_id=ing_lettuce.id, quantity="1", unit="head"))
    db.commit()
    return recipe.id


def _create_meal(client, recipe_id, meal_date, meal_type="dinner"):
    """Helper: create a meal plan entry linked to a recipe."""
    resp = client.post("/api/meals", json={
        "date": str(meal_date),
        "meal_type": meal_type,
        "recipe_id": recipe_id,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _generate_shopping(client, week_start=WEEK_START):
    """Helper: generate shopping list and return (items_created, items_list)."""
    gen = client.post(f"/api/shopping-list/generate/{week_start}")
    assert gen.status_code == 201, gen.text
    items_created = gen.json()["items_created"]

    get = client.get(f"/api/shopping-list/week/{week_start}")
    assert get.status_code == 200, get.text
    items = get.json()
    return items_created, items


def _mark_cooked(client, meal_id):
    """Helper: mark a meal as cooking-complete."""
    resp = client.post(f"/api/meals/{meal_id}/cooking-complete", json={
        "actual_servings": 2,
        "actual_prep_minutes": 10,
        "actual_cook_minutes": 15,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestShoppingExcludesCookedMeals:
    """Shopping list must not include ingredients from cooked/depleted meals."""

    def test_uncooked_meal_generates_shopping_items(
        self, client, recipe_with_ingredients
    ):
        """Baseline: uncooked meal's ingredients appear on shopping list."""
        _create_meal(client, recipe_with_ingredients, WEEK_START)
        items_created, items = _generate_shopping(client)

        assert items_created >= 2
        names = {i["name"].lower() for i in items}
        assert "spaghetti" in names
        assert "tomato sauce" in names

    def test_cooked_meal_excluded_from_shopping(
        self, client, recipe_with_ingredients
    ):
        """After cooking, regenerating shopping list excludes that meal."""
        meal_id = _create_meal(client, recipe_with_ingredients, WEEK_START)

        # Generate first -- should have items
        items_created_1, _ = _generate_shopping(client)
        assert items_created_1 >= 2

        # Mark cooked
        _mark_cooked(client, meal_id)

        # Regenerate -- should have 0 recipe items
        _, items = _generate_shopping(client)
        recipe_items = [i for i in items if i.get("source_recipe_id")]
        assert len(recipe_items) == 0

    def test_two_meals_cook_one_only_uncooked_remains(
        self, client, recipe_with_ingredients, second_recipe
    ):
        """Two meals in same week. Cook one. Only uncooked meal's items remain."""
        meal_pasta = _create_meal(
            client, recipe_with_ingredients, WEEK_START, "dinner"
        )
        _create_meal(
            client, second_recipe, WEEK_START + timedelta(days=1), "lunch"
        )

        # Cook pasta
        _mark_cooked(client, meal_pasta)

        # Regenerate
        _, items = _generate_shopping(client)
        names = {i["name"].lower() for i in items if i.get("source_recipe_id")}

        # Salad ingredients should be present, pasta ingredients should not
        assert "lettuce" in names
        assert "spaghetti" not in names
        assert "tomato sauce" not in names

    def test_cooked_meal_different_week_still_generates(
        self, client, recipe_with_ingredients
    ):
        """Cook a meal this week; same recipe next week still generates items."""
        # This week: cook the meal
        meal_this_week = _create_meal(
            client, recipe_with_ingredients, WEEK_START, "dinner"
        )
        _mark_cooked(client, meal_this_week)

        # Next week: same recipe, uncooked
        next_week = WEEK_START + timedelta(days=7)
        _create_meal(client, recipe_with_ingredients, next_week, "lunch")

        # Generate for NEXT week -- should have items
        _, items = _generate_shopping(client, week_start=next_week)
        names = {i["name"].lower() for i in items if i.get("source_recipe_id")}
        assert "spaghetti" in names

    def test_depleted_meal_excluded_from_shopping(
        self, client, test_db, recipe_with_ingredients
    ):
        """Meal with inventory_depleted=True is excluded even if not cooked."""
        meal_id = _create_meal(client, recipe_with_ingredients, WEEK_START)

        # Directly set inventory_depleted (simulates depletion without cooking)
        entry = test_db.get(MealPlanEntry, meal_id)
        entry.inventory_depleted = True
        test_db.commit()

        # Regenerate
        _, items = _generate_shopping(client)
        recipe_items = [i for i in items if i.get("source_recipe_id")]
        assert len(recipe_items) == 0

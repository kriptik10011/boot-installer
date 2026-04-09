"""
Tests for V2 Session 15: Pantry-First Suggestions + Weekly Review Wizard.
"""

from datetime import date, datetime, timedelta, timezone
import pytest

from app.models.recipe import Recipe, RecipeIngredient
from app.models.meal import MealPlanEntry
from app.models.recipe import Ingredient
from app.models.inventory import InventoryItem
from app.models.event import Event
from app.models.financial import FinancialItem
from app.models.transaction import Transaction
from app.models.budget import BudgetCategory
from app.services.pantry_suggestions import suggest_from_pantry
from app.services.weekly_review_service import get_week_review


@pytest.fixture
def pantry_data(test_db):
    """Set up recipes + inventory for pantry suggestion testing."""
    db = test_db

    # Ingredients
    chicken = Ingredient(name="chicken breast", canonical_name="chicken breast")
    rice = Ingredient(name="rice", canonical_name="rice")
    broccoli = Ingredient(name="broccoli", canonical_name="broccoli")
    garlic = Ingredient(name="garlic", canonical_name="garlic")
    soy_sauce = Ingredient(name="soy sauce", canonical_name="soy sauce")
    pasta = Ingredient(name="pasta", canonical_name="pasta")
    tomato = Ingredient(name="tomato sauce", canonical_name="tomato sauce")
    cheese = Ingredient(name="parmesan cheese", canonical_name="parmesan cheese")
    db.add_all([chicken, rice, broccoli, garlic, soy_sauce, pasta, tomato, cheese])
    db.flush()

    # Recipe 1: Chicken Stir Fry (5 ingredients)
    stir_fry = Recipe(name="Chicken Stir Fry", servings=4, instructions="Cook it.")
    db.add(stir_fry)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=chicken.id, quantity="2", unit="lb"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=rice.id, quantity="2", unit="cup"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=broccoli.id, quantity="1", unit="head"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=garlic.id, quantity="3", unit="clove"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=soy_sauce.id, quantity="2", unit="tbsp"),
    ])

    # Recipe 2: Pasta (3 ingredients)
    pasta_recipe = Recipe(name="Simple Pasta", servings=2, instructions="Boil and serve.")
    db.add(pasta_recipe)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=pasta_recipe.id, ingredient_id=pasta.id, quantity="1", unit="lb"),
        RecipeIngredient(recipe_id=pasta_recipe.id, ingredient_id=tomato.id, quantity="1", unit="jar"),
        RecipeIngredient(recipe_id=pasta_recipe.id, ingredient_id=cheese.id, quantity="0.5", unit="cup"),
    ])

    # Inventory: chicken, rice, garlic, pasta in stock
    db.add_all([
        InventoryItem(name="chicken breast", ingredient_id=chicken.id, quantity=2.0, unit="lb"),
        InventoryItem(name="rice", ingredient_id=rice.id, quantity=5.0, unit="cup"),
        InventoryItem(name="garlic", ingredient_id=garlic.id, quantity=6.0, unit="clove"),
        InventoryItem(name="pasta", ingredient_id=pasta.id, quantity=2.0, unit="lb"),
    ])

    db.commit()
    return {
        "stir_fry_id": stir_fry.id,
        "pasta_id": pasta_recipe.id,
    }


class TestPantrySuggestions:
    def test_suggest_returns_ranked_results(self, test_db, pantry_data):
        suggestions = suggest_from_pantry(test_db)
        assert len(suggestions) == 2

        # Stir Fry has 3/5 ingredients (chicken, rice, garlic)
        stir_fry = next(s for s in suggestions if s.recipe_id == pantry_data["stir_fry_id"])
        assert stir_fry.matching_ingredients == 3
        assert stir_fry.missing_ingredients == 2
        assert stir_fry.match_pct == 60.0

        # Pasta has 1/3 ingredients (pasta)
        pasta = next(s for s in suggestions if s.recipe_id == pantry_data["pasta_id"])
        assert pasta.matching_ingredients == 1
        assert pasta.missing_ingredients == 2

    def test_sorted_by_match_pct(self, test_db, pantry_data):
        suggestions = suggest_from_pantry(test_db)
        # Stir fry (60%) should come before pasta (33%)
        assert suggestions[0].recipe_name == "Chicken Stir Fry"
        assert suggestions[1].recipe_name == "Simple Pasta"

    def test_min_match_filter(self, test_db, pantry_data):
        suggestions = suggest_from_pantry(test_db, min_match_pct=50.0)
        assert len(suggestions) == 1
        assert suggestions[0].recipe_name == "Chicken Stir Fry"

    def test_missing_ingredients_listed(self, test_db, pantry_data):
        suggestions = suggest_from_pantry(test_db)
        stir_fry = suggestions[0]
        missing_names = {m.ingredient_name for m in stir_fry.missing}
        assert "broccoli" in missing_names
        assert "soy sauce" in missing_names

    def test_empty_inventory(self, test_db):
        """No inventory items should return empty list."""
        suggestions = suggest_from_pantry(test_db)
        assert len(suggestions) == 0

    def test_api_endpoint(self, client, pantry_data):
        resp = client.get("/api/recipes/suggest/from-pantry")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["recipe_name"] == "Chicken Stir Fry"
        assert data[0]["match_pct"] == 60.0


@pytest.fixture
def review_data(test_db):
    """Set up data for weekly review testing."""
    db = test_db
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    # Recipes and meals
    recipe = Recipe(name="Test Recipe", servings=4, instructions="Test.")
    db.add(recipe)
    db.flush()

    meals = [
        MealPlanEntry(
            recipe_id=recipe.id, date=monday,
            meal_type="dinner", planned_servings=4,
            cooked_at=datetime.now(timezone.utc),
        ),
        MealPlanEntry(
            recipe_id=recipe.id, date=monday + timedelta(days=1),
            meal_type="dinner", planned_servings=4,
        ),
    ]
    db.add_all(meals)

    # Events
    events = [
        Event(name="Meeting", date=monday, start_time="09:00"),
        Event(name="Doctor", date=monday + timedelta(days=2), start_time="14:00"),
    ]
    db.add_all(events)

    db.commit()
    return {"monday": monday.isoformat()}


class TestWeeklyReview:
    def test_review_summary(self, test_db, review_data):
        summary = get_week_review(test_db, review_data["monday"])
        assert summary.meals_planned == 2
        assert summary.meals_cooked == 1
        assert summary.meals_skipped == 1
        assert summary.events_total == 2

    def test_review_api(self, client, review_data):
        resp = client.get(f"/api/summary/review/{review_data['monday']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["meals_planned"] == 2
        assert data["meals_cooked"] == 1
        assert data["events_total"] == 2

    def test_empty_week(self, client):
        resp = client.get("/api/summary/review/2020-01-06")
        assert resp.status_code == 200
        data = resp.json()
        assert data["meals_planned"] == 0
        assert data["events_total"] == 0

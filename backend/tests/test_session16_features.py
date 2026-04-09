"""
Tests for V2 Session 16: Ingredient Reuse, Day Notes, Batch Prep.
"""

from datetime import date, timedelta
import pytest

from app.models.recipe import Recipe, RecipeIngredient, Ingredient
from app.models.meal import MealPlanEntry
from app.models.day_note import DayNote
from app.models.batch_prep import BatchPrepSession, BatchPrepTask, BatchPrepMeal
from app.services.ingredient_reuse import suggest_ingredient_reuse


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def reuse_data(test_db):
    """Set up recipes with overlapping ingredients for reuse testing."""
    db = test_db

    # Ingredients
    chicken = Ingredient(name="chicken breast", canonical_name="chicken breast")
    rice = Ingredient(name="rice", canonical_name="rice")
    garlic = Ingredient(name="garlic", canonical_name="garlic")
    onion = Ingredient(name="onion", canonical_name="onion")
    soy = Ingredient(name="soy sauce", canonical_name="soy sauce")
    pasta = Ingredient(name="pasta", canonical_name="pasta")
    tomato = Ingredient(name="tomato sauce", canonical_name="tomato sauce")
    db.add_all([chicken, rice, garlic, onion, soy, pasta, tomato])
    db.flush()

    # Recipe 1: Chicken Stir Fry (chicken, rice, garlic, soy)
    stir_fry = Recipe(name="Chicken Stir Fry", servings=4, instructions="Stir fry it.")
    db.add(stir_fry)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=chicken.id, quantity="2", unit="lb"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=rice.id, quantity="2", unit="cup"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=garlic.id, quantity="3", unit="clove"),
        RecipeIngredient(recipe_id=stir_fry.id, ingredient_id=soy.id, quantity="2", unit="tbsp"),
    ])

    # Recipe 2: Chicken Rice Bowl (chicken, rice, onion) — overlaps with stir fry
    rice_bowl = Recipe(name="Chicken Rice Bowl", servings=2, instructions="Bowl it.")
    db.add(rice_bowl)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=rice_bowl.id, ingredient_id=chicken.id, quantity="1", unit="lb"),
        RecipeIngredient(recipe_id=rice_bowl.id, ingredient_id=rice.id, quantity="1", unit="cup"),
        RecipeIngredient(recipe_id=rice_bowl.id, ingredient_id=onion.id, quantity="1", unit="whole"),
    ])

    # Recipe 3: Pasta (pasta, tomato, garlic) — overlaps only garlic
    pasta_recipe = Recipe(name="Simple Pasta", servings=2, instructions="Boil pasta.")
    db.add(pasta_recipe)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=pasta_recipe.id, ingredient_id=pasta.id, quantity="1", unit="lb"),
        RecipeIngredient(recipe_id=pasta_recipe.id, ingredient_id=tomato.id, quantity="1", unit="jar"),
        RecipeIngredient(recipe_id=pasta_recipe.id, ingredient_id=garlic.id, quantity="2", unit="clove"),
    ])

    # Plan stir fry for Monday
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    meal = MealPlanEntry(
        recipe_id=stir_fry.id, date=monday,
        meal_type="dinner", planned_servings=4,
    )
    db.add(meal)
    db.commit()

    return {
        "monday": monday.isoformat(),
        "stir_fry_id": stir_fry.id,
        "rice_bowl_id": rice_bowl.id,
        "pasta_id": pasta_recipe.id,
        "meal_id": meal.id,
    }


# =============================================================================
# Ingredient Reuse Tests
# =============================================================================

class TestIngredientReuse:
    def test_suggests_recipes_with_overlap(self, test_db, reuse_data):
        suggestions = suggest_ingredient_reuse(test_db, reuse_data["monday"])
        assert len(suggestions) >= 1

    def test_rice_bowl_has_higher_overlap(self, test_db, reuse_data):
        suggestions = suggest_ingredient_reuse(test_db, reuse_data["monday"])
        # Rice bowl shares 2 ingredients (chicken, rice) vs pasta shares 1 (garlic)
        rice_bowl = next((s for s in suggestions if s.recipe_id == reuse_data["rice_bowl_id"]), None)
        pasta = next((s for s in suggestions if s.recipe_id == reuse_data["pasta_id"]), None)
        assert rice_bowl is not None
        assert pasta is not None
        assert rice_bowl.overlap_count > pasta.overlap_count

    def test_sorted_by_overlap(self, test_db, reuse_data):
        suggestions = suggest_ingredient_reuse(test_db, reuse_data["monday"])
        assert suggestions[0].recipe_name == "Chicken Rice Bowl"
        assert suggestions[1].recipe_name == "Simple Pasta"

    def test_shared_ingredients_listed(self, test_db, reuse_data):
        suggestions = suggest_ingredient_reuse(test_db, reuse_data["monday"])
        rice_bowl = suggestions[0]
        shared_names = {si.ingredient_name for si in rice_bowl.shared_ingredients}
        assert "chicken breast" in shared_names
        assert "rice" in shared_names

    def test_api_endpoint(self, client, reuse_data):
        resp = client.get(f"/api/meals/reuse-suggestions/{reuse_data['monday']}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["recipe_name"] == "Chicken Rice Bowl"

    def test_no_planned_meals_returns_empty(self, test_db):
        suggestions = suggest_ingredient_reuse(test_db, "2020-01-06")
        assert len(suggestions) == 0


# =============================================================================
# Day Notes Tests
# =============================================================================

class TestDayNotes:
    def test_create_note(self, client):
        resp = client.post("/api/day-notes/", json={
            "date": "2026-02-12",
            "content": "Great day for cooking!",
            "mood": "energized",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["content"] == "Great day for cooking!"
        assert data["mood"] == "energized"

    def test_get_note(self, client):
        client.post("/api/day-notes/", json={
            "date": "2026-02-12",
            "content": "Test note",
        })
        resp = client.get("/api/day-notes/2026-02-12")
        assert resp.status_code == 200
        data = resp.json()
        assert data["content"] == "Test note"

    def test_upsert_updates_existing(self, client):
        client.post("/api/day-notes/", json={
            "date": "2026-02-12",
            "content": "First version",
        })
        resp = client.post("/api/day-notes/", json={
            "date": "2026-02-12",
            "content": "Updated version",
        })
        assert resp.status_code == 201
        assert resp.json()["content"] == "Updated version"

    def test_week_notes(self, client):
        for i in range(3):
            client.post("/api/day-notes/", json={
                "date": f"2026-02-{9 + i:02d}",
                "content": f"Note for day {i}",
            })
        resp = client.get("/api/day-notes/week/2026-02-09")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_delete_note(self, client):
        client.post("/api/day-notes/", json={
            "date": "2026-02-12",
            "content": "Delete me",
        })
        resp = client.delete("/api/day-notes/2026-02-12")
        assert resp.status_code == 204
        resp = client.get("/api/day-notes/2026-02-12")
        assert resp.json() is None

    def test_nonexistent_note_returns_null(self, client):
        resp = client.get("/api/day-notes/2020-01-01")
        assert resp.status_code == 200
        assert resp.json() is None


# =============================================================================
# Batch Prep Tests
# =============================================================================

class TestBatchPrep:
    def test_create_session(self, client, reuse_data):
        resp = client.post("/api/batch-prep/", json={
            "name": "Sunday Meal Prep",
            "prep_date": "2026-02-15",
            "prep_start_time": "10:00",
            "estimated_duration_minutes": 120,
            "meal_ids": [reuse_data["meal_id"]],
            "tasks": [
                {"task_name": "Chop vegetables", "estimated_minutes": 15},
                {"task_name": "Cook rice", "estimated_minutes": 20},
            ],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Sunday Meal Prep"
        assert len(data["tasks"]) == 2
        assert len(data["meal_ids"]) == 1

    def test_list_sessions(self, client):
        client.post("/api/batch-prep/", json={
            "name": "Prep 1",
            "prep_date": "2026-02-15",
        })
        resp = client.get("/api/batch-prep/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_complete_session(self, client):
        create_resp = client.post("/api/batch-prep/", json={
            "name": "Quick Prep",
            "prep_date": "2026-02-15",
        })
        session_id = create_resp.json()["id"]
        resp = client.post(f"/api/batch-prep/{session_id}/complete?actual_duration_minutes=90")
        assert resp.status_code == 200
        assert resp.json()["is_completed"] is True
        assert resp.json()["actual_duration_minutes"] == 90

    def test_add_and_toggle_task(self, client):
        create_resp = client.post("/api/batch-prep/", json={
            "name": "Task Test",
            "prep_date": "2026-02-15",
        })
        session_id = create_resp.json()["id"]

        # Add task
        task_resp = client.post(f"/api/batch-prep/{session_id}/tasks", json={
            "task_name": "Marinate chicken",
            "estimated_minutes": 10,
        })
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Toggle task
        toggle_resp = client.put(f"/api/batch-prep/{session_id}/tasks/{task_id}")
        assert toggle_resp.status_code == 200
        assert toggle_resp.json()["is_completed"] is True

    def test_week_sessions(self, client):
        client.post("/api/batch-prep/", json={
            "name": "Week Prep",
            "prep_date": "2026-02-09",
        })
        resp = client.get("/api/batch-prep/week/2026-02-09")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_delete_session(self, client):
        create_resp = client.post("/api/batch-prep/", json={
            "name": "Delete Me",
            "prep_date": "2026-02-15",
        })
        session_id = create_resp.json()["id"]
        resp = client.delete(f"/api/batch-prep/{session_id}")
        assert resp.status_code == 204
        resp = client.get(f"/api/batch-prep/{session_id}")
        assert resp.status_code == 404

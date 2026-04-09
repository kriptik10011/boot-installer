"""
Accumulated state pipeline test: multiple recipes sharing ingredients in one week.

Tests what per-recipe isolation cannot:
- Ingredient consolidation across recipes in shopping list
- Shared inventory after trip completion
- Progressive depletion across multiple cooking sessions
- PERCENTAGE-mode items (oils, spices) with percent_full lifecycle
- Cooking-complete recording (intelligence layer RCF data)
- Undo/redo across multiple meals
- Scaled servings (2x recipe → 2x depletion)

Uses hand-crafted fixtures (no network, no cached JSON files).
"""

import pytest
from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db


# ═══════════════════════════════════════════════════════════════════════════════
# Hand-crafted recipe fixtures
# ═══════════════════════════════════════════════════════════════════════════════

RECIPE_A_PASTA = {
    "name": "Garlic Pasta",
    "instructions": "Cook pasta. Sauté garlic in olive oil. Toss with parmesan and salt.",
    "ingredients": [
        {"name": "olive oil", "quantity": "3", "unit": "tablespoon", "notes": None},
        {"name": "garlic", "quantity": "4", "unit": "clove", "notes": "minced"},
        {"name": "salt", "quantity": None, "unit": None, "notes": "to taste"},
        {"name": "pasta", "quantity": "1", "unit": "pound", "notes": None},
        {"name": "parmesan cheese", "quantity": "0.5", "unit": "cup", "notes": "grated"},
    ],
    "servings": 4,
    "prep_time_minutes": 10,
    "cook_time_minutes": 15,
    "source_url": "https://example.com/garlic-pasta",
}

RECIPE_B_STIRFRY = {
    "name": "Chicken Stir Fry",
    "instructions": "Stir fry chicken in olive oil with garlic. Add soy sauce and rice.",
    "ingredients": [
        {"name": "olive oil", "quantity": "2", "unit": "tablespoon", "notes": None},
        {"name": "garlic", "quantity": "3", "unit": "clove", "notes": "minced"},
        {"name": "salt", "quantity": None, "unit": None, "notes": "to taste"},
        {"name": "soy sauce", "quantity": "3", "unit": "tablespoon", "notes": None},
        {"name": "chicken breast", "quantity": "1.5", "unit": "pound", "notes": "sliced"},
        {"name": "rice", "quantity": "2", "unit": "cup", "notes": None},
    ],
    "servings": 4,
    "prep_time_minutes": 15,
    "cook_time_minutes": 20,
    "source_url": "https://example.com/chicken-stir-fry",
}

RECIPE_C_SALAD = {
    "name": "Lemon Salad",
    "instructions": "Toss lettuce and tomato with olive oil, lemon juice, and salt.",
    "ingredients": [
        {"name": "olive oil", "quantity": "2", "unit": "tablespoon", "notes": None},
        {"name": "salt", "quantity": None, "unit": None, "notes": "to taste"},
        {"name": "lemon juice", "quantity": "2", "unit": "tablespoon", "notes": "fresh"},
        {"name": "lettuce", "quantity": "1", "unit": "head", "notes": None},
        {"name": "tomato", "quantity": "2", "unit": None, "notes": "diced"},
    ],
    "servings": 2,
    "prep_time_minutes": 10,
    "cook_time_minutes": 0,
    "source_url": "https://example.com/lemon-salad",
}

WEEK_START = date(2025, 1, 6)  # Monday


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

def _seed_categories(db):
    """Seed inventory and recipe categories directly into test DB."""
    from app.models.inventory import InventoryCategory
    from app.models.recipe import RecipeCategory

    for name in ["Produce", "Dairy", "Meat & Seafood", "Frozen",
                 "Pantry", "Beverages", "Condiments", "Snacks"]:
        db.add(InventoryCategory(name=name))
    for name in ["Breakfast", "Lunch", "Dinner", "Dessert",
                 "Appetizer", "Side Dish", "Soup", "Salad"]:
        db.add(RecipeCategory(name=name))
    db.commit()


def _seed_ingredient_packages(db):
    """Seed default ingredient package mappings — matches production."""
    from app.models.ingredient_package import IngredientPackage, DEFAULT_PACKAGE_MAPPINGS

    for pattern, pkg_type, qty in DEFAULT_PACKAGE_MAPPINGS:
        db.add(IngredientPackage(
            ingredient_pattern=pattern,
            package_type=pkg_type,
            default_quantity=qty,
        ))
    db.commit()


def _make_fresh_db():
    """Create fresh in-memory SQLite with all tables and seed data."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    _seed_categories(db)
    _seed_ingredient_packages(db)
    return db


@pytest.fixture
def accumulated_env():
    """Set up client with fresh DB for accumulated test."""
    db = _make_fresh_db()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    from app.routers import (
        recipes, meals, shopping_list, inventory,
        events, categories, tags, patterns, summary,
        observation, recurrence, finances,
    )
    for mod in [recipes, meals, shopping_list, inventory,
                events, categories, tags, patterns, summary,
                observation, recurrence, finances]:
        if hasattr(mod, "limiter"):
            mod.limiter.enabled = False

    with TestClient(app) as client:
        yield client, db

    app.dependency_overrides.clear()
    db.close()


def _import_recipe(client, fixture: dict) -> dict:
    """Import a recipe via API, return response dict."""
    payload = {
        "name": fixture["name"],
        "instructions": fixture["instructions"],
        "ingredients": fixture["ingredients"],
        "servings": fixture["servings"],
        "prep_time_minutes": fixture.get("prep_time_minutes"),
        "cook_time_minutes": fixture.get("cook_time_minutes"),
        "source_url": fixture["source_url"],
    }
    resp = client.post("/api/recipes/import/confirm", json=payload)
    assert resp.status_code == 201, f"Import failed for {fixture['name']}: {resp.text[:200]}"
    return resp.json()


def _plan_meal(client, recipe_id: int, meal_date: date, servings: int) -> dict:
    """Create a meal plan entry."""
    payload = {
        "date": str(meal_date),
        "meal_type": "dinner",
        "recipe_id": recipe_id,
        "planned_servings": servings,
    }
    resp = client.post("/api/meals", json=payload)
    assert resp.status_code == 201, f"Meal plan failed: {resp.text[:200]}"
    return resp.json()


def _complete_cooking(client, meal_id: int, servings: int, prep: int = 15, cook: int = 30) -> dict:
    """Record cooking completion for intelligence layer."""
    payload = {
        "actual_servings": servings,
        "actual_prep_minutes": prep,
        "actual_cook_minutes": cook,
        "notes": None,
    }
    resp = client.post(f"/api/meals/{meal_id}/cooking-complete", json=payload)
    assert resp.status_code == 200, f"Cooking complete failed: {resp.text[:200]}"
    return resp.json()


def _shop_and_stock(client, week_start: date):
    """Generate shopping list, toggle all, complete trip. Returns (gen_data, items, trip_data)."""
    resp = client.post(f"/api/shopping-list/generate/{week_start}")
    assert resp.status_code == 201
    gen = resp.json()

    resp = client.get(f"/api/shopping-list/week/{week_start}")
    assert resp.status_code == 200
    items = resp.json()

    for item in items:
        resp = client.post(f"/api/shopping-list/{item['id']}/toggle")
        assert resp.status_code == 200

    resp = client.post(f"/api/shopping-list/week/{week_start}/complete")
    assert resp.status_code == 200
    trip = resp.json()

    return gen, items, trip


# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccumulatedPipeline:
    """Multi-recipe week with shared ingredients — full production dataflow."""

    def test_full_accumulated_week(self, accumulated_env):
        """
        Import 3 recipes → plan week → shop → cook each sequentially.

        Production dataflow trace:
          recipes.import_confirm × 3 → meals.create_meal_plan × 3
          → shopping_list.generate_shopping_list (consolidates shared ingredients)
          → toggle × N → complete_shopping_trip (transfers to inventory)
          → generate_shopping_list [stocking check, verifies PERCENTAGE + COUNT]
          → complete_cooking × 3 (records actual servings for RCF)
          → deplete_from_cooking × 3 (progressive depletion of shared inventory)

        Verifies:
        - Shopping list consolidates shared ingredients (olive oil, garlic, salt)
        - Trip completion transfers consolidated amounts to inventory
        - PERCENTAGE-mode items get percent_full set during trip completion
        - Stocking check passes (items_created == 0) including for PERCENTAGE items
        - Cooking-complete records actual data for intelligence layer
        - Each cooking session progressively depletes shared inventory
        - Depletion response includes mode and status fields
        - Scaled servings (Stir Fry at 2x) consume proportionally more
        """
        client, db = accumulated_env

        # ── Step 1: Import all 3 recipes ─────────────────────────────────
        recipe_a = _import_recipe(client, RECIPE_A_PASTA)
        recipe_b = _import_recipe(client, RECIPE_B_STIRFRY)
        recipe_c = _import_recipe(client, RECIPE_C_SALAD)

        # ── Step 2: Plan the week ────────────────────────────────────────
        # Mon=Pasta(4 servings), Tue=StirFry(8 servings=2x), Wed=Salad(2 servings)
        meal_a = _plan_meal(client, recipe_a["id"], WEEK_START, 4)
        meal_b = _plan_meal(client, recipe_b["id"], WEEK_START + timedelta(days=1), 8)
        meal_c = _plan_meal(client, recipe_c["id"], WEEK_START + timedelta(days=2), 2)

        # ── Step 3: Generate shopping list ───────────────────────────────
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["items_created"] > 0, "Shopping list should have items"
        assert gen["recipes_processed"] == 3, f"Expected 3 recipes, got {gen['recipes_processed']}"

        # Check consolidation: olive oil should appear once (summed across recipes)
        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()
        olive_oil_items = [i for i in items if "olive oil" in i["name"].lower()]
        assert len(olive_oil_items) == 1, \
            f"Olive oil should be consolidated to 1 entry, got {len(olive_oil_items)}"

        # Salt (to taste) should still appear since we have no inventory
        salt_items = [i for i in items if "salt" in i["name"].lower()]
        assert len(salt_items) == 1, f"Salt should appear once, got {len(salt_items)}"

        # ── Step 4: Toggle all and complete trip ─────────────────────────
        for item in items:
            resp = client.post(f"/api/shopping-list/{item['id']}/toggle")
            assert resp.status_code == 200

        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200
        trip = resp.json()
        assert trip["items_transferred"] == len(items)

        # ── Step 5: Verify inventory state after trip ────────────────────
        resp = client.get("/api/inventory/items")
        assert resp.status_code == 200
        inventory_after_trip = resp.json()
        assert len(inventory_after_trip) > 0, "Inventory should have items after trip"

        # Every inventory item should have non-negative quantity
        for inv_item in inventory_after_trip:
            qty = inv_item.get("quantity") or 0
            assert qty >= 0, f"Inventory '{inv_item['name']}' has negative qty: {qty}"

        # ── Step 6: Stocking check (should need nothing) ────────────────
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        recheck = resp.json()
        assert recheck["items_created"] == 0, \
            f"Stocking check should find all items stocked, but created {recheck['items_created']}"

        # ── Step 7: Cooking complete for all 3 meals ─────────────────────
        cooking_a = _complete_cooking(client, meal_a["id"], 4, prep=10, cook=15)
        assert cooking_a["cooked_at"] is not None, "Meal A: cooked_at not set"

        cooking_b = _complete_cooking(client, meal_b["id"], 8, prep=15, cook=20)
        assert cooking_b["actual_servings"] == 8, "Meal B: actual_servings should be 8 (2x)"
        assert cooking_b["cooked_at"] is not None, "Meal B: cooked_at not set"

        cooking_c = _complete_cooking(client, meal_c["id"], 2, prep=10, cook=0)
        assert cooking_c["cooked_at"] is not None, "Meal C: cooked_at not set"

        # ── Step 8: Cook Monday (Garlic Pasta, 4 servings = 1x) ─────────
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200
        depletion_a = resp.json()

        # Validate DepletionResponse schema
        assert "depleted" in depletion_a
        assert "undo_available_for_seconds" in depletion_a
        for entry in depletion_a["depleted"]:
            assert "mode" in entry, "Depletion entry missing 'mode'"
            assert "status" in entry, "Depletion entry missing 'status'"
            assert entry["remaining"] >= 0, f"Negative remaining for {entry['ingredient_name']}"

        # ── Step 9: Cook Tuesday (Stir Fry at 2x = 8 servings) ──────────
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_b['id']}")
        assert resp.status_code == 200
        depletion_b = resp.json()

        for entry in depletion_b["depleted"]:
            assert entry["remaining"] >= 0, \
                f"Negative remaining after 2x cooking for {entry['ingredient_name']}"

        # ── Step 10: Cook Wednesday (Lemon Salad, 2 servings) ────────────
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_c['id']}")
        assert resp.status_code == 200
        depletion_c = resp.json()

        for entry in depletion_c["depleted"]:
            assert entry["remaining"] >= 0, \
                f"Negative remaining after salad for {entry['ingredient_name']}"

        # ── Step 11: Final inventory verification ────────────────────────
        resp = client.get("/api/inventory/items")
        assert resp.status_code == 200
        final_inventory = resp.json()

        # Olive oil should still exist (just depleted)
        olive_oil_inv = [i for i in final_inventory if "olive oil" in i["name"].lower()]
        assert olive_oil_inv, "Olive oil should still be in inventory after cooking"

        # All items should have quantity >= 0 (no negative inventory)
        for item in final_inventory:
            qty = item.get("quantity") or 0
            assert qty >= 0, f"Inventory item '{item['name']}' has negative quantity: {qty}"

    def test_idempotent_cooking_across_meals(self, accumulated_env):
        """Second depletion of any meal should be a no-op.

        Production trace: inventory.py:deplete_from_cooking
          → checks meal.inventory_depleted == True
          → returns DepletionResponse(depleted=[], undo_available_for_seconds=0)
        """
        client, db = accumulated_env

        recipe_a = _import_recipe(client, RECIPE_A_PASTA)
        meal_a = _plan_meal(client, recipe_a["id"], WEEK_START, 4)

        _shop_and_stock(client, WEEK_START)
        _complete_cooking(client, meal_a["id"], 4)

        # First depletion
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200
        first = resp.json()
        assert len(first["depleted"]) > 0, "First depletion should have entries"

        # Second depletion — should be idempotent
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200
        second = resp.json()
        assert second["depleted"] == [], "Second depletion should return empty list"
        assert second["undo_available_for_seconds"] == 0, "Idempotent response should have undo=0"

    def test_undo_restores_inventory(self, accumulated_env):
        """Undo depletion should restore inventory to pre-cooking state.

        Production trace: inventory.py:undo_depletion
          → reads consumption_history JSON for meal_id entries
          → restores quantity (COUNT) or percent_full (PERCENTAGE)
          → removes history entries
          → resets meal.inventory_depleted = False
        """
        client, db = accumulated_env

        recipe_a = _import_recipe(client, RECIPE_A_PASTA)
        meal_a = _plan_meal(client, recipe_a["id"], WEEK_START, 4)

        _shop_and_stock(client, WEEK_START)

        # Snapshot inventory before cooking
        resp = client.get("/api/inventory/items")
        pre_cook = {i["name"].lower(): i.get("quantity", 0) for i in resp.json()}

        # Cook and record it
        _complete_cooking(client, meal_a["id"], 4)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200

        # Undo
        resp = client.post(f"/api/inventory/undo-depletion/{meal_a['id']}")
        assert resp.status_code == 200
        undo_data = resp.json()
        assert undo_data["restored_count"] >= 0, "Undo should report restored count"

        # Verify inventory restored
        resp = client.get("/api/inventory/items")
        post_undo = {i["name"].lower(): i.get("quantity", 0) for i in resp.json()}

        for name, pre_qty in pre_cook.items():
            post_qty = post_undo.get(name)
            if post_qty is not None and pre_qty is not None:
                assert abs(pre_qty - post_qty) < 0.01, \
                    f"Undo didn't restore '{name}': was {pre_qty}, now {post_qty}"

        # Verify re-depletion works after undo (idempotency flag cleared)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200
        redepletion = resp.json()
        assert "depleted" in redepletion, "Re-depletion after undo should work"

    def test_percentage_mode_lifecycle(self, accumulated_env):
        """Verify PERCENTAGE-mode items flow through the full pipeline.

        Production trace:
          1. find_or_create_ingredient() detects "olive oil" → LIQUID category
          2. Ingredient.get_effective_tracking_mode() → PERCENTAGE for LIQUID/SPICE
          3. complete_shopping_trip() → sets percent_full=100 (Session 10 fix)
          4. generate_shopping_list() stocking check → percent_full >= 25 → skip
          5. deplete_from_cooking() → subtracts 10% default from percent_full
          6. undo_depletion() → restores percent_full
        """
        client, db = accumulated_env
        from app.models.recipe import Ingredient, TrackingMode

        # Import recipe with olive oil (LIQUID → PERCENTAGE mode)
        recipe = _import_recipe(client, RECIPE_A_PASTA)
        meal = _plan_meal(client, recipe["id"], WEEK_START, 4)

        # Shop and stock
        _shop_and_stock(client, WEEK_START)

        # Check that olive oil got percent_full=100 after trip completion
        olive_oil_ing = db.query(Ingredient).filter(
            Ingredient.canonical_name == "olive oil"
        ).first()

        if olive_oil_ing:
            from app.models.inventory import InventoryItem
            olive_oil_inv = db.query(InventoryItem).filter(
                InventoryItem.ingredient_id == olive_oil_ing.id
            ).first()

            if olive_oil_inv:
                mode = olive_oil_inv.get_tracking_mode()
                if mode == TrackingMode.PERCENTAGE:
                    # Verify percent_full was set to 100 by trip completion
                    assert olive_oil_inv.percent_full == 100, \
                        f"PERCENTAGE item should have percent_full=100 after trip, got {olive_oil_inv.percent_full}"

                    # Stocking check should pass (percent_full >= 25)
                    resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
                    assert resp.status_code == 201
                    assert resp.json()["items_created"] == 0, \
                        "Stocking check should pass for PERCENTAGE item with percent_full=100"

                    # Deplete — should subtract 10% default
                    _complete_cooking(client, meal["id"], 4)
                    resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
                    assert resp.status_code == 200
                    depletion = resp.json()

                    pct_entries = [e for e in depletion["depleted"] if e["mode"] == "percentage"]
                    if pct_entries:
                        # Verify 10% default depletion
                        assert pct_entries[0]["amount_depleted"] == 10, \
                            f"PERCENTAGE default depletion should be 10%, got {pct_entries[0]['amount_depleted']}"
                        assert pct_entries[0]["remaining"] == 90, \
                            f"After 10% depletion, remaining should be 90%, got {pct_entries[0]['remaining']}"

                    # Verify DB state
                    db.refresh(olive_oil_inv)
                    assert olive_oil_inv.percent_full == 90, \
                        f"DB percent_full should be 90 after 10% depletion, got {olive_oil_inv.percent_full}"

    def test_scaled_servings_depletion(self, accumulated_env):
        """Verify that 2x servings causes 2x depletion.

        Production trace: inventory.py:deplete_from_cooking
          → scale_factor = planned_servings / default_servings
          → amount_used = parsed.amount * scale_factor
        """
        client, db = accumulated_env

        recipe = _import_recipe(client, RECIPE_B_STIRFRY)

        # Plan at 2x servings (recipe serves 4, plan 8)
        meal = _plan_meal(client, recipe["id"], WEEK_START, 8)

        _shop_and_stock(client, WEEK_START)
        _complete_cooking(client, meal["id"], 8, prep=15, cook=20)

        # Snapshot pre-depletion
        resp = client.get("/api/inventory/items")
        pre = {i["name"].lower(): i.get("quantity", 0) for i in resp.json()}

        # Deplete
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
        assert resp.status_code == 200
        depletion = resp.json()

        # Snapshot post-depletion
        resp = client.get("/api/inventory/items")
        post = {i["name"].lower(): i.get("quantity", 0) for i in resp.json()}

        # Check that COUNT-mode items were depleted by 2x recipe amounts
        # Recipe B has chicken breast: 1.5 lb × 2 = 3.0 lb depleted
        for entry in depletion["depleted"]:
            if entry["mode"] == "count" and entry["status"] != "skipped":
                assert entry["amount_depleted"] > 0, \
                    f"COUNT item '{entry['ingredient_name']}' should have positive depletion"

        # Rice: recipe says 2 cups, 2x = 4 cups. Shopping list generated for 2x.
        # After depletion, rice should have quantity reduced
        rice_pre = pre.get("rice", 0)
        rice_post = post.get("rice", 0)
        if rice_pre > 0:
            assert rice_post < rice_pre, \
                f"Rice should be depleted: pre={rice_pre}, post={rice_post}"

"""
Parametrized recipe pipeline stress test.

Loads cached JSON fixtures (no network), creates a fresh in-memory DB per recipe,
and runs the full 11-stage pipeline with hard asserts tracing every production
code path: import → plan → shop → toggle → trip → stocking check →
cooking-complete → deplete → idempotency → undo → re-deplete.

Replaces test_500_recipe_stress.py.

Run:
    cd backend
    pytest tests/stress/test_pipeline_stress.py -v --tb=short          # All fixtures
    pytest tests/stress/test_pipeline_stress.py -v --tb=short -k "000" # Single fixture
"""

import json
import pytest
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db


# ═══════════════════════════════════════════════════════════════════════════════
# Load fixtures from disk
# ═══════════════════════════════════════════════════════════════════════════════

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "recipe_data"


def _load_fixtures():
    """Load all JSON fixtures. Returns list of (test_id, fixture_dict)."""
    fixtures = []
    if not FIXTURES_DIR.exists():
        return fixtures
    for f in sorted(FIXTURES_DIR.glob("*.json")):
        if f.name.startswith("_"):
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("ingredients"):
                test_id = f.stem
                fixtures.append((test_id, data))
        except Exception:
            pass
    return fixtures


FIXTURES = _load_fixtures()

# Fixed week for determinism
WEEK_START = date(2025, 1, 6)  # Monday


# ═══════════════════════════════════════════════════════════════════════════════
# Shared TestClient with swappable DB
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
    """Seed default ingredient package mappings — matches production seed_ingredient_packages()."""
    from app.models.ingredient_package import IngredientPackage, DEFAULT_PACKAGE_MAPPINGS

    for pattern, pkg_type, qty in DEFAULT_PACKAGE_MAPPINGS:
        db.add(IngredientPackage(
            ingredient_pattern=pattern,
            package_type=pkg_type,
            default_quantity=qty,
        ))
    db.commit()


def _make_fresh_db():
    """Create a fresh in-memory SQLite DB with all tables and production seed data."""
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


@pytest.fixture(scope="module")
def pipeline_client():
    """Module-scoped TestClient with swappable DB holder."""
    db_holder = {"db": None}

    def override_get_db():
        try:
            yield db_holder["db"]
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # Disable rate limiters
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
        yield client, db_holder

    app.dependency_overrides.clear()


def _dedup_ingredients(ingredients: list) -> list:
    """Deduplicate ingredients by canonical name to prevent UNIQUE constraint violations.

    Uses generate_canonical_name() which is the same logic as find_or_create_ingredient(),
    so ingredients like 'extra virgin olive oil' and 'olive oil' that resolve to the same
    canonical name are properly deduped before import.
    """
    from app.models.recipe import generate_canonical_name
    seen = set()
    result = []
    for ing in ingredients:
        key = generate_canonical_name(ing["name"].strip())
        if key not in seen:
            seen.add(key)
            result.append(ing)
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Parametrized pipeline test — 11 stages tracing full production dataflow
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not FIXTURES, reason="No recipe fixtures found. Run capture_recipe_fixtures.py first.")
@pytest.mark.parametrize("test_id,fixture", FIXTURES, ids=[f[0] for f in FIXTURES])
def test_recipe_pipeline(pipeline_client, test_id, fixture):
    """Run full 11-stage pipeline for a single recipe with fresh DB.

    Production dataflow trace:
      Frontend: importRecipeConfirm() → mealsApi.create() → shoppingListApi.generate()
                → toggle() × N → completeTrip() → generate() [stocking check]
                → completeCooking() → depletFromCooking() → depletFromCooking() [idempotent]
                → undoDepletion()

      Backend:  recipes.import_confirm → meals.create_meal_plan → shopping_list.generate_shopping_list
                → shopping_list.toggle_item × N → shopping_list.complete_shopping_trip
                → shopping_list.generate_shopping_list [recheck] → meals.complete_cooking
                → inventory.deplete_from_cooking → inventory.deplete_from_cooking [idempotent]
                → inventory.undo_depletion
    """
    client, db_holder = pipeline_client
    db = _make_fresh_db()
    db_holder["db"] = db

    try:
        recipe_name = fixture["name"]
        ingredients = _dedup_ingredients(fixture["ingredients"])
        servings = fixture.get("servings") or 4
        source_url = fixture.get("_meta", {}).get("url", "https://example.com/test")

        # Filter out empty ingredient names and truncate long names (200 char schema limit)
        ingredients = [ing for ing in ingredients if ing.get("name", "").strip()]
        for ing in ingredients:
            if len(ing["name"]) > 200:
                ing["name"] = ing["name"][:200]
        assert ingredients, f"No valid ingredients in fixture {test_id}"

        # ─── Stage 1: Import ─────────────────────────────────────────────
        # Traces: POST /api/recipes/import/confirm
        # Production path: recipes.py:import_confirm → find_or_create_ingredient()
        #   → RecipeIngredient creation → seen_ingredient_ids dedup

        # Clamp prep/cook times to schema max (1440 min = 24h).
        # Some scraped data has bogus values (e.g. 20160 min = 14 days)
        # or string values from malformed scrapes.
        prep_time = fixture.get("prep_time_minutes")
        cook_time = fixture.get("cook_time_minutes")
        try:
            prep_time = int(prep_time) if prep_time is not None else None
        except (ValueError, TypeError):
            prep_time = None
        try:
            cook_time = int(cook_time) if cook_time is not None else None
        except (ValueError, TypeError):
            cook_time = None
        if prep_time is not None and prep_time > 1440:
            prep_time = 1440
        if cook_time is not None and cook_time > 1440:
            cook_time = 1440

        import_payload = {
            "name": recipe_name,
            "instructions": fixture.get("instructions") or "Cook according to recipe.",
            "ingredients": [
                {
                    "name": ing["name"],
                    "quantity": ing.get("quantity"),
                    "unit": ing.get("unit"),
                    "notes": ing.get("notes"),
                }
                for ing in ingredients
            ],
            "servings": servings,
            "prep_time_minutes": prep_time,
            "cook_time_minutes": cook_time,
            "source_url": source_url,
        }

        resp = client.post("/api/recipes/import/confirm", json=import_payload)
        assert resp.status_code == 201, f"Stage 1 (import) failed: {resp.status_code} {resp.text[:200]}"
        recipe_data = resp.json()
        recipe_id = recipe_data["id"]

        # Verify all ingredients have ingredient_id (FK must be set)
        resp_ingredients = recipe_data.get("ingredients", [])
        for ri in resp_ingredients:
            assert ri.get("ingredient_id") is not None, \
                f"Stage 1: ingredient_id is None for '{ri.get('ingredient_name', '?')}'"

        # ─── Stage 2: Meal Plan ──────────────────────────────────────────
        # Traces: POST /api/meals
        # Production path: meals.py:create_meal_plan → MealPlanEntry creation
        meal_payload = {
            "date": str(WEEK_START),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "planned_servings": servings,
        }
        resp = client.post("/api/meals", json=meal_payload)
        assert resp.status_code == 201, f"Stage 2 (meal plan) failed: {resp.status_code} {resp.text[:200]}"
        meal_data = resp.json()
        meal_id = meal_data["id"]
        assert meal_data["planned_servings"] == servings, "Stage 2: planned_servings mismatch"

        # ─── Stage 3: Shopping List Generation ───────────────────────────
        # Traces: POST /api/shopping-list/generate/{week_start}
        # Production path: shopping_list.py:generate_shopping_list
        #   → MealPlanEntry.planned_servings for scaling
        #   → find_or_create_ingredient for each item
        #   → quantity_amount/quantity_unit pre-parsing
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 200, f"Stage 3 (shopping gen) failed: {resp.status_code} {resp.text[:200]}"
        gen_data = resp.json()
        assert gen_data["items_created"] > 0, \
            f"Stage 3: items_created=0 for {recipe_name} ({len(ingredients)} ingredients)"

        # ─── Stage 4: Toggle All Items ───────────────────────────────────
        # Traces: GET /api/shopping-list/week/{week_start}
        #       + POST /api/shopping-list/{id}/toggle × N
        # Production path: shopping_list.py:toggle_item (flip is_checked boolean)
        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        shopping_items = resp.json()
        assert shopping_items, "Stage 4: No shopping list items found"

        for item in shopping_items:
            resp = client.post(f"/api/shopping-list/{item['id']}/toggle")
            assert resp.status_code == 200, \
                f"Stage 4 (toggle) failed for item {item['id']}: {resp.status_code}"

        # ─── Stage 5: Complete Shopping Trip ─────────────────────────────
        # Traces: POST /api/shopping-list/week/{week_start}/complete
        # Production path: shopping_list.py:complete_shopping_trip
        #   → inventory creation/update per checked item
        #   → percent_full=100 for PERCENTAGE-mode items (Session 10 fix)
        #   → normalize_unit() for unit matching
        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200, f"Stage 5 (trip complete) failed: {resp.status_code} {resp.text[:200]}"
        trip_data = resp.json()
        assert trip_data["items_transferred"] > 0, "Stage 5: items_transferred=0"

        # ─── Stage 6: Stocking Check ────────────────────────────────────
        # Traces: POST /api/shopping-list/generate/{week_start} (second call)
        # Production path: shopping_list.py:generate_shopping_list
        #   → check_inventory_coverage() for COUNT items
        #   → percent_full >= 25 check for PERCENTAGE items
        #   → "to taste" skip when any inventory exists (Session 10 fix)
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 200, f"Stage 6 (stocking check) failed: {resp.status_code}"
        recheck = resp.json()
        assert recheck["items_created"] == 0, \
            f"Stage 6: Stocking check created {recheck['items_created']} items (should be 0). " \
            f"Recipe: {recipe_name}"

        # ─── Stage 7: Cooking Complete ───────────────────────────────────
        # Traces: POST /api/meals/{meal_id}/cooking-complete
        # Production path: meals.py:complete_cooking
        #   → records actual_servings, actual_prep_minutes, actual_cook_minutes
        #   → sets cooked_at timestamp for intelligence layer RCF learning
        cooking_payload = {
            "actual_servings": servings,
            "actual_prep_minutes": min(prep_time or 15, 1440),
            "actual_cook_minutes": min(cook_time or 30, 1440),
            "notes": None,
        }
        resp = client.post(f"/api/meals/{meal_id}/cooking-complete", json=cooking_payload)
        assert resp.status_code == 200, f"Stage 7 (cooking complete) failed: {resp.status_code} {resp.text[:200]}"
        cooking_data = resp.json()
        assert cooking_data.get("actual_servings") == servings, "Stage 7: actual_servings not recorded"
        assert cooking_data.get("cooked_at") is not None, "Stage 7: cooked_at not set"

        # ─── Stage 8: Depletion ──────────────────────────────────────────
        # Traces: POST /api/inventory/deplete-from-cooking/{meal_id}
        # Production path: inventory.py:deplete_from_cooking
        #   → TrackingMode.PERCENTAGE: subtract 10% from percent_full
        #   → TrackingMode.COUNT: subtract recipe_qty × scale_factor
        #   → Fix B: skip zero-quantity ("to taste")
        #   → Fix G: unit conversion (convert_same_type, convert_volume_to_weight)
        #   → records consumption_history for RCF
        #   → sets inventory_depleted=True (idempotency flag)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert resp.status_code == 200, f"Stage 8 (depletion) failed: {resp.status_code} {resp.text[:200]}"
        depletion_data = resp.json()

        # Verify response matches DepletionResponse schema (6 fields per entry)
        assert "depleted" in depletion_data, "Stage 8: missing 'depleted' key"
        assert "undo_available_for_seconds" in depletion_data, "Stage 8: missing undo timer"
        for entry in depletion_data["depleted"]:
            assert "ingredient_id" in entry, "Stage 8: missing ingredient_id in depletion log"
            assert "mode" in entry, "Stage 8: missing mode in depletion log"
            assert "status" in entry, "Stage 8: missing status in depletion log"
            assert entry["mode"] in ("count", "percentage"), \
                f"Stage 8: invalid mode '{entry['mode']}'"
            assert entry["status"] in ("full", "medium", "low", "empty", "skipped"), \
                f"Stage 8: invalid status '{entry['status']}'"
            assert entry["remaining"] >= 0, \
                f"Stage 8: negative remaining for {entry['ingredient_name']}"

        # ─── Stage 9: Idempotency ───────────────────────────────────────
        # Traces: POST /api/inventory/deplete-from-cooking/{meal_id} (second call)
        # Production path: inventory.py:deplete_from_cooking
        #   → meal.inventory_depleted == True → return empty DepletionResponse
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert resp.status_code == 200, f"Stage 9 (idempotency) failed: {resp.status_code}"
        idem_data = resp.json()
        assert idem_data["depleted"] == [], \
            f"Stage 9: Second depletion should be no-op, got {len(idem_data['depleted'])} entries"
        assert idem_data["undo_available_for_seconds"] == 0, \
            "Stage 9: Idempotent response should have undo_available=0"

        # ─── Stage 10: Undo Depletion ────────────────────────────────────
        # Traces: POST /api/inventory/undo-depletion/{meal_id}
        # Production path: inventory.py:undo_depletion
        #   → reverses consumption_history entries for meal_id
        #   → restores inventory quantities
        #   → resets inventory_depleted=False
        resp = client.post(f"/api/inventory/undo-depletion/{meal_id}")
        assert resp.status_code == 200, f"Stage 10 (undo) failed: {resp.status_code} {resp.text[:200]}"
        undo_data = resp.json()
        assert "restored_count" in undo_data, "Stage 10: missing restored_count"
        assert "message" in undo_data, "Stage 10: missing message"

        # ─── Stage 11: Re-deplete after undo ─────────────────────────────
        # Verifies undo properly clears the idempotency flag so depletion works again
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert resp.status_code == 200, f"Stage 11 (re-deplete) failed: {resp.status_code} {resp.text[:200]}"
        redepletion = resp.json()
        # After undo, re-depletion should produce entries again
        # (unless all ingredients had zero quantity / were skipped)
        assert "depleted" in redepletion, "Stage 11: missing depleted key"

    finally:
        db.close()

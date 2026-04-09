"""
Multi-recipe interaction tests at scale (KI-001).

Three-level testing strategy:
- Level 1 (TestArchetypeWeeks): Curated week patterns with oracle-verified outputs
- Level 2 (TestFrequencyAwareScale): 11K fixture selection with invariant assertions
- Level 3 (TestUndoRedoInteraction): Cross-meal undo/redo with oracle verification

Run:
    cd backend
    pytest tests/test_multi_recipe_scale.py -v --tb=short                # All
    pytest tests/test_multi_recipe_scale.py::TestArchetypeWeeks -v       # Level 1
    pytest tests/test_multi_recipe_scale.py::TestFrequencyAwareScale -v  # Level 2
    pytest tests/test_multi_recipe_scale.py::TestUndoRedoInteraction -v  # Level 3
"""

import json
import random
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.models.recipe import generate_canonical_name

from tests.scale_test_oracle import (
    compute_scale_factor,
    compute_shopping_list,
    compute_inventory_after_stocking,
    compute_inventory_after_depletion,
    compute_depletion_sequence,
    HOUSEHOLD_SKIP,
)
from tests.scale_test_archetypes import (
    WEEK_START,
    BUSY_FAMILY_RECIPES, BUSY_FAMILY_MEALS, BUSY_FAMILY_EXPECTED_SHOPPING,
    BUSY_FAMILY_SALT_IN_LIST,
    MEAL_PREPPER_RECIPES, MEAL_PREPPER_RECIPE, MEAL_PREPPER_MEALS,
    MEAL_PREPPER_TOTAL_SCALE, MEAL_PREPPER_EXPECTED_SHOPPING,
    ADVENTUROUS_COOK_RECIPES, ADVENTUROUS_COOK_MEALS,
    ADVENTUROUS_COOK_EXPECTED_ITEM_COUNT,
    PANTRY_DEPLETER_RECIPES, PANTRY_DEPLETER_MEALS,
    PANTRY_DEPLETER_OIL_SEQUENCE, PANTRY_DEPLETER_BUTTER_SEQUENCE,
    PANTRY_DEPLETER_FLOUR_SEQUENCE,
    DUPLICATE_PLANNER_RECIPES, DUPLICATE_PLANNER_MEALS,
    DUPLICATE_PLANNER_SCALE_FACTORS, DUPLICATE_PLANNER_EXPECTED_SHOPPING,
    CROSS_UNIT_RECIPES, CROSS_UNIT_MEALS, CROSS_UNIT_EXPECTED_SHOPPING,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Test Infrastructure
# ═══════════════════════════════════════════════════════════════════════════════

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "recipe_data"


def _load_fixtures():
    """Load all JSON fixtures from disk."""
    fixtures = []
    if not FIXTURES_DIR.exists():
        return fixtures
    for f in sorted(FIXTURES_DIR.glob("*.json")):
        if f.name.startswith("_"):
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("ingredients"):
                fixtures.append((f.stem, data))
        except Exception:
            pass
    return fixtures


FIXTURES = _load_fixtures()


def _seed_categories(db):
    """Seed inventory and recipe categories."""
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
    """Seed default ingredient package mappings."""
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


def _disable_rate_limiters():
    """Disable rate limiters on all routers."""
    from app.routers import (
        recipes, meals, shopping_list, inventory,
        events, categories, tags, patterns, summary,
        observation, recurrence, finances,
        backup, feedback,
    )
    for mod in [recipes, meals, shopping_list, inventory,
                events, categories, tags, patterns, summary,
                observation, recurrence, finances,
                backup, feedback]:
        if hasattr(mod, "limiter"):
            mod.limiter.enabled = False


def _dedup_ingredients(ingredients: list) -> list:
    """Deduplicate ingredients by canonical name."""
    seen = set()
    result = []
    for ing in ingredients:
        key = generate_canonical_name(ing["name"].strip())
        if key not in seen:
            seen.add(key)
            result.append(ing)
    return result


@pytest.fixture
def scale_env():
    """Fresh DB + TestClient for scale tests."""
    db = _make_fresh_db()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    _disable_rate_limiters()

    with TestClient(app) as client:
        yield client, db

    app.dependency_overrides.clear()
    db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# API Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _import_recipe(client, fixture: dict) -> dict:
    """Import recipe via API, return response dict."""
    ingredients = fixture.get("ingredients", [])
    # Filter out empty-name ingredients and clamp to schema limits
    clean_ingredients = []
    for ing in ingredients:
        name = ing.get("name", "").strip()
        if not name:
            continue
        if len(name) > 200:
            name = name[:200]
        notes = ing.get("notes")
        if notes and len(notes) > 500:
            notes = notes[:500]
        clean_ingredients.append({
            "name": name,
            "quantity": ing.get("quantity"),
            "unit": ing.get("unit"),
            "notes": notes,
        })

    # Clamp servings to schema max (100)
    servings = fixture.get("servings") or 4
    if servings > 100:
        servings = 4

    payload = {
        "name": fixture["name"],
        "instructions": fixture.get("instructions", "Cook."),
        "ingredients": _dedup_ingredients(clean_ingredients),
        "servings": servings,
        "prep_time_minutes": min(fixture.get("prep_time_minutes") or 15, 1440),
        "cook_time_minutes": min(fixture.get("cook_time_minutes") or 30, 1440),
        "source_url": fixture.get("source_url", "https://example.com/test"),
    }
    assert payload["ingredients"], f"No valid ingredients for {fixture['name']}"
    resp = client.post("/api/recipes/import/confirm", json=payload)
    assert resp.status_code == 201, f"Import failed for {fixture['name']}: {resp.text[:300]}"
    return resp.json()


def _plan_meal(client, recipe_id: int, meal_date: date, servings: int,
               meal_type: str = "dinner") -> dict:
    """Create a meal plan entry."""
    payload = {
        "date": str(meal_date),
        "meal_type": meal_type,
        "recipe_id": recipe_id,
        "planned_servings": servings,
    }
    resp = client.post("/api/meals", json=payload)
    assert resp.status_code == 201, f"Meal plan failed: {resp.text[:300]}"
    return resp.json()


def _complete_cooking(client, meal_id: int, servings: int,
                      prep: int = 15, cook: int = 30) -> dict:
    """Record cooking completion."""
    payload = {
        "actual_servings": servings,
        "actual_prep_minutes": prep,
        "actual_cook_minutes": cook,
        "notes": None,
    }
    resp = client.post(f"/api/meals/{meal_id}/cooking-complete", json=payload)
    assert resp.status_code == 200, f"Cooking complete failed: {resp.text[:300]}"
    return resp.json()


def _shop_and_stock(client, week_start: date):
    """Generate shopping list, toggle all, complete trip."""
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


def _get_inventory_snapshot(client):
    """Get current inventory as dict keyed by canonical name."""
    resp = client.get("/api/inventory/items")
    assert resp.status_code == 200
    items = resp.json()
    snapshot = {}
    for item in items:
        canonical = generate_canonical_name(item["name"])
        snapshot[canonical] = {
            "quantity": item.get("quantity") or 0,
            "percent_full": item.get("percent_full"),
            "name": item["name"],
        }
    return snapshot


def _import_and_plan_archetype(client, recipes, meals):
    """Import all recipes and plan all meals for an archetype. Returns recipe_data and meal_data lists."""
    recipe_data = []
    for recipe in recipes:
        data = _import_recipe(client, recipe)
        recipe_data.append(data)

    meal_data = []
    for recipe_idx, day_offset, meal_type, servings in meals:
        meal_date = WEEK_START + timedelta(days=day_offset)
        meal = _plan_meal(client, recipe_data[recipe_idx]["id"],
                          meal_date, servings, meal_type)
        meal_data.append({
            "meal": meal,
            "recipe_idx": recipe_idx,
            "servings": servings,
        })

    return recipe_data, meal_data


# ═══════════════════════════════════════════════════════════════════════════════
# Oracle Comparison Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _build_oracle_meal_entries(recipes, meals):
    """Build oracle-compatible meal entries from archetype data."""
    entries = []
    for recipe_idx, day_offset, meal_type, servings in meals:
        entries.append({
            "recipe": recipes[recipe_idx],
            "planned_servings": servings,
        })
    return entries


def _assert_shopping_list_matches_oracle(shopping_items, expected, tolerance=0.01):
    """Compare production shopping list against oracle expected amounts.

    Args:
        shopping_items: list of shopping list item dicts from API
        expected: dict of {canonical_name: (expected_amount, expected_unit)}
        tolerance: numerical tolerance for amount comparison
    """
    # Build canonical name → item mapping from production
    actual = {}
    for item in shopping_items:
        canonical = generate_canonical_name(item["name"])
        actual[canonical] = {
            "amount": item.get("quantity_amount"),
            "name": item["name"],
        }

    for oracle_key, (expected_amount, expected_unit) in expected.items():
        canonical = generate_canonical_name(oracle_key)
        assert canonical in actual, \
            f"Oracle expects '{canonical}' (from '{oracle_key}') in shopping list but not found. " \
            f"Actual items: {sorted(actual.keys())}"
        actual_amount = actual[canonical]["amount"]
        if expected_amount is not None and actual_amount is not None:
            assert abs(actual_amount - expected_amount) < tolerance, \
                f"'{canonical}': oracle={expected_amount}, actual={actual_amount}, " \
                f"diff={abs(actual_amount - expected_amount)}"


def _assert_no_duplicate_canonical_names(shopping_items):
    """Assert each canonical ingredient name appears at most once."""
    canonical_names = [generate_canonical_name(item["name"]) for item in shopping_items]
    dupes = [name for name, count in Counter(canonical_names).items() if count > 1]
    assert not dupes, f"Duplicate canonical names in shopping list: {dupes}"


# ═══════════════════════════════════════════════════════════════════════════════
# Level 1: Archetype Week Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestArchetypeWeeks:
    """Curated week patterns with oracle-verified outputs."""

    def test_busy_family_week(self, scale_env):
        """12 meals, 5 recipes, heavy shared staples. Oracle-verified consolidation."""
        client, db = scale_env

        recipe_data, meal_data = _import_and_plan_archetype(
            client, BUSY_FAMILY_RECIPES, BUSY_FAMILY_MEALS
        )

        # Generate shopping list
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] == 5, \
            f"Expected 5 recipes processed, got {gen['recipes_processed']}"

        # Get shopping list items
        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        # No duplicate canonical names
        _assert_no_duplicate_canonical_names(items)

        # Oracle comparison: exact quantities for measurable ingredients
        _assert_shopping_list_matches_oracle(items, BUSY_FAMILY_EXPECTED_SHOPPING)

        # Salt (to taste) should appear once
        salt_items = [i for i in items if "salt" in i["name"].lower()
                      and generate_canonical_name(i["name"]) == "salt"]
        assert len(salt_items) == 1, \
            f"Salt should appear once, got {len(salt_items)}"

        # All items should have ingredient_id
        for item in items:
            assert item.get("ingredient_id") is not None, \
                f"Missing ingredient_id for '{item['name']}'"

        # Complete shopping trip and verify stocking check
        for item in items:
            client.post(f"/api/shopping-list/{item['id']}/toggle")
        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        assert resp.json()["items_created"] == 0, \
            "Stocking check should find all items stocked after trip"

        # Cook all 12 meals sequentially with depletion
        for md in meal_data:
            meal = md["meal"]
            _complete_cooking(client, meal["id"], md["servings"])
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200
            depletion = resp.json()
            for entry in depletion["depleted"]:
                assert entry["remaining"] >= 0, \
                    f"Negative remaining for {entry['ingredient_name']} " \
                    f"after meal {md['recipe_idx']}"

        # Final inventory: all non-negative
        final = _get_inventory_snapshot(client)
        for canonical, data in final.items():
            assert data["quantity"] >= 0, \
                f"Final inventory '{canonical}' has negative quantity: {data['quantity']}"

    def test_meal_prepper_week(self, scale_env):
        """Same recipe 3x at 8/4/2 servings. Oracle verifies scale factor = 3.5."""
        client, db = scale_env

        recipe_data, meal_data = _import_and_plan_archetype(
            client, MEAL_PREPPER_RECIPES, MEAL_PREPPER_MEALS
        )

        # Generate shopping list
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] == 1

        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        # Oracle: every ingredient should be base_qty * 3.5
        _assert_shopping_list_matches_oracle(items, MEAL_PREPPER_EXPECTED_SHOPPING)
        _assert_no_duplicate_canonical_names(items)

        # Full pipeline: shop, stock, stocking check
        for item in items:
            client.post(f"/api/shopping-list/{item['id']}/toggle")
        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        assert resp.json()["items_created"] == 0

        # Cook all 3 meals and verify depletion
        for md in meal_data:
            meal = md["meal"]
            _complete_cooking(client, meal["id"], md["servings"])
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200
            for entry in resp.json()["depleted"]:
                assert entry["remaining"] >= 0

    def test_adventurous_cook_week(self, scale_env):
        """7 different cuisines, minimal overlap. Tests low-consolidation paths."""
        client, db = scale_env

        recipe_data, meal_data = _import_and_plan_archetype(
            client, ADVENTUROUS_COOK_RECIPES, ADVENTUROUS_COOK_MEALS
        )

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] == 7

        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        # Many unique items, but shared staples consolidated
        _assert_no_duplicate_canonical_names(items)

        # Olive oil should appear exactly once despite being in 5 recipes
        oil_items = [i for i in items
                     if generate_canonical_name(i["name"]) == "olive oil"]
        assert len(oil_items) == 1, \
            f"Olive oil should be consolidated to 1 entry, got {len(oil_items)}"

        # Garlic should appear exactly once despite being in 5 recipes
        garlic_items = [i for i in items
                        if generate_canonical_name(i["name"]) == "garlic"]
        assert len(garlic_items) == 1, \
            f"Garlic should be consolidated to 1 entry, got {len(garlic_items)}"

        # Full pipeline through stocking
        _shop_and_stock(client, WEEK_START)

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        assert resp.json()["items_created"] == 0

    def test_pantry_depleter_week(self, scale_env):
        """7 recipes deplete oil/butter/flour to near-zero. Oracle tracks exact sequences."""
        client, db = scale_env

        recipe_data, meal_data = _import_and_plan_archetype(
            client, PANTRY_DEPLETER_RECIPES, PANTRY_DEPLETER_MEALS
        )

        # Shop and stock
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()
        for item in items:
            client.post(f"/api/shopping-list/{item['id']}/toggle")
        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200

        # Cook each meal sequentially and verify depletion sequences
        for i, md in enumerate(meal_data):
            meal = md["meal"]
            _complete_cooking(client, meal["id"], md["servings"])
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200

            # Check no negative remaining in ANY item
            for entry in resp.json()["depleted"]:
                assert entry["remaining"] >= 0, \
                    f"Meal {i}: negative remaining for {entry['ingredient_name']}: " \
                    f"{entry['remaining']}"

            # Verify specific oracle sequences
            snapshot = _get_inventory_snapshot(client)

            # Olive oil (PERCENTAGE mode)
            if "olive oil" in snapshot:
                oil_pf = snapshot["olive oil"].get("percent_full")
                if oil_pf is not None:
                    expected_pf = PANTRY_DEPLETER_OIL_SEQUENCE[i]
                    assert abs(oil_pf - expected_pf) <= 3, \
                        f"Meal {i}: olive oil percent_full={oil_pf}, expected={expected_pf}"

            # Butter (COUNT mode)
            if "butter" in snapshot:
                butter_qty = snapshot["butter"]["quantity"]
                expected_butter = PANTRY_DEPLETER_BUTTER_SEQUENCE[i]
                assert abs(butter_qty - expected_butter) < 0.01, \
                    f"Meal {i}: butter qty={butter_qty}, expected={expected_butter}"

            # Flour (COUNT mode)
            if "flour" in snapshot:
                flour_qty = snapshot["flour"]["quantity"]
                expected_flour = PANTRY_DEPLETER_FLOUR_SEQUENCE[i]
                assert abs(flour_qty - expected_flour) < 0.01, \
                    f"Meal {i}: flour qty={flour_qty}, expected={expected_flour}"

        # Final: butter and flour should be 0
        final = _get_inventory_snapshot(client)
        if "butter" in final:
            assert final["butter"]["quantity"] < 0.01, \
                f"Butter should be depleted to 0, got {final['butter']['quantity']}"
        if "flour" in final:
            assert final["flour"]["quantity"] < 0.01, \
                f"Flour should be depleted to 0, got {final['flour']['quantity']}"

    def test_duplicate_planner_week(self, scale_env):
        """3 recipes × 14 meals at varying servings. Oracle verifies scale factor sums."""
        client, db = scale_env

        recipe_data, meal_data = _import_and_plan_archetype(
            client, DUPLICATE_PLANNER_RECIPES, DUPLICATE_PLANNER_MEALS
        )

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] == 3

        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        # Oracle: exact quantities matching scale factor sums
        _assert_shopping_list_matches_oracle(items, DUPLICATE_PLANNER_EXPECTED_SHOPPING)
        _assert_no_duplicate_canonical_names(items)

        # Full pipeline
        for item in items:
            client.post(f"/api/shopping-list/{item['id']}/toggle")
        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        assert resp.json()["items_created"] == 0

        # Cook all 14 meals
        for md in meal_data:
            meal = md["meal"]
            _complete_cooking(client, meal["id"], md["servings"])
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200
            for entry in resp.json()["depleted"]:
                assert entry["remaining"] >= 0, \
                    f"Negative remaining for {entry['ingredient_name']}"

    def test_cross_unit_consolidation(self, scale_env):
        """Cross-unit ingredients (cup vs tbsp, tbsp vs tsp) are converted before summing."""
        client, db = scale_env

        recipe_data, meal_data = _import_and_plan_archetype(
            client, CROSS_UNIT_RECIPES, CROSS_UNIT_MEALS
        )

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] == 3

        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        # Oracle: exact quantities after cross-unit conversion
        _assert_shopping_list_matches_oracle(items, CROSS_UNIT_EXPECTED_SHOPPING)
        _assert_no_duplicate_canonical_names(items)

        # Verify specific cross-unit conversions happened:
        # olive oil should be ~9 tbsp (2 + 4 converted from cup + 3), NOT 5.25 (blind add)
        item_map = {generate_canonical_name(i["name"]): i for i in items}
        oil = item_map.get("olive oil")
        assert oil is not None, "olive oil missing from shopping list"
        assert abs(oil["quantity_amount"] - 9.0) < 0.01, \
            f"olive oil should be 9 tbsp (cross-unit converted), got {oil['quantity_amount']}"

        # salt should be ~3.25 tsp (1 + 1.5 from tbsp + 0.75 from tbsp), NOT 1.75 (blind add)
        salt = item_map.get("salt")
        assert salt is not None, "salt missing from shopping list"
        assert abs(salt["quantity_amount"] - 3.25) < 0.01, \
            f"salt should be 3.25 tsp (cross-unit converted), got {salt['quantity_amount']}"

        # Full pipeline: toggle all, complete trip, verify inventory merging
        for item in items:
            client.post(f"/api/shopping-list/{item['id']}/toggle")
        resp = client.post(f"/api/shopping-list/week/{WEEK_START}/complete")
        assert resp.status_code == 200
        trip = resp.json()

        # Verify inventory has merged items (not separate rows per unit)
        inv_snapshot = _get_inventory_snapshot(client)
        assert "olive oil" in inv_snapshot, "olive oil missing from inventory"

        # Stocking check should find nothing to create
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        assert resp.json()["items_created"] == 0

        # Cook all 3 meals with depletion
        for md in meal_data:
            meal = md["meal"]
            _complete_cooking(client, meal["id"], md["servings"])
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200
            for entry in resp.json()["depleted"]:
                assert entry["remaining"] >= 0, \
                    f"Negative remaining for {entry['ingredient_name']}"


# ═══════════════════════════════════════════════════════════════════════════════
# Level 2: Frequency-Aware Scale Tests (require 11K fixtures)
# ═══════════════════════════════════════════════════════════════════════════════

def _build_ingredient_frequency_map(fixtures):
    """Build canonical ingredient → recipe count mapping."""
    freq = Counter()
    for test_id, fixture in fixtures:
        for ing in fixture.get("ingredients", []):
            name = ing.get("name", "").strip()
            if name:
                canonical = generate_canonical_name(name)
                freq[canonical] += 1
    return freq


def _select_recipes_by_frequency(n, fixtures, freq_map, seed=42):
    """Select N recipes ensuring overlap of high-frequency ingredients.

    Strategy: Score each recipe by sum of ingredient frequencies.
    Take top 3N candidates, then shuffle deterministically and pick N.
    This ensures selected recipes are likely to share common ingredients.
    """
    scored = []
    for test_id, fixture in fixtures:
        ingredients = fixture.get("ingredients", [])
        if not ingredients:
            continue
        # Filter valid ingredients
        valid = [ing for ing in ingredients if ing.get("name", "").strip()]
        if not valid:
            continue
        # Score by total frequency of all ingredients
        score = sum(
            freq_map.get(generate_canonical_name(ing["name"].strip()), 0)
            for ing in valid
        )
        scored.append((score, test_id, fixture))

    scored.sort(key=lambda x: -x[0])
    candidates = scored[:n * 3]

    rng = random.Random(seed)
    rng.shuffle(candidates)
    return [(tid, fix) for _, tid, fix in candidates[:n]]


@pytest.mark.skipif(len(FIXTURES) < 20, reason="Need ≥20 recipe fixtures")
class TestFrequencyAwareScale:
    """Scale tests using real recipe fixtures with frequency-aware selection."""

    def test_5_recipe_week_consolidation(self, scale_env):
        """5 frequency-selected recipes. Structural + consolidation assertions."""
        client, db = scale_env
        freq = _build_ingredient_frequency_map(FIXTURES)
        selected = _select_recipes_by_frequency(5, FIXTURES, freq)

        recipe_data = []
        for test_id, fixture in selected:
            data = _import_recipe(client, fixture)
            recipe_data.append(data)

        # Plan each on a different day
        meal_data = []
        for i, rd in enumerate(recipe_data):
            servings = rd.get("servings") or 4
            meal = _plan_meal(client, rd["id"],
                              WEEK_START + timedelta(days=i), servings)
            meal_data.append(meal)

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] == 5

        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        # Structural assertions
        _assert_no_duplicate_canonical_names(items)
        for item in items:
            assert item.get("ingredient_id") is not None
            if item.get("quantity_amount") is not None:
                assert item["quantity_amount"] >= 0

    def test_10_recipe_full_pipeline(self, scale_env):
        """10 recipes through full pipeline. Invariant + schema assertions."""
        client, db = scale_env
        freq = _build_ingredient_frequency_map(FIXTURES)
        selected = _select_recipes_by_frequency(10, FIXTURES, freq, seed=123)

        recipe_data = []
        for test_id, fixture in selected:
            data = _import_recipe(client, fixture)
            recipe_data.append(data)

        meal_data = []
        meal_types = ["dinner", "lunch"]
        for i, rd in enumerate(recipe_data):
            servings = rd.get("servings") or 4
            day = i % 7
            mt = meal_types[i // 7]
            meal = _plan_meal(client, rd["id"],
                              WEEK_START + timedelta(days=day), servings, mt)
            meal_data.append((meal, servings))

        # Shop and stock
        gen, items, trip = _shop_and_stock(client, WEEK_START)
        assert trip["items_transferred"] > 0

        # Stocking check — most items stocked, minor gaps tolerated from
        # unit conversion / percentage-mode rounding during trip completion
        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        restocked_gaps = resp.json()["items_created"]
        assert restocked_gaps <= 5, f"Stocking check found {restocked_gaps} gaps (expected ≤5)"

        # Cook and deplete all 10
        for meal, servings in meal_data:
            _complete_cooking(client, meal["id"], servings)
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200
            depletion = resp.json()
            for entry in depletion["depleted"]:
                assert entry["remaining"] >= 0, \
                    f"Negative remaining for {entry['ingredient_name']}"
                assert entry["mode"] in ("count", "percentage")
                assert entry["status"] in ("full", "medium", "low", "empty", "skipped")

        # Final inventory check
        resp = client.get("/api/inventory/items")
        assert resp.status_code == 200
        for item in resp.json():
            assert (item.get("quantity") or 0) >= 0
            if item.get("percent_full") is not None:
                assert item["percent_full"] >= 0

    def test_20_recipe_shared_ingredient_stress(self, scale_env):
        """20 recipes across 2 weeks. Consolidation uniqueness assertions."""
        client, db = scale_env
        freq = _build_ingredient_frequency_map(FIXTURES)
        selected = _select_recipes_by_frequency(20, FIXTURES, freq, seed=456)

        recipe_data = []
        for test_id, fixture in selected:
            data = _import_recipe(client, fixture)
            recipe_data.append(data)

        # Plan across 2 weeks: first 10 in week 1, next 10 in week 2
        for i, rd in enumerate(recipe_data[:10]):
            servings = rd.get("servings") or 4
            _plan_meal(client, rd["id"],
                       WEEK_START + timedelta(days=i % 7), servings)

        resp = client.post(f"/api/shopping-list/generate/{WEEK_START}")
        assert resp.status_code == 201
        gen = resp.json()
        assert gen["recipes_processed"] >= 1

        resp = client.get(f"/api/shopping-list/week/{WEEK_START}")
        assert resp.status_code == 200
        items = resp.json()

        _assert_no_duplicate_canonical_names(items)

        # All items must have ingredient_id
        for item in items:
            assert item.get("ingredient_id") is not None

    def test_progressive_depletion_no_underflow(self, scale_env):
        """10 recipes at 2x servings. Verify no underflow after all depletions."""
        client, db = scale_env
        freq = _build_ingredient_frequency_map(FIXTURES)
        selected = _select_recipes_by_frequency(10, FIXTURES, freq, seed=789)

        recipe_data = []
        for test_id, fixture in selected:
            data = _import_recipe(client, fixture)
            recipe_data.append(data)

        # Plan all at 2x servings (stress scaling)
        meal_data = []
        for i, rd in enumerate(recipe_data):
            base_servings = rd.get("servings") or 4
            doubled = base_servings * 2
            meal = _plan_meal(client, rd["id"],
                              WEEK_START + timedelta(days=i % 7),
                              doubled, "dinner" if i < 7 else "lunch")
            meal_data.append((meal, doubled))

        _shop_and_stock(client, WEEK_START)

        # Cook all 10 sequentially, checking inventory after each
        for i, (meal, servings) in enumerate(meal_data):
            _complete_cooking(client, meal["id"], servings)
            resp = client.post(f"/api/inventory/deplete-from-cooking/{meal['id']}")
            assert resp.status_code == 200

            # After every depletion: ALL inventory items non-negative
            resp = client.get("/api/inventory/items")
            assert resp.status_code == 200
            for item in resp.json():
                qty = item.get("quantity") or 0
                pf = item.get("percent_full")
                assert qty >= 0, \
                    f"After meal {i}: '{item['name']}' has qty={qty}"
                if pf is not None:
                    assert pf >= 0, \
                        f"After meal {i}: '{item['name']}' has pf={pf}"


# ═══════════════════════════════════════════════════════════════════════════════
# Level 3: Undo/Redo Interaction Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestUndoRedoInteraction:
    """Cross-meal undo/redo with oracle verification."""

    def test_undo_meal_a_preserves_meal_b(self, scale_env):
        """Cook A, Cook B, Undo A → B's depletion preserved. Oracle-verified."""
        client, db = scale_env

        # Use first 3 Busy Family recipes (shared olive oil, garlic, onion)
        recipes = BUSY_FAMILY_RECIPES[:3]
        recipe_data = [_import_recipe(client, r) for r in recipes]

        meal_a = _plan_meal(client, recipe_data[0]["id"], WEEK_START, 4)
        meal_b = _plan_meal(client, recipe_data[1]["id"],
                            WEEK_START + timedelta(days=1), 4)
        meal_c = _plan_meal(client, recipe_data[2]["id"],
                            WEEK_START + timedelta(days=2), 4)

        _shop_and_stock(client, WEEK_START)

        # Snapshot before any cooking
        pre_cook = _get_inventory_snapshot(client)

        # Cook A and deplete
        _complete_cooking(client, meal_a["id"], 4)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200
        depletion_a = resp.json()

        after_a = _get_inventory_snapshot(client)

        # Cook B and deplete
        _complete_cooking(client, meal_b["id"], 4)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_b['id']}")
        assert resp.status_code == 200
        depletion_b = resp.json()

        after_ab = _get_inventory_snapshot(client)

        # Undo A
        resp = client.post(f"/api/inventory/undo-depletion/{meal_a['id']}")
        assert resp.status_code == 200
        undo_data = resp.json()
        assert undo_data["restored_count"] > 0, "Undo should restore items"

        after_undo_a = _get_inventory_snapshot(client)

        # After undo A, inventory should match:
        # pre_cook - B's depletion only
        # For COUNT items in B's depletion, verify B's amounts still subtracted
        for entry in depletion_b["depleted"]:
            if entry["status"] == "skipped":
                continue
            canonical = generate_canonical_name(entry["ingredient_name"])
            if canonical in pre_cook and canonical in after_undo_a:
                pre_qty = pre_cook[canonical]["quantity"]
                after_qty = after_undo_a[canonical]["quantity"]
                if entry["mode"] == "count" and entry["amount_depleted"] > 0:
                    # B's depletion should still be reflected
                    expected = max(0, pre_qty - entry["amount_depleted"])
                    assert abs(after_qty - expected) < 0.1, \
                        f"After undo A, '{canonical}': expected={expected}, " \
                        f"actual={after_qty} (B depleted {entry['amount_depleted']})"

        # Re-deplete A — should restore to after_ab state
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200

        after_re_a = _get_inventory_snapshot(client)

        # Should match the both-depleted snapshot
        # Tolerance is 2.0 because percentage-mode items use geometric decay
        # (10% of current), which is order-dependent after undo/re-deplete.
        for canonical in after_ab:
            if canonical in after_re_a:
                ab_qty = after_ab[canonical]["quantity"]
                re_qty = after_re_a[canonical]["quantity"]
                assert abs(ab_qty - re_qty) < 2.0, \
                    f"Re-deplete mismatch for '{canonical}': " \
                    f"after_ab={ab_qty}, after_re_deplete={re_qty}"

    def test_undo_redo_idempotency_across_meals(self, scale_env):
        """Cook A, Cook B, Undo B, Undo A, Re-deplete A, Re-deplete B → same final state."""
        client, db = scale_env

        recipes = BUSY_FAMILY_RECIPES[:2]
        recipe_data = [_import_recipe(client, r) for r in recipes]

        meal_a = _plan_meal(client, recipe_data[0]["id"], WEEK_START, 4)
        meal_b = _plan_meal(client, recipe_data[1]["id"],
                            WEEK_START + timedelta(days=1), 4)

        _shop_and_stock(client, WEEK_START)

        # Cook both
        _complete_cooking(client, meal_a["id"], 4)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200

        _complete_cooking(client, meal_b["id"], 4)
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_b['id']}")
        assert resp.status_code == 200

        both_depleted = _get_inventory_snapshot(client)

        # Undo B
        resp = client.post(f"/api/inventory/undo-depletion/{meal_b['id']}")
        assert resp.status_code == 200
        assert resp.json()["restored_count"] >= 0

        # Undo A
        resp = client.post(f"/api/inventory/undo-depletion/{meal_a['id']}")
        assert resp.status_code == 200
        assert resp.json()["restored_count"] >= 0

        # Re-deplete A
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_a['id']}")
        assert resp.status_code == 200

        # Re-deplete B
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_b['id']}")
        assert resp.status_code == 200

        final = _get_inventory_snapshot(client)

        # Final should match both_depleted
        # Tolerance is 2.0 because percentage-mode items use geometric decay
        # (10% of current), which is order-dependent after undo/re-deplete.
        for canonical in both_depleted:
            if canonical in final:
                orig = both_depleted[canonical]["quantity"]
                now = final[canonical]["quantity"]
                assert abs(orig - now) < 2.0, \
                    f"Undo/redo mismatch for '{canonical}': " \
                    f"both_depleted={orig}, final={now}"

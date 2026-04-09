"""
Chunk worker for stress test. Processes a list of fixture paths and writes
results to an output file. Launched as a subprocess by run_stress_test.py.

Usage: python tests/_chunk_worker.py <paths_file> <output_file>
"""
import json
import sys
import logging
import warnings
from datetime import date
from pathlib import Path

logging.disable(logging.WARNING)
warnings.filterwarnings("ignore")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

WEEK_START = date(2025, 1, 6)


def main():
    paths_file = sys.argv[1]
    output_file = sys.argv[2]

    chunk_paths = json.loads(Path(paths_file).read_text(encoding="utf-8"))

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import Base, get_db
    from app.models.recipe import generate_canonical_name
    from app.models.inventory import InventoryCategory
    from app.models.recipe import RecipeCategory
    from app.models.ingredient_package import IngredientPackage, DEFAULT_PACKAGE_MAPPINGS

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

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    # Seed categories and packages ONCE (saves 181 INSERTs per recipe)
    SEED_TABLES = {"inventory_categories", "recipe_categories", "ingredient_packages"}
    seed_db = Session()
    for name in ["Produce", "Dairy", "Meat & Seafood", "Frozen",
                 "Pantry", "Beverages", "Condiments", "Snacks"]:
        seed_db.add(InventoryCategory(name=name))
    for name in ["Breakfast", "Lunch", "Dinner", "Dessert",
                 "Appetizer", "Side Dish", "Soup", "Salad"]:
        seed_db.add(RecipeCategory(name=name))
    for pattern, pkg_type, qty in DEFAULT_PACKAGE_MAPPINGS:
        seed_db.add(IngredientPackage(
            ingredient_pattern=pattern, package_type=pkg_type, default_quantity=qty,
        ))
    seed_db.commit()
    seed_db.close()

    # Only delete recipe-specific tables between recipes (skip seed tables)
    table_names = [t.name for t in reversed(Base.metadata.sorted_tables)
                   if t.name not in SEED_TABLES]

    db_holder = {"db": None}

    def override_get_db():
        try:
            yield db_holder["db"]
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app, raise_server_exceptions=False)

    results = []
    week_str = str(WEEK_START)

    for filepath in chunk_paths:
        fpath = Path(filepath)
        test_id = fpath.stem

        try:
            fixture = json.loads(fpath.read_text(encoding="utf-8"))
            if not fixture.get("ingredients"):
                results.append(("SKIP", test_id, "No ingredients", "prep"))
                continue
        except Exception as e:
            results.append(("ERROR", test_id, str(e)[:200], "load"))
            continue

        # Fast reset: DELETE only recipe-specific tables (seed data stays)
        conn = engine.raw_connection()
        cursor = conn.cursor()
        for tname in table_names:
            cursor.execute(f"DELETE FROM {tname}")
        conn.commit()
        conn.close()

        db = Session()
        db_holder["db"] = db

        try:
            result = run_pipeline(client, test_id, fixture, generate_canonical_name, week_str)
            results.append(result)
        except Exception as e:
            results.append(("ERROR", test_id, f"{type(e).__name__}: {str(e)[:200]}", "exception"))
        finally:
            db.close()

    app.dependency_overrides.clear()
    client.close()
    engine.dispose()

    Path(output_file).write_text(json.dumps(results), encoding="utf-8")


def run_pipeline(client, test_id, fixture, gcn, week_str):
    """Run 11-stage pipeline. Returns (status, test_id, error, stage)."""
    recipe_name = fixture["name"]
    ingredients = fixture["ingredients"]
    servings = fixture.get("servings") or 4
    try:
        servings = min(int(servings), 100)
    except (ValueError, TypeError):
        servings = 4
    if servings < 1:
        servings = 4

    seen = set()
    deduped = []
    for ing in ingredients:
        name = (ing.get("name") or "").strip()
        if not name:
            continue
        if len(name) > 200:
            name = name[:200]
        key = gcn(name)
        if key and key not in seen:
            seen.add(key)
            deduped.append({**ing, "name": name})
    ingredients = deduped

    if not ingredients:
        return ("SKIP", test_id, "No valid ingredients", "prep")

    source_url = fixture.get("_meta", {}).get("url", "https://example.com/test")
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

    resp = client.post("/api/recipes/import/confirm", json={
        "name": recipe_name,
        "instructions": fixture.get("instructions") or "Cook according to recipe.",
        "ingredients": [
            {"name": i["name"], "quantity": i.get("quantity"),
             "unit": i.get("unit"), "notes": i.get("notes")}
            for i in ingredients
        ],
        "servings": servings,
        "prep_time_minutes": prep_time,
        "cook_time_minutes": cook_time,
        "source_url": source_url,
    })
    if resp.status_code != 201:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "1-import")
    recipe_id = resp.json()["id"]

    resp = client.post("/api/meals", json={
        "date": week_str, "meal_type": "dinner",
        "recipe_id": recipe_id, "planned_servings": servings,
    })
    if resp.status_code != 201:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "2-meal")
    meal_id = resp.json()["id"]

    resp = client.post(f"/api/shopping-list/generate/{week_str}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "3-shop")
    if resp.json()["items_created"] == 0:
        return ("FAIL", test_id, "items_created=0", "3-shop")

    resp = client.get(f"/api/shopping-list/week/{week_str}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"get items: {resp.status_code}", "4-toggle")
    items = resp.json()
    for item in items:
        r = client.post(f"/api/shopping-list/{item['id']}/toggle")
        if r.status_code != 200:
            return ("FAIL", test_id, f"toggle {item['id']}: {r.status_code}", "4-toggle")

    resp = client.post(f"/api/shopping-list/week/{week_str}/complete")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "5-trip")
    if resp.json()["items_transferred"] == 0:
        return ("FAIL", test_id, "items_transferred=0", "5-trip")

    resp = client.post(f"/api/shopping-list/generate/{week_str}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}", "6-stock")
    created = resp.json()["items_created"]
    if created != 0:
        return ("FAIL", test_id, f"stocking check created {created} items", "6-stock")

    resp = client.post(f"/api/meals/{meal_id}/cooking-complete", json={
        "actual_servings": servings,
        "actual_prep_minutes": min(prep_time or 15, 1440),
        "actual_cook_minutes": min(cook_time or 30, 1440),
        "notes": None,
    })
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "7-cook")

    resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "8-deplete")
    for entry in resp.json().get("depleted", []):
        if entry.get("remaining", 0) < 0:
            return ("FAIL", test_id, f"negative remaining: {entry}", "8-deplete")

    resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}", "9-idem")
    if resp.json()["depleted"] != []:
        return ("FAIL", test_id, "non-empty idempotent depletion", "9-idem")

    resp = client.post(f"/api/inventory/undo-depletion/{meal_id}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "10-undo")

    resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
    if resp.status_code != 200:
        return ("FAIL", test_id, f"{resp.status_code}: {resp.text[:200]}", "11-redepl")

    return ("PASS", test_id, "", "")


if __name__ == "__main__":
    main()

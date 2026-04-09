"""
Full pipeline integration tests: Recipe → Shopping List → Inventory → Cooking Depletion.

Tests the complete data flow to ensure bulletproof inventory management.
"""

import pytest
from datetime import date, timedelta


class TestFullPipelineRecipeToDepletion:
    """Recipe import → meal plan → shopping list → inventory → depletion."""

    def test_full_pipeline_recipe_to_depletion(self, client, test_db):
        """Full pipeline: recipe → meal plan → shopping list → inventory → depletion."""
        # 1. Create a recipe with ingredients
        recipe_data = {
            "name": "Test Chicken Stir Fry",
            "instructions": "1. Cook chicken. 2. Add veggies. 3. Serve.",
            "prep_time_minutes": 10,
            "cook_time_minutes": 15,
            "servings": 4,
        }
        recipe_resp = client.post("/api/recipes", json=recipe_data)
        assert recipe_resp.status_code == 201
        recipe_id = recipe_resp.json()["id"]

        # 2. Add ingredients to recipe via the ingredient service
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        chicken = find_or_create_ingredient(test_db, "chicken breast", "pound")
        rice = find_or_create_ingredient(test_db, "rice", "cup")
        test_db.flush()

        ri1 = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=chicken.id,
            quantity="2",
            unit="pound",
        )
        ri2 = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=rice.id,
            quantity="1",
            unit="cup",
        )
        test_db.add_all([ri1, ri2])
        test_db.commit()

        # 3. Create a meal plan entry
        week_start = date.today() - timedelta(days=date.today().weekday())
        meal_data = {
            "date": str(week_start),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "planned_servings": 4,
        }
        meal_resp = client.post("/api/meals", json=meal_data)
        assert meal_resp.status_code == 201
        meal_id = meal_resp.json()["id"]

        # 4. Generate shopping list
        gen_resp = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen_resp.status_code == 201
        gen_data = gen_resp.json()
        assert gen_data["items_created"] >= 2

        # 5. Verify shopping list items exist
        list_resp = client.get(f"/api/shopping-list/week/{week_start}")
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert len(items) >= 2

        # 6. Add inventory items (simulating having stock)
        inv_chicken = client.post("/api/inventory/items", json={
            "name": "chicken breast",
            "quantity": 5.0,
            "unit": "pound",
            "location": "fridge",
        })
        assert inv_chicken.status_code == 201

        inv_rice = client.post("/api/inventory/items", json={
            "name": "rice",
            "quantity": 3.0,
            "unit": "cup",
            "location": "pantry",
        })
        assert inv_rice.status_code == 201

        # 7. Regenerate shopping list — stocked items should be skipped
        gen_resp2 = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen_resp2.status_code == 201
        # Items should be skipped since inventory has enough
        assert gen_resp2.json()["items_created"] == 0

        # 8. Deplete inventory from cooking
        deplete_resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert deplete_resp.status_code == 200
        deplete_data = deplete_resp.json()
        assert len(deplete_data["depleted"]) >= 1

        # 9. Verify inventory quantities decreased
        inv_items = client.get("/api/inventory/items").json()
        chicken_inv = next((i for i in inv_items if "chicken" in i["name"].lower()), None)
        assert chicken_inv is not None
        assert chicken_inv["quantity"] < 5.0  # Was 5, should have decreased


class TestCanonicalNameInventoryMatch:
    """Canonical name matching prevents duplicate shopping list items."""

    def test_canonical_name_inventory_match(self, client, test_db):
        """Inventory item with canonical name 'olive oil' skips 'Extra Virgin Olive Oil' in shopping."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient, Ingredient
        from app.models.inventory import InventoryItem

        # Create recipe with "Extra Virgin Olive Oil"
        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Salad",
            "instructions": "Mix ingredients.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        evoo = find_or_create_ingredient(test_db, "Extra Virgin Olive Oil", "tablespoon")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=evoo.id,
            quantity="2",
            unit="tablespoon",
        )
        test_db.add(ri)
        test_db.commit()

        # Create inventory item directly linked to the SAME ingredient (via canonical match)
        # Using the API should find the same ingredient via find_or_create_ingredient
        # Note: olive oil is a LIQUID → PERCENTAGE tracking mode, so set percent_full
        inv_resp = client.post("/api/inventory/items", json={
            "name": "Extra Virgin Olive Oil",
            "quantity": 10.0,
            "unit": "tablespoon",
            "location": "pantry",
            "percent_full": 80,
        })
        assert inv_resp.status_code == 201
        inv_data = inv_resp.json()
        # Verify the API linked to the same ingredient
        assert inv_data["ingredient_id"] == evoo.id

        # Create meal plan
        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={
            "date": str(week_start),
            "meal_type": "lunch",
            "recipe_id": recipe_id,
        })

        # Generate shopping list — olive oil should NOT appear (stocked via FK match)
        gen_resp = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen_resp.status_code == 201
        assert gen_resp.json()["items_created"] == 0


class TestShoppingTripExpirationAutofill:
    """Shopping trip completion auto-fills expiration dates."""

    def test_shopping_trip_expiration_autofill(self, client, test_db):
        """Complete shopping trip → inventory items have expiration dates."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models import ShoppingListItem

        week_start = date.today() - timedelta(days=date.today().weekday())

        # Create a shopping list item manually (checked)
        ingredient = find_or_create_ingredient(test_db, "chicken breast")
        test_db.flush()

        item = ShoppingListItem(
            ingredient_id=ingredient.id,
            name="chicken breast",
            quantity="2 pounds",
            quantity_amount=2.0,
            quantity_unit="pound",
            category="Meat & Seafood",
            is_checked=True,
            week_start=week_start,
        )
        test_db.add(item)
        test_db.commit()

        # Complete shopping trip
        complete_resp = client.post(f"/api/shopping-list/week/{week_start}/complete")
        assert complete_resp.status_code == 200
        assert complete_resp.json()["items_transferred"] == 1

        # Verify inventory item has expiration fields
        inv_items = client.get("/api/inventory/items").json()
        chicken = next((i for i in inv_items if "chicken" in i["name"].lower()), None)
        assert chicken is not None
        assert chicken["expiration_date"] is not None
        assert chicken["food_category"] is not None
        assert chicken["expiration_auto_filled"] is True


class TestDepletionUnitMismatchGuard:
    """Unit incompatibility guard prevents wrong subtractions."""

    def test_depletion_unit_mismatch_skips(self, client, test_db):
        """Inventory unit 'bag' vs recipe unit 'cup' → depletion skipped."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        # Create recipe with flour measured in cups
        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Bread",
            "instructions": "Mix and bake.",
            "servings": 1,
        })
        recipe_id = recipe_resp.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=flour.id,
            quantity="2",
            unit="cup",
        )
        test_db.add(ri)
        test_db.commit()

        # Create inventory with flour in bags (incompatible unit)
        inv_resp = client.post("/api/inventory/items", json={
            "name": "flour",
            "quantity": 5.0,
            "unit": "bag",
            "location": "pantry",
        })
        assert inv_resp.status_code == 201

        # Create meal plan
        week_start = date.today() - timedelta(days=date.today().weekday())
        meal_resp = client.post("/api/meals", json={
            "date": str(week_start),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        })
        meal_id = meal_resp.json()["id"]

        # Deplete — should skip flour due to unit mismatch
        deplete_resp = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert deplete_resp.status_code == 200
        depleted = deplete_resp.json()["depleted"]

        # Flour should be skipped
        flour_entry = next((d for d in depleted if "flour" in d["ingredient_name"].lower()), None)
        if flour_entry:
            assert flour_entry["status"] == "skipped"
            assert flour_entry["amount_depleted"] == 0

        # Verify quantity unchanged
        inv_items = client.get("/api/inventory/items").json()
        flour_inv = next((i for i in inv_items if "flour" in i["name"].lower()), None)
        assert flour_inv is not None
        assert flour_inv["quantity"] == 5.0  # Unchanged


class TestDepletionIdempotency:
    """Depletion endpoint is idempotent — second call returns empty."""

    def test_depletion_idempotency(self, client, test_db):
        """Deplete same meal twice → second call returns empty."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        # Create recipe with ingredient
        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Soup",
            "instructions": "Boil and serve.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        onion = find_or_create_ingredient(test_db, "onion")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=onion.id,
            quantity="1",
            unit="",
        )
        test_db.add(ri)
        test_db.commit()

        # Add to inventory
        client.post("/api/inventory/items", json={
            "name": "onion",
            "quantity": 5.0,
            "location": "pantry",
        })

        # Create meal
        week_start = date.today() - timedelta(days=date.today().weekday())
        meal_resp = client.post("/api/meals", json={
            "date": str(week_start),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        })
        meal_id = meal_resp.json()["id"]

        # First depletion — should succeed
        deplete1 = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert deplete1.status_code == 200
        assert len(deplete1.json()["depleted"]) >= 1

        # Second depletion — should return empty (idempotent)
        deplete2 = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert deplete2.status_code == 200
        assert len(deplete2.json()["depleted"]) == 0


class TestStorageLocationInference:
    """Shopping trip infers correct storage location from food category."""

    def test_storage_location_inference(self, client, test_db):
        """Chicken → fridge, rice → pantry via shopping trip completion."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models import ShoppingListItem

        week_start = date.today() - timedelta(days=date.today().weekday())

        # Create checked shopping items
        chicken_ing = find_or_create_ingredient(test_db, "chicken breast")
        rice_ing = find_or_create_ingredient(test_db, "rice")
        test_db.flush()

        items = [
            ShoppingListItem(
                ingredient_id=chicken_ing.id,
                name="chicken breast",
                quantity="2 pounds",
                quantity_amount=2.0,
                quantity_unit="pound",
                category="Meat & Seafood",
                is_checked=True,
                week_start=week_start,
            ),
            ShoppingListItem(
                ingredient_id=rice_ing.id,
                name="rice",
                quantity="2 cups",
                quantity_amount=2.0,
                quantity_unit="cup",
                category="Pantry",
                is_checked=True,
                week_start=week_start,
            ),
        ]
        test_db.add_all(items)
        test_db.commit()

        # Complete shopping trip
        complete_resp = client.post(f"/api/shopping-list/week/{week_start}/complete")
        assert complete_resp.status_code == 200
        assert complete_resp.json()["items_transferred"] == 2

        # Verify storage locations
        inv_items = client.get("/api/inventory/items").json()
        chicken_inv = next((i for i in inv_items if "chicken" in i["name"].lower()), None)
        rice_inv = next((i for i in inv_items if "rice" in i["name"].lower()), None)

        assert chicken_inv is not None
        assert chicken_inv["location"] == "fridge"

        assert rice_inv is not None
        assert rice_inv["location"] == "pantry"


class TestRestockThresholdBoundary:
    """Restock threshold boundary tests for needs_restock()."""

    def test_low_quantity_triggers_restock(self, client, test_db):
        """Inventory has 0.1 cups flour → should be added to shopping list (below 0.25 threshold)."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient
        from app.models.inventory import InventoryItem

        # Create recipe with flour
        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Pancakes",
            "instructions": "Mix and cook.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=flour.id,
            quantity="2",
            unit="cup",
        )
        test_db.add(ri)
        test_db.commit()

        # Add inventory with very low quantity (below 0.25 threshold)
        client.post("/api/inventory/items", json={
            "name": "flour",
            "quantity": 0.1,
            "unit": "cup",
            "location": "pantry",
        })

        # Create meal plan
        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={
            "date": str(week_start),
            "meal_type": "breakfast",
            "recipe_id": recipe_id,
        })

        # Generate shopping list — flour should appear (low stock)
        gen_resp = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen_resp.status_code == 201
        assert gen_resp.json()["items_created"] >= 1

    def test_insufficient_quantity_adds_to_shopping(self, client, test_db):
        """Inventory has 0.5 cups flour but recipe needs 1 cup → SHOULD be added."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Muffins",
            "instructions": "Mix and bake.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=flour.id,
            quantity="1",
            unit="cup",
        )
        test_db.add(ri)
        test_db.commit()

        # Add inventory — 0.5 cups is less than 1 cup needed
        client.post("/api/inventory/items", json={
            "name": "flour",
            "quantity": 0.5,
            "unit": "cup",
            "location": "pantry",
        })

        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={
            "date": str(week_start),
            "meal_type": "breakfast",
            "recipe_id": recipe_id,
        })

        # Generate shopping list — flour SHOULD appear (0.5 cups < 1 cup needed)
        gen_resp = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen_resp.status_code == 201
        assert gen_resp.json()["items_created"] >= 1

    def test_sufficient_quantity_skips_shopping(self, client, test_db):
        """Inventory has 3 cups flour and recipe needs 1 cup → should NOT be added."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Cookies",
            "instructions": "Mix and bake.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=flour.id,
            quantity="1",
            unit="cup",
        )
        test_db.add(ri)
        test_db.commit()

        # Add inventory — 3 cups is more than 1 cup needed
        client.post("/api/inventory/items", json={
            "name": "flour",
            "quantity": 3.0,
            "unit": "cup",
            "location": "pantry",
        })

        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={
            "date": str(week_start),
            "meal_type": "breakfast",
            "recipe_id": recipe_id,
        })

        # Generate shopping list — flour should NOT appear (3 cups > 1 cup)
        gen_resp = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen_resp.status_code == 201
        assert gen_resp.json()["items_created"] == 0


class TestExpiringItemsHaveIngredientIds:
    """Expiring items endpoint returns ingredient_id for frontend matching."""

    def test_expiring_items_have_ingredient_ids(self, client, test_db):
        """Inventory items with ingredient_id links and short expiration appear in expiring endpoint."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.inventory import InventoryItem, StorageLocation

        # Create ingredient-linked inventory item with short expiration
        milk_ing = find_or_create_ingredient(test_db, "milk")
        test_db.flush()

        item = InventoryItem(
            ingredient_id=milk_ing.id,
            name="milk",
            quantity=1.0,
            unit="gallon",
            location=StorageLocation.FRIDGE,
            expiration_date=date.today() + timedelta(days=2),
            purchase_date=date.today(),
            food_category="dairy",
            source="purchased",
        )
        test_db.add(item)
        test_db.commit()

        # Query expiring items
        resp = client.get("/api/inventory/items/expiring?days=7")
        assert resp.status_code == 200
        expiring = resp.json()
        assert len(expiring) >= 1

        milk_item = next((i for i in expiring if "milk" in i["name"].lower()), None)
        assert milk_item is not None
        assert milk_item["ingredient_id"] == milk_ing.id


# =============================================================================
# Helper: Create recipe + ingredient + meal plan + optional inventory
# =============================================================================

def _setup_recipe_with_ingredient(client, test_db, ingredient_name, qty, unit,
                                  recipe_servings=4, planned_servings=None,
                                  inventory_qty=None, inventory_unit=None,
                                  inventory_location="pantry",
                                  inventory_percent_full=None):
    """Create a recipe with one ingredient, meal plan it, and optionally add inventory."""
    from app.services.ingredient_service import find_or_create_ingredient
    from app.models.recipe import RecipeIngredient

    recipe_resp = client.post("/api/recipes", json={
        "name": f"Test Recipe for {ingredient_name}",
        "instructions": "Test instructions.",
        "servings": recipe_servings,
    })
    assert recipe_resp.status_code == 201
    recipe_id = recipe_resp.json()["id"]

    ing = find_or_create_ingredient(test_db, ingredient_name, unit)
    test_db.flush()

    ri = RecipeIngredient(
        recipe_id=recipe_id,
        ingredient_id=ing.id,
        quantity=qty,
        unit=unit,
    )
    test_db.add(ri)
    test_db.commit()

    week_start = date.today() - timedelta(days=date.today().weekday())

    meal_json = {
        "date": str(week_start),
        "meal_type": "dinner",
        "recipe_id": recipe_id,
    }
    if planned_servings is not None:
        meal_json["planned_servings"] = planned_servings

    meal_resp = client.post("/api/meals", json=meal_json)
    assert meal_resp.status_code == 201
    meal_id = meal_resp.json()["id"]

    if inventory_qty is not None:
        inv_json = {
            "name": ingredient_name,
            "quantity": inventory_qty,
            "unit": inventory_unit or unit,
            "location": inventory_location,
        }
        if inventory_percent_full is not None:
            inv_json["percent_full"] = inventory_percent_full
            inv_json["tracking_mode_override"] = "percentage"
        inv_resp = client.post("/api/inventory/items", json=inv_json)
        assert inv_resp.status_code == 201

    return recipe_id, ing, meal_id, week_start


# =============================================================================
# Fix D: Comprehensive new test classes
# =============================================================================

class TestQuantityAwareStockingCheck:
    """Tests for Fix A: quantity-aware inventory comparison in shopping list generation."""

    def test_same_unit_sufficient(self, client, test_db):
        """3 cups flour in inventory, recipe needs 2 cups → skipped."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=3.0, inventory_unit="cup",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0

    def test_same_unit_insufficient(self, client, test_db):
        """1 cup flour in inventory, recipe needs 2 cups → added."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=1.0, inventory_unit="cup",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_same_unit_exact(self, client, test_db):
        """2 cups flour in inventory, recipe needs 2 cups → skipped (exact match)."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=2.0, inventory_unit="cup",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0

    def test_convertible_units_tsp_to_cup(self, client, test_db):
        """50 tsp sugar in inventory, recipe needs 1 cup (=48 tsp) → skipped."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "sugar", "1", "cup",
            inventory_qty=50.0, inventory_unit="teaspoon",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0

    def test_convertible_units_insufficient(self, client, test_db):
        """10 tsp sugar in inventory, recipe needs 1 cup (=48 tsp) → added."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "sugar", "1", "cup",
            inventory_qty=10.0, inventory_unit="teaspoon",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_cross_type_volume_to_weight(self, client, test_db):
        """500g flour in inventory, recipe needs 2 cups (≈240g) → skipped."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=500.0, inventory_unit="gram",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0

    def test_cross_type_insufficient(self, client, test_db):
        """100g flour in inventory, recipe needs 2 cups (≈240g) → added."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=100.0, inventory_unit="gram",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_incompatible_units_fallback(self, client, test_db):
        """2 bags flour, recipe needs 1 cup → added (can't convert bags)."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "1", "cup",
            inventory_qty=2.0, inventory_unit="bag",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_percentage_mode_above_threshold(self, client, test_db):
        """Olive oil at 80% full → skipped (threshold fallback, ≥25%)."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "olive oil", "2", "tablespoon",
            inventory_qty=10.0, inventory_unit="tablespoon",
            inventory_percent_full=80,
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0

    def test_percentage_mode_below_threshold(self, client, test_db):
        """Olive oil at 10% full → added (<25% threshold)."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "olive oil", "2", "tablespoon",
            inventory_qty=10.0, inventory_unit="tablespoon",
            inventory_percent_full=10,
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_count_no_unit_sufficient(self, client, test_db):
        """5 eggs in inventory, recipe needs 3 → skipped."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "egg", "3", "",
            inventory_qty=5.0, inventory_unit="",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0

    def test_count_no_unit_insufficient(self, client, test_db):
        """1 egg in inventory, recipe needs 3 → added."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "egg", "3", "",
            inventory_qty=1.0, inventory_unit="",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_multi_recipe_consolidated(self, client, test_db):
        """Recipe A: 1 cup flour + Recipe B: 2 cups flour = 3 total. Inventory 2 cups → added."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        # Create two recipes sharing the same ingredient
        r1 = client.post("/api/recipes", json={
            "name": "Recipe A", "instructions": "A", "servings": 4,
        })
        r2 = client.post("/api/recipes", json={
            "name": "Recipe B", "instructions": "B", "servings": 4,
        })
        r1_id = r1.json()["id"]
        r2_id = r2.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        test_db.add(RecipeIngredient(recipe_id=r1_id, ingredient_id=flour.id, quantity="1", unit="cup"))
        test_db.add(RecipeIngredient(recipe_id=r2_id, ingredient_id=flour.id, quantity="2", unit="cup"))
        test_db.commit()

        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={"date": str(week_start), "meal_type": "breakfast", "recipe_id": r1_id})
        client.post("/api/meals", json={"date": str(week_start + timedelta(days=1)), "meal_type": "dinner", "recipe_id": r2_id})

        # Inventory: only 2 cups (need 3)
        client.post("/api/inventory/items", json={
            "name": "flour", "quantity": 2.0, "unit": "cup", "location": "pantry",
        })

        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_zero_inventory(self, client, test_db):
        """0 cups flour in inventory → added."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=0.0, inventory_unit="cup",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1

    def test_negative_edge(self, client, test_db):
        """0.001 cups flour in inventory, recipe needs 2 → added."""
        _, _, _, week_start = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            inventory_qty=0.001, inventory_unit="cup",
        )
        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1


class TestZeroQuantityDepletion:
    """Tests for Fix B: zero-quantity depletion suppression."""

    def test_zero_amount_skips_depletion(self, client, test_db):
        """Recipe ingredient with quantity '0' → depletion skipped, inventory unchanged."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "rice", "0", "cup",
            inventory_qty=5.0, inventory_unit="cup",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        depleted = dep.json()["depleted"]
        rice_entry = next((d for d in depleted if "rice" in d["ingredient_name"].lower()), None)
        if rice_entry:
            assert rice_entry["status"] == "skipped"
            assert rice_entry["amount_depleted"] == 0

        # Verify unchanged
        items = client.get("/api/inventory/items").json()
        rice_inv = next((i for i in items if "rice" in i["name"].lower()), None)
        assert rice_inv is not None
        assert rice_inv["quantity"] == 5.0

    def test_no_quantity_string_defaults(self, client, test_db):
        """Recipe ingredient with quantity=None → defaults to 1.0 (countable), depletes normally."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        recipe_resp = client.post("/api/recipes", json={
            "name": "Simple Soup", "instructions": "Cook.", "servings": 4,
        })
        recipe_id = recipe_resp.json()["id"]

        onion = find_or_create_ingredient(test_db, "onion")
        test_db.flush()

        # No quantity string — will default to 1.0
        ri = RecipeIngredient(recipe_id=recipe_id, ingredient_id=onion.id, quantity=None, unit="")
        test_db.add(ri)
        test_db.commit()

        client.post("/api/inventory/items", json={
            "name": "onion", "quantity": 5.0, "location": "pantry",
        })

        week_start = date.today() - timedelta(days=date.today().weekday())
        meal_resp = client.post("/api/meals", json={
            "date": str(week_start), "meal_type": "dinner", "recipe_id": recipe_id,
        })
        meal_id = meal_resp.json()["id"]

        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        onion_inv = next((i for i in items if "onion" in i["name"].lower()), None)
        assert onion_inv is not None
        assert onion_inv["quantity"] == 4.0  # 5 - 1 = 4


class TestDepletionServingScale:
    """Tests for Fix E: depletion scales by planned_servings / recipe.servings."""

    def test_double_servings_depletes_double(self, client, test_db):
        """Recipe: 4 servings, 2 cups flour. Plan: 8 servings. Inv: 5 → depletes 4, remaining 1."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            recipe_servings=4, planned_servings=8,
            inventory_qty=5.0, inventory_unit="cup",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        flour = next((i for i in items if "flour" in i["name"].lower()), None)
        assert flour is not None
        assert abs(flour["quantity"] - 1.0) < 0.01  # 5 - 4 = 1

    def test_half_servings_depletes_half(self, client, test_db):
        """Recipe: 4 servings, 2 cups flour. Plan: 2 servings. Inv: 5 → depletes 1, remaining 4."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            recipe_servings=4, planned_servings=2,
            inventory_qty=5.0, inventory_unit="cup",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        flour = next((i for i in items if "flour" in i["name"].lower()), None)
        assert flour is not None
        assert abs(flour["quantity"] - 4.0) < 0.01  # 5 - 1 = 4

    def test_default_servings_unchanged(self, client, test_db):
        """Recipe: 4 servings, 2 cups. Meal: planned=None (defaults to 4). Inv: 5 → depletes 2."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            recipe_servings=4, planned_servings=None,
            inventory_qty=5.0, inventory_unit="cup",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        flour = next((i for i in items if "flour" in i["name"].lower()), None)
        assert flour is not None
        assert abs(flour["quantity"] - 3.0) < 0.01  # 5 - 2 = 3

    def test_adjustment_overrides_scale(self, client, test_db):
        """User adjustment count_used=1 overrides scaled amount."""
        _, ing, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "flour", "2", "cup",
            recipe_servings=4, planned_servings=8,
            inventory_qty=5.0, inventory_unit="cup",
        )
        # Deplete with user adjustment
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}", json={
            "adjustments": [{"ingredient_id": ing.id, "count_used": 1.0}],
        })
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        flour = next((i for i in items if "flour" in i["name"].lower()), None)
        assert flour is not None
        assert abs(flour["quantity"] - 4.0) < 0.01  # 5 - 1 = 4 (override, not 5-4=1)


class TestAggregatedInventoryStocking:
    """Tests for Fix F: aggregated inventory across multiple locations."""

    def test_multi_location_aggregated_sufficient(self, client, test_db):
        """2 cups flour (pantry) + 1 cup flour (freezer) = 3. Recipe needs 2.5 → skipped."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Bread", "instructions": "Bake.", "servings": 4,
        })
        recipe_id = recipe_resp.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        test_db.add(RecipeIngredient(
            recipe_id=recipe_id, ingredient_id=flour.id, quantity="2.5", unit="cup",
        ))
        test_db.commit()

        # Add flour in two locations
        client.post("/api/inventory/items", json={
            "name": "flour", "quantity": 2.0, "unit": "cup", "location": "pantry",
        })
        client.post("/api/inventory/items", json={
            "name": "flour", "quantity": 1.0, "unit": "cup", "location": "freezer",
        })

        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={
            "date": str(week_start), "meal_type": "dinner", "recipe_id": recipe_id,
        })

        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] == 0  # 3 > 2.5

    def test_multi_location_insufficient(self, client, test_db):
        """1 cup flour (pantry) + 0.5 cup flour (freezer) = 1.5. Recipe needs 2 → added."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        recipe_resp = client.post("/api/recipes", json={
            "name": "Test Cake", "instructions": "Bake.", "servings": 4,
        })
        recipe_id = recipe_resp.json()["id"]

        flour = find_or_create_ingredient(test_db, "flour", "cup")
        test_db.flush()

        test_db.add(RecipeIngredient(
            recipe_id=recipe_id, ingredient_id=flour.id, quantity="2", unit="cup",
        ))
        test_db.commit()

        client.post("/api/inventory/items", json={
            "name": "flour", "quantity": 1.0, "unit": "cup", "location": "pantry",
        })
        client.post("/api/inventory/items", json={
            "name": "flour", "quantity": 0.5, "unit": "cup", "location": "freezer",
        })

        week_start = date.today() - timedelta(days=date.today().weekday())
        client.post("/api/meals", json={
            "date": str(week_start), "meal_type": "dinner", "recipe_id": recipe_id,
        })

        gen = client.post(f"/api/shopping-list/generate/{week_start}")
        assert gen.status_code == 201
        assert gen.json()["items_created"] >= 1  # 1.5 < 2


class TestDepletionUnitConversion:
    """Tests for Fix G: unit conversion in depletion before skipping."""

    def test_depletion_converts_tsp_to_tbsp(self, client, test_db):
        """Inv: 5 tbsp sugar. Recipe: 6 tsp (=2 tbsp). → depletes 2 tbsp, remaining 3."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "sugar", "6", "teaspoon",
            inventory_qty=5.0, inventory_unit="tablespoon",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        sugar = next((i for i in items if "sugar" in i["name"].lower()), None)
        assert sugar is not None
        assert abs(sugar["quantity"] - 3.0) < 0.01  # 5 - 2 = 3

    def test_depletion_cross_type_volume_to_weight(self, client, test_db):
        """Inv: 300g flour. Recipe: 1 cup (≈120g). → depletes ~120g, remaining ~180g."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "flour", "1", "cup",
            inventory_qty=300.0, inventory_unit="gram",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        items = client.get("/api/inventory/items").json()
        flour = next((i for i in items if "flour" in i["name"].lower()), None)
        assert flour is not None
        # 300g - ~120g = ~180g (flour: 120g per cup in COMMON_CONVERSIONS)
        assert 170 < flour["quantity"] < 190

    def test_depletion_truly_incompatible_skips(self, client, test_db):
        """Inv: 2 bags flour. Recipe: 1 cup. → skipped (bags not convertible)."""
        _, _, meal_id, _ = _setup_recipe_with_ingredient(
            client, test_db, "flour", "1", "cup",
            inventory_qty=2.0, inventory_unit="bag",
        )
        dep = client.post(f"/api/inventory/deplete-from-cooking/{meal_id}")
        assert dep.status_code == 200

        depleted = dep.json()["depleted"]
        flour_entry = next((d for d in depleted if "flour" in d["ingredient_name"].lower()), None)
        if flour_entry:
            assert flour_entry["status"] == "skipped"

        items = client.get("/api/inventory/items").json()
        flour = next((i for i in items if "flour" in i["name"].lower()), None)
        assert flour is not None
        assert flour["quantity"] == 2.0  # Unchanged

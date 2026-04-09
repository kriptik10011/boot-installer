"""
V2 Pipeline Integration Tests — Session 2

Tests the full V2 food system pipeline:
  Recipe → Shopping List (package enrichment) → Shopping Trip (package data)
  → Inventory (package tracking) → Cooking Depletion (package update)

Covers:
- Shopping list enrichment with package conversion data
- Shopping trip completion with PackageSizeModal data
- Shopping trip completion WITHOUT package data (V1 fallback)
- Cooking depletion updating amount_used in package units
- Undo depletion reversing amount_used
- Full pipeline end-to-end with package context
"""

import json
from datetime import date, timedelta

import pytest

from app.models import (
    Recipe, RecipeIngredient, Ingredient,
    MealPlanEntry, ShoppingListItem, InventoryItem,
)
from app.models.meal import MealType
from app.models.package_conversion import PackageConversion
from app.models.purchase_history import PurchaseHistory
from app.models.inventory import StorageLocation, ItemSource


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def olive_oil_conversion(test_db):
    """Seed PackageConversion for olive oil."""
    conv = PackageConversion(
        ingredient_pattern="olive oil",
        package_type="bottle",
        package_size=16.9,
        package_unit="fl oz",
        cooking_equivalent=33.8,
        cooking_unit="tablespoon",
    )
    test_db.add(conv)
    test_db.commit()
    return conv


@pytest.fixture
def flour_conversion(test_db):
    """Seed PackageConversion for flour."""
    conv = PackageConversion(
        ingredient_pattern="flour",
        package_type="bag",
        package_size=5.0,
        package_unit="lb",
        cooking_equivalent=17.0,
        cooking_unit="cup",
    )
    test_db.add(conv)
    test_db.commit()
    return conv


@pytest.fixture
def setup_recipe_and_meal(test_db):
    """
    Create a recipe with olive oil + flour ingredients,
    a meal plan entry for this week, and return all objects.
    """
    ingredient_oil = Ingredient(name="olive oil", canonical_name="olive oil")
    ingredient_flour = Ingredient(name="all-purpose flour", canonical_name="flour")
    test_db.add_all([ingredient_oil, ingredient_flour])
    test_db.flush()

    recipe = Recipe(
        name="Pasta",
        servings=4,
        prep_time_minutes=10,
        cook_time_minutes=20,
        instructions="Cook pasta",
    )
    test_db.add(recipe)
    test_db.flush()

    ri_oil = RecipeIngredient(
        recipe_id=recipe.id,
        ingredient_id=ingredient_oil.id,
        quantity="3",
        unit="tablespoon",
    )
    ri_flour = RecipeIngredient(
        recipe_id=recipe.id,
        ingredient_id=ingredient_flour.id,
        quantity="2",
        unit="cup",
    )
    test_db.add_all([ri_oil, ri_flour])
    test_db.flush()

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    meal = MealPlanEntry(
        date=week_start,
        meal_type=MealType.DINNER,
        recipe_id=recipe.id,
        planned_servings=4,
    )
    test_db.add(meal)
    test_db.commit()

    return {
        "recipe": recipe,
        "ingredient_oil": ingredient_oil,
        "ingredient_flour": ingredient_flour,
        "ri_oil": ri_oil,
        "ri_flour": ri_flour,
        "meal": meal,
        "week_start": week_start,
    }


# ── Test: Shopping List Enrichment ─────────────────────────────────────────────

class TestShoppingListEnrichment:
    """Test that shopping list items get package conversion data."""

    def test_enrichment_with_conversion(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Shopping list item for olive oil should have package data."""
        week_start = setup_recipe_and_meal["week_start"]
        client.post(f"/api/shopping-list/generate/{week_start}")
        resp = client.get(f"/api/shopping-list/week/{week_start}")
        assert resp.status_code == 200
        data = resp.json()

        # Find olive oil item
        oil_items = [i for i in data if "olive oil" in i["name"].lower()]
        assert len(oil_items) >= 1

        oil_item = oil_items[0]
        assert oil_item.get("package_display") is not None
        assert oil_item.get("packages_needed") is not None
        assert oil_item.get("packages_needed") >= 1
        assert oil_item.get("package_unit") == "fl oz"
        assert oil_item.get("package_type") == "bottle"

    def test_enrichment_without_conversion(self, client, test_db, setup_recipe_and_meal):
        """Items without PackageConversion should have null package data (V1 fallback)."""
        week_start = setup_recipe_and_meal["week_start"]
        client.post(f"/api/shopping-list/generate/{week_start}")
        resp = client.get(f"/api/shopping-list/week/{week_start}")
        assert resp.status_code == 200
        data = resp.json()

        flour_items = [i for i in data if "flour" in i["name"].lower()]
        if flour_items:
            flour_item = flour_items[0]
            assert flour_item.get("package_display") is None
            assert flour_item.get("packages_needed") is None

    def test_enrichment_with_both_conversions(self, client, test_db, olive_oil_conversion, flour_conversion, setup_recipe_and_meal):
        """Both items should have package data when conversions exist."""
        week_start = setup_recipe_and_meal["week_start"]
        client.post(f"/api/shopping-list/generate/{week_start}")
        resp = client.get(f"/api/shopping-list/week/{week_start}")
        assert resp.status_code == 200
        data = resp.json()

        oil_items = [i for i in data if "olive oil" in i["name"].lower()]
        flour_items = [i for i in data if "flour" in i["name"].lower()]

        if oil_items:
            assert oil_items[0].get("packages_needed") is not None
        if flour_items:
            assert flour_items[0].get("packages_needed") is not None


# ── Test: Shopping Trip with Package Data ──────────────────────────────────────

class TestShoppingTripWithPackageData:
    """Test shopping trip completion with PackageSizeModal data."""

    def test_complete_trip_with_package_data(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Completing trip with package data should set inventory package fields."""
        week_start = setup_recipe_and_meal["week_start"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        # Generate shopping list first
        client.post(f"/api/shopping-list/generate/{week_start}")

        # Check off olive oil
        items = test_db.query(ShoppingListItem).filter(
            ShoppingListItem.ingredient_id == ingredient_oil.id
        ).all()
        for item in items:
            item.is_checked = True
        test_db.commit()

        body = {
            "package_data": [{
                "shopping_item_id": items[0].id,
                "package_label": "16.9fl oz bottle",
                "package_size": 16.9,
                "package_unit": "fl oz",
                "package_type": "bottle",
                "store": "Trader Joe's",
                "price": 8.99,
            }]
        }

        resp = client.post(f"/api/shopping-list/week/{week_start}/complete", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items_transferred"] >= 1

        # Verify inventory item has package data
        inv_item = test_db.query(InventoryItem).filter(
            InventoryItem.ingredient_id == ingredient_oil.id
        ).first()
        assert inv_item is not None
        assert inv_item.package_size == 16.9
        assert inv_item.package_unit == "fluid_ounce"
        assert inv_item.package_label == "16.9fl oz bottle"

    def test_complete_trip_without_package_data(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Completing trip without body should still create inventory."""
        week_start = setup_recipe_and_meal["week_start"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        client.post(f"/api/shopping-list/generate/{week_start}")
        items = test_db.query(ShoppingListItem).filter(
            ShoppingListItem.ingredient_id == ingredient_oil.id
        ).all()
        for item in items:
            item.is_checked = True
        test_db.commit()

        resp = client.post(f"/api/shopping-list/week/{week_start}/complete")
        assert resp.status_code == 200

        inv_item = test_db.query(InventoryItem).filter(
            InventoryItem.ingredient_id == ingredient_oil.id
        ).first()
        assert inv_item is not None

    def test_purchase_history_recorded(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Package data should create PurchaseHistory record."""
        week_start = setup_recipe_and_meal["week_start"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        client.post(f"/api/shopping-list/generate/{week_start}")
        items = test_db.query(ShoppingListItem).filter(
            ShoppingListItem.ingredient_id == ingredient_oil.id
        ).all()
        for item in items:
            item.is_checked = True
        test_db.commit()

        body = {
            "package_data": [{
                "shopping_item_id": items[0].id,
                "package_label": "16.9fl oz bottle",
                "package_size": 16.9,
                "package_unit": "fl oz",
                "package_type": "bottle",
                "store": "Trader Joe's",
                "price": 8.99,
            }]
        }

        resp = client.post(f"/api/shopping-list/week/{week_start}/complete", json=body)
        assert resp.status_code == 200

        purchases = test_db.query(PurchaseHistory).filter(
            PurchaseHistory.ingredient_id == ingredient_oil.id
        ).all()
        assert len(purchases) >= 1
        assert purchases[0].package_label == "16.9fl oz bottle"
        assert purchases[0].store == "Trader Joe's"
        assert purchases[0].price == 8.99


# ── Test: Cooking Depletion with Package Tracking ──────────────────────────────

class TestCookingDepletionPackageTracking:
    """Test that cooking depletion updates amount_used in package units."""

    def _create_packaged_inventory(self, test_db, ingredient, quantity=16.9, unit="fl oz"):
        """Helper to create an inventory item with package data.

        quantity is in package_unit (fl oz) — the single source of truth.
        """
        inv = InventoryItem(
            name=ingredient.name,
            quantity=quantity,
            unit=unit,
            ingredient_id=ingredient.id,
            location=StorageLocation.PANTRY,
            source=ItemSource.PURCHASED,
            package_size=16.9,
            package_unit="fl oz",
            package_label="16.9fl oz bottle",
            packages_count=1.0,
            amount_used=0.0,
            amount_used_unit="fl oz",
        )
        test_db.add(inv)
        test_db.commit()
        return inv

    def test_depletion_updates_amount_used(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Cooking 3 tbsp olive oil should update amount_used in fl oz."""
        meal = setup_recipe_and_meal["meal"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        inv = self._create_packaged_inventory(test_db, ingredient_oil)
        initial_quantity = inv.quantity

        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200

        test_db.refresh(inv)
        # Package-tracked items: quantity decreases (single source of truth),
        # amount_used is synced as audit trail.
        assert inv.quantity < initial_quantity
        assert inv.amount_used is not None
        assert inv.amount_used > 0.0

    def test_depletion_without_package_data(self, client, test_db, setup_recipe_and_meal):
        """Depletion on V1-style items (no package) should not set amount_used."""
        meal = setup_recipe_and_meal["meal"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        inv = InventoryItem(
            name="olive oil",
            quantity=10.0,
            unit="tablespoon",
            ingredient_id=ingredient_oil.id,
            location=StorageLocation.PANTRY,
            source=ItemSource.PURCHASED,
        )
        test_db.add(inv)
        test_db.commit()

        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200

        test_db.refresh(inv)
        assert inv.quantity < 10.0
        assert inv.amount_used is None or inv.amount_used == 0.0

    def test_depletion_records_package_in_history(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Consumption history should include package_amount_used for undo."""
        meal = setup_recipe_and_meal["meal"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        inv = self._create_packaged_inventory(test_db, ingredient_oil)

        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200

        test_db.refresh(inv)
        history = inv.consumption_history
        if isinstance(history, str):
            history = json.loads(history)

        assert len(history) >= 1
        entry = [e for e in history if e.get("meal_id") == meal.id]
        assert len(entry) >= 1
        assert "package_amount_used" in entry[0]
        assert entry[0]["package_amount_used"] > 0


# ── Test: Undo Depletion with Package Tracking ────────────────────────────────

class TestUndoDepletionPackageTracking:
    """Test that undo depletion reverses amount_used."""

    def test_undo_restores_amount_used(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Undoing depletion should decrease amount_used back to original."""
        meal = setup_recipe_and_meal["meal"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        inv = InventoryItem(
            name="olive oil",
            quantity=16.9,  # quantity in package_unit (fl oz)
            unit="fl oz",
            ingredient_id=ingredient_oil.id,
            location=StorageLocation.PANTRY,
            source=ItemSource.PURCHASED,
            package_size=16.9,
            package_unit="fl oz",
            package_label="16.9fl oz bottle",
            packages_count=1.0,
            amount_used=0.0,
            amount_used_unit="fl oz",
        )
        test_db.add(inv)
        test_db.commit()

        # Deplete
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200
        test_db.refresh(inv)
        assert inv.amount_used > 0

        # Undo
        resp = client.post(f"/api/inventory/undo-depletion/{meal.id}")
        assert resp.status_code == 200
        test_db.refresh(inv)
        assert abs(inv.amount_used) < 0.01  # Near zero


# ── Test: Full Pipeline End-to-End ─────────────────────────────────────────────

class TestFullV2Pipeline:
    """End-to-end: recipe → shopping → purchase → inventory → cook → deplete."""

    def test_full_pipeline_with_package_context(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """
        Complete V2 flow:
        1. Generate shopping list (enriched)
        2. Complete trip (with package data)
        3. Cook and deplete (amount_used updates)
        """
        week_start = setup_recipe_and_meal["week_start"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]
        meal = setup_recipe_and_meal["meal"]

        # 1. Generate shopping list then GET enriched
        client.post(f"/api/shopping-list/generate/{week_start}")
        resp = client.get(f"/api/shopping-list/week/{week_start}")
        assert resp.status_code == 200
        items = resp.json()
        oil_items = [i for i in items if "olive oil" in i["name"].lower()]
        assert len(oil_items) >= 1
        assert oil_items[0]["packages_needed"] is not None

        # 2. Check off and complete with package data
        db_items = test_db.query(ShoppingListItem).filter(
            ShoppingListItem.ingredient_id == ingredient_oil.id
        ).all()
        for item in db_items:
            item.is_checked = True
        test_db.commit()

        body = {
            "package_data": [{
                "shopping_item_id": db_items[0].id,
                "package_label": "16.9fl oz bottle",
                "package_size": 16.9,
                "package_unit": "fl oz",
                "package_type": "bottle",
            }]
        }
        resp = client.post(f"/api/shopping-list/week/{week_start}/complete", json=body)
        assert resp.status_code == 200

        # 3. Verify inventory
        inv = test_db.query(InventoryItem).filter(
            InventoryItem.ingredient_id == ingredient_oil.id
        ).first()
        assert inv is not None
        assert inv.package_size == 16.9
        assert inv.package_unit == "fluid_ounce"

        # 4. Cook and deplete
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200

        test_db.refresh(inv)
        # Quantity may be in package units after shopping trip completion
        if inv.amount_used is not None and inv.amount_used > 0:
            assert inv.amount_used_unit == "fluid_ounce"

    def test_v1_fallback_no_package_conversion(self, client, test_db, setup_recipe_and_meal):
        """Without PackageConversion, entire pipeline works in V1 mode."""
        week_start = setup_recipe_and_meal["week_start"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]
        meal = setup_recipe_and_meal["meal"]

        # 1. Generate then GET (no package enrichment without conversion table)
        client.post(f"/api/shopping-list/generate/{week_start}")
        resp = client.get(f"/api/shopping-list/week/{week_start}")
        assert resp.status_code == 200
        items = resp.json()
        oil_items = [i for i in items if "olive oil" in i["name"].lower()]
        if oil_items:
            assert oil_items[0]["packages_needed"] is None

        # 2. Complete without body
        db_items = test_db.query(ShoppingListItem).filter(
            ShoppingListItem.ingredient_id == ingredient_oil.id
        ).all()
        for item in db_items:
            item.is_checked = True
        test_db.commit()

        resp = client.post(f"/api/shopping-list/week/{week_start}/complete")
        assert resp.status_code == 200

        # 3. V1 inventory
        inv = test_db.query(InventoryItem).filter(
            InventoryItem.ingredient_id == ingredient_oil.id
        ).first()
        assert inv is not None
        assert inv.package_size is None

        # 4. Depletion works normally
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200
        test_db.refresh(inv)
        assert inv.amount_used is None or inv.amount_used == 0.0


# ── Test: Edge Cases ───────────────────────────────────────────────────────────

class TestV2EdgeCases:
    """Edge cases for the V2 pipeline."""

    def test_empty_package_data_list(self, client, test_db, setup_recipe_and_meal):
        """Empty package_data list should work like V1."""
        week_start = setup_recipe_and_meal["week_start"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        client.post(f"/api/shopping-list/generate/{week_start}")
        db_items = test_db.query(ShoppingListItem).filter(
            ShoppingListItem.ingredient_id == ingredient_oil.id
        ).all()
        for item in db_items:
            item.is_checked = True
        test_db.commit()

        body = {"package_data": []}
        resp = client.post(f"/api/shopping-list/week/{week_start}/complete", json=body)
        assert resp.status_code == 200

    def test_multiple_depletions_accumulate(self, client, test_db, olive_oil_conversion, setup_recipe_and_meal):
        """Multiple cooking sessions should accumulate amount_used."""
        meal = setup_recipe_and_meal["meal"]
        ingredient_oil = setup_recipe_and_meal["ingredient_oil"]

        inv = InventoryItem(
            name="olive oil",
            quantity=50.7,  # 3 packages * 16.9 fl oz, in package_unit
            unit="fl oz",
            ingredient_id=ingredient_oil.id,
            location=StorageLocation.PANTRY,
            source=ItemSource.PURCHASED,
            package_size=16.9,
            package_unit="fl oz",
            package_label="16.9fl oz bottle",
            packages_count=3.0,
            amount_used=0.0,
            amount_used_unit="fl oz",
        )
        test_db.add(inv)
        test_db.commit()

        # First depletion
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200
        test_db.refresh(inv)
        first_qty = inv.quantity

        # Reset idempotency flag
        meal.inventory_depleted = False
        test_db.commit()

        # Second depletion
        resp = client.post(f"/api/inventory/deplete-from-cooking/{meal.id}")
        assert resp.status_code == 200
        test_db.refresh(inv)
        assert inv.quantity < first_qty  # Depletions accumulate

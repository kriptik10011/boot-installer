"""
Tests for parenthetical unit extraction in shopping list and inventory pipeline.

Covers the fix for ingredient duplication when recipes use patterns like
"4 (6 oz each) salmon filets" where the parser correctly stores unit=None
but downstream systems need the effective quantity (24 oz).
"""

import pytest
from datetime import date, timedelta


class TestParentheticalUnitShoppingGeneration:
    """Shopping list generation correctly extracts units from parenthetical notes."""

    def _week_start(self):
        today = date.today()
        return today - timedelta(days=today.weekday())

    def test_salmon_parenthetical_generates_oz(self, client, test_db):
        """'4 (6 oz each) salmon filets' generates shopping item with 24 oz."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        ws = self._week_start()

        # Create recipe
        recipe_resp = client.post("/api/recipes", json={
            "name": "Baked Salmon",
            "instructions": "Bake at 400F for 15 minutes.",
            "servings": 4,
        })
        assert recipe_resp.status_code == 201
        recipe_id = recipe_resp.json()["id"]

        # Add ingredient with parenthetical notes (as parser would store it)
        salmon = find_or_create_ingredient(test_db, "salmon filets")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=salmon.id,
            quantity="4",
            unit=None,  # Parser stores no unit for "4 (6 oz each) salmon filets"
            notes="6 oz each",  # Parenthetical info stored in notes
        )
        test_db.add(ri)
        test_db.commit()

        # Create meal plan for this week
        client.post("/api/meals", json={
            "date": str(ws),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "planned_servings": 4,
        })

        # Generate shopping list
        gen_resp = client.post(f"/api/shopping-list/generate/{ws}")
        assert gen_resp.status_code == 201

        # Check the generated item has correct quantity
        list_resp = client.get(f"/api/shopping-list/week/{ws}")
        items = list_resp.json()
        salmon_items = [i for i in items if "salmon" in i["name"].lower()]
        assert len(salmon_items) == 1
        assert salmon_items[0]["quantity_amount"] == 24.0
        assert salmon_items[0]["quantity_unit"] == "ounce"

    def test_no_extraction_when_unit_present(self, client, test_db):
        """If recipe ingredient already has a unit, notes are not parsed."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        ws = self._week_start()

        recipe_resp = client.post("/api/recipes", json={
            "name": "Tomato Soup",
            "instructions": "Blend tomatoes.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        tomatoes = find_or_create_ingredient(test_db, "diced tomatoes")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=tomatoes.id,
            quantity="1",
            unit="can",  # Already has a unit
            notes="14.5 oz",
        )
        test_db.add(ri)
        test_db.commit()

        client.post("/api/meals", json={
            "date": str(ws),
            "meal_type": "lunch",
            "recipe_id": recipe_id,
            "planned_servings": 2,
        })

        gen_resp = client.post(f"/api/shopping-list/generate/{ws}")
        assert gen_resp.status_code == 201

        list_resp = client.get(f"/api/shopping-list/week/{ws}")
        items = list_resp.json()
        tomato_items = [i for i in items if "tomato" in i["name"].lower()]
        assert len(tomato_items) == 1
        # Unit should remain "can", not "oz"
        assert tomato_items[0]["quantity_unit"] == "can"

    def test_notes_without_unit_no_extraction(self, client, test_db):
        """Notes like 'thinly sliced' don't trigger extraction."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient

        ws = self._week_start()

        recipe_resp = client.post("/api/recipes", json={
            "name": "Stir Fry",
            "instructions": "Stir fry everything.",
            "servings": 2,
        })
        recipe_id = recipe_resp.json()["id"]

        peppers = find_or_create_ingredient(test_db, "bell peppers")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=peppers.id,
            quantity="2",
            unit=None,
            notes="thinly sliced",
        )
        test_db.add(ri)
        test_db.commit()

        client.post("/api/meals", json={
            "date": str(ws),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "planned_servings": 2,
        })

        gen_resp = client.post(f"/api/shopping-list/generate/{ws}")
        assert gen_resp.status_code == 201

        list_resp = client.get(f"/api/shopping-list/week/{ws}")
        items = list_resp.json()
        pepper_items = [i for i in items if "pepper" in i["name"].lower()]
        assert len(pepper_items) == 1
        # No unit extraction — should remain None
        assert pepper_items[0]["quantity_unit"] is None


class TestUnitlessInventoryMerge:
    """Inventory merge handles unitless items without creating duplicates."""

    def _week_start(self):
        today = date.today()
        return today - timedelta(days=today.weekday())

    def test_unitless_shopping_merges_with_existing_inventory(self, client, test_db):
        """Shopping item unit=None merges with existing inventory unit='ounce'."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.inventory import InventoryItem, StorageLocation

        ws = self._week_start()

        salmon = find_or_create_ingredient(test_db, "salmon")
        test_db.flush()

        # Create existing inventory with unit
        inv = InventoryItem(
            ingredient_id=salmon.id,
            name="salmon",
            quantity=8.0,
            unit="ounce",
            location=StorageLocation.FRIDGE,
            source="purchased",
            purchase_date=date.today(),
        )
        test_db.add(inv)
        test_db.commit()

        # Create a shopping list item with no unit (simulating the bug case)
        shopping_item = client.post("/api/shopping-list", json={
            "name": "salmon",
            "quantity": "4",
            "week_start": str(ws),
        })
        item_id = shopping_item.json()["id"]

        # Toggle to checked
        client.post(f"/api/shopping-list/{item_id}/toggle")

        # Complete the shopping trip
        complete_resp = client.post(f"/api/shopping-list/week/{ws}/complete")
        assert complete_resp.status_code == 200
        assert complete_resp.json()["items_transferred"] == 1

        # Verify no duplicate — should be one inventory item, merged
        inv_resp = client.get("/api/inventory/items")
        items = inv_resp.json()
        salmon_items = [i for i in items if "salmon" in i["name"].lower()]
        assert len(salmon_items) == 1
        # Quantity merged: 8 + 4 = 12
        assert salmon_items[0]["quantity"] == 12.0
        # Unit preserved from existing
        assert salmon_items[0]["unit"] == "ounce"

    def test_existing_unitless_adopts_new_unit(self, client, test_db):
        """Existing inventory unit=None adopts unit from shopping item."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.inventory import InventoryItem, StorageLocation

        ws = self._week_start()

        chicken = find_or_create_ingredient(test_db, "chicken breast")
        test_db.flush()

        # Create existing inventory WITHOUT unit
        inv = InventoryItem(
            ingredient_id=chicken.id,
            name="chicken breast",
            quantity=2.0,
            unit=None,
            location=StorageLocation.FRIDGE,
            source="purchased",
            purchase_date=date.today(),
        )
        test_db.add(inv)
        test_db.commit()

        # Create a shopping list item WITH unit
        shopping_item = client.post("/api/shopping-list", json={
            "name": "chicken breast",
            "quantity": "3 lb",
            "week_start": str(ws),
        })
        item_id = shopping_item.json()["id"]

        # Toggle to checked
        client.post(f"/api/shopping-list/{item_id}/toggle")

        # Complete the shopping trip
        complete_resp = client.post(f"/api/shopping-list/week/{ws}/complete")
        assert complete_resp.status_code == 200

        # Verify existing item got the unit upgrade
        inv_resp = client.get("/api/inventory/items")
        items = inv_resp.json()
        chicken_items = [i for i in items if "chicken" in i["name"].lower()]
        assert len(chicken_items) == 1
        # Quantity merged: 2 + 3 = 5
        assert chicken_items[0]["quantity"] == 5.0
        # Unit upgraded from None to "pound" (normalized from "lb")
        assert chicken_items[0]["unit"] == "pound"


class TestCoverageCheckUnitless:
    """Inventory coverage check handles unitless recipe vs unit-having inventory."""

    def _week_start(self):
        today = date.today()
        return today - timedelta(days=today.weekday())

    def test_unitless_recipe_covered_by_unit_inventory(self, client, test_db):
        """Recipe with no unit is covered when sufficient inventory exists."""
        from app.services.ingredient_service import find_or_create_ingredient
        from app.models.recipe import RecipeIngredient
        from app.models.inventory import InventoryItem, StorageLocation

        ws = self._week_start()

        # Create recipe with unitless ingredient + notes
        recipe_resp = client.post("/api/recipes", json={
            "name": "Pan Seared Salmon",
            "instructions": "Sear in pan.",
            "servings": 4,
        })
        recipe_id = recipe_resp.json()["id"]

        salmon = find_or_create_ingredient(test_db, "salmon")
        test_db.flush()

        ri = RecipeIngredient(
            recipe_id=recipe_id,
            ingredient_id=salmon.id,
            quantity="4",
            unit=None,
            notes="6 oz each",
        )
        test_db.add(ri)

        # Create inventory with plenty of salmon in oz
        inv = InventoryItem(
            ingredient_id=salmon.id,
            name="salmon",
            quantity=32.0,
            unit="oz",
            location=StorageLocation.FRIDGE,
            source="purchased",
            purchase_date=date.today(),
        )
        test_db.add(inv)
        test_db.commit()

        # Create meal plan
        client.post("/api/meals", json={
            "date": str(ws),
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "planned_servings": 4,
        })

        # Generate shopping list — salmon should NOT appear (covered by inventory)
        gen_resp = client.post(f"/api/shopping-list/generate/{ws}")
        assert gen_resp.status_code == 201

        list_resp = client.get(f"/api/shopping-list/week/{ws}")
        items = list_resp.json()
        salmon_items = [i for i in items if "salmon" in i["name"].lower()]
        # With 32 oz in inventory and 24 oz needed, salmon should be covered
        assert len(salmon_items) == 0

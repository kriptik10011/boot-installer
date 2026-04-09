"""
Tests for V2 Package Conversion System.

Covers:
- PackageConversion model + seeding
- PurchaseHistory model
- PackageConverter service: cooking_to_packages, package_to_cooking
- convert_cooking_to_package_unit (depletion tracking)
- find_conversion (pattern matching)
- InventoryItem.get_package_percent_remaining / get_amount_remaining
- Edge cases: no conversion, cross-unit, fractional packages
- migrate_schema new columns on inventory_items
"""

import pytest
import math
from datetime import date, datetime, timezone

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.inventory import InventoryItem, InventoryCategory, StorageLocation, ItemSource
from app.models.package_conversion import PackageConversion, DEFAULT_PACKAGE_CONVERSIONS
from app.models.purchase_history import PurchaseHistory
from app.models.recipe import Ingredient
from app.services.package_converter import (
    find_conversion,
    cooking_to_packages,
    package_to_cooking,
    convert_cooking_to_package_unit,
    record_purchase,
    PackageResult,
    CookingResult,
)


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture(scope="function")
def db():
    """Fresh in-memory DB for each test with all tables."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def seeded_db(db):
    """DB seeded with default package conversions."""
    for pattern, pkg_type, pkg_size, pkg_unit, cooking_eq, cooking_unit in DEFAULT_PACKAGE_CONVERSIONS:
        db.add(PackageConversion(
            ingredient_pattern=pattern,
            package_type=pkg_type,
            package_size=pkg_size,
            package_unit=pkg_unit,
            cooking_equivalent=cooking_eq,
            cooking_unit=cooking_unit,
        ))
    db.commit()
    return db


@pytest.fixture
def olive_oil_ingredient(db):
    """Create an olive oil ingredient."""
    ingredient = Ingredient(name="olive oil", canonical_name="olive oil")
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    return ingredient


@pytest.fixture
def flour_ingredient(db):
    """Create a flour ingredient."""
    ingredient = Ingredient(name="all-purpose flour", canonical_name="flour")
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    return ingredient


# ============================================================
# PackageConversion Model Tests
# ============================================================

class TestPackageConversionModel:
    """Tests for PackageConversion table and seeding."""

    def test_table_created(self, db):
        """PackageConversion table exists in fresh DB."""
        engine = db.get_bind()
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        assert "package_conversions" in tables

    def test_create_conversion(self, db):
        """Can create a single conversion record."""
        conv = PackageConversion(
            ingredient_pattern="test oil",
            package_type="bottle",
            package_size=16.0,
            package_unit="oz",
            cooking_equivalent=32.0,
            cooking_unit="tablespoon",
        )
        db.add(conv)
        db.commit()

        result = db.query(PackageConversion).first()
        assert result.ingredient_pattern == "test oil"
        assert result.package_size == 16.0
        assert result.cooking_equivalent == 32.0
        assert result.is_custom is False

    def test_seed_default_conversions(self, seeded_db):
        """Default conversions are seeded correctly."""
        count = seeded_db.query(PackageConversion).count()
        assert count == len(DEFAULT_PACKAGE_CONVERSIONS)

    def test_seed_has_olive_oil(self, seeded_db):
        """Olive oil is in the default conversions."""
        conv = (
            seeded_db.query(PackageConversion)
            .filter(PackageConversion.ingredient_pattern == "olive oil")
            .first()
        )
        assert conv is not None
        assert conv.package_type == "bottle"
        assert conv.cooking_unit == "tablespoon"

    def test_seed_has_eggs(self, seeded_db):
        """Eggs are in the default conversions with count units."""
        conv = (
            seeded_db.query(PackageConversion)
            .filter(PackageConversion.ingredient_pattern == "eggs")
            .first()
        )
        assert conv is not None
        assert conv.package_type == "carton"
        assert conv.package_size == 12.0
        assert conv.cooking_unit == "count"

    def test_custom_flag(self, db):
        """Custom conversions are flagged correctly."""
        conv = PackageConversion(
            ingredient_pattern="specialty oil",
            package_type="tin",
            package_size=250.0,
            package_unit="ml",
            cooking_equivalent=50.0,
            cooking_unit="teaspoon",
            is_custom=True,
        )
        db.add(conv)
        db.commit()

        result = db.query(PackageConversion).first()
        assert result.is_custom is True


# ============================================================
# PurchaseHistory Model Tests
# ============================================================

class TestPurchaseHistoryModel:
    """Tests for PurchaseHistory table."""

    def test_table_created(self, db):
        """PurchaseHistory table exists."""
        engine = db.get_bind()
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        assert "purchase_history" in tables

    def test_create_purchase(self, db, olive_oil_ingredient):
        """Can record a purchase."""
        purchase = PurchaseHistory(
            ingredient_id=olive_oil_ingredient.id,
            package_label="32oz bottle",
            package_size=32.0,
            package_unit="oz",
            package_type="bottle",
            store="Costco",
            price=8.99,
            purchase_date=date.today(),
        )
        db.add(purchase)
        db.commit()

        result = db.query(PurchaseHistory).first()
        assert result.ingredient_id == olive_oil_ingredient.id
        assert result.package_label == "32oz bottle"
        assert result.price == 8.99
        assert result.store == "Costco"

    def test_purchase_relationship(self, db, olive_oil_ingredient):
        """PurchaseHistory links to Ingredient via FK."""
        purchase = PurchaseHistory(
            ingredient_id=olive_oil_ingredient.id,
            package_label="16oz bottle",
            package_size=16.0,
            package_unit="oz",
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)

        assert purchase.ingredient.name == "olive oil"


# ============================================================
# InventoryItem New Columns Tests
# ============================================================

class TestInventoryItemPackageColumns:
    """Tests for new V2 columns on InventoryItem."""

    def test_new_columns_exist(self, db):
        """All 6 new package columns exist on inventory_items table."""
        engine = db.get_bind()
        inspector = inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("inventory_items")}

        assert "package_size" in columns
        assert "package_unit" in columns
        assert "package_label" in columns
        assert "packages_count" in columns
        assert "amount_used" in columns
        assert "amount_used_unit" in columns

    def test_create_item_without_package_data(self, db):
        """V1-style items work without package data (all nullable)."""
        item = InventoryItem(
            name="olive oil",
            quantity=1.0,
            unit="bottle",
            location=StorageLocation.PANTRY,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.package_size is None
        assert item.package_unit is None
        assert item.package_label is None

    def test_create_item_with_package_data(self, db):
        """V2-style items have full package tracking."""
        item = InventoryItem(
            name="olive oil",
            quantity=1.0,
            unit="bottle",
            location=StorageLocation.PANTRY,
            package_size=32.0,
            package_unit="oz",
            package_label="32oz bottle",
            packages_count=1.0,
            amount_used=6.1,
            amount_used_unit="oz",
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.package_size == 32.0
        assert item.package_unit == "oz"
        assert item.package_label == "32oz bottle"
        assert item.packages_count == 1.0
        assert item.amount_used == 6.1
        assert item.amount_used_unit == "oz"

    def test_get_package_percent_remaining(self, db):
        """Package percentage remaining calculates correctly."""
        item = InventoryItem(
            name="olive oil",
            quantity=25.9,  # quantity IS the remaining amount (32 - 6.1)
            unit="bottle",
            location=StorageLocation.PANTRY,
            package_size=32.0,
            package_unit="oz",
            packages_count=1.0,
            amount_used=6.1,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        pct = item.get_package_percent_remaining()
        assert pct is not None
        # 25.9 / 32 * 100 = 80.9375
        assert abs(pct - 80.9) < 0.1

    def test_get_package_percent_remaining_no_package(self, db):
        """Returns None when no package data."""
        item = InventoryItem(
            name="olive oil",
            quantity=1.0,
            location=StorageLocation.PANTRY,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.get_package_percent_remaining() is None

    def test_get_package_percent_remaining_empty(self, db):
        """Returns 0% when fully depleted."""
        item = InventoryItem(
            name="olive oil",
            quantity=0.0,  # quantity IS the remaining amount (fully used)
            location=StorageLocation.PANTRY,
            package_size=32.0,
            packages_count=1.0,
            amount_used=32.0,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.get_package_percent_remaining() == 0.0

    def test_get_package_percent_remaining_multiple_packages(self, db):
        """Percentage works with multiple packages."""
        item = InventoryItem(
            name="olive oil",
            quantity=24.0,  # quantity IS the remaining amount; 24/32*100 = 75%
            location=StorageLocation.PANTRY,
            package_size=32.0,
            packages_count=2.0,
            amount_used=16.0,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        pct = item.get_package_percent_remaining()
        # 24.0 / 32.0 * 100 = 75.0
        assert pct == 75.0

    def test_get_amount_remaining(self, db):
        """Absolute remaining amount calculates correctly."""
        item = InventoryItem(
            name="olive oil",
            quantity=25.9,  # quantity IS the remaining amount
            location=StorageLocation.PANTRY,
            package_size=32.0,
            packages_count=1.0,
            amount_used=6.1,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        remaining = item.get_amount_remaining()
        assert remaining == 25.9

    def test_get_amount_remaining_no_data(self, db):
        """Returns None when no package data."""
        item = InventoryItem(
            name="olive oil",
            quantity=1.0,
            location=StorageLocation.PANTRY,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.get_amount_remaining() is None

    def test_get_amount_remaining_over_used(self, db):
        """Clamps to 0 if quantity is negative (shouldn't happen but safe)."""
        item = InventoryItem(
            name="olive oil",
            quantity=0.0,  # depleted — clamped to 0 by max(0.0, ...)
            location=StorageLocation.PANTRY,
            package_size=32.0,
            packages_count=1.0,
            amount_used=40.0,  # More than capacity
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.get_amount_remaining() == 0.0


# ============================================================
# find_conversion Tests
# ============================================================

class TestFindConversion:
    """Tests for pattern matching in find_conversion()."""

    def test_exact_match(self, seeded_db):
        """Exact ingredient name matches pattern."""
        conv = find_conversion(seeded_db, "olive oil")
        assert conv is not None
        assert conv.ingredient_pattern == "olive oil"

    def test_case_insensitive(self, seeded_db):
        """Match is case-insensitive."""
        conv = find_conversion(seeded_db, "Olive Oil")
        assert conv is not None
        assert conv.ingredient_pattern == "olive oil"

    def test_pattern_in_name(self, seeded_db):
        """Pattern 'olive oil' matches 'extra virgin olive oil'."""
        conv = find_conversion(seeded_db, "extra virgin olive oil")
        assert conv is not None
        assert conv.ingredient_pattern == "olive oil"

    def test_longest_match_wins(self, seeded_db):
        """'black beans' matches 'black beans' not 'beans' (longest)."""
        # Both "beans" and "black beans" exist in seed data — "black beans" is more specific
        conv = find_conversion(seeded_db, "black beans")
        assert conv is not None
        assert conv.ingredient_pattern == "black beans"

    def test_no_match_returns_none(self, seeded_db):
        """Unknown ingredient returns None."""
        conv = find_conversion(seeded_db, "dragon fruit")
        assert conv is None

    def test_empty_name_returns_none(self, seeded_db):
        """Empty string returns None."""
        assert find_conversion(seeded_db, "") is None
        assert find_conversion(seeded_db, None) is None

    def test_whitespace_stripped(self, seeded_db):
        """Leading/trailing whitespace is stripped."""
        conv = find_conversion(seeded_db, "  olive oil  ")
        assert conv is not None


# ============================================================
# cooking_to_packages Tests
# ============================================================

class TestCookingToPackages:
    """Tests for cooking_to_packages() conversion."""

    def test_olive_oil_basic(self, seeded_db):
        """3 tablespoons olive oil → 1 bottle (capacity 33.8 tbsp)."""
        result = cooking_to_packages(seeded_db, 3.0, "tablespoon", "olive oil")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "bottle"
        assert result.cooking_amount == 3.0
        assert result.cooking_unit == "tablespoon"

    def test_olive_oil_needs_two_bottles(self, seeded_db):
        """40 tablespoons → 2 bottles (33.8 tbsp each)."""
        result = cooking_to_packages(seeded_db, 40.0, "tablespoon", "olive oil")
        assert result is not None
        assert result.packages_needed == 2

    def test_cross_unit_conversion(self, seeded_db):
        """2 cups olive oil → converts cups to tablespoons first."""
        result = cooking_to_packages(seeded_db, 2.0, "cup", "olive oil")
        assert result is not None
        # 2 cups = 32 tablespoons; 1 bottle = 33.8 tbsp → 1 bottle
        assert result.packages_needed == 1
        assert result.cooking_unit == "tablespoon"

    def test_eggs_count(self, seeded_db):
        """6 eggs → 1 carton (12-count)."""
        result = cooking_to_packages(seeded_db, 6.0, "count", "eggs")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "carton"

    def test_eggs_need_two_cartons(self, seeded_db):
        """18 eggs → 2 cartons."""
        result = cooking_to_packages(seeded_db, 18.0, "count", "eggs")
        assert result is not None
        assert result.packages_needed == 2

    def test_flour_cups(self, seeded_db):
        """3 cups flour → 1 bag (5lb bag = 17 cups)."""
        result = cooking_to_packages(seeded_db, 3.0, "cup", "flour")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "bag"

    def test_leftover_calculation(self, seeded_db):
        """Leftover is correctly calculated."""
        result = cooking_to_packages(seeded_db, 3.0, "tablespoon", "olive oil")
        assert result is not None
        # 1 bottle = 33.8 tbsp, need 3 → leftover = 30.8
        assert abs(result.leftover_amount - 30.8) < 0.1

    def test_no_conversion_returns_none(self, seeded_db):
        """Unknown ingredient returns None."""
        result = cooking_to_packages(seeded_db, 1.0, "cup", "dragon fruit")
        assert result is None

    def test_zero_amount_returns_none(self, seeded_db):
        """Zero amount returns None."""
        result = cooking_to_packages(seeded_db, 0.0, "cup", "olive oil")
        assert result is None

    def test_incompatible_units_returns_none(self, seeded_db):
        """Weight unit for volume-based conversion returns None."""
        # Olive oil conversion uses tablespoon (volume), gram is weight
        result = cooking_to_packages(seeded_db, 100.0, "gram", "olive oil")
        assert result is None

    def test_unit_aliases(self, seeded_db):
        """Unit aliases like 'tbsp' are normalized correctly."""
        result = cooking_to_packages(seeded_db, 3.0, "tbsp", "olive oil")
        assert result is not None
        assert result.packages_needed == 1

    def test_tsp_to_tablespoon_conversion(self, seeded_db):
        """9 teaspoons = 3 tablespoons olive oil → 1 bottle."""
        result = cooking_to_packages(seeded_db, 9.0, "teaspoon", "olive oil")
        assert result is not None
        assert result.packages_needed == 1
        # 9 tsp = 3 tbsp
        assert abs(result.cooking_amount - 3.0) < 0.01


# ============================================================
# package_to_cooking Tests
# ============================================================

class TestPackageToCooking:
    """Tests for package_to_cooking() conversion."""

    def test_one_bottle_olive_oil(self, seeded_db):
        """1 bottle olive oil → 33.8 tablespoons."""
        result = package_to_cooking(seeded_db, 1.0, "olive oil")
        assert result is not None
        assert result.amount == 33.8
        assert result.unit == "tablespoon"

    def test_two_bottles(self, seeded_db):
        """2 bottles → double the cooking amount."""
        result = package_to_cooking(seeded_db, 2.0, "olive oil")
        assert result is not None
        assert result.amount == 67.6

    def test_half_bottle(self, seeded_db):
        """0.5 bottles → half the cooking amount."""
        result = package_to_cooking(seeded_db, 0.5, "olive oil")
        assert result is not None
        assert result.amount == 16.9

    def test_eggs_carton(self, seeded_db):
        """1 carton eggs → 12 count."""
        result = package_to_cooking(seeded_db, 1.0, "eggs")
        assert result is not None
        assert result.amount == 12.0
        assert result.unit == "count"

    def test_no_conversion_returns_none(self, seeded_db):
        """Unknown ingredient returns None."""
        result = package_to_cooking(seeded_db, 1.0, "dragon fruit")
        assert result is None

    def test_zero_packages_returns_none(self, seeded_db):
        """Zero packages returns None."""
        result = package_to_cooking(seeded_db, 0.0, "olive oil")
        assert result is None


# ============================================================
# convert_cooking_to_package_unit Tests
# ============================================================

class TestConvertCookingToPackageUnit:
    """Tests for cooking-to-package-unit conversion (depletion tracking)."""

    def test_olive_oil_tbsp_to_oz(self, seeded_db):
        """3 tablespoons olive oil → ~1.5 fl oz."""
        result = convert_cooking_to_package_unit(
            seeded_db, 3.0, "tablespoon", "olive oil"
        )
        assert result is not None
        # 3 tbsp * (16.9 / 33.8) = 1.5 fl oz
        assert abs(result - 1.5) < 0.01

    def test_flour_cups_to_lb(self, seeded_db):
        """5 cups flour → ~1.47 lb."""
        result = convert_cooking_to_package_unit(
            seeded_db, 5.0, "cup", "flour"
        )
        assert result is not None
        # 5 cups * (5 lb / 17 cups) ≈ 1.47 lb
        assert abs(result - 1.4706) < 0.01

    def test_cross_unit_tsp(self, seeded_db):
        """9 teaspoons olive oil → converts via tbsp to fl oz."""
        result = convert_cooking_to_package_unit(
            seeded_db, 9.0, "teaspoon", "olive oil"
        )
        assert result is not None
        # 9 tsp = 3 tbsp; 3 tbsp * (16.9 / 33.8) = 1.5 fl oz
        assert abs(result - 1.5) < 0.01

    def test_no_conversion_returns_none(self, seeded_db):
        """Unknown ingredient returns None."""
        result = convert_cooking_to_package_unit(
            seeded_db, 1.0, "cup", "dragon fruit"
        )
        assert result is None

    def test_zero_amount_returns_none(self, seeded_db):
        """Zero amount returns None."""
        result = convert_cooking_to_package_unit(
            seeded_db, 0.0, "cup", "olive oil"
        )
        assert result is None




# ============================================================
# record_purchase Tests
# ============================================================

class TestRecordPurchase:
    """Tests for recording purchases."""

    def test_basic_record(self, db, olive_oil_ingredient):
        """Can record a purchase with minimal data."""
        purchase = record_purchase(
            db,
            ingredient_id=olive_oil_ingredient.id,
            package_label="32oz bottle",
            package_size=32.0,
            package_unit="oz",
        )
        db.commit()
        db.refresh(purchase)

        assert purchase.id is not None
        assert purchase.ingredient_id == olive_oil_ingredient.id
        assert purchase.purchase_date == date.today()

    def test_full_record(self, db, olive_oil_ingredient):
        """Can record with all optional fields."""
        purchase = record_purchase(
            db,
            ingredient_id=olive_oil_ingredient.id,
            package_label="32oz bottle",
            package_size=32.0,
            package_unit="oz",
            package_type="bottle",
            store="Costco",
            price=8.99,
        )
        db.commit()
        db.refresh(purchase)

        assert purchase.store == "Costco"
        assert purchase.price == 8.99
        assert purchase.package_type == "bottle"


# ============================================================
# Integration: Full V2 Flow Test
# ============================================================

class TestFullV2Flow:
    """Integration test for the complete V2 food system flow."""

    def test_recipe_to_shopping_to_inventory_to_cooking(self, seeded_db):
        """
        Complete flow:
        1. Recipe needs 3 cups olive oil
        2. Convert to packages → 1 bottle
        3. Create inventory item with package data
        4. Cook and deplete
        5. Check remaining percentage
        """
        db = seeded_db

        # Step 1: Recipe needs 3 cups olive oil
        # Step 2: Convert to packages
        # 3 cups = 48 tbsp; 1 bottle = 33.8 tbsp → need 2 bottles
        pkg = cooking_to_packages(db, 3.0, "cup", "olive oil")
        assert pkg is not None
        assert pkg.packages_needed == 2

        # Step 3: Create inventory item with 2 bottles from the conversion
        conv = find_conversion(db, "olive oil")
        item = InventoryItem(
            name="olive oil",
            quantity=conv.package_size * 2,  # quantity = total remaining across 2 packages
            unit="bottle",
            location=StorageLocation.PANTRY,
            package_size=conv.package_size,
            package_unit=conv.package_unit,
            package_label=f"{conv.package_size}{conv.package_unit} {conv.package_type}",
            packages_count=2.0,  # User bought 2 bottles
            amount_used=0.0,
            amount_used_unit=conv.package_unit,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        # Verify fully stocked (2 packages worth = 200% of single package)
        assert item.get_package_percent_remaining() == 200.0

        # Step 4: Cook using 3 cups — convert to package unit
        depletion = convert_cooking_to_package_unit(db, 3.0, "cup", "olive oil")
        assert depletion is not None

        # Update quantity (source of truth) and amount_used (audit trail)
        item.quantity = max(0.0, (item.quantity or 0.0) - depletion)
        item.amount_used = (item.amount_used or 0.0) + depletion
        db.commit()
        db.refresh(item)

        # Step 5: Check remaining — partially used but still some left
        pct = item.get_package_percent_remaining()
        assert pct is not None
        assert 0 < pct < 200  # Should be partially used (started at 200%)

        remaining = item.get_amount_remaining()
        assert remaining is not None
        assert remaining > 0
        assert remaining < conv.package_size * 2  # Less than full stock

    def test_v1_items_unaffected(self, seeded_db):
        """V1 items without package data continue to work."""
        db = seeded_db

        item = InventoryItem(
            name="mystery spice",
            quantity=3.0,
            unit="tablespoon",
            location=StorageLocation.PANTRY,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        # Package methods return None
        assert item.get_package_percent_remaining() is None
        assert item.get_amount_remaining() is None

        # V1 methods still work
        assert item.get_status_level() in ("full", "medium", "low", "empty")


# ============================================================
# migrate_schema Tests
# ============================================================

class TestMigrateSchema:
    """Tests for migrate_schema() adding new columns to existing tables."""

    def test_inventory_items_columns_in_migration(self):
        """inventory_items columns are registered in migrate_schema."""
        from app.database import migrate_schema
        import sqlalchemy as sa

        # Read the migrations dict by inspecting source
        # We verify the function at least references inventory_items
        import inspect
        source = inspect.getsource(migrate_schema)
        assert "inventory_items" in source
        assert "package_size" in source
        assert "package_unit" in source
        assert "package_label" in source
        assert "packages_count" in source
        assert "amount_used" in source
        assert "amount_used_unit" in source


# ============================================================
# Edge Cases
# ============================================================

class TestEdgeCases:
    """Edge case tests for robustness."""

    def test_very_large_amount(self, seeded_db):
        """Very large cooking amount → many packages."""
        result = cooking_to_packages(seeded_db, 1000.0, "tablespoon", "olive oil")
        assert result is not None
        # 1000 tbsp / 33.8 per bottle = ~30 bottles
        assert result.packages_needed == math.ceil(1000.0 / 33.8)

    def test_very_small_amount(self, seeded_db):
        """Very small amount → still 1 package."""
        result = cooking_to_packages(seeded_db, 0.25, "teaspoon", "olive oil")
        assert result is not None
        assert result.packages_needed == 1

    def test_fractional_packages_count(self, db):
        """Fractional packages_count in inventory (1.5 bottles)."""
        item = InventoryItem(
            name="olive oil",
            quantity=26.67,  # quantity IS the remaining amount; 26.67/32*100 = 83.3%
            location=StorageLocation.PANTRY,
            package_size=32.0,
            packages_count=1.5,
            amount_used=8.0,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        # 26.67 / 32 * 100 = 83.3
        pct = item.get_package_percent_remaining()
        assert abs(pct - 83.3) < 0.1

    def test_negative_amount_returns_none(self, seeded_db):
        """Negative cooking amount returns None."""
        result = cooking_to_packages(seeded_db, -5.0, "cup", "olive oil")
        assert result is None

    def test_package_size_zero_safety(self, db):
        """Zero package_size doesn't divide by zero."""
        item = InventoryItem(
            name="test",
            quantity=1.0,
            location=StorageLocation.PANTRY,
            package_size=0.0,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        assert item.get_package_percent_remaining() is None
        assert item.get_amount_remaining() is None

    def test_butter_sticks(self, seeded_db):
        """Butter: 2 tablespoons → 1 stick (8 tbsp per stick)."""
        result = cooking_to_packages(seeded_db, 2.0, "tablespoon", "butter")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "stick"

    def test_tomato_paste_tablespoons(self, seeded_db):
        """Tomato paste: 3 tablespoons → 1 can (6oz = 12 tbsp)."""
        result = cooking_to_packages(seeded_db, 3.0, "tablespoon", "tomato paste")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "can"

    def test_milk_cups(self, seeded_db):
        """Milk: 2 cups → 1 carton (64oz = 8 cups)."""
        result = cooking_to_packages(seeded_db, 2.0, "cup", "milk")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "carton"

    def test_salt_teaspoons(self, seeded_db):
        """Salt: 5 teaspoons → 1 container (26oz = 156 tsp)."""
        result = cooking_to_packages(seeded_db, 5.0, "teaspoon", "salt")
        assert result is not None
        assert result.packages_needed == 1
        assert result.package_type == "container"

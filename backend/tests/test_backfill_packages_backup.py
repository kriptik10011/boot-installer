"""
Regression tests for backfill_unified_columns() packages_backup calculation.

Covers the fix for packages_count=0 (Python falsy edge case) where
`(pc if pc and pc > 0 else 1)` incorrectly treated 0 like None.
"""

import pytest
from app.models.inventory import InventoryItem, StorageLocation


class TestPackagesBackupBackfill:
    """Test packages_backup calculation during backfill."""

    def _create_item(self, test_db, name: str, packages_count, unit: str = "count"):
        """Helper: create an inventory item with given packages_count and no unit_type (needs backfill)."""
        item = InventoryItem(
            name=name,
            quantity=1.0,
            unit=unit,
            location=StorageLocation.PANTRY,
            packages_count=packages_count,
            unit_type=None,  # ensures backfill picks it up
        )
        test_db.add(item)
        test_db.commit()
        test_db.refresh(item)
        return item

    def test_packages_count_none_gives_zero_backup(self, test_db):
        """packages_count=None -> packages_backup=0 (no packages at all)."""
        from app.services.inventory_service import backfill_unified_columns

        item = self._create_item(test_db, "Milk (None)", packages_count=None)
        backfill_unified_columns(test_db)
        test_db.refresh(item)

        assert item.packages_backup == 0

    def test_packages_count_zero_gives_zero_backup(self, test_db):
        """packages_count=0 -> packages_backup=0 (the falsy bug regression)."""
        from app.services.inventory_service import backfill_unified_columns

        item = self._create_item(test_db, "Eggs (zero)", packages_count=0)
        backfill_unified_columns(test_db)
        test_db.refresh(item)

        assert item.packages_backup == 0

    def test_packages_count_one_gives_zero_backup(self, test_db):
        """packages_count=1 -> packages_backup=0 (1 open package, no backup)."""
        from app.services.inventory_service import backfill_unified_columns

        item = self._create_item(test_db, "Rice (one)", packages_count=1)
        backfill_unified_columns(test_db)
        test_db.refresh(item)

        assert item.packages_backup == 0

    def test_packages_count_three_gives_two_backup(self, test_db):
        """packages_count=3 -> packages_backup=2 (1 open + 2 backup)."""
        from app.services.inventory_service import backfill_unified_columns

        item = self._create_item(test_db, "Flour (three)", packages_count=3)
        backfill_unified_columns(test_db)
        test_db.refresh(item)

        assert item.packages_backup == 2

    def test_backfill_idempotent_skips_already_processed(self, test_db):
        """Items with unit_type already set are skipped (idempotent)."""
        from app.services.inventory_service import backfill_unified_columns

        item = self._create_item(test_db, "Already Done", packages_count=5)
        backfill_unified_columns(test_db)
        test_db.refresh(item)
        assert item.packages_backup == 4

        # Manually change packages_backup to detect re-processing
        item.packages_backup = 99
        test_db.commit()

        # Run again — should skip because unit_type is now set
        backfill_unified_columns(test_db)
        test_db.refresh(item)
        assert item.packages_backup == 99  # unchanged = skipped

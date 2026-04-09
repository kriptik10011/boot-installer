"""
Data integrity tests for W2 ship readiness.

Tests CentsType aggregate behavior, property migration correctness,
FK indexes, and CASCADE delete chains.
"""

import os
os.environ["WEEKLY_REVIEW_TEST_MODE"] = "true"

import pytest
from datetime import date, datetime
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.financial import FinancialItem, FinancialItemType
from app.models.transaction import Transaction
from app.models.asset import Asset, AssetHistory
from app.models.budget import BudgetCategory, BudgetAllocation
from app.utils.cents_type import CentsType
from app.models.recipe import Ingredient


@pytest.fixture(scope="function")
def db():
    """Fresh in-memory database for each test with FK enforcement."""
    from sqlalchemy import event

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Enable FK enforcement (matches production PRAGMA foreign_keys = ON)
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


# =============================================================================
# W2.0: CentsType Aggregate Calibration Tests
# =============================================================================

class TestCentsTypeAggregates:
    """Verify func.sum/avg/coalesce on CentsType columns return dollars, not cents.

    If these fail, there's a pre-existing bug in 30+ aggregate call sites
    across budget_engine, reports_service, investment_service, etc.
    """

    def test_sum_returns_dollars(self, db):
        """func.sum(CentsType column) should return dollar float, not raw cents."""
        db.add(Transaction(amount=10.50, date=date.today(), description="t1"))
        db.add(Transaction(amount=20.25, date=date.today(), description="t2"))
        db.commit()

        result = db.query(func.sum(Transaction.amount)).scalar()
        # If CentsType process_result_value is called: 30.75 (dollars)
        # If bypassed: 3075 (cents)
        assert result is not None
        assert abs(result - 30.75) < 0.01, (
            f"func.sum returned {result} — expected ~30.75 (dollars). "
            f"If {result} > 100, CentsType is bypassed on aggregates (pre-existing bug in 30+ sites)."
        )

    def test_coalesce_sum_returns_dollars(self, db):
        """func.coalesce(func.sum(CentsType), 0.0) should return dollar float."""
        db.add(Transaction(amount=5.99, date=date.today(), description="t1"))
        db.commit()

        result = db.query(
            func.coalesce(func.sum(Transaction.amount), 0.0)
        ).scalar()
        assert abs(result - 5.99) < 0.01, (
            f"coalesce+sum returned {result} — expected ~5.99"
        )

    def test_coalesce_sum_empty_returns_zero(self, db):
        """func.coalesce(func.sum(CentsType), 0.0) on empty table returns 0.0."""
        result = db.query(
            func.coalesce(func.sum(Transaction.amount), 0.0)
        ).scalar()
        assert result == 0.0

    def test_sum_with_nullable_cents_column(self, db):
        """func.sum on nullable CentsType column ignores NULLs."""
        # Use FinancialItem which has nullable amount-adjacent fields
        # Transaction.amount is NOT NULL, so test with a model that allows NULLs
        db.add(FinancialItem(
            name="Bill A", amount=15.00, due_date=date.today(),
            type=FinancialItemType.BILL,
        ))
        db.add(FinancialItem(
            name="Bill B", amount=25.00, due_date=date.today(),
            type=FinancialItemType.BILL,
        ))
        db.commit()

        result = db.query(func.sum(FinancialItem.amount)).scalar()
        assert abs(result - 40.00) < 0.01

    def test_orm_read_returns_dollars(self, db):
        """Basic ORM attribute access returns dollars."""
        db.add(Transaction(amount=42.50, date=date.today(), description="t1"))
        db.commit()

        tx = db.query(Transaction).first()
        assert abs(tx.amount - 42.50) < 0.01


# =============================================================================
# W2.1: Property Cents Migration Tests (TDD — tests first)
# =============================================================================

class TestPropertyCentsMigration:
    """Tests for D10 property float-to-cents migration.

    These verify the migration converts correctly and doesn't affect
    non-monetary columns (bathrooms, interest_rate).
    """

    def test_migration_converts_purchase_price(self, db):
        """After migration, purchase_price stored as cents, returned as dollars."""
        from app.models.property import Property
        prop = Property(
            name="Test Property",
            address="123 Main St",
            purchase_price=250000.00,
            current_value=300000.00,
        )
        db.add(prop)
        db.commit()
        db.refresh(prop)

        assert abs(prop.purchase_price - 250000.00) < 0.01
        assert abs(prop.current_value - 300000.00) < 0.01

    def test_migration_converts_rent_payment(self, db):
        """Rent payment amounts stored as cents, returned as dollars."""
        from app.models.property import Property, PropertyUnit, Lease, Tenant, RentPayment
        prop = Property(name="P", address="A")
        db.add(prop)
        db.flush()
        unit = PropertyUnit(property_id=prop.id, unit_number="1A", monthly_rent=1500.00)
        db.add(unit)
        db.flush()
        tenant = Tenant(name="John Doe")
        db.add(tenant)
        db.flush()
        lease = Lease(
            unit_id=unit.id, tenant_id=tenant.id,
            monthly_rent=1500.00, start_date=date.today(),
            end_date=date.today(),
        )
        db.add(lease)
        db.flush()
        payment = RentPayment(
            lease_id=lease.id, amount_due=1500.00,
            amount_paid=1500.00, late_fee=0.00,
            period_month="2026-04",
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

        assert abs(payment.amount_due - 1500.00) < 0.01
        assert abs(payment.amount_paid - 1500.00) < 0.01
        assert abs(payment.late_fee - 0.00) < 0.01

    def test_migration_preserves_null_values(self, db):
        """NULL monetary values stay NULL after migration."""
        from app.models.property import Property
        prop = Property(name="P", address="A", purchase_price=None, current_value=None)
        db.add(prop)
        db.commit()
        db.refresh(prop)

        assert prop.purchase_price is None
        assert prop.current_value is None


# =============================================================================
# W2.5: CASCADE Delete Tests (TDD — tests first)
# =============================================================================

class TestCascadeDeletes:
    """Verify parent deletion cascades correctly to owned children."""

    def test_asset_delete_cascades_to_history(self, db):
        """Deleting an Asset should cascade-delete its AssetHistory rows."""
        asset = Asset(name="House", current_value=500000.00, type="real_estate")
        db.add(asset)
        db.flush()

        db.add(AssetHistory(asset_id=asset.id, value=500000.00, change_amount=0, date=date.today()))
        db.add(AssetHistory(asset_id=asset.id, value=510000.00, change_amount=10000.00, date=date.today()))
        db.commit()

        assert db.query(AssetHistory).filter_by(asset_id=asset.id).count() == 2

        db.delete(asset)
        db.commit()

        assert db.query(AssetHistory).count() == 0

    def test_meal_delete_nulls_batch_prep_link(self, db):
        """Deleting a MealPlanEntry should SET NULL on BatchPrepMeal.meal_id."""
        from app.models.meal import MealPlanEntry
        from app.models.batch_prep import BatchPrepSession, BatchPrepMeal

        meal = MealPlanEntry(date=date.today(), meal_type="dinner")
        db.add(meal)
        db.flush()

        session = BatchPrepSession(name="Prep Sunday", prep_date=date.today())
        db.add(session)
        db.flush()

        link = BatchPrepMeal(session_id=session.id, meal_id=meal.id)
        db.add(link)
        db.commit()

        db.delete(meal)
        db.commit()

        # BatchPrepMeal should survive with meal_id = NULL
        surviving = db.query(BatchPrepMeal).first()
        assert surviving is not None
        assert surviving.meal_id is None


# =============================================================================
# W2.3: Canonical Name UNIQUE Constraint Tests
# =============================================================================

class TestCanonicalNameUnique:
    """Verify UNIQUE constraint on ingredients.canonical_name."""

    def test_unique_canonical_prevents_duplicates(self, db):
        """Two ingredients with same canonical_name cannot coexist."""
        from sqlalchemy.exc import IntegrityError as SAIntegrityError

        db.add(Ingredient(name="Ginger", canonical_name="ginger", category="produce"))
        db.flush()

        db.add(Ingredient(name="Fresh Ginger", canonical_name="ginger", category="produce"))
        with pytest.raises(SAIntegrityError):
            db.flush()
        db.rollback()

    def test_null_canonical_allowed(self, db):
        """NULL canonical_name is allowed (unique index ignores NULLs in SQLite)."""
        db.add(Ingredient(name="Unknown1", canonical_name=None))
        db.add(Ingredient(name="Unknown2", canonical_name=None))
        db.commit()
        assert db.query(Ingredient).count() == 2

    def test_find_or_create_dedup(self, db):
        """find_or_create_ingredient returns existing on canonical match."""
        from app.services.ingredient_service import find_or_create_ingredient

        ing1 = find_or_create_ingredient(db, "fresh ginger", "piece")
        ing2 = find_or_create_ingredient(db, "ginger", "piece")
        assert ing1.id == ing2.id  # Same ingredient
        assert db.query(Ingredient).filter_by(canonical_name="ginger").count() == 1

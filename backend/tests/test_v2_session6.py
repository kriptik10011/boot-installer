"""
V2 Session 6 Tests: Finance Schema + Budget Engine + API Endpoints

10 new tables, budget engine, 6 new routers.
Target: comprehensive coverage of all new finance features.
"""

import pytest
from datetime import date, timedelta
from app.models.budget import BudgetCategory, BudgetAllocation, BudgetCategoryType
from app.models.income import IncomeSource
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.savings_goal import SavingsGoal
from app.models.debt import DebtAccount, DebtPayment
from app.models.asset import Asset, AssetHistory
from app.models.financial import FinancialItem, FinancialItemType


# ===== MODEL TESTS =====

class TestBudgetCategoryModel:
    """Test BudgetCategory table creation and fields."""

    def test_create_budget_category(self, test_db):
        cat = BudgetCategory(name="Groceries", type="need", budget_amount=500.0, sort_order=1)
        test_db.add(cat)
        test_db.commit()
        assert cat.id is not None
        assert cat.name == "Groceries"
        assert cat.type == "need"
        assert cat.budget_amount == 500.0
        assert cat.is_active is True
        assert cat.rollover_enabled is False

    def test_category_types(self, test_db):
        for t in ["need", "want", "savings", "debt"]:
            cat = BudgetCategory(name=f"Cat_{t}", type=t, budget_amount=100.0)
            test_db.add(cat)
        test_db.commit()
        cats = test_db.query(BudgetCategory).all()
        assert len(cats) == 4

    def test_category_rollover_cap(self, test_db):
        cat = BudgetCategory(
            name="Dining", type="want", budget_amount=200.0,
            rollover_enabled=True, rollover_cap=100.0,
        )
        test_db.add(cat)
        test_db.commit()
        assert cat.rollover_enabled is True
        assert cat.rollover_cap == 100.0

    def test_parent_category(self, test_db):
        parent = BudgetCategory(name="Entertainment", type="want", budget_amount=300.0)
        test_db.add(parent)
        test_db.flush()
        child = BudgetCategory(
            name="Streaming", type="want", budget_amount=50.0,
            parent_category_id=parent.id,
        )
        test_db.add(child)
        test_db.commit()
        assert child.parent_category_id == parent.id


class TestBudgetAllocationModel:
    """Test BudgetAllocation table."""

    def test_create_allocation(self, test_db):
        cat = BudgetCategory(name="Groceries", type="need", budget_amount=500.0)
        test_db.add(cat)
        test_db.flush()

        alloc = BudgetAllocation(
            category_id=cat.id,
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
            allocated_amount=500.0,
            spent_amount=200.0,
            rolled_over_from=50.0,
        )
        test_db.add(alloc)
        test_db.commit()

        assert alloc.remaining == 350.0  # 500 + 50 - 200
        assert abs(alloc.pct_used - 36.4) < 0.1  # 200 / 550 * 100

    def test_allocation_zero_budget(self, test_db):
        cat = BudgetCategory(name="Misc", type="want", budget_amount=0.0)
        test_db.add(cat)
        test_db.flush()

        alloc = BudgetAllocation(
            category_id=cat.id,
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
            allocated_amount=0.0,
        )
        test_db.add(alloc)
        test_db.commit()
        assert alloc.pct_used == 0.0


class TestIncomeSourceModel:
    """Test IncomeSource table."""

    def test_create_income_source(self, test_db):
        src = IncomeSource(
            name="Salary", amount=4200.0, frequency="monthly",
            next_expected_date=date(2026, 3, 1),
        )
        test_db.add(src)
        test_db.commit()
        assert src.id is not None
        assert src.is_active is True

    def test_income_frequencies(self, test_db):
        for freq in ["weekly", "biweekly", "monthly", "annual", "irregular"]:
            src = IncomeSource(name=f"Income_{freq}", amount=1000.0, frequency=freq)
            test_db.add(src)
        test_db.commit()
        assert test_db.query(IncomeSource).count() == 5


class TestTransactionModel:
    """Test Transaction table."""

    def test_create_expense(self, test_db):
        txn = Transaction(
            date=date(2026, 2, 10), amount=45.67,
            description="Grocery shopping", merchant="Whole Foods",
            is_income=False,
        )
        test_db.add(txn)
        test_db.commit()
        assert txn.id is not None
        assert txn.is_income is False

    def test_create_income_transaction(self, test_db):
        src = IncomeSource(name="Salary", amount=4200.0, frequency="monthly")
        test_db.add(src)
        test_db.flush()

        txn = Transaction(
            date=date(2026, 2, 1), amount=4200.0,
            description="Monthly salary", is_income=True,
            income_source_id=src.id,
        )
        test_db.add(txn)
        test_db.commit()
        assert txn.is_income is True
        assert txn.income_source_id == src.id

    def test_transaction_category_fk(self, test_db):
        cat = BudgetCategory(name="Groceries", type="need", budget_amount=500.0)
        test_db.add(cat)
        test_db.flush()

        txn = Transaction(
            date=date(2026, 2, 10), amount=87.50,
            description="Weekly groceries", category_id=cat.id,
        )
        test_db.add(txn)
        test_db.commit()
        assert txn.category_id == cat.id


class TestTransactionRecurrenceModel:
    """Test TransactionRecurrence table."""

    def test_create_recurring_bill(self, test_db):
        rec = TransactionRecurrence(
            description="Netflix", amount=15.99,
            merchant="Netflix", frequency="monthly",
            next_due_date=date(2026, 3, 15),
            is_subscription=True, subscription_service="Netflix",
        )
        test_db.add(rec)
        test_db.commit()
        assert rec.id is not None
        assert rec.is_subscription is True

    def test_recurrence_frequencies(self, test_db):
        for freq in ["weekly", "biweekly", "monthly", "quarterly", "annual"]:
            rec = TransactionRecurrence(
                description=f"Bill_{freq}", amount=100.0, frequency=freq,
            )
            test_db.add(rec)
        test_db.commit()
        assert test_db.query(TransactionRecurrence).count() == 5


class TestSavingsGoalModel:
    """Test SavingsGoal table."""

    def test_create_goal(self, test_db):
        goal = SavingsGoal(
            name="Emergency Fund", target_amount=5000.0,
            current_amount=2000.0, category="emergency_fund",
            monthly_contribution=200.0,
        )
        test_db.add(goal)
        test_db.commit()
        assert goal.progress_pct == 40.0
        assert goal.remaining == 3000.0

    def test_goal_achieved(self, test_db):
        goal = SavingsGoal(
            name="Vacation", target_amount=1000.0,
            current_amount=1000.0, category="vacation",
        )
        test_db.add(goal)
        test_db.commit()
        assert goal.progress_pct == 100.0
        assert goal.remaining == 0.0

    def test_goal_over_target(self, test_db):
        goal = SavingsGoal(
            name="Over", target_amount=100.0, current_amount=150.0,
        )
        test_db.add(goal)
        test_db.commit()
        assert goal.progress_pct == 100.0
        assert goal.remaining == 0.0


class TestDebtModels:
    """Test DebtAccount and DebtPayment tables."""

    def test_create_debt_account(self, test_db):
        debt = DebtAccount(
            name="Credit Card", current_balance=3500.0,
            original_balance=5000.0, interest_rate=19.99,
            minimum_payment=75.0, type="credit_card",
        )
        test_db.add(debt)
        test_db.commit()
        assert debt.paid_off_pct == 30.0  # (5000-3500)/5000 * 100

    def test_record_payment(self, test_db):
        debt = DebtAccount(
            name="Student Loan", current_balance=25000.0,
            original_balance=30000.0, interest_rate=5.5,
            minimum_payment=250.0, type="student_loan",
        )
        test_db.add(debt)
        test_db.flush()

        payment = DebtPayment(
            debt_id=debt.id, date=date(2026, 2, 1),
            amount=300.0, principal_portion=200.0,
            interest_portion=100.0, balance_after=24800.0,
        )
        test_db.add(payment)
        test_db.commit()

        assert len(debt.payments) == 1
        assert debt.payments[0].amount == 300.0

    def test_debt_types(self, test_db):
        for dtype in ["credit_card", "student_loan", "auto_loan", "mortgage", "personal", "medical", "other"]:
            debt = DebtAccount(
                name=f"Debt_{dtype}", current_balance=1000.0,
                original_balance=1000.0, type=dtype,
            )
            test_db.add(debt)
        test_db.commit()
        assert test_db.query(DebtAccount).count() == 7


class TestAssetModels:
    """Test Asset and AssetHistory tables."""

    def test_create_asset(self, test_db):
        asset = Asset(
            name="Checking Account", current_value=5000.0,
            type="checking", institution="Chase",
            is_liquid=True,
        )
        test_db.add(asset)
        test_db.commit()
        assert asset.id is not None

    def test_asset_history(self, test_db):
        asset = Asset(name="Savings", current_value=10000.0, type="savings")
        test_db.add(asset)
        test_db.flush()

        for i in range(3):
            hist = AssetHistory(
                asset_id=asset.id,
                date=date(2026, 1, 1) + timedelta(days=30 * i),
                value=10000.0 + (i * 500),
                change_amount=500.0 if i > 0 else None,
            )
            test_db.add(hist)
        test_db.commit()
        assert len(asset.history) == 3

    def test_asset_types(self, test_db):
        for atype in ["cash", "checking", "savings", "investment", "real_estate", "vehicle", "other"]:
            asset = Asset(name=f"Asset_{atype}", current_value=1000.0, type=atype)
            test_db.add(asset)
        test_db.commit()
        assert test_db.query(Asset).count() == 7


class TestFinancialItemExtension:
    """Test V2 columns added to FinancialItem."""

    def test_new_columns_exist(self, test_db):
        item = FinancialItem(
            name="Electricity", amount=150.0,
            due_date=date(2026, 3, 1), type=FinancialItemType.BILL,
        )
        test_db.add(item)
        test_db.commit()
        assert item.budget_category_id is None
        assert item.is_migrated_to_transaction is False

    def test_link_to_budget_category(self, test_db):
        cat = BudgetCategory(name="Utilities", type="need", budget_amount=300.0)
        test_db.add(cat)
        test_db.flush()

        item = FinancialItem(
            name="Electricity", amount=150.0,
            due_date=date(2026, 3, 1), type=FinancialItemType.BILL,
            budget_category_id=cat.id,
        )
        test_db.add(item)
        test_db.commit()
        assert item.budget_category_id == cat.id


# ===== BUDGET ENGINE TESTS =====

class TestBudgetEngine:
    """Test the zero-based budgeting engine calculations."""

    def test_budget_status_empty(self, test_db):
        from app.services.budget_engine import calculate_budget_status
        status = calculate_budget_status(test_db, date(2026, 2, 1))
        assert status.total_income == 0.0
        assert status.total_allocated == 0.0
        assert status.total_spent == 0.0
        assert status.categories == []

    def test_budget_status_with_categories(self, test_db):
        from app.services.budget_engine import calculate_budget_status

        cat1 = BudgetCategory(name="Groceries", type="need", budget_amount=500.0, sort_order=1)
        cat2 = BudgetCategory(name="Dining", type="want", budget_amount=200.0, sort_order=2)
        test_db.add_all([cat1, cat2])
        test_db.flush()

        # Add income transaction
        test_db.add(Transaction(
            date=date(2026, 2, 5), amount=4200.0,
            description="Salary", is_income=True,
        ))
        # Add expense transactions
        test_db.add(Transaction(
            date=date(2026, 2, 8), amount=87.50,
            description="Groceries", category_id=cat1.id, is_income=False,
        ))
        test_db.add(Transaction(
            date=date(2026, 2, 10), amount=45.00,
            description="Restaurant", category_id=cat2.id, is_income=False,
        ))
        test_db.commit()

        status = calculate_budget_status(test_db, date(2026, 2, 1))
        assert status.total_income == 4200.0
        assert status.total_allocated == 700.0  # 500 + 200
        assert status.total_spent == 132.50  # 87.50 + 45.00
        assert len(status.categories) == 2

        groceries = status.categories[0]
        assert groceries.name == "Groceries"
        assert groceries.spent == 87.50
        assert groceries.remaining == 412.50  # 500 - 87.50

    def test_budget_status_period_bounds(self, test_db):
        from app.services.budget_engine import get_period_bounds

        # Monthly: Feb 2026
        start, end = get_period_bounds(date(2026, 2, 15), "monthly")
        assert start == date(2026, 2, 1)
        assert end == date(2026, 2, 28)

        # December boundary
        start, end = get_period_bounds(date(2026, 12, 10), "monthly")
        assert start == date(2026, 12, 1)
        assert end == date(2026, 12, 31)

        # Weekly
        start, end = get_period_bounds(date(2026, 2, 12), "weekly")
        assert start.weekday() == 0  # Monday
        assert end.weekday() == 6  # Sunday

    def test_safe_to_spend_empty(self, test_db):
        from app.services.budget_engine import safe_to_spend
        result = safe_to_spend(test_db)
        assert result.amount == 0.0
        assert result.total_income == 0.0

    def test_safe_to_spend_with_data(self, test_db):
        from app.services.budget_engine import safe_to_spend

        today = date.today()
        start = today.replace(day=1)

        # Income
        test_db.add(Transaction(
            date=start, amount=4200.0,
            description="Salary", is_income=True,
        ))
        # Expense
        test_db.add(Transaction(
            date=today, amount=500.0,
            description="Rent payment", is_income=False,
        ))
        test_db.commit()

        result = safe_to_spend(test_db)
        assert result.total_income == 4200.0
        assert result.already_spent == 500.0
        # Safe = 4200 - 500 - upcoming_bills(0) - savings(0) = 3700
        assert result.amount == 3700.0

    def test_allocation_creates_record(self, test_db):
        from app.services.budget_engine import allocate_budget

        cat = BudgetCategory(name="Groceries", type="need", budget_amount=500.0)
        test_db.add(cat)
        test_db.flush()

        alloc = allocate_budget(test_db, cat.id, date(2026, 2, 1), 600.0, "Increased for February")
        test_db.commit()

        assert alloc.allocated_amount == 600.0
        assert alloc.adjustment_note == "Increased for February"
        assert alloc.period_start == date(2026, 2, 1)

    def test_allocation_update_existing(self, test_db):
        from app.services.budget_engine import allocate_budget

        cat = BudgetCategory(name="Groceries", type="need", budget_amount=500.0)
        test_db.add(cat)
        test_db.flush()

        # First allocation
        allocate_budget(test_db, cat.id, date(2026, 2, 1), 500.0)
        test_db.commit()

        # Update allocation
        alloc = allocate_budget(test_db, cat.id, date(2026, 2, 1), 600.0, "Adjusted")
        test_db.commit()

        assert alloc.allocated_amount == 600.0
        # Should be only 1 allocation record (updated, not duplicated)
        count = test_db.query(BudgetAllocation).filter(
            BudgetAllocation.category_id == cat.id,
        ).count()
        assert count == 1

    def test_rollover_disabled(self, test_db):
        from app.services.budget_engine import calculate_rollover

        cat = BudgetCategory(name="Groceries", type="need", budget_amount=500.0, rollover_enabled=False)
        test_db.add(cat)
        test_db.commit()

        rollover = calculate_rollover(test_db, cat.id, date(2026, 2, 1))
        assert rollover == 0.0

    def test_rollover_with_cap(self, test_db):
        from app.services.budget_engine import calculate_rollover, allocate_budget

        cat = BudgetCategory(
            name="Dining", type="want", budget_amount=200.0,
            rollover_enabled=True, rollover_cap=50.0,
        )
        test_db.add(cat)
        test_db.flush()

        # Create January allocation with $150 remaining (200 budgeted, 50 spent)
        alloc = BudgetAllocation(
            category_id=cat.id,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            allocated_amount=200.0,
            spent_amount=50.0,
        )
        test_db.add(alloc)
        test_db.commit()

        # Calculate rollover for February: remaining=150, but cap=50
        rollover = calculate_rollover(test_db, cat.id, date(2026, 2, 1))
        assert rollover == 50.0  # Capped

    def test_income_estimation_from_sources(self, test_db):
        from app.services.budget_engine import _calculate_period_income

        test_db.add(IncomeSource(name="Salary", amount=4200.0, frequency="monthly", is_active=True))
        test_db.add(IncomeSource(name="Freelance", amount=500.0, frequency="monthly", is_active=True))
        test_db.commit()

        income = _calculate_period_income(test_db, date(2026, 2, 1), date(2026, 2, 28))
        assert income == 4700.0  # 4200 + 500


# ===== API ENDPOINT TESTS =====

class TestBudgetAPI:
    """Test budget router endpoints."""

    def test_list_categories(self, client):
        response = client.get("/api/budget/categories")
        assert response.status_code == 200
        # Default seeded categories
        data = response.json()
        assert isinstance(data, list)

    def test_create_category(self, client):
        response = client.post("/api/budget/categories", json={
            "name": "Test Category",
            "type": "want",
            "budget_amount": 150.0,
        })
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Category"
        assert data["budget_amount"] == 150.0

    def test_get_category(self, client):
        # Create first
        create = client.post("/api/budget/categories", json={
            "name": "Cat", "type": "need", "budget_amount": 100.0,
        })
        cat_id = create.json()["id"]

        response = client.get(f"/api/budget/categories/{cat_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Cat"

    def test_update_category(self, client):
        create = client.post("/api/budget/categories", json={
            "name": "Old Name", "type": "need", "budget_amount": 100.0,
        })
        cat_id = create.json()["id"]

        response = client.put(f"/api/budget/categories/{cat_id}", json={
            "name": "New Name", "budget_amount": 200.0,
        })
        assert response.status_code == 200
        assert response.json()["name"] == "New Name"
        assert response.json()["budget_amount"] == 200.0

    def test_delete_category_soft(self, client):
        create = client.post("/api/budget/categories", json={
            "name": "To Delete", "type": "want", "budget_amount": 50.0,
        })
        cat_id = create.json()["id"]

        response = client.delete(f"/api/budget/categories/{cat_id}")
        assert response.status_code == 204

        # Should not appear in active-only list
        active = client.get("/api/budget/categories?active_only=true").json()
        assert not any(c["id"] == cat_id for c in active)

    def test_budget_status(self, client):
        response = client.get("/api/budget/status/2026-02-01")
        assert response.status_code == 200
        data = response.json()
        assert "total_income" in data
        assert "categories" in data

    def test_safe_to_spend(self, client):
        response = client.get("/api/budget/safe-to-spend")
        assert response.status_code == 200
        data = response.json()
        assert "amount" in data
        assert "breakdown" in data

    def test_allocate_budget(self, client):
        create = client.post("/api/budget/categories", json={
            "name": "Alloc Test", "type": "need", "budget_amount": 300.0,
        })
        cat_id = create.json()["id"]

        response = client.post("/api/budget/allocate", json={
            "category_id": cat_id,
            "amount": 350.0,
            "period_start": "2026-02-01",
            "note": "Adjusted for holidays",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["allocated_amount"] == 350.0

    def test_get_rollover(self, client):
        create = client.post("/api/budget/categories", json={
            "name": "Rollover Test", "type": "want", "budget_amount": 200.0,
            "rollover_enabled": True,
        })
        cat_id = create.json()["id"]

        response = client.get(f"/api/budget/rollover/{cat_id}?period_start=2026-02-01")
        assert response.status_code == 200
        data = response.json()
        assert "rollover_amount" in data

    def test_category_not_found(self, client):
        response = client.get("/api/budget/categories/99999")
        assert response.status_code == 404


class TestIncomeAPI:
    """Test income router endpoints."""

    def test_crud_income_source(self, client):
        # Create
        create = client.post("/api/income/sources", json={
            "name": "Day Job", "amount": 4200.0, "frequency": "monthly",
        })
        assert create.status_code == 201
        src_id = create.json()["id"]

        # Read
        get = client.get(f"/api/income/sources/{src_id}")
        assert get.status_code == 200
        assert get.json()["name"] == "Day Job"

        # Update
        update = client.put(f"/api/income/sources/{src_id}", json={"amount": 4500.0})
        assert update.status_code == 200
        assert update.json()["amount"] == 4500.0

        # List
        list_resp = client.get("/api/income/sources")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) >= 1

        # Delete (deactivate)
        delete = client.delete(f"/api/income/sources/{src_id}")
        assert delete.status_code == 204

    def test_income_source_not_found(self, client):
        response = client.get("/api/income/sources/99999")
        assert response.status_code == 404


class TestTransactionsAPI:
    """Test transactions router endpoints."""

    def test_create_expense(self, client):
        response = client.post("/api/transactions/", json={
            "date": "2026-02-10",
            "amount": 45.67,
            "description": "Grocery shopping",
            "merchant": "Whole Foods",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["amount"] == 45.67
        assert data["is_income"] is False

    def test_create_income(self, client):
        response = client.post("/api/transactions/", json={
            "date": "2026-02-01",
            "amount": 4200.0,
            "description": "Monthly salary",
            "is_income": True,
        })
        assert response.status_code == 201
        assert response.json()["is_income"] is True

    def test_list_with_filters(self, client):
        # Create some transactions
        client.post("/api/transactions/", json={
            "date": "2026-02-10", "amount": 50.0, "description": "A",
        })
        client.post("/api/transactions/", json={
            "date": "2026-02-11", "amount": 30.0, "description": "B",
        })

        # Filter by date range
        response = client.get("/api/transactions/?start_date=2026-02-10&end_date=2026-02-10")
        assert response.status_code == 200
        data = response.json()
        assert all(t["date"] == "2026-02-10" for t in data)

    def test_update_transaction(self, client):
        create = client.post("/api/transactions/", json={
            "date": "2026-02-10", "amount": 50.0, "description": "Wrong amount",
        })
        txn_id = create.json()["id"]

        update = client.put(f"/api/transactions/{txn_id}", json={"amount": 75.0})
        assert update.status_code == 200
        assert update.json()["amount"] == 75.0

    def test_delete_transaction(self, client):
        create = client.post("/api/transactions/", json={
            "date": "2026-02-10", "amount": 10.0, "description": "To delete",
        })
        txn_id = create.json()["id"]

        delete = client.delete(f"/api/transactions/{txn_id}")
        assert delete.status_code == 204

        get = client.get(f"/api/transactions/{txn_id}")
        assert get.status_code == 404

    def test_by_category(self, client):
        # Create category first
        cat = client.post("/api/budget/categories", json={
            "name": "Test Cat", "type": "need", "budget_amount": 100.0,
        })
        cat_id = cat.json()["id"]

        # Create transaction in category
        client.post("/api/transactions/", json={
            "date": "2026-02-10", "amount": 50.0,
            "description": "In category", "category_id": cat_id,
        })

        response = client.get(f"/api/transactions/?category_id={cat_id}")
        assert response.status_code == 200
        assert len(response.json()) >= 1


class TestSavingsAPI:
    """Test savings router endpoints."""

    def test_crud_savings_goal(self, client):
        # Create
        create = client.post("/api/savings/goals", json={
            "name": "Emergency Fund",
            "target_amount": 5000.0,
            "current_amount": 1000.0,
            "category": "emergency_fund",
            "monthly_contribution": 200.0,
        })
        assert create.status_code == 201
        data = create.json()
        assert data["progress_pct"] == 20.0
        assert data["remaining"] == 4000.0
        goal_id = data["id"]

        # Read
        get = client.get(f"/api/savings/goals/{goal_id}")
        assert get.status_code == 200

        # Update
        update = client.put(f"/api/savings/goals/{goal_id}", json={"target_amount": 6000.0})
        assert update.status_code == 200
        assert update.json()["target_amount"] == 6000.0

        # List
        list_resp = client.get("/api/savings/goals")
        assert list_resp.status_code == 200

    def test_contribute_to_goal(self, client):
        create = client.post("/api/savings/goals", json={
            "name": "Vacation", "target_amount": 1000.0,
            "current_amount": 800.0,
        })
        goal_id = create.json()["id"]

        # Contribute
        contrib = client.post(f"/api/savings/goals/{goal_id}/contribute", json={
            "amount": 200.0,
        })
        assert contrib.status_code == 200
        data = contrib.json()
        assert data["current_amount"] == 1000.0
        assert data["is_achieved"] is True
        assert data["progress_pct"] == 100.0

    def test_savings_goal_not_found(self, client):
        response = client.get("/api/savings/goals/99999")
        assert response.status_code == 404


class TestDebtAPI:
    """Test debt router endpoints."""

    def test_crud_debt_account(self, client):
        # Create
        create = client.post("/api/debt/accounts", json={
            "name": "Credit Card",
            "current_balance": 3500.0,
            "original_balance": 5000.0,
            "interest_rate": 19.99,
            "minimum_payment": 75.0,
            "type": "credit_card",
        })
        assert create.status_code == 201
        data = create.json()
        assert data["paid_off_pct"] == 30.0
        account_id = data["id"]

        # Read
        get = client.get(f"/api/debt/accounts/{account_id}")
        assert get.status_code == 200

        # Update
        update = client.put(f"/api/debt/accounts/{account_id}", json={"current_balance": 3000.0})
        assert update.status_code == 200
        assert update.json()["current_balance"] == 3000.0

        # List
        list_resp = client.get("/api/debt/accounts")
        assert list_resp.status_code == 200

    def test_record_payment(self, client):
        create = client.post("/api/debt/accounts", json={
            "name": "Student Loan",
            "current_balance": 25000.0,
            "original_balance": 30000.0,
            "interest_rate": 5.5,
            "minimum_payment": 250.0,
            "type": "student_loan",
        })
        account_id = create.json()["id"]

        # Record payment
        payment = client.post(f"/api/debt/accounts/{account_id}/payment", json={
            "date": "2026-02-01",
            "amount": 300.0,
            "principal_portion": 200.0,
            "interest_portion": 100.0,
        })
        assert payment.status_code == 201

        # Verify balance decreased
        get = client.get(f"/api/debt/accounts/{account_id}")
        assert get.json()["current_balance"] == 24700.0  # 25000 - 300

        # List payments
        payments = client.get(f"/api/debt/accounts/{account_id}/payments")
        assert payments.status_code == 200
        assert len(payments.json()) == 1

    def test_debt_summary(self, client):
        client.post("/api/debt/accounts", json={
            "name": "Debt 1", "current_balance": 1000.0,
            "original_balance": 2000.0, "minimum_payment": 50.0,
        })
        client.post("/api/debt/accounts", json={
            "name": "Debt 2", "current_balance": 3000.0,
            "original_balance": 4000.0, "minimum_payment": 100.0,
        })

        response = client.get("/api/debt/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["total_debt"] == 4000.0
        assert data["total_minimum_payments"] == 150.0
        assert data["debt_count"] == 2

    def test_debt_not_found(self, client):
        response = client.get("/api/debt/accounts/99999")
        assert response.status_code == 404


class TestNetWorthAPI:
    """Test net worth / assets router endpoints."""

    def test_crud_asset(self, client):
        # Create
        create = client.post("/api/net-worth/assets", json={
            "name": "Checking Account",
            "current_value": 5000.0,
            "type": "checking",
            "institution": "Chase",
            "is_liquid": True,
        })
        assert create.status_code == 201
        asset_id = create.json()["id"]

        # Read / List
        list_resp = client.get("/api/net-worth/assets")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) >= 1

        # Update
        update = client.put(f"/api/net-worth/assets/{asset_id}", json={"current_value": 5500.0})
        assert update.status_code == 200
        assert update.json()["current_value"] == 5500.0

    def test_net_worth_calculation(self, client):
        # Create assets
        client.post("/api/net-worth/assets", json={
            "name": "Checking", "current_value": 5000.0, "type": "checking", "is_liquid": True,
        })
        client.post("/api/net-worth/assets", json={
            "name": "House", "current_value": 250000.0, "type": "real_estate", "is_liquid": False,
        })

        # Create debts
        client.post("/api/debt/accounts", json={
            "name": "Mortgage", "current_balance": 200000.0,
            "original_balance": 250000.0, "type": "mortgage",
        })

        response = client.get("/api/net-worth/current")
        assert response.status_code == 200
        data = response.json()
        assert data["total_assets"] == 255000.0
        assert data["total_liabilities"] == 200000.0
        assert data["net_worth"] == 55000.0
        assert data["liquid_assets"] == 5000.0
        assert data["illiquid_assets"] == 250000.0

    def test_snapshot(self, client):
        client.post("/api/net-worth/assets", json={
            "name": "Savings", "current_value": 10000.0, "type": "savings",
        })

        response = client.post("/api/net-worth/snapshot")
        assert response.status_code == 200
        assert "message" in response.json()

    def test_asset_history(self, client):
        create = client.post("/api/net-worth/assets", json={
            "name": "Investment", "current_value": 20000.0, "type": "investment",
        })
        asset_id = create.json()["id"]

        # Take snapshot
        client.post("/api/net-worth/snapshot")

        response = client.get(f"/api/net-worth/assets/{asset_id}/history")
        assert response.status_code == 200

    def test_asset_not_found(self, client):
        response = client.put("/api/net-worth/assets/99999", json={"current_value": 0})
        assert response.status_code == 404


class TestSeedBudgetCategories:
    """Test default budget category seeding."""

    def test_default_categories_seeded(self, test_db):
        """Seed runs against test DB and creates expected categories."""
        from app.db.seeds import seed_budget_categories
        # Monkey-patch SessionLocal to use test_db
        import app.database as db_module
        orig_session_local = db_module.SessionLocal

        class FakeSessionLocal:
            def __call__(self):
                return test_db
        db_module.SessionLocal = FakeSessionLocal()
        try:
            seed_budget_categories()
        finally:
            db_module.SessionLocal = orig_session_local

        cats = test_db.query(BudgetCategory).all()
        names = [c.name for c in cats]
        assert "Housing" in names
        assert "Groceries" in names
        assert "Dining Out" in names
        assert "Emergency Fund" in names
        assert "Debt Payments" in names
        assert len(cats) == 14

    def test_default_category_types(self, test_db):
        """Verify seeded categories have correct types."""
        from app.db.seeds import seed_budget_categories
        import app.database as db_module
        orig_session_local = db_module.SessionLocal

        class FakeSessionLocal:
            def __call__(self):
                return test_db
        db_module.SessionLocal = FakeSessionLocal()
        try:
            seed_budget_categories()
        finally:
            db_module.SessionLocal = orig_session_local

        cats = test_db.query(BudgetCategory).all()
        type_map = {c.name: c.type for c in cats}
        assert type_map["Housing"] == "need"
        assert type_map["Entertainment"] == "want"
        assert type_map["Emergency Fund"] == "savings"
        assert type_map["Debt Payments"] == "debt"

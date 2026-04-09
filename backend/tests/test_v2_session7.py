"""
V2 Session 7 Tests — Transaction management, income pipeline, recurring bills.

Tests: transaction_service functions, new transaction endpoints, recurring router,
       income summary endpoint.
"""

import pytest
from datetime import date, timedelta
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.income import IncomeSource
from app.models.budget import BudgetCategory


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def _create_category(db, name="Groceries", budget_amount=500.0, cat_type="need"):
    cat = BudgetCategory(
        name=name, type=cat_type, budget_amount=budget_amount,
        period="monthly", sort_order=0, is_active=True,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def _create_transaction(db, amount=50.0, merchant="Walmart", category_id=None,
                         txn_date=None, is_income=False, description="Purchase",
                         income_source_id=None):
    txn = Transaction(
        date=txn_date or date.today(),
        amount=amount,
        description=description,
        merchant=merchant,
        category_id=category_id,
        is_income=is_income,
        income_source_id=income_source_id,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def _create_income_source(db, name="Salary", amount=4200.0, frequency="monthly"):
    src = IncomeSource(
        name=name, amount=amount, frequency=frequency,
        is_active=True, sort_order=0,
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


def _create_recurrence(db, description="Netflix", amount=15.99, frequency="monthly",
                        next_due_date=None, is_subscription=True,
                        subscription_service=None, category_id=None):
    rec = TransactionRecurrence(
        description=description,
        amount=amount,
        frequency=frequency,
        next_due_date=next_due_date or (date.today() + timedelta(days=5)),
        is_subscription=is_subscription,
        subscription_service=subscription_service or description,
        is_active=True,
        category_id=category_id,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


# ──────────────────────────────────────────────────────────
# Service: check_duplicate
# ──────────────────────────────────────────────────────────

class TestCheckDuplicate:
    def test_detects_duplicate(self, test_db):
        from app.services.transaction_service import check_duplicate
        _create_transaction(test_db, amount=42.50, merchant="Target", txn_date=date.today())
        result = check_duplicate(test_db, 42.50, "Target", date.today())
        assert result is not None
        assert result.existing_amount == 42.50
        assert "Target" in result.similarity_reason

    def test_no_duplicate_different_merchant(self, test_db):
        from app.services.transaction_service import check_duplicate
        _create_transaction(test_db, amount=42.50, merchant="Target", txn_date=date.today())
        result = check_duplicate(test_db, 42.50, "Walmart", date.today())
        assert result is None

    def test_no_duplicate_different_amount(self, test_db):
        from app.services.transaction_service import check_duplicate
        _create_transaction(test_db, amount=42.50, merchant="Target", txn_date=date.today())
        result = check_duplicate(test_db, 99.99, "Target", date.today())
        assert result is None

    def test_no_duplicate_outside_window(self, test_db):
        from app.services.transaction_service import check_duplicate
        old_date = date.today() - timedelta(days=5)
        _create_transaction(test_db, amount=42.50, merchant="Target", txn_date=old_date)
        result = check_duplicate(test_db, 42.50, "Target", date.today())
        assert result is None

    def test_no_merchant_returns_none(self, test_db):
        from app.services.transaction_service import check_duplicate
        result = check_duplicate(test_db, 42.50, None, date.today())
        assert result is None


# ──────────────────────────────────────────────────────────
# Service: suggest_category_for_merchant
# ──────────────────────────────────────────────────────────

class TestSuggestCategory:
    def test_suggests_with_enough_history(self, test_db):
        from app.services.transaction_service import suggest_category_for_merchant
        cat = _create_category(test_db, "Groceries")
        _create_transaction(test_db, merchant="Kroger", category_id=cat.id)
        _create_transaction(test_db, merchant="Kroger", category_id=cat.id)
        result = suggest_category_for_merchant(test_db, "Kroger")
        assert result is not None
        assert result.category_id == cat.id
        assert result.category_name == "Groceries"
        assert result.confidence > 0

    def test_no_suggestion_with_one_transaction(self, test_db):
        from app.services.transaction_service import suggest_category_for_merchant
        cat = _create_category(test_db)
        _create_transaction(test_db, merchant="NewStore", category_id=cat.id)
        result = suggest_category_for_merchant(test_db, "NewStore")
        assert result is None

    def test_empty_merchant_returns_none(self, test_db):
        from app.services.transaction_service import suggest_category_for_merchant
        result = suggest_category_for_merchant(test_db, "")
        assert result is None


# ──────────────────────────────────────────────────────────
# Service: create_split_transaction
# ──────────────────────────────────────────────────────────

class TestSplitTransaction:
    def test_creates_split_transactions(self, test_db):
        from app.services.transaction_service import create_split_transaction
        cat1 = _create_category(test_db, "Groceries")
        cat2 = _create_category(test_db, "Household")
        splits = [(cat1.id, 80.0), (cat2.id, 70.0)]
        txns = create_split_transaction(
            test_db, date.today(), 150.0, "Target Run", splits, merchant="Target"
        )
        test_db.commit()
        assert len(txns) == 2
        assert txns[0].amount == 80.0
        assert txns[0].category_id == cat1.id
        assert txns[1].amount == 70.0
        assert txns[1].category_id == cat2.id
        assert "Split:" in txns[0].receipt_note

    def test_split_amounts_must_match_total(self, test_db):
        from app.services.transaction_service import create_split_transaction
        cat1 = _create_category(test_db, "Groceries")
        cat2 = _create_category(test_db, "Household")
        splits = [(cat1.id, 80.0), (cat2.id, 50.0)]  # 130 != 150
        with pytest.raises(ValueError, match="don't match"):
            create_split_transaction(
                test_db, date.today(), 150.0, "Target Run", splits
            )


# ──────────────────────────────────────────────────────────
# Service: calculate_spending_velocity
# ──────────────────────────────────────────────────────────

class TestSpendingVelocity:
    def test_calculates_velocity(self, test_db):
        from app.services.transaction_service import calculate_spending_velocity
        cat = _create_category(test_db, "Groceries", budget_amount=1000.0)
        _create_transaction(test_db, amount=500.0, category_id=cat.id)
        results = calculate_spending_velocity(test_db)
        assert len(results) >= 1
        grocery_vel = next(v for v in results if v.category_id == cat.id)
        assert grocery_vel.spent_amount == 500.0
        assert grocery_vel.budget_amount == 1000.0
        assert grocery_vel.velocity >= 0

    def test_empty_budget_categories(self, test_db):
        from app.services.transaction_service import calculate_spending_velocity
        results = calculate_spending_velocity(test_db)
        assert results == []


# ──────────────────────────────────────────────────────────
# Service: get_income_summary
# ──────────────────────────────────────────────────────────

class TestIncomeSummary:
    def test_expected_vs_actual(self, test_db):
        from app.services.transaction_service import get_income_summary
        src = _create_income_source(test_db, "Salary", 4200.0, "monthly")
        _create_transaction(
            test_db, amount=4200.0, is_income=True,
            income_source_id=src.id, description="Paycheck"
        )
        summary = get_income_summary(test_db, date.today())
        assert summary.expected_income == 4200.0
        assert summary.actual_income == 4200.0
        assert summary.difference == 0.0

    def test_unlinked_income_tracked(self, test_db):
        from app.services.transaction_service import get_income_summary
        _create_transaction(
            test_db, amount=500.0, is_income=True,
            description="Freelance gig"
        )
        summary = get_income_summary(test_db, date.today())
        assert summary.actual_income == 500.0
        assert any(s["name"] == "Other income" for s in summary.sources)


# ──────────────────────────────────────────────────────────
# Service: get_upcoming_recurring
# ──────────────────────────────────────────────────────────

class TestUpcomingRecurring:
    def test_finds_upcoming_bills(self, test_db):
        from app.services.transaction_service import get_upcoming_recurring
        _create_recurrence(test_db, "Netflix", 15.99, next_due_date=date.today() + timedelta(days=3))
        _create_recurrence(test_db, "Rent", 1500.0, next_due_date=date.today() + timedelta(days=10),
                           is_subscription=False)
        results = get_upcoming_recurring(test_db, days=30)
        assert len(results) == 2

    def test_excludes_far_future(self, test_db):
        from app.services.transaction_service import get_upcoming_recurring
        _create_recurrence(test_db, "Annual", 100.0, next_due_date=date.today() + timedelta(days=100))
        results = get_upcoming_recurring(test_db, days=30)
        assert len(results) == 0

    def test_overdue_detected(self, test_db):
        from app.services.transaction_service import get_upcoming_recurring
        _create_recurrence(test_db, "Late Bill", 50.0, next_due_date=date.today() - timedelta(days=3))
        results = get_upcoming_recurring(test_db, days=30)
        assert len(results) == 1
        assert results[0].is_overdue is True
        assert results[0].days_until_due < 0


# ──────────────────────────────────────────────────────────
# Service: get_subscription_summary
# ──────────────────────────────────────────────────────────

class TestSubscriptionSummary:
    def test_calculates_monthly_total(self, test_db):
        from app.services.transaction_service import get_subscription_summary
        _create_recurrence(test_db, "Netflix", 15.99, "monthly")
        _create_recurrence(test_db, "Spotify", 9.99, "monthly")
        result = get_subscription_summary(test_db)
        assert result["subscription_count"] == 2
        assert result["monthly_total"] == pytest.approx(25.98, abs=0.01)
        assert result["annual_total"] == pytest.approx(25.98 * 12, abs=0.1)

    def test_annual_subscription_prorated(self, test_db):
        from app.services.transaction_service import get_subscription_summary
        _create_recurrence(test_db, "Annual Service", 120.0, "annual")
        result = get_subscription_summary(test_db)
        assert result["monthly_total"] == pytest.approx(10.0, abs=0.01)


# ──────────────────────────────────────────────────────────
# API: Transaction endpoints (new in Session 7)
# ──────────────────────────────────────────────────────────

class TestTransactionEndpoints:
    def test_check_duplicate_found(self, client, test_db):
        _create_transaction(test_db, amount=42.50, merchant="Target")
        today = date.today().isoformat()
        resp = client.get(f"/api/transactions/check-duplicate?amount=42.50&merchant=Target&txn_date={today}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_duplicate"] is True
        assert data["existing_amount"] == 42.50

    def test_check_duplicate_not_found(self, client, test_db):
        today = date.today().isoformat()
        resp = client.get(f"/api/transactions/check-duplicate?amount=99.99&merchant=Unknown&txn_date={today}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_duplicate"] is False

    def test_suggest_category(self, client, test_db):
        cat = _create_category(test_db, "Groceries")
        _create_transaction(test_db, merchant="Kroger", category_id=cat.id)
        _create_transaction(test_db, merchant="Kroger", category_id=cat.id)
        resp = client.get("/api/transactions/suggest-category/Kroger")
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_suggestion"] is True
        assert data["category_name"] == "Groceries"

    def test_suggest_category_no_history(self, client, test_db):
        resp = client.get("/api/transactions/suggest-category/NewStore")
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_suggestion"] is False

    def test_spending_velocity(self, client, test_db):
        cat = _create_category(test_db, "Groceries", budget_amount=1000.0)
        _create_transaction(test_db, amount=300.0, category_id=cat.id)
        resp = client.get("/api/transactions/spending-velocity")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["budget_amount"] == 1000.0

    def test_split_transaction(self, client, test_db):
        cat1 = _create_category(test_db, "Groceries")
        cat2 = _create_category(test_db, "Household")
        resp = client.post("/api/transactions/split", json={
            "date": date.today().isoformat(),
            "total_amount": 150.0,
            "description": "Target Run",
            "splits": [
                {"category_id": cat1.id, "amount": 80.0},
                {"category_id": cat2.id, "amount": 70.0},
            ],
            "merchant": "Target",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert len(data) == 2
        assert data[0]["amount"] == 80.0
        assert data[1]["amount"] == 70.0

    def test_split_amounts_mismatch(self, client, test_db):
        cat1 = _create_category(test_db, "Groceries")
        cat2 = _create_category(test_db, "Household")
        resp = client.post("/api/transactions/split", json={
            "date": date.today().isoformat(),
            "total_amount": 150.0,
            "description": "Target Run",
            "splits": [
                {"category_id": cat1.id, "amount": 80.0},
                {"category_id": cat2.id, "amount": 50.0},  # 130 != 150
            ],
        })
        assert resp.status_code == 422


# ──────────────────────────────────────────────────────────
# API: Income summary endpoint
# ──────────────────────────────────────────────────────────

class TestIncomeSummaryEndpoint:
    def test_income_summary(self, client, test_db):
        src = _create_income_source(test_db, "Salary", 4200.0, "monthly")
        _create_transaction(
            test_db, amount=4200.0, is_income=True,
            income_source_id=src.id, description="Paycheck",
        )
        today = date.today().isoformat()
        resp = client.get(f"/api/income/summary/{today}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["expected_income"] == 4200.0
        assert data["actual_income"] == 4200.0

    def test_income_summary_no_sources(self, client, test_db):
        today = date.today().isoformat()
        resp = client.get(f"/api/income/summary/{today}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["expected_income"] == 0.0


# ──────────────────────────────────────────────────────────
# API: Recurring router endpoints
# ──────────────────────────────────────────────────────────

class TestRecurringEndpoints:
    def test_create_recurring(self, client, test_db):
        resp = client.post("/api/recurring/", json={
            "description": "Netflix",
            "amount": 15.99,
            "frequency": "monthly",
            "next_due_date": (date.today() + timedelta(days=15)).isoformat(),
            "is_subscription": True,
            "subscription_service": "Netflix",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["description"] == "Netflix"
        assert data["amount"] == 15.99
        assert data["is_subscription"] is True

    def test_list_recurring(self, client, test_db):
        _create_recurrence(test_db, "Netflix", 15.99)
        _create_recurrence(test_db, "Rent", 1500.0, is_subscription=False)
        resp = client.get("/api/recurring/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    def test_list_recurring_filter_subscription(self, client, test_db):
        _create_recurrence(test_db, "Netflix", 15.99, is_subscription=True)
        _create_recurrence(test_db, "Rent", 1500.0, is_subscription=False)
        resp = client.get("/api/recurring/?is_subscription=true")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["description"] == "Netflix"

    def test_get_recurring(self, client, test_db):
        rec = _create_recurrence(test_db, "Netflix", 15.99)
        resp = client.get(f"/api/recurring/{rec.id}")
        assert resp.status_code == 200
        assert resp.json()["description"] == "Netflix"

    def test_get_recurring_not_found(self, client, test_db):
        resp = client.get("/api/recurring/999")
        assert resp.status_code == 404

    def test_update_recurring(self, client, test_db):
        rec = _create_recurrence(test_db, "Netflix", 15.99)
        resp = client.put(f"/api/recurring/{rec.id}", json={"amount": 19.99})
        assert resp.status_code == 200
        assert resp.json()["amount"] == 19.99

    def test_deactivate_recurring(self, client, test_db):
        rec = _create_recurrence(test_db, "Netflix", 15.99)
        resp = client.delete(f"/api/recurring/{rec.id}")
        assert resp.status_code == 204
        test_db.refresh(rec)
        assert rec.is_active is False

    def test_upcoming_bills(self, client, test_db):
        _create_recurrence(test_db, "Netflix", 15.99, next_due_date=date.today() + timedelta(days=3))
        _create_recurrence(test_db, "Far Future", 100.0, next_due_date=date.today() + timedelta(days=100))
        resp = client.get("/api/recurring/upcoming?days=30")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["description"] == "Netflix"

    def test_overdue_bills(self, client, test_db):
        _create_recurrence(test_db, "Late Bill", 50.0, next_due_date=date.today() - timedelta(days=3))
        _create_recurrence(test_db, "Future Bill", 100.0, next_due_date=date.today() + timedelta(days=5))
        resp = client.get("/api/recurring/overdue")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["is_overdue"] is True

    def test_subscriptions_summary(self, client, test_db):
        _create_recurrence(test_db, "Netflix", 15.99, "monthly")
        _create_recurrence(test_db, "Spotify", 9.99, "monthly")
        resp = client.get("/api/recurring/subscriptions/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["subscription_count"] == 2
        assert data["monthly_total"] == pytest.approx(25.98, abs=0.01)

    def test_mark_paid(self, client, test_db):
        next_due = date.today() + timedelta(days=5)
        rec = _create_recurrence(test_db, "Netflix", 15.99, "monthly", next_due_date=next_due)
        resp = client.post(f"/api/recurring/{rec.id}/mark-paid")
        assert resp.status_code == 201
        data = resp.json()
        assert data["amount"] == 15.99
        assert data["is_recurring"] is True
        # Verify next_due_date advanced
        test_db.refresh(rec)
        assert rec.last_paid_date == date.today()
        # Next due should be ~1 month later
        assert rec.next_due_date > next_due

    def test_mark_paid_not_found(self, client, test_db):
        resp = client.post("/api/recurring/999/mark-paid")
        assert resp.status_code == 404

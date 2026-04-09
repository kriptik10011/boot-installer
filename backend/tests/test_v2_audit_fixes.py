"""
V2 Audit Fix Regression Tests — 42 issues across 5 severity levels.

Each test is named after the issue ID it guards against.
These tests would have caught the original bugs if they'd existed.
"""

import math
import pytest
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

from app.models.savings_goal import SavingsGoal
from app.models.debt import DebtAccount, DebtPayment
from app.models.asset import Asset, AssetHistory
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.income import IncomeSource
from app.models.budget import BudgetCategory, BudgetAllocation


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def _create_savings_goal(db, name="Vacation", target=5000.0, current=1000.0,
                          monthly=200.0, target_date=None, category="custom"):
    goal = SavingsGoal(
        name=name, target_amount=target, current_amount=current,
        monthly_contribution=monthly, target_date=target_date,
        category=category, priority=3,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def _create_debt(db, name="Credit Card", balance=5000.0, original=5000.0,
                  rate=18.0, minimum=100.0, extra=0.0):
    debt = DebtAccount(
        name=name, current_balance=balance, original_balance=original,
        interest_rate=rate, minimum_payment=minimum,
        extra_payment_amount=extra, is_active=True, type="credit_card",
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return debt


def _create_asset(db, name="Checking", value=5000.0, asset_type="checking", is_liquid=True):
    asset = Asset(
        name=name, current_value=value, type=asset_type,
        is_liquid=is_liquid, last_updated=date.today(),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def _create_transaction(db, amount=50.0, is_income=False, txn_date=None,
                         is_recurring=False, merchant=None, category_id=None):
    txn = Transaction(
        date=txn_date or date.today(),
        amount=amount,
        description="Test Transaction",
        is_income=is_income,
        is_recurring=is_recurring,
        merchant=merchant,
        category_id=category_id,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def _create_budget_category(db, name="Groceries", budget_amount=500.0, cat_type="need"):
    cat = BudgetCategory(
        name=name, type=cat_type, budget_amount=budget_amount,
        period="monthly", sort_order=0, is_active=True,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def _create_income_source(db, name="Salary", amount=4000.0, frequency="monthly",
                           next_date=None):
    src = IncomeSource(
        name=name, amount=amount, frequency=frequency,
        next_expected_date=next_date, is_active=True,
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


def _create_recurring(db, description="Netflix", amount=15.99, frequency="monthly",
                       next_due=None, is_subscription=True, is_active=True):
    rec = TransactionRecurrence(
        description=description, amount=amount, frequency=frequency,
        next_due_date=next_due, is_subscription=is_subscription,
        is_active=is_active,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


# ══════════════════════════════════════════════════════════
# CRITICAL FIXES
# ══════════════════════════════════════════════════════════

class TestC1_SpendingVelocityDivisionByZero:
    """C-1: calculate_spending_velocity must not crash when period_start is future."""

    def test_future_period_start_no_crash(self, test_db):
        from app.services.transaction_service import calculate_spending_velocity
        _create_budget_category(test_db, "Food", 500.0)
        future = date.today() + timedelta(days=60)
        # Must not raise ZeroDivisionError
        results = calculate_spending_velocity(test_db, future)
        assert isinstance(results, list)
        for v in results:
            assert v.velocity >= 0  # No negative velocity
            assert v.pct_period_elapsed > 0  # Never zero (clamped)

    def test_today_period_start_works(self, test_db):
        from app.services.transaction_service import calculate_spending_velocity
        _create_budget_category(test_db, "Food", 500.0)
        results = calculate_spending_velocity(test_db, date.today())
        assert isinstance(results, list)

    def test_past_period_start_works(self, test_db):
        from app.services.transaction_service import calculate_spending_velocity
        _create_budget_category(test_db, "Food", 500.0)
        past = date.today() - timedelta(days=15)
        results = calculate_spending_velocity(test_db, past)
        assert isinstance(results, list)


class TestC2_DebtSnowballFreedMinimums:
    """C-2: Freed minimums from paid-off debts must roll into extra for next debt."""

    def test_snowball_freed_minimums_accumulate(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        # Small debt pays off first, its $50 minimum should roll to next
        _create_debt(test_db, "Small", 100.0, 100.0, 0.0, 50.0)
        _create_debt(test_db, "Medium", 1000.0, 1000.0, 0.0, 50.0)

        plan = calculate_payoff_plan(test_db, "snowball", extra_monthly=0.0)

        # After Small pays off (month 2), Medium should get $50 + $50 = $100/month
        # Medium: 1000 / 100 = ~10 more months after Small pays off
        # Total: 2 (small) + about 9 (medium at $100/mo) = ~11
        # Without snowball effect: Small=2, Medium=20 → total 20
        assert plan.total_months < 15, (
            f"Snowball should finish in ~12 months, got {plan.total_months}. "
            "Freed minimums likely not rolling over correctly."
        )

    def test_avalanche_with_multiple_payoffs(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "High Rate Small", 500.0, 500.0, 24.0, 50.0)
        _create_debt(test_db, "Low Rate Large", 5000.0, 5000.0, 6.0, 100.0)

        plan_avalanche = calculate_payoff_plan(test_db, "avalanche")
        plan_minimum = calculate_payoff_plan(test_db, "minimum")

        # Avalanche should finish faster because freed minimums accelerate payoff
        assert plan_avalanche.total_months <= plan_minimum.total_months


class TestC3_SafeToSpendFormula:
    """C-3: Safe-to-spend must use one coherent formula, not overwrite."""

    def test_safe_to_spend_no_double_subtraction(self, test_db):
        from app.services.budget_engine import safe_to_spend
        # Set up: $4000 income, $1000 bills, $200 savings, $500 spent
        _create_income_source(test_db, "Job", 4000.0)
        _create_recurring(test_db, "Rent", 1000.0, "monthly",
                          next_due=date.today() + timedelta(days=5),
                          is_subscription=False)
        _create_savings_goal(test_db, "Fund", 10000.0, 0.0, 200.0,
                              category="emergency_fund")
        _create_transaction(test_db, 500.0, is_income=False)

        result = safe_to_spend(test_db)

        # safe = 4000 - 500 - 1000 - 200 = 2300
        assert result.amount > 0
        # Verify the formula components add up
        expected = (result.total_income - result.already_spent
                    - result.upcoming_bills - result.savings_contributions)
        assert abs(result.amount - max(0, expected)) < 1.0, (
            f"Formula mismatch: expected ~{expected}, got {result.amount}"
        )


# ══════════════════════════════════════════════════════════
# HIGH FIXES
# ══════════════════════════════════════════════════════════

class TestH2_NegativeSplitAmounts:
    """H-2: Split transaction must reject negative amounts."""

    def test_rejects_negative_split_amount(self, test_db):
        from app.services.transaction_service import create_split_transaction
        with pytest.raises(ValueError, match="positive"):
            create_split_transaction(
                test_db, date.today(), 100.0, "Test",
                [(1, -50.0), (2, 150.0)],
            )

    def test_rejects_zero_split_amount(self, test_db):
        from app.services.transaction_service import create_split_transaction
        with pytest.raises(ValueError, match="positive"):
            create_split_transaction(
                test_db, date.today(), 100.0, "Test",
                [(1, 0.0), (2, 100.0)],
            )


class TestH3_MathCeilInProjections:
    """H-3: Months to goal must use math.ceil, not int(x + 0.99)."""

    def test_exact_division_gives_exact_months(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        # 4000 / 200 = exactly 20 months
        _create_savings_goal(test_db, target=5000.0, current=1000.0, monthly=200.0)
        results = calculate_goal_projections(test_db)
        assert results[0].months_to_goal == 20

    def test_fractional_division_rounds_up(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        # 4001 / 200 = 20.005 → should ceil to 21
        _create_savings_goal(test_db, target=5001.0, current=1000.0, monthly=200.0)
        results = calculate_goal_projections(test_db)
        assert results[0].months_to_goal == math.ceil(4001.0 / 200.0)
        assert results[0].months_to_goal == 21

    def test_small_remainder_still_rounds_up(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        # 100.01 / 100 = 1.0001 → should be 2 months
        _create_savings_goal(test_db, target=200.01, current=100.0, monthly=100.0)
        results = calculate_goal_projections(test_db)
        assert results[0].months_to_goal == 2


class TestH4_PastTargetDate:
    """H-4: Goals with past target_date should show overdue status."""

    def test_past_target_date_not_on_track(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        past_date = date.today() - timedelta(days=30)
        _create_savings_goal(test_db, target=5000.0, current=1000.0,
                              monthly=200.0, target_date=past_date)
        results = calculate_goal_projections(test_db)
        assert results[0].on_track is False
        assert results[0].required_monthly == 4000.0  # Need it all now


class TestH5_EmergencyFundZeroExpenses:
    """H-5: Emergency fund with zero expenses should handle gracefully."""

    def test_zero_expenses_zero_target(self, test_db):
        from app.services.savings_service import calculate_emergency_fund
        result = calculate_emergency_fund(test_db)
        assert result.monthly_expenses == 0.0
        assert result.three_month_target == 0.0
        assert result.months_covered == 0.0
        assert result.status == "none"


class TestH6_ZeroMinimumPayment:
    """H-6: Debt with $0 minimum and positive interest must not loop infinitely."""

    def test_zero_minimum_with_interest_terminates(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "Zero Min", 1000.0, 1000.0, 18.0, 0.0)
        plan = calculate_payoff_plan(test_db)
        # Should terminate (auto-set minimum to cover interest)
        assert plan.total_months > 0
        assert plan.total_months <= 600
        # Balance should decrease
        if plan.schedule:
            last_entry = [e for e in plan.schedule if e.debt_name == "Zero Min"][-1]
            assert last_entry.balance_after < 1000.0

    def test_zero_minimum_zero_interest_pays_off(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "Free Debt", 1000.0, 1000.0, 0.0, 0.0)
        plan = calculate_payoff_plan(test_db)
        # 0% APR, $0 min: auto-set to $1 minimum → 1000 months, but capped at 600
        assert plan.total_months <= 600


class TestH8_StaleRollover:
    """H-8: Rollover must use real-time transaction data, not stale allocation."""

    def test_rollover_reflects_actual_spending(self, test_db):
        from app.services.budget_engine import calculate_rollover, get_period_bounds

        cat = _create_budget_category(test_db, "Groceries", 500.0)
        cat.rollover_enabled = True
        test_db.commit()

        # Create spending in previous month
        prev_month = date.today().replace(day=1) - timedelta(days=1)
        prev_start, prev_end = get_period_bounds(prev_month)
        _create_transaction(
            test_db, 300.0, txn_date=prev_start + timedelta(days=5),
            category_id=cat.id,
        )

        # Create stale allocation with wrong spent_amount
        alloc = BudgetAllocation(
            category_id=cat.id, period_start=prev_start, period_end=prev_end,
            allocated_amount=500.0, spent_amount=100.0,  # Stale: says $100 but really $300
            rolled_over_from=0.0,
        )
        test_db.add(alloc)
        test_db.commit()

        # Rollover should use real spending ($300), not stale ($100)
        rollover = calculate_rollover(test_db, cat.id, date.today().replace(day=1))
        # Budget $500 - Real spent $300 = $200 rollover
        assert abs(rollover - 200.0) < 1.0, f"Expected ~200, got {rollover}"


class TestH9_AnnualSubscriptionNormalization:
    """H-9: Subscription summary must normalize annual/quarterly to monthly."""

    def test_annual_subscription_monthly_equivalent(self, test_db):
        from app.services.transaction_service import get_subscription_summary
        _create_recurring(test_db, "Annual Service", 120.0, "annual")
        result = get_subscription_summary(test_db)
        assert result["monthly_total"] == 10.0  # 120 / 12
        sub = result["subscriptions"][0]
        assert sub["monthly_equivalent"] == 10.0

    def test_quarterly_subscription_monthly_equivalent(self, test_db):
        from app.services.transaction_service import get_subscription_summary
        _create_recurring(test_db, "Quarterly Service", 30.0, "quarterly")
        result = get_subscription_summary(test_db)
        assert result["monthly_total"] == 10.0  # 30 / 3
        sub = result["subscriptions"][0]
        assert sub["monthly_equivalent"] == 10.0


class TestH10_H13_DayOfMonthMatching:
    """H-10/H-13: Income/bill due-on checks must respect start date, not just day-of-month."""

    def test_income_not_due_before_start_date(self, test_db):
        from app.services.net_worth_service import _income_due_on
        src = _create_income_source(
            test_db, "Job", 4000.0, "monthly",
            next_date=date(2026, 3, 15),
        )
        # Feb 15 has same day-of-month but is before next_expected_date
        feb_15 = date(2026, 2, 15)
        assert _income_due_on(src, feb_15) is False
        # March 15 should match
        mar_15 = date(2026, 3, 15)
        assert _income_due_on(src, mar_15) is True

    def test_bill_not_due_before_start_date(self, test_db):
        from app.services.net_worth_service import _bill_due_on
        rec = _create_recurring(
            test_db, "Electric", 100.0, "monthly",
            next_due=date(2026, 3, 20), is_subscription=False,
        )
        # Feb 20 has same day-of-month but is before next_due_date
        feb_20 = date(2026, 2, 20)
        assert _bill_due_on(rec, feb_20) is False
        # March 20 should match
        mar_20 = date(2026, 3, 20)
        assert _bill_due_on(rec, mar_20) is True


# ══════════════════════════════════════════════════════════
# MEDIUM FIXES
# ══════════════════════════════════════════════════════════

class TestM4_MarkPaidValidation:
    """M-4: Mark-paid must reject inactive recurring bills."""

    def test_cannot_pay_inactive_bill(self, client, test_db):
        rec = _create_recurring(test_db, "Old Bill", 50.0, "monthly",
                                 next_due=date.today(), is_subscription=False,
                                 is_active=False)
        resp = client.post(f"/api/recurring/{rec.id}/mark-paid")
        assert resp.status_code == 400
        assert "inactive" in resp.json()["detail"].lower()


class TestM7_EmptySpendingVelocity:
    """M-7: Spending velocity with no categories should return empty list."""

    def test_no_categories_returns_empty(self, test_db):
        from app.services.transaction_service import calculate_spending_velocity
        results = calculate_spending_velocity(test_db)
        assert results == []


class TestM10_SnapshotIncludesDebt:
    """M-10: Net worth snapshot should return debt total too."""

    def test_snapshot_returns_debt_info(self, client, test_db):
        _create_asset(test_db, "Cash", 5000.0)
        _create_debt(test_db, "Card", 2000.0, 2000.0, 18.0, 50.0)
        resp = client.post("/api/net-worth/snapshot")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_debt_snapshot" in data
        assert data["total_debt_snapshot"] == 2000.0


class TestM11_ForecastIncludesSavings:
    """M-11: Cash flow forecast should deduct savings contributions."""

    def test_savings_reduce_projected_balance(self, test_db):
        from app.services.net_worth_service import forecast_cash_flow
        _create_asset(test_db, "Checking", 10000.0, "checking", True)
        # No savings goal
        result_no_savings = forecast_cash_flow(test_db, days=30)

        # Add savings goal with $300/month contribution
        _create_savings_goal(test_db, "Fund", 10000.0, 0.0, 300.0)
        result_with_savings = forecast_cash_flow(test_db, days=30)

        # Balance should be lower with savings contributions
        assert result_with_savings.min_projected_balance < result_no_savings.min_projected_balance


# ══════════════════════════════════════════════════════════
# LOW FIXES
# ══════════════════════════════════════════════════════════

class TestL1_NamedConstant:
    """L-1: Duplicate window should use named constant."""

    def test_duplicate_window_constant_exists(self):
        from app.services.transaction_service import DUPLICATE_WINDOW_HOURS
        assert DUPLICATE_WINDOW_HOURS == 24


class TestL4_NoDuplicateDebtToResponse:
    """L-4: _debt_to_response should not be duplicated across routers."""

    def test_net_worth_imports_from_debt(self):
        """Verify net_worth router imports _debt_to_response from debt router."""
        from app.routers.net_worth import _debt_to_response
        from app.routers.debt import _account_to_response
        # They should be the same function
        assert _debt_to_response is _account_to_response


class TestL7_TypedWarnings:
    """L-7: Cash flow warnings should use typed Pydantic model."""

    def test_forecast_endpoint_has_typed_warnings(self, client, test_db):
        _create_asset(test_db, "Checking", 100.0, "checking", True)
        resp = client.get("/api/net-worth/forecast?days=7&threshold=500")
        assert resp.status_code == 200
        data = resp.json()
        for w in data["low_balance_warnings"]:
            assert "date" in w
            assert "projected_balance" in w
            assert "threshold" in w
            assert "message" in w


# ══════════════════════════════════════════════════════════
# EDGE CASES (would have caught original bugs)
# ══════════════════════════════════════════════════════════

class TestEdgeCaseRegression:
    """Tests that would have prevented the original 42 issues from shipping."""

    def test_spending_velocity_all_zero_budget(self, test_db):
        """Categories with $0 budget should be excluded from velocity."""
        from app.services.transaction_service import calculate_spending_velocity
        cat = _create_budget_category(test_db, "Free", 0.0)
        results = calculate_spending_velocity(test_db)
        # $0 budget categories should be filtered out
        assert len(results) == 0

    def test_debt_payoff_interest_exceeds_payment(self, test_db):
        """Debt where interest > minimum: should still terminate."""
        from app.services.debt_service import calculate_payoff_plan
        # $300/month interest on $10K, only $50 min payment
        _create_debt(test_db, "Drowning", 10000.0, 10000.0, 36.0, 50.0)
        plan = calculate_payoff_plan(test_db)
        assert plan.total_months <= 600

    def test_savings_goal_already_met(self, test_db):
        """Goal with current >= target should show 0 months."""
        from app.services.savings_service import calculate_goal_projections
        _create_savings_goal(test_db, target=1000.0, current=1500.0, monthly=100.0)
        results = calculate_goal_projections(test_db)
        assert results[0].remaining == 0.0
        assert results[0].months_to_goal == 0

    def test_safe_to_spend_with_no_data(self, test_db):
        """Safe-to-spend with no income, no bills, no spending."""
        from app.services.budget_engine import safe_to_spend
        result = safe_to_spend(test_db)
        assert result.amount == 0.0

    def test_forecast_with_income_and_bills(self, test_db):
        """Forecast should include both income and bill events."""
        from app.services.net_worth_service import forecast_cash_flow
        _create_asset(test_db, "Checking", 5000.0, "checking", True)
        next_week = date.today() + timedelta(days=7)
        _create_income_source(test_db, "Pay", 2000.0, "monthly", next_date=next_week)
        _create_recurring(test_db, "Rent", 1500.0, "monthly",
                           next_due=next_week, is_subscription=False)
        result = forecast_cash_flow(test_db, days=30)
        # Should have some days with income and some with bills
        has_income = any(d.income > 0 for d in result.daily_projections)
        has_bills = any(d.bills > 0 for d in result.daily_projections)
        assert has_income, "Forecast should include income events"
        assert has_bills, "Forecast should include bill events"

"""
V2 Sessions 8-10 Tests — Savings projections, debt payoff engine,
net worth trends, cash flow forecasting.

Comprehensive tests covering all new service functions and endpoints.
"""

import pytest
from datetime import date, timedelta
from app.models.savings_goal import SavingsGoal
from app.models.debt import DebtAccount, DebtPayment
from app.models.asset import Asset, AssetHistory
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.income import IncomeSource
from app.models.budget import BudgetCategory


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


def _create_transaction(db, amount=50.0, is_income=False, txn_date=None, is_recurring=False):
    txn = Transaction(
        date=txn_date or date.today(),
        amount=amount,
        description="Test Transaction",
        is_income=is_income,
        is_recurring=is_recurring,
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


# ══════════════════════════════════════════════════════════
# SESSION 8: Savings Service Tests
# ══════════════════════════════════════════════════════════

class TestGoalProjections:
    def test_projects_completion_with_contribution(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        _create_savings_goal(test_db, target=5000.0, current=1000.0, monthly=200.0)
        results = calculate_goal_projections(test_db)
        assert len(results) == 1
        p = results[0]
        assert p.remaining == 4000.0
        assert p.months_to_goal == 20  # 4000 / 200 = 20
        assert p.projected_completion is not None

    def test_no_projection_without_contribution(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        _create_savings_goal(test_db, target=5000.0, current=1000.0, monthly=0.0)
        results = calculate_goal_projections(test_db)
        assert len(results) == 1
        assert results[0].months_to_goal is None
        assert results[0].projected_completion is None

    def test_on_track_with_target_date(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        from dateutil.relativedelta import relativedelta
        target_date = date.today() + relativedelta(months=30)
        _create_savings_goal(
            test_db, target=5000.0, current=1000.0, monthly=200.0,
            target_date=target_date,
        )
        results = calculate_goal_projections(test_db)
        assert results[0].on_track is True  # 20 months < 30 months

    def test_behind_schedule(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        from dateutil.relativedelta import relativedelta
        target_date = date.today() + relativedelta(months=10)
        _create_savings_goal(
            test_db, target=5000.0, current=1000.0, monthly=200.0,
            target_date=target_date,
        )
        results = calculate_goal_projections(test_db)
        assert results[0].on_track is False  # 20 months > 10 months
        assert results[0].required_monthly is not None
        assert results[0].required_monthly > 200.0

    def test_skips_achieved_goals(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        goal = _create_savings_goal(test_db, target=1000.0, current=1000.0, monthly=0.0)
        goal.is_achieved = True
        test_db.commit()
        results = calculate_goal_projections(test_db)
        assert len(results) == 0

    def test_multiple_goals_sorted_by_priority(self, test_db):
        from app.services.savings_service import calculate_goal_projections
        _create_savings_goal(test_db, name="Low Priority", target=1000.0, current=0.0, monthly=100.0)
        goal2 = _create_savings_goal(test_db, name="High Priority", target=2000.0, current=0.0, monthly=100.0)
        goal2.priority = 1
        test_db.commit()
        results = calculate_goal_projections(test_db)
        assert len(results) == 2
        assert results[0].goal_name == "High Priority"


class TestEmergencyFund:
    def test_no_transaction_history_uses_budget(self, test_db):
        from app.services.savings_service import calculate_emergency_fund
        _create_budget_category(test_db, "Groceries", 500.0, "need")
        _create_budget_category(test_db, "Dining", 200.0, "want")
        result = calculate_emergency_fund(test_db)
        assert result.monthly_expenses == 700.0  # needs + wants
        assert result.three_month_target == 2100.0
        assert result.six_month_target == 4200.0
        assert result.status == "none"

    def test_with_emergency_fund_goal(self, test_db):
        from app.services.savings_service import calculate_emergency_fund
        _create_budget_category(test_db, "Groceries", 1000.0, "need")
        _create_savings_goal(
            test_db, name="Emergency Fund", target=6000.0,
            current=3500.0, category="emergency_fund",
        )
        result = calculate_emergency_fund(test_db)
        assert result.current_emergency_fund == 3500.0
        assert result.months_covered > 0
        assert result.status in ["building", "partial", "adequate", "strong"]

    def test_status_none_when_zero_fund(self, test_db):
        from app.services.savings_service import calculate_emergency_fund
        result = calculate_emergency_fund(test_db)
        assert result.status == "none"

    def test_strong_status(self, test_db):
        from app.services.savings_service import calculate_emergency_fund
        _create_budget_category(test_db, "Rent", 1000.0, "need")
        _create_savings_goal(
            test_db, name="Emergency Fund", target=12000.0,
            current=10000.0, category="emergency_fund",
        )
        result = calculate_emergency_fund(test_db)
        assert result.months_covered >= 6
        assert result.status == "strong"


class TestMilestones:
    def test_detects_milestone(self, test_db):
        from app.services.savings_service import detect_milestones
        _create_savings_goal(test_db, target=1000.0, current=500.0)
        results = detect_milestones(test_db)
        assert len(results) == 1
        assert results[0].milestone_pct == 50

    def test_100_percent_milestone(self, test_db):
        from app.services.savings_service import detect_milestones
        _create_savings_goal(test_db, target=1000.0, current=1000.0)
        results = detect_milestones(test_db)
        assert results[0].milestone_pct == 100

    def test_no_milestone_below_25(self, test_db):
        from app.services.savings_service import detect_milestones
        _create_savings_goal(test_db, target=1000.0, current=100.0)
        results = detect_milestones(test_db)
        assert len(results) == 0


# ══════════════════════════════════════════════════════════
# SESSION 8: Savings API Endpoint Tests
# ══════════════════════════════════════════════════════════

class TestSavingsEndpoints:
    def test_projections_endpoint(self, client, test_db):
        _create_savings_goal(test_db, target=5000.0, current=1000.0, monthly=200.0)
        resp = client.get("/api/savings/projections")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["remaining"] == 4000.0
        assert data[0]["months_to_goal"] == 20

    def test_emergency_fund_endpoint(self, client, test_db):
        _create_budget_category(test_db, "Groceries", 500.0, "need")
        resp = client.get("/api/savings/emergency-fund")
        assert resp.status_code == 200
        data = resp.json()
        assert "monthly_expenses" in data
        assert "status" in data

    def test_milestones_endpoint(self, client, test_db):
        _create_savings_goal(test_db, target=1000.0, current=750.0)
        resp = client.get("/api/savings/milestones")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["milestone_pct"] == 75


# ══════════════════════════════════════════════════════════
# SESSION 9: Debt Payoff Engine Tests
# ══════════════════════════════════════════════════════════

class TestPayoffPlan:
    def test_avalanche_strategy(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "High Rate", 3000.0, 3000.0, 24.0, 60.0)
        _create_debt(test_db, "Low Rate", 5000.0, 5000.0, 6.0, 80.0)
        plan = calculate_payoff_plan(test_db, "avalanche")
        assert plan.total_months > 0
        assert plan.total_interest > 0
        assert plan.debt_free_date is not None
        # Verify schedule contains entries
        assert len(plan.schedule) > 0

    def test_snowball_strategy(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "Small Balance", 1000.0, 1000.0, 18.0, 50.0)
        _create_debt(test_db, "Large Balance", 10000.0, 10000.0, 12.0, 200.0)
        plan = calculate_payoff_plan(test_db, "snowball")
        assert plan.total_months > 0
        assert plan.strategy == "snowball"

    def test_extra_payment_reduces_time(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "Test Debt", 5000.0, 5000.0, 18.0, 100.0)
        no_extra = calculate_payoff_plan(test_db, "avalanche", 0.0)
        with_extra = calculate_payoff_plan(test_db, "avalanche", 200.0)
        assert with_extra.total_months < no_extra.total_months
        assert with_extra.total_interest < no_extra.total_interest

    def test_no_debts_returns_empty(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        plan = calculate_payoff_plan(test_db)
        assert plan.total_months == 0
        assert plan.schedule == []

    def test_zero_balance_debt_excluded(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "Paid Off", 0.0, 5000.0, 18.0, 100.0)
        plan = calculate_payoff_plan(test_db)
        assert plan.total_months == 0

    def test_schedule_entries_have_correct_fields(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "Test", 2000.0, 2000.0, 12.0, 100.0)
        plan = calculate_payoff_plan(test_db)
        entry = plan.schedule[0]
        assert entry.month == 1
        assert entry.debt_name == "Test"
        assert entry.payment > 0
        assert entry.balance_after < 2000.0


class TestStrategyComparison:
    def test_avalanche_saves_interest(self, test_db):
        from app.services.debt_service import compare_strategies
        _create_debt(test_db, "High Rate", 5000.0, 5000.0, 24.0, 100.0)
        _create_debt(test_db, "Low Rate", 2000.0, 2000.0, 6.0, 50.0)
        result = compare_strategies(test_db)
        # Avalanche (highest rate first) should save interest vs snowball (smallest balance first)
        assert result["interest_savings"] >= 0  # avalanche saves interest

    def test_comparison_returns_both_strategies(self, test_db):
        from app.services.debt_service import compare_strategies
        _create_debt(test_db, "Debt A", 3000.0, 3000.0, 18.0, 75.0)
        result = compare_strategies(test_db)
        assert result["snowball"].strategy == "snowball"
        assert result["avalanche"].strategy == "avalanche"


class TestExtraPaymentSimulation:
    def test_extra_saves_time_and_interest(self, test_db):
        from app.services.debt_service import simulate_extra_payment
        _create_debt(test_db, "Test Debt", 5000.0, 5000.0, 18.0, 100.0)
        result = simulate_extra_payment(test_db, 100.0)
        assert result["months_saved"] > 0
        assert result["interest_saved"] > 0
        assert result["extra_monthly"] == 100.0


class TestDebtSummary:
    def test_debt_summary(self, test_db):
        from app.services.debt_service import get_debt_summary
        _create_debt(test_db, "Card A", 3000.0, 3000.0, 18.0, 75.0)
        _create_debt(test_db, "Card B", 5000.0, 5000.0, 24.0, 100.0)
        result = get_debt_summary(test_db)
        assert result["total_debt"] == 8000.0
        assert result["total_minimum_payments"] == 175.0
        assert result["debt_count"] == 2
        assert result["weighted_avg_interest"] > 18.0  # B has higher rate+balance


# ══════════════════════════════════════════════════════════
# SESSION 9: Debt API Endpoint Tests
# ══════════════════════════════════════════════════════════

class TestDebtEndpoints:
    def test_payoff_plan_endpoint(self, client, test_db):
        _create_debt(test_db, "Test Debt", 3000.0, 3000.0, 18.0, 75.0)
        resp = client.get("/api/debt/payoff-plan?strategy=avalanche")
        assert resp.status_code == 200
        data = resp.json()
        assert data["strategy"] == "avalanche"
        assert data["total_months"] > 0
        assert len(data["schedule"]) > 0

    def test_compare_strategies_endpoint(self, client, test_db):
        _create_debt(test_db, "Card", 5000.0, 5000.0, 18.0, 100.0)
        resp = client.get("/api/debt/compare-strategies")
        assert resp.status_code == 200
        data = resp.json()
        assert "snowball" in data
        assert "avalanche" in data
        assert "interest_savings" in data

    def test_what_if_endpoint(self, client, test_db):
        _create_debt(test_db, "Card", 5000.0, 5000.0, 18.0, 100.0)
        resp = client.get("/api/debt/what-if?extra=200")
        assert resp.status_code == 200
        data = resp.json()
        assert data["months_saved"] > 0
        assert data["interest_saved"] > 0

    # detail-summary endpoint removed in Phase F5 (no frontend consumer)


# ══════════════════════════════════════════════════════════
# SESSION 10: Net Worth Service Tests
# ══════════════════════════════════════════════════════════

class TestNetWorthTrend:
    def test_returns_trend_entries(self, test_db):
        from app.services.net_worth_service import get_net_worth_trend
        _create_asset(test_db, "Checking", 5000.0)
        results = get_net_worth_trend(test_db, months=3)
        assert len(results) > 0
        # Current month should include the asset
        latest = results[-1]
        assert latest.total_assets >= 0

    def test_empty_with_no_data(self, test_db):
        from app.services.net_worth_service import get_net_worth_trend
        results = get_net_worth_trend(test_db, months=3)
        # Still returns entries (months), but with zero values
        assert len(results) > 0


class TestNetWorthMilestones:
    def test_milestones_achieved(self, test_db):
        from app.services.net_worth_service import detect_net_worth_milestones
        _create_asset(test_db, "Savings", 15000.0)
        results = detect_net_worth_milestones(test_db)
        achieved = [m for m in results if m.achieved]
        assert len(achieved) >= 3  # $1K, $5K, $10K at minimum

    def test_milestones_not_achieved(self, test_db):
        from app.services.net_worth_service import detect_net_worth_milestones
        _create_asset(test_db, "Small", 500.0)
        results = detect_net_worth_milestones(test_db)
        achieved = [m for m in results if m.achieved]
        assert len(achieved) == 0  # $500 < $1K

    def test_negative_net_worth(self, test_db):
        from app.services.net_worth_service import detect_net_worth_milestones
        _create_asset(test_db, "Checking", 1000.0)
        _create_debt(test_db, "Debt", 5000.0, 5000.0, 18.0, 100.0)
        results = detect_net_worth_milestones(test_db)
        achieved = [m for m in results if m.achieved]
        assert len(achieved) == 0


class TestCashFlowForecast:
    def test_basic_forecast(self, test_db):
        from app.services.net_worth_service import forecast_cash_flow
        _create_asset(test_db, "Checking", 5000.0, "checking", True)
        result = forecast_cash_flow(test_db, days=30)
        assert result.start_balance == 5000.0
        assert result.days == 30
        assert len(result.daily_projections) == 30

    def test_low_balance_warnings(self, test_db):
        from app.services.net_worth_service import forecast_cash_flow
        _create_asset(test_db, "Checking", 100.0, "checking", True)
        result = forecast_cash_flow(test_db, days=30, low_balance_threshold=500.0)
        assert result.start_balance == 100.0
        # Should have warnings since starting below threshold
        assert len(result.low_balance_warnings) > 0

    def test_forecast_includes_income_and_bills(self, test_db):
        from app.services.net_worth_service import forecast_cash_flow
        _create_asset(test_db, "Checking", 5000.0, "checking", True)
        result = forecast_cash_flow(test_db, days=30)
        assert result.min_projected_balance <= result.start_balance

    def test_empty_forecast_with_no_assets(self, test_db):
        from app.services.net_worth_service import forecast_cash_flow
        result = forecast_cash_flow(test_db, days=7)
        assert result.start_balance == 0.0
        assert len(result.daily_projections) == 7


# ══════════════════════════════════════════════════════════
# SESSION 10: Net Worth API Endpoint Tests
# ══════════════════════════════════════════════════════════

class TestNetWorthEndpoints:
    def test_trend_endpoint(self, client, test_db):
        _create_asset(test_db, "Checking", 5000.0)
        resp = client.get("/api/net-worth/trend?months=3")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0

    def test_milestones_endpoint(self, client, test_db):
        _create_asset(test_db, "Big Account", 50000.0)
        resp = client.get("/api/net-worth/milestones")
        assert resp.status_code == 200
        data = resp.json()
        achieved = [m for m in data if m["achieved"]]
        assert len(achieved) >= 4  # 1K, 5K, 10K, 25K, 50K

    def test_forecast_endpoint(self, client, test_db):
        _create_asset(test_db, "Checking", 5000.0, "checking", True)
        resp = client.get("/api/net-worth/forecast?days=14")
        assert resp.status_code == 200
        data = resp.json()
        assert data["start_balance"] == 5000.0
        assert data["days"] == 14
        assert len(data["daily_projections"]) == 14


# ══════════════════════════════════════════════════════════
# CROSS-SESSION: Integration & Edge Case Tests
# ══════════════════════════════════════════════════════════

class TestEdgeCases:
    def test_debt_payoff_with_zero_interest(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        _create_debt(test_db, "0% Promo", 3000.0, 3000.0, 0.0, 100.0)
        plan = calculate_payoff_plan(test_db)
        assert plan.total_interest == 0.0
        assert plan.total_months == 30  # 3000 / 100 = 30

    def test_savings_goal_already_exceeded(self, test_db):
        from app.services.savings_service import detect_milestones
        _create_savings_goal(test_db, target=1000.0, current=1500.0)
        results = detect_milestones(test_db)
        assert results[0].milestone_pct == 100

    def test_emergency_fund_zero_expenses(self, test_db):
        from app.services.savings_service import calculate_emergency_fund
        result = calculate_emergency_fund(test_db)
        # No expenses and no budget → 0 monthly expenses
        assert result.monthly_expenses == 0.0
        assert result.status == "none"

    def test_cash_flow_zero_spending_history(self, test_db):
        from app.services.net_worth_service import forecast_cash_flow
        _create_asset(test_db, "Checking", 10000.0, "checking", True)
        result = forecast_cash_flow(test_db, days=7)
        # With no spending history, daily spending should be 0
        assert result.daily_projections[0].expenses == 0.0

    def test_high_interest_debt_safety_cap(self, test_db):
        from app.services.debt_service import calculate_payoff_plan
        # Very small payment on high-interest debt - should still terminate
        _create_debt(test_db, "Tiny Payment", 10000.0, 10000.0, 36.0, 50.0)
        plan = calculate_payoff_plan(test_db)
        # With 36% APR on $10K and only $50/month minimum,
        # monthly interest is $300 which exceeds payment.
        # Safety cap should prevent infinite loop (600 months max)
        assert plan.total_months <= 600

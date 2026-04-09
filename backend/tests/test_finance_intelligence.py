"""
Tests for V2 Session 14: Financial Intelligence Integration.

Tests cover: spending velocity insights, bill due soon insights,
savings goal pacing, milestone celebrations, budget depletion alerts.
"""

from datetime import date, timedelta
import pytest

from app.models.budget import BudgetCategory
from app.models.transaction import Transaction
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.savings_goal import SavingsGoal
from app.services.pattern_detection.engine import PatternEngine


@pytest.fixture
def finance_intel_data(test_db):
    """Set up finance data for intelligence testing."""
    db = test_db
    today = date.today()
    first_of_month = today.replace(day=1)

    # Budget categories
    groceries = BudgetCategory(
        name="Groceries", type="need", budget_amount=600.0,
        is_active=True, sort_order=1,
    )
    dining = BudgetCategory(
        name="Dining", type="want", budget_amount=200.0,
        is_active=True, sort_order=2,
    )
    db.add_all([groceries, dining])
    db.flush()

    # Transactions: overspend on groceries (total $900 = 150% of $600 budget)
    # Must exceed 130% of budget to trigger velocity > 1.3 even on the last day
    txns = [
        Transaction(
            date=first_of_month + timedelta(days=1), amount=350.0,
            description="Big grocery run", category_id=groceries.id,
            is_income=False,
        ),
        Transaction(
            date=first_of_month + timedelta(days=3), amount=300.0,
            description="Costco", category_id=groceries.id,
            is_income=False,
        ),
        Transaction(
            date=first_of_month + timedelta(days=5), amount=250.0,
            description="Specialty store", category_id=groceries.id,
            is_income=False,
        ),
    ]
    db.add_all(txns)

    # Recurring bill due tomorrow
    bill_tomorrow = TransactionRecurrence(
        description="Electric Bill", amount=120.0, frequency="monthly",
        is_active=True, next_due_date=today + timedelta(days=1),
        is_subscription=False,
    )
    # Recurring bill due today
    bill_today = TransactionRecurrence(
        description="Phone Bill", amount=85.0, frequency="monthly",
        is_active=True, next_due_date=today,
        is_subscription=False,
    )
    db.add_all([bill_tomorrow, bill_today])

    # Savings goal at 50% milestone
    vacation = SavingsGoal(
        name="Vacation Fund", target_amount=2000.0,
        current_amount=1020.0, monthly_contribution=100.0,
        category="vacation", is_achieved=False, priority=2,
    )
    # Savings goal behind pace
    house = SavingsGoal(
        name="Down Payment", target_amount=50000.0,
        current_amount=5000.0, monthly_contribution=500.0,
        target_date=date(today.year + 1, 6, 1),
        category="down_payment", is_achieved=False, priority=1,
    )
    db.add_all([vacation, house])
    db.commit()

    return {
        "groceries_id": groceries.id,
        "dining_id": dining.id,
    }


class TestSpendingVelocityInsights:
    def test_overspending_generates_insight(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()

        velocity_insights = [i for i in insights if i["type"] == "spending_velocity_high"]
        # Groceries: $900 spent out of $600 budget (150%) — triggers velocity > 1.3
        # even on the last day of the month when pct_elapsed = 100%
        assert len(velocity_insights) >= 1
        grocery_insight = next(
            (i for i in velocity_insights if "Groceries" in i["message"]),
            None,
        )
        assert grocery_insight is not None
        assert grocery_insight["priority"] == 2
        assert grocery_insight["confidence"] == 0.85

    def test_no_insight_for_on_track_category(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()

        velocity_insights = [i for i in insights if i["type"] == "spending_velocity_high"]
        # Dining has no transactions, so no velocity alert
        dining_insight = next(
            (i for i in velocity_insights if "Dining" in i["message"]),
            None,
        )
        assert dining_insight is None


class TestBillDueSoonInsights:
    def test_bill_due_today_priority_1(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()

        bill_insights = [i for i in insights if i["type"] == "bill_due_soon"]
        today_bill = next(
            (i for i in bill_insights if "Phone Bill" in i["message"]),
            None,
        )
        assert today_bill is not None
        assert today_bill["priority"] == 1
        assert "due today" in today_bill["message"]

    def test_bill_due_tomorrow_priority_2(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()

        bill_insights = [i for i in insights if i["type"] == "bill_due_soon"]
        tomorrow_bill = next(
            (i for i in bill_insights if "Electric Bill" in i["message"]),
            None,
        )
        assert tomorrow_bill is not None
        assert tomorrow_bill["priority"] == 2
        assert "due in 1 day" in tomorrow_bill["message"]


class TestSavingsInsights:
    def test_milestone_celebration(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()

        milestone_insights = [i for i in insights if i["type"] == "savings_milestone"]
        vacation_milestone = next(
            (i for i in milestone_insights if "Vacation" in i["message"]),
            None,
        )
        assert vacation_milestone is not None
        assert "50%" in vacation_milestone["message"]
        assert vacation_milestone["priority"] == 4
        assert vacation_milestone["confidence"] == 1.0

    def test_behind_pace_warning(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()

        pacing_insights = [i for i in insights if i["type"] == "savings_behind_pace"]
        house_pacing = next(
            (i for i in pacing_insights if "Down Payment" in i["message"]),
            None,
        )
        assert house_pacing is not None
        assert house_pacing["priority"] == 3
        assert "$" in house_pacing["message"]


class TestNoFinanceData:
    def test_no_insights_without_data(self, test_db):
        """Financial insights should not crash with no finance data."""
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()
        # Should return an empty list or only non-finance insights
        finance_types = {
            "spending_velocity_high", "budget_nearly_depleted",
            "bill_due_soon", "savings_behind_pace", "savings_milestone",
        }
        finance_insights = [i for i in insights if i["type"] in finance_types]
        assert len(finance_insights) == 0


class TestInsightEvidenceFormat:
    def test_all_insights_have_evidence(self, test_db, finance_intel_data):
        engine = PatternEngine(test_db)
        insights = engine.get_actionable_insights()
        for insight in insights:
            if insight["type"].startswith("spending_") or insight["type"].startswith("bill_") or insight["type"].startswith("savings_") or insight["type"].startswith("budget_"):
                assert "evidence" in insight, f"Missing evidence on {insight['type']}"
                ev = insight["evidence"]
                assert "context" in ev, f"Missing context on {insight['type']}"

    def test_api_returns_finance_insights(self, client, finance_intel_data):
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        resp = client.get(f"/api/patterns/insights?week_start={monday.isoformat()}")
        assert resp.status_code == 200
        data = resp.json()
        # Should have at least the bill_due_soon insights
        bill_insights = [i for i in data if i["type"] == "bill_due_soon"]
        assert len(bill_insights) >= 1

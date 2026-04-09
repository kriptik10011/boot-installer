"""
Tests for V2 Session 12: Financial Reports & Analytics.

Tests cover: spending breakdown, income vs expenses, category trends,
merchant analysis, savings rate, health score, monthly close, year review, export.
"""

from datetime import date, timedelta
import pytest

from app.models.budget import BudgetCategory
from app.models.transaction import Transaction
from app.models.income import IncomeSource
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.savings_goal import SavingsGoal
from app.models.debt import DebtAccount
from app.models.asset import Asset


@pytest.fixture
def finance_data(test_db):
    """Set up comprehensive finance data for report testing."""
    db = test_db
    today = date.today()

    # Budget categories
    groceries = BudgetCategory(name="Groceries", type="need", budget_amount=600.0, is_active=True, sort_order=1)
    dining = BudgetCategory(name="Dining", type="want", budget_amount=200.0, is_active=True, sort_order=2)
    transport = BudgetCategory(name="Transport", type="need", budget_amount=150.0, is_active=True, sort_order=3)
    db.add_all([groceries, dining, transport])
    db.flush()

    # Income source
    salary = IncomeSource(
        name="Salary", amount=4200.0, frequency="monthly",
        is_active=True, next_expected_date=today.replace(day=1),
    )
    db.add(salary)
    db.flush()

    # Transactions this month
    first_of_month = today.replace(day=1)
    txns = [
        Transaction(date=first_of_month, amount=4200.0, description="Paycheck",
                    is_income=True, income_source_id=salary.id),
        Transaction(date=first_of_month + timedelta(days=1), amount=85.50,
                    description="Weekly groceries", merchant="Whole Foods",
                    category_id=groceries.id, is_income=False),
        Transaction(date=first_of_month + timedelta(days=3), amount=42.00,
                    description="Dinner out", merchant="Olive Garden",
                    category_id=dining.id, is_income=False),
        Transaction(date=first_of_month + timedelta(days=5), amount=65.00,
                    description="More groceries", merchant="Whole Foods",
                    category_id=groceries.id, is_income=False),
        Transaction(date=first_of_month + timedelta(days=7), amount=35.00,
                    description="Gas", merchant="Shell",
                    category_id=transport.id, is_income=False),
        Transaction(date=first_of_month + timedelta(days=8), amount=28.00,
                    description="Lunch", merchant="Chipotle",
                    category_id=dining.id, is_income=False),
    ]
    db.add_all(txns)

    # Recurring bill
    rent = TransactionRecurrence(
        description="Rent", amount=1500.0, frequency="monthly",
        is_active=True, next_due_date=today + timedelta(days=15),
        is_subscription=False,
    )
    netflix = TransactionRecurrence(
        description="Netflix", amount=15.99, frequency="monthly",
        is_active=True, next_due_date=today + timedelta(days=10),
        is_subscription=True, subscription_service="Netflix",
    )
    db.add_all([rent, netflix])

    # Savings goal
    emergency = SavingsGoal(
        name="Emergency Fund", target_amount=10000.0,
        current_amount=3000.0, monthly_contribution=200.0,
        category="emergency_fund", is_achieved=False, priority=1,
    )
    db.add(emergency)

    # Debt
    cc = DebtAccount(
        name="Credit Card", current_balance=2500.0,
        original_balance=5000.0, interest_rate=19.99,
        minimum_payment=75.0, due_day_of_month=15,
        type="credit_card", is_active=True,
    )
    db.add(cc)

    # Asset
    checking = Asset(
        name="Checking", current_value=5000.0,
        type="checking", is_liquid=True,
    )
    db.add(checking)

    db.commit()

    return {
        "groceries_id": groceries.id,
        "dining_id": dining.id,
        "transport_id": transport.id,
        "salary_id": salary.id,
    }


class TestSpendingBreakdown:
    def test_spending_by_category(self, test_db, finance_data):
        from app.services.reports_service import get_spending_breakdown

        today = date.today()
        first_of_month = today.replace(day=1)
        last_of_month = (first_of_month.replace(month=first_of_month.month + 1, day=1)
                         if first_of_month.month < 12
                         else first_of_month.replace(year=first_of_month.year + 1, month=1, day=1)) - timedelta(days=1)

        breakdown = get_spending_breakdown(test_db, first_of_month, last_of_month)
        assert len(breakdown) == 3

        # Groceries should be highest
        assert breakdown[0].category_name == "Groceries"
        assert breakdown[0].total_spent == 150.50
        assert breakdown[0].transaction_count == 2

    def test_spending_api(self, client, finance_data):
        today = date.today()
        first = today.replace(day=1)
        resp = client.get(f"/api/reports/spending/{first.isoformat()}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_spent"] > 0
        assert len(data["categories"]) == 3

    def test_empty_period(self, client):
        resp = client.get("/api/reports/spending/2020-01-01")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_spent"] == 0.0


class TestIncomeVsExpenses:
    def test_income_vs_expenses(self, test_db, finance_data):
        from app.services.reports_service import get_income_vs_expenses
        data = get_income_vs_expenses(test_db, 1)
        assert len(data) == 1
        assert data[0].total_income == 4200.0
        assert data[0].total_expenses > 0
        assert data[0].surplus > 0

    def test_api(self, client, finance_data):
        resp = client.get("/api/reports/income-vs-expenses?months=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["months"] == 3
        assert len(data["data"]) == 3


class TestCategoryTrends:
    def test_trends(self, test_db, finance_data):
        from app.services.reports_service import get_category_trends
        trends = get_category_trends(test_db, 3)
        assert len(trends) == 3
        # Each trend has monthly amounts
        for t in trends:
            assert len(t.monthly_amounts) == 3

    def test_api(self, client, finance_data):
        resp = client.get("/api/reports/category-trends?months=3")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["trends"]) == 3


class TestMerchantAnalysis:
    def test_merchants(self, test_db, finance_data):
        from app.services.reports_service import get_merchant_analysis
        today = date.today()
        first = today.replace(day=1)
        last = first + timedelta(days=31)
        merchants = get_merchant_analysis(test_db, first, last)
        assert len(merchants) >= 3
        # Whole Foods should be top (150.50 total)
        assert merchants[0].merchant == "Whole Foods"
        assert merchants[0].transaction_count == 2

    def test_api(self, client, finance_data):
        today = date.today()
        first = today.replace(day=1)
        resp = client.get(f"/api/reports/merchants?period_start={first.isoformat()}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["merchants"]) >= 3


class TestSavingsRate:
    def test_savings_rate(self, test_db, finance_data):
        from app.services.reports_service import get_savings_rate
        rates = get_savings_rate(test_db, 1)
        assert len(rates) == 1
        # Income 4200, expenses 255.50, rate = (4200-255.50)/4200 = 93.9%
        assert rates[0]["savings_rate"] > 0

    def test_api(self, client, finance_data):
        resp = client.get("/api/reports/savings-rate?months=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["months"] == 3


class TestHealthScore:
    def test_health_score_calculation(self, test_db, finance_data):
        from app.services.reports_service import calculate_health_score
        score = calculate_health_score(test_db)
        assert 0 <= score.total_score <= 100
        assert 0 <= score.savings_rate_score <= 100
        assert 0 <= score.bills_on_time_score <= 100
        assert 0 <= score.budget_adherence_score <= 100
        assert 0 <= score.emergency_fund_score <= 100
        assert 0 <= score.debt_to_income_score <= 100
        assert "savings_rate_pct" in score.details

    def test_health_score_api(self, client, finance_data):
        resp = client.get("/api/reports/health-score")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_score" in data
        assert "details" in data

    def test_empty_health_score(self, client):
        """Health score with no data should not crash."""
        resp = client.get("/api/reports/health-score")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_score"] >= 0


class TestMonthlyClose:
    def test_monthly_close(self, test_db, finance_data):
        from app.services.reports_service import get_monthly_close
        today = date.today()
        result = get_monthly_close(test_db, today)
        assert result["total_income"] == 4200.0
        assert result["total_expenses"] > 0
        assert result["net_worth"] > 0
        assert result["transaction_count"] > 0

    def test_api(self, client, finance_data):
        today = date.today()
        resp = client.get(f"/api/reports/monthly-close/{today.isoformat()}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_income"] > 0


class TestYearReview:
    def test_year_review(self, test_db, finance_data):
        from app.services.reports_service import get_year_review
        result = get_year_review(test_db, date.today().year)
        assert result["year"] == date.today().year
        assert result["total_income"] > 0
        assert result["total_expenses"] > 0
        assert len(result["monthly_breakdown"]) == 12

    def test_api(self, client, finance_data):
        resp = client.get(f"/api/reports/year-review/{date.today().year}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["year"] == date.today().year

    def test_empty_year(self, client):
        resp = client.get("/api/reports/year-review/2020")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_income"] == 0.0


class TestExport:
    def test_export_json(self, client, finance_data):
        today = date.today()
        first = today.replace(day=1)
        resp = client.get(f"/api/reports/export?period_start={first.isoformat()}&format=json")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["transactions"]) > 0

    def test_export_csv(self, client, finance_data):
        today = date.today()
        first = today.replace(day=1)
        resp = client.get(f"/api/reports/export?period_start={first.isoformat()}&format=csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_export_empty(self, client):
        resp = client.get("/api/reports/export?period_start=2020-01-01&format=json")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["transactions"]) == 0

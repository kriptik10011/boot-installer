"""
Financial reports and analytics service.

Handles: spending breakdown, income vs expenses, category trends,
merchant analysis, savings rate, financial health score, monthly close,
year review, CSV/JSON export.
All deterministic — no AI, no estimates.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction
from app.models.budget import BudgetCategory
from app.models.income import IncomeSource
from app.models.debt import DebtAccount
from app.models.asset import Asset
from app.models.transaction_recurrence import TransactionRecurrence
from app.models.financial import FinancialItem, FinancialItemType
from app.utils.bill_utils import normalize_to_monthly


@dataclass
class SpendingBreakdown:
    """Spending by category for a period."""
    category_id: Optional[int]
    category_name: str
    category_type: Optional[str]
    total_spent: float
    pct_of_total: float
    transaction_count: int


@dataclass
class IncomeVsExpenses:
    """Income vs expenses for a period."""
    period_label: str
    period_start: date
    period_end: date
    total_income: float
    total_expenses: float
    surplus: float


@dataclass
class CategoryTrend:
    """Spending trend for a category over multiple periods."""
    category_id: int
    category_name: str
    monthly_amounts: List[Dict]  # [{"month": "2026-01", "amount": 250.0}]


@dataclass
class MerchantSummary:
    """Spending summary for a single merchant."""
    merchant: str
    total_spent: float
    transaction_count: int
    avg_amount: float
    last_transaction_date: Optional[date]
    most_common_category: Optional[str]


@dataclass
class HealthScoreBreakdown:
    """Financial health score with component breakdown."""
    total_score: float  # 0-100
    savings_rate_score: float
    bills_on_time_score: float
    budget_adherence_score: float
    emergency_fund_score: float
    debt_to_income_score: float
    details: Dict


def get_spending_breakdown(
    db: Session,
    period_start: date,
    period_end: date,
) -> List[SpendingBreakdown]:
    """
    Get spending breakdown by category for a period.

    Returns each category's total spend, percentage of total, and transaction count.
    """
    results = db.query(
        Transaction.category_id,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).filter(
        Transaction.date >= period_start,
        Transaction.date <= period_end,
        Transaction.is_income == False,
    ).group_by(Transaction.category_id).all()

    total_all = sum(r.total for r in results) or 1.0

    # Batch-load all referenced categories
    cat_ids = [row.category_id for row in results if row.category_id]
    cats = db.query(BudgetCategory).filter(
        BudgetCategory.id.in_(cat_ids)
    ).all() if cat_ids else []
    cats_by_id = {c.id: c for c in cats}

    breakdown = []
    for row in results:
        cat_name = "Uncategorized"
        cat_type = None
        if row.category_id:
            cat = cats_by_id.get(row.category_id)
            if cat:
                cat_name = cat.name
                cat_type = cat.type

        breakdown.append(SpendingBreakdown(
            category_id=row.category_id,
            category_name=cat_name,
            category_type=cat_type,
            total_spent=round(row.total, 2),
            pct_of_total=round(row.total / total_all * 100, 1),
            transaction_count=row.count,
        ))

    breakdown.sort(key=lambda x: x.total_spent, reverse=True)
    return breakdown


def get_income_vs_expenses(
    db: Session,
    months: int = 6,
) -> List[IncomeVsExpenses]:
    """
    Get monthly income vs expenses comparison.

    Returns monthly data points for the last N months.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    period_start = (today - relativedelta(months=months - 1)).replace(day=1)

    # Single query: monthly income and expenses grouped
    monthly_data = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        Transaction.is_income,
        func.coalesce(func.sum(Transaction.amount), 0.0).label("total"),
    ).filter(
        Transaction.date >= period_start,
        Transaction.date <= today,
    ).group_by(func.strftime("%Y-%m", Transaction.date), Transaction.is_income).all()

    # Index by (month, is_income)
    monthly_map: dict[tuple, float] = {}
    for row in monthly_data:
        monthly_map[(row.month, row.is_income)] = row.total

    results = []
    for i in range(months - 1, -1, -1):
        month_start = (today - relativedelta(months=i)).replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1) - timedelta(days=1)

        label = month_start.strftime("%Y-%m")
        income = monthly_map.get((label, True), 0.0)
        expenses = monthly_map.get((label, False), 0.0)

        results.append(IncomeVsExpenses(
            period_label=label,
            period_start=month_start,
            period_end=month_end,
            total_income=round(income, 2),
            total_expenses=round(expenses, 2),
            surplus=round(income - expenses, 2),
        ))

    return results


def get_category_trends(
    db: Session,
    months: int = 6,
    category_ids: Optional[List[int]] = None,
) -> List[CategoryTrend]:
    """
    Get spending trend per category over multiple months.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    categories = db.query(BudgetCategory).filter(BudgetCategory.is_active == True).all()
    if category_ids:
        categories = [c for c in categories if c.id in category_ids]

    # Compute date range for the full period
    period_start = (today - relativedelta(months=months - 1)).replace(day=1)

    # Build month labels
    month_labels = []
    for i in range(months - 1, -1, -1):
        ms = (today - relativedelta(months=i)).replace(day=1)
        month_labels.append(ms.strftime("%Y-%m"))

    # Single GROUP BY query for all categories and months
    cat_ids = [c.id for c in categories]
    spending_rows = db.query(
        Transaction.category_id,
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.coalesce(func.sum(Transaction.amount), 0.0).label("total"),
    ).filter(
        Transaction.category_id.in_(cat_ids) if cat_ids else True,
        Transaction.date >= period_start,
        Transaction.date <= today,
        Transaction.is_income == False,
    ).group_by(Transaction.category_id, func.strftime("%Y-%m", Transaction.date)).all()

    # Index results by (category_id, month)
    spending_map: dict[tuple, float] = {}
    for row in spending_rows:
        spending_map[(row.category_id, row.month)] = row.total

    trends = []
    for cat in categories:
        monthly_amounts = []
        for label in month_labels:
            amount = spending_map.get((cat.id, label), 0.0)
            monthly_amounts.append({
                "month": label,
                "amount": round(amount, 2),
            })

        trends.append(CategoryTrend(
            category_id=cat.id,
            category_name=cat.name,
            monthly_amounts=monthly_amounts,
        ))

    return trends


def get_merchant_analysis(
    db: Session,
    period_start: date,
    period_end: date,
    limit: int = 20,
) -> List[MerchantSummary]:
    """
    Get spending analysis grouped by merchant.
    """
    results = db.query(
        Transaction.merchant,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
        func.avg(Transaction.amount).label("avg"),
        func.max(Transaction.date).label("last_date"),
    ).filter(
        Transaction.date >= period_start,
        Transaction.date <= period_end,
        Transaction.is_income == False,
        Transaction.merchant != None,
        Transaction.merchant != "",
    ).group_by(Transaction.merchant).order_by(
        func.sum(Transaction.amount).desc()
    ).limit(limit).all()

    merchant_names = [row.merchant for row in results if row.merchant]

    # Batch: find most common category for each merchant in one query
    from sqlalchemy import literal_column
    merchant_cat_rows = db.query(
        Transaction.merchant,
        Transaction.category_id,
        func.count(Transaction.id).label("cnt"),
    ).filter(
        Transaction.merchant.in_(merchant_names) if merchant_names else False,
        Transaction.category_id != None,
    ).group_by(Transaction.merchant, Transaction.category_id).all()

    # For each merchant, pick the category with highest count
    merchant_cat_counts: dict[str, dict[int, int]] = {}
    for row in merchant_cat_rows:
        merchant_cat_counts.setdefault(row.merchant, {})[row.category_id] = row.cnt
    merchant_top_cat: dict[str, int] = {}
    for merch, cats in merchant_cat_counts.items():
        merchant_top_cat[merch] = max(cats, key=cats.get)

    # Batch-load all referenced categories
    all_cat_ids = set(merchant_top_cat.values())
    cats = db.query(BudgetCategory).filter(
        BudgetCategory.id.in_(all_cat_ids)
    ).all() if all_cat_ids else []
    cats_by_id = {c.id: c for c in cats}

    merchants = []
    for row in results:
        cat_name = None
        top_cat_id = merchant_top_cat.get(row.merchant)
        if top_cat_id:
            cat = cats_by_id.get(top_cat_id)
            if cat:
                cat_name = cat.name

        merchants.append(MerchantSummary(
            merchant=row.merchant,
            total_spent=round(row.total, 2),
            transaction_count=row.count,
            avg_amount=round(row.avg, 2),
            last_transaction_date=row.last_date,
            most_common_category=cat_name,
        ))

    return merchants


def get_savings_rate(
    db: Session,
    months: int = 6,
) -> List[Dict]:
    """
    Calculate savings rate for each month.

    savings_rate = (income - expenses) / income * 100
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    period_start = (today - relativedelta(months=months - 1)).replace(day=1)

    # Single query: monthly totals grouped by month and income flag
    monthly_data = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        Transaction.is_income,
        func.coalesce(func.sum(Transaction.amount), 0.0).label("total"),
    ).filter(
        Transaction.date >= period_start,
        Transaction.date <= today,
    ).group_by(func.strftime("%Y-%m", Transaction.date), Transaction.is_income).all()

    monthly_map: dict[tuple, float] = {}
    for row in monthly_data:
        monthly_map[(row.month, row.is_income)] = row.total

    rates = []

    for i in range(months - 1, -1, -1):
        month_start = (today - relativedelta(months=i)).replace(day=1)
        label = month_start.strftime("%Y-%m")

        income = monthly_map.get((label, True), 0.0)
        expenses = monthly_map.get((label, False), 0.0)

        rate = ((income - expenses) / income * 100.0) if income > 0 else 0.0

        rates.append({
            "month": label,
            "income": round(income, 2),
            "expenses": round(expenses, 2),
            "saved": round(income - expenses, 2),
            "savings_rate": round(rate, 1),
        })

    return rates


def calculate_health_score(db: Session) -> HealthScoreBreakdown:
    """
    Calculate composite financial health score (0-100).

    Components:
    - Savings rate (25%): 20%+ savings = 100
    - Bills on time (20%): 100% on time = 100
    - Budget adherence (20%): Within budget = 100
    - Emergency fund (20%): 3+ months = 100
    - Debt-to-income ratio (15%): <36% DTI = 100
    """
    from app.services.budget_engine import get_period_bounds

    today = date.today()
    start, end = get_period_bounds(today)

    # 1. Savings rate score (25%)
    income = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= start, Transaction.date <= end,
        Transaction.is_income == True,
    ).scalar() or 0.0

    expenses = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= start, Transaction.date <= end,
        Transaction.is_income == False,
    ).scalar() or 0.0

    savings_rate = ((income - expenses) / income * 100.0) if income > 0 else 0.0
    # 20%+ savings = 100, linear scale
    savings_score = min(100.0, max(0.0, savings_rate / 20.0 * 100.0))

    # 2. Bills on time score (20%) — combines recurring + one-time bills
    recurring_total = db.query(func.count(TransactionRecurrence.id)).filter(
        TransactionRecurrence.is_active == True,
    ).scalar() or 0

    recurring_overdue = db.query(func.count(TransactionRecurrence.id)).filter(
        TransactionRecurrence.is_active == True,
        TransactionRecurrence.next_due_date != None,
        TransactionRecurrence.next_due_date < today,
    ).scalar() or 0

    one_time_total = db.query(func.count(FinancialItem.id)).filter(
        FinancialItem.type == FinancialItemType.BILL,
        FinancialItem.is_paid == False,
    ).scalar() or 0

    one_time_overdue = db.query(func.count(FinancialItem.id)).filter(
        FinancialItem.type == FinancialItemType.BILL,
        FinancialItem.is_paid == False,
        FinancialItem.due_date < today,
    ).scalar() or 0

    total_bills = recurring_total + one_time_total
    overdue = recurring_overdue + one_time_overdue
    bills_score = ((total_bills - overdue) / total_bills * 100.0) if total_bills > 0 else 100.0

    # 3. Budget adherence score (20%)
    categories = db.query(BudgetCategory).filter(
        BudgetCategory.is_active == True,
        BudgetCategory.budget_amount > 0,
    ).all()

    within_budget_count = 0
    total_categories = len(categories)
    for cat in categories:
        spent = db.query(
            func.coalesce(func.sum(Transaction.amount), 0.0)
        ).filter(
            Transaction.category_id == cat.id,
            Transaction.date >= start, Transaction.date <= end,
            Transaction.is_income == False,
        ).scalar() or 0.0
        if spent <= cat.budget_amount:
            within_budget_count += 1

    budget_score = (within_budget_count / total_categories * 100.0) if total_categories > 0 else 100.0

    # 4. Emergency fund score (20%)
    from app.services.savings_service import calculate_emergency_fund
    ef = calculate_emergency_fund(db)
    # 3+ months covered = 100, linear scale
    ef_score = min(100.0, max(0.0, ef.months_covered / 3.0 * 100.0))

    # 5. Debt-to-income ratio score (15%)
    total_debt = db.query(
        func.coalesce(func.sum(DebtAccount.current_balance), 0.0)
    ).filter(DebtAccount.is_active == True).scalar() or 0.0

    monthly_minimums = db.query(
        func.coalesce(func.sum(DebtAccount.minimum_payment), 0.0)
    ).filter(DebtAccount.is_active == True).scalar() or 0.0

    monthly_income = income  # Use current period income
    if monthly_income <= 0:
        # Estimate from income sources
        sources = db.query(IncomeSource).filter(IncomeSource.is_active == True).all()
        for src in sources:
            monthly_income += normalize_to_monthly(src.amount, src.frequency)

    dti_ratio = (monthly_minimums / monthly_income * 100.0) if monthly_income > 0 else 0.0
    # <36% DTI = 100, 50%+ = 0, linear scale between
    dti_score = max(0.0, min(100.0, (50.0 - dti_ratio) / 14.0 * 100.0))

    # Weighted total
    total_score = (
        savings_score * 0.25
        + bills_score * 0.20
        + budget_score * 0.20
        + ef_score * 0.20
        + dti_score * 0.15
    )

    return HealthScoreBreakdown(
        total_score=round(total_score, 1),
        savings_rate_score=round(savings_score, 1),
        bills_on_time_score=round(bills_score, 1),
        budget_adherence_score=round(budget_score, 1),
        emergency_fund_score=round(ef_score, 1),
        debt_to_income_score=round(dti_score, 1),
        details={
            "savings_rate_pct": round(savings_rate, 1),
            "bills_total": total_bills,
            "bills_overdue": overdue,
            "categories_within_budget": within_budget_count,
            "categories_total": total_categories,
            "emergency_fund_months": round(ef.months_covered, 1),
            "dti_ratio_pct": round(dti_ratio, 1),
            "monthly_debt_payments": round(monthly_minimums, 2),
            "monthly_income": round(monthly_income, 2),
        },
    )


def get_monthly_close(
    db: Session,
    month_date: date,
) -> Dict:
    """
    End-of-month summary with key financial metrics.
    """
    from app.services.budget_engine import get_period_bounds

    start, end = get_period_bounds(month_date, "monthly")

    income = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= start, Transaction.date <= end,
        Transaction.is_income == True,
    ).scalar() or 0.0

    expenses = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= start, Transaction.date <= end,
        Transaction.is_income == False,
    ).scalar() or 0.0

    txn_count = db.query(func.count(Transaction.id)).filter(
        Transaction.date >= start,
        Transaction.date <= end,
    ).scalar() or 0

    # Net worth at period end
    total_assets = db.query(
        func.coalesce(func.sum(Asset.current_value), 0.0)
    ).scalar() or 0.0

    total_debt = db.query(
        func.coalesce(func.sum(DebtAccount.current_balance), 0.0)
    ).filter(DebtAccount.is_active == True).scalar() or 0.0

    savings_rate = ((income - expenses) / income * 100.0) if income > 0 else 0.0

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "surplus_deficit": round(income - expenses, 2),
        "savings_rate_pct": round(savings_rate, 1),
        "transaction_count": txn_count,
        "net_worth": round(total_assets - total_debt, 2),
        "total_assets": round(total_assets, 2),
        "total_debt": round(total_debt, 2),
    }


def get_year_review(
    db: Session,
    year: int,
) -> Dict:
    """
    Annual summary: total income, spending, saved, net worth change.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    total_income = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= year_start,
        Transaction.date <= year_end,
        Transaction.is_income == True,
    ).scalar() or 0.0

    total_expenses = db.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(
        Transaction.date >= year_start,
        Transaction.date <= year_end,
        Transaction.is_income == False,
    ).scalar() or 0.0

    total_saved = total_income - total_expenses

    txn_count = db.query(func.count(Transaction.id)).filter(
        Transaction.date >= year_start,
        Transaction.date <= year_end,
    ).scalar() or 0

    # Monthly breakdown
    monthly = []
    for m in range(1, 13):
        m_start = date(year, m, 1)
        if m == 12:
            m_end = date(year, 12, 31)
        else:
            m_end = date(year, m + 1, 1) - timedelta(days=1)

        m_income = db.query(
            func.coalesce(func.sum(Transaction.amount), 0.0)
        ).filter(
            Transaction.date >= m_start, Transaction.date <= m_end,
            Transaction.is_income == True,
        ).scalar() or 0.0

        m_expenses = db.query(
            func.coalesce(func.sum(Transaction.amount), 0.0)
        ).filter(
            Transaction.date >= m_start, Transaction.date <= m_end,
            Transaction.is_income == False,
        ).scalar() or 0.0

        monthly.append({
            "month": m_start.strftime("%Y-%m"),
            "income": round(m_income, 2),
            "expenses": round(m_expenses, 2),
            "surplus": round(m_income - m_expenses, 2),
        })

    # Top spending categories
    top_categories = db.query(
        Transaction.category_id,
        func.sum(Transaction.amount).label("total"),
    ).filter(
        Transaction.date >= year_start,
        Transaction.date <= year_end,
        Transaction.is_income == False,
        Transaction.category_id != None,
    ).group_by(Transaction.category_id).order_by(
        func.sum(Transaction.amount).desc()
    ).limit(5).all()

    top_cats = []
    for row in top_categories:
        cat = db.query(BudgetCategory).filter(BudgetCategory.id == row.category_id).first()
        top_cats.append({
            "category": cat.name if cat else "Unknown",
            "total_spent": round(row.total, 2),
        })

    savings_rate = (total_saved / total_income * 100.0) if total_income > 0 else 0.0

    return {
        "year": year,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "total_saved": round(total_saved, 2),
        "savings_rate_pct": round(savings_rate, 1),
        "transaction_count": txn_count,
        "monthly_breakdown": monthly,
        "top_spending_categories": top_cats,
    }


def export_transactions(
    db: Session,
    period_start: date,
    period_end: date,
    fmt: str = "json",
) -> List[Dict]:
    """
    Export transactions for a period as list of dicts (for JSON or CSV conversion).
    """
    transactions = db.query(Transaction).filter(
        Transaction.date >= period_start,
        Transaction.date <= period_end,
    ).order_by(Transaction.date).all()

    rows = []
    for txn in transactions:
        cat_name = ""
        if txn.category_id:
            cat = db.query(BudgetCategory).filter(BudgetCategory.id == txn.category_id).first()
            cat_name = cat.name if cat else ""

        rows.append({
            "date": txn.date.isoformat(),
            "amount": txn.amount,
            "description": txn.description or "",
            "merchant": txn.merchant or "",
            "category": cat_name,
            "is_income": txn.is_income,
            "payment_method": txn.payment_method or "",
            "notes": txn.notes or "",
        })

    return rows

"""
Spending Insights — Analyze spending velocity per budget category.

Strategy:
  1. Sum transactions for the category over the analysis period
  2. Calculate daily rate
  3. Project depletion date if budget is set
  4. Generate recommendation based on pace ratio

Confidence >= 0.4 required.
"""

from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction
from app.models.budget import BudgetCategory, BudgetAllocation


MIN_CONFIDENCE = 0.4
DEFAULT_DAYS = 30


def analyze_spending_velocity(
    db: Session,
    category_id: int | None = None,
    days: int = DEFAULT_DAYS,
) -> list[dict]:
    """
    Analyze spending velocity for budget categories.

    If category_id is None, analyzes all categories with spending.
    Returns list of dicts with velocity metrics.
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    # Get categories to analyze
    if category_id:
        categories = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).all()
    else:
        categories = db.query(BudgetCategory).all()

    insights = []

    # Batch-load per-category spending with a single GROUP BY query
    cat_ids = [cat.id for cat in categories]
    spent_rows = db.query(
        Transaction.category_id,
        func.sum(func.abs(Transaction.amount)),
    ).filter(
        Transaction.category_id.in_(cat_ids),
        Transaction.date >= start_date,
        Transaction.date <= end_date,
        Transaction.amount < 0,  # Only expenses (negative amounts)
    ).group_by(Transaction.category_id).all() if cat_ids else []
    spent_by_cat = {row[0]: float(row[1]) for row in spent_rows}

    # Batch-load transaction counts per category
    count_rows = db.query(
        Transaction.category_id,
        func.count(Transaction.id),
    ).filter(
        Transaction.category_id.in_(cat_ids),
        Transaction.date >= start_date,
        Transaction.date <= end_date,
    ).group_by(Transaction.category_id).all() if cat_ids else []
    count_by_cat = {row[0]: row[1] for row in count_rows}

    # Batch-load latest allocation per category (most recent by id)
    # Get the max allocation id per category, then load those allocations
    latest_alloc_ids_rows = db.query(
        BudgetAllocation.category_id,
        func.max(BudgetAllocation.id),
    ).filter(
        BudgetAllocation.category_id.in_(cat_ids),
    ).group_by(BudgetAllocation.category_id).all() if cat_ids else []
    latest_alloc_ids = [row[1] for row in latest_alloc_ids_rows]
    latest_allocs = db.query(BudgetAllocation).filter(
        BudgetAllocation.id.in_(latest_alloc_ids),
    ).all() if latest_alloc_ids else []
    alloc_by_cat = {a.category_id: a for a in latest_allocs}

    for cat in categories:
        total_spent = spent_by_cat.get(cat.id, 0.0)

        if total_spent == 0:
            continue

        daily_rate = total_spent / max(days, 1)

        # Get current budget allocation if exists
        allocation = alloc_by_cat.get(cat.id)

        budget_amount = float(allocation.allocated_amount) if allocation else None
        projected_total = None
        depletion_date = None
        pace_ratio = 1.0
        recommendation = ""

        if budget_amount and budget_amount > 0:
            # Expected daily rate = budget / 30 (monthly budget)
            expected_daily = budget_amount / 30
            pace_ratio = round(daily_rate / max(expected_daily, 0.01), 2)

            # Project to end of month
            days_remaining = 30 - (end_date.day if end_date.day <= 30 else 30)
            projected_total = round(total_spent + daily_rate * days_remaining, 2)

            # Depletion date
            remaining_budget = budget_amount - total_spent
            if remaining_budget > 0 and daily_rate > 0:
                days_until_depletion = int(remaining_budget / daily_rate)
                depletion_date = str(end_date + timedelta(days=days_until_depletion))

            # Recommendation
            if pace_ratio > 1.5:
                recommendation = f"Spending at {pace_ratio}x expected pace. Consider reducing discretionary spending."
            elif pace_ratio > 1.3:
                recommendation = f"Spending slightly above pace ({pace_ratio}x). Monitor closely."
            elif pace_ratio > 1.0:
                recommendation = "On track, slightly above budget pace."
            else:
                recommendation = "Under budget pace. Good job!"

        # Confidence based on data points
        txn_count = count_by_cat.get(cat.id, 0)

        if txn_count >= 10:
            confidence = 0.9
        elif txn_count >= 5:
            confidence = 0.7
        elif txn_count >= 2:
            confidence = 0.5
        else:
            confidence = 0.4

        if confidence < MIN_CONFIDENCE:
            continue

        insights.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "daily_rate": round(daily_rate, 2),
            "period_days": days,
            "total_spent": round(total_spent, 2),
            "budget_amount": round(budget_amount, 2) if budget_amount else None,
            "projected_total": projected_total,
            "projected_depletion_date": depletion_date,
            "pace_ratio": pace_ratio,
            "confidence": confidence,
            "recommendation": recommendation,
        })

    insights.sort(key=lambda i: i["pace_ratio"], reverse=True)
    return insights

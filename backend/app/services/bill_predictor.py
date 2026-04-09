"""
Bill Predictor — Forecasts upcoming bills from TransactionRecurrence.

Strategy:
  1. Find all active recurrences with next_due_date in the window
  2. Average the last 3 transaction amounts for amount prediction
  3. Confidence = 1 / (1 + stddev_ratio) — lower variance = higher confidence

Confidence >= 0.5 required.
"""

from datetime import date, timedelta
from math import sqrt
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.transaction_recurrence import TransactionRecurrence
from app.models.transaction import Transaction


MIN_CONFIDENCE = 0.5
DEFAULT_WINDOW_DAYS = 14


def predict_upcoming_bills(
    db: Session,
    week_start: str,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> list[dict]:
    """
    Predict bills due within the given window.

    Returns list of dicts with: recurrence_id, description, predicted_amount,
    predicted_date, confidence, category, last_3_amounts.
    """
    start = date.fromisoformat(week_start)
    end = start + timedelta(days=window_days)

    # Find active recurrences with next_due_date in window
    recurrences = (
        db.query(TransactionRecurrence)
        .filter(
            TransactionRecurrence.is_active == True,
            TransactionRecurrence.next_due_date >= start,
            TransactionRecurrence.next_due_date <= end,
        )
        .all()
    )

    predictions = []

    # Batch-load all transactions for these recurrences
    rec_ids = [rec.id for rec in recurrences]
    all_txns = (
        db.query(Transaction)
        .filter(Transaction.recurrence_id.in_(rec_ids))
        .order_by(desc(Transaction.date))
        .all()
    ) if rec_ids else []

    # Build lookup: recurrence_id -> last 3 transactions
    txns_by_rec: dict[int, list] = {}
    for t in all_txns:
        lst = txns_by_rec.setdefault(t.recurrence_id, [])
        if len(lst) < 3:
            lst.append(t)

    # Batch-load budget categories
    from app.models.budget import BudgetCategory
    cat_ids = [rec.budget_category_id for rec in recurrences if rec.budget_category_id]
    if cat_ids:
        cats = db.query(BudgetCategory).filter(BudgetCategory.id.in_(cat_ids)).all()
        cat_lookup = {c.id: c.name for c in cats}
    else:
        cat_lookup = {}

    for rec in recurrences:
        recent_txns = txns_by_rec.get(rec.id, [])
        amounts = [abs(t.amount) for t in recent_txns if t.amount]

        if amounts:
            avg_amount = sum(amounts) / len(amounts)
            # Calculate confidence from variance
            if len(amounts) > 1:
                variance = sum((a - avg_amount) ** 2 for a in amounts) / len(amounts)
                stddev = sqrt(variance)
                stddev_ratio = stddev / max(avg_amount, 0.01)
                confidence = round(1 / (1 + stddev_ratio), 2)
            else:
                confidence = 0.6  # Single data point
        else:
            # No history — use recurrence amount if available
            avg_amount = float(rec.amount) if rec.amount else 0
            confidence = 0.4  # Low confidence without history

        if confidence < MIN_CONFIDENCE:
            continue

        category_name = cat_lookup.get(rec.budget_category_id) if rec.budget_category_id else None

        predictions.append({
            "recurrence_id": rec.id,
            "description": rec.description,
            "predicted_amount": round(avg_amount, 2),
            "predicted_date": str(rec.next_due_date),
            "confidence": confidence,
            "category": category_name,
            "last_3_amounts": [round(a, 2) for a in amounts],
        })

    predictions.sort(key=lambda p: p["predicted_date"])
    return predictions

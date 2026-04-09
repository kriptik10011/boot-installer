"""
Service for the guided weekly review wizard.

Provides the data for the guided 5-step weekly review wizard.
Aggregates meals, events, finances, shopping, and inventory status.
"""

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List

logger = logging.getLogger("weekly_review")

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.meal import MealPlanEntry
from app.models.event import Event
from app.models.financial import FinancialItem
from app.models.transaction import Transaction
from app.models.budget import BudgetCategory
from app.models.inventory import InventoryItem
from app.utils.week_utils import get_week_range


@dataclass
class WeekReviewSummary:
    week_start: str
    week_end: str
    # Meals
    meals_planned: int = 0
    meals_cooked: int = 0
    meals_skipped: int = 0
    top_recipes: List[str] = field(default_factory=list)
    # Events
    events_total: int = 0
    events_completed: int = 0
    # Finance
    total_income: float = 0.0
    total_expenses: float = 0.0
    bills_paid: int = 0
    bills_unpaid: int = 0
    budget_categories_over: int = 0
    savings_contributed: float = 0.0
    # Inventory
    low_stock_count: int = 0
    expiring_soon_count: int = 0
    # Shopping
    shopping_items_completed: int = 0
    shopping_items_total: int = 0


def get_week_review(db: Session, week_start: str) -> WeekReviewSummary:
    """Generate weekly review summary for the wizard."""
    start, end_excl = get_week_range(week_start)
    end_display = (end_excl - timedelta(days=1)).isoformat()  # Sunday for display

    summary = WeekReviewSummary(week_start=week_start, week_end=end_display)

    # --- Meals ---
    meals = db.query(MealPlanEntry).filter(
        MealPlanEntry.date >= week_start,
        MealPlanEntry.date < end_excl.isoformat(),
    ).all()
    summary.meals_planned = len(meals)
    summary.meals_cooked = sum(1 for m in meals if m.cooked_at is not None)
    summary.meals_skipped = summary.meals_planned - summary.meals_cooked

    # Top recipes (most planned)
    recipe_counts: dict[str, int] = {}
    for m in meals:
        if m.recipe and m.recipe.name:
            recipe_counts[m.recipe.name] = recipe_counts.get(m.recipe.name, 0) + 1
    summary.top_recipes = sorted(recipe_counts, key=recipe_counts.get, reverse=True)[:3]

    # --- Events ---
    events = db.query(Event).filter(
        Event.date >= week_start,
        Event.date < end_excl.isoformat(),
    ).all()
    summary.events_total = len(events)

    # --- Finance ---
    try:
        transactions = db.query(Transaction).filter(
            Transaction.date >= start,
            Transaction.date < end_excl,
        ).all()

        summary.total_income = sum(t.amount for t in transactions if t.is_income)
        summary.total_expenses = sum(t.amount for t in transactions if not t.is_income)

        # Bills for the week
        bills = db.query(FinancialItem).filter(
            FinancialItem.due_date >= week_start,
            FinancialItem.due_date < end_excl.isoformat(),
            FinancialItem.type == 'bill',
        ).all()
        summary.bills_paid = sum(1 for b in bills if b.is_paid)
        summary.bills_unpaid = sum(1 for b in bills if not b.is_paid)

        # Budget categories over budget
        categories = db.query(BudgetCategory).filter(
            BudgetCategory.is_active == True,
            BudgetCategory.budget_amount > 0,
        ).all()
        # Batch query: spending per category with GROUP BY
        spending_rows = db.query(
            Transaction.category_id,
            func.sum(Transaction.amount).label('total'),
        ).filter(
            Transaction.is_income == False,
            Transaction.date >= start.replace(day=1),
            Transaction.date < end_excl,
        ).group_by(Transaction.category_id).all()
        spending_by_cat = {row.category_id: row.total for row in spending_rows}
        for cat in categories:
            spent = spending_by_cat.get(cat.id, 0)
            if spent > cat.budget_amount:
                summary.budget_categories_over += 1
    except Exception as e:
        logger.warning("Weekly review: finance data unavailable: %s", e)

    # --- Inventory ---
    try:
        low_stock = db.query(InventoryItem).filter(
            InventoryItem.quantity != None,
            InventoryItem.quantity <= 1,
            InventoryItem.quantity > 0,
        ).count()
        summary.low_stock_count = low_stock

        soon = date.today() + timedelta(days=3)
        expiring = db.query(InventoryItem).filter(
            InventoryItem.expiration_date != None,
            InventoryItem.expiration_date <= soon.isoformat(),
            InventoryItem.expiration_date >= date.today().isoformat(),
        ).count()
        summary.expiring_soon_count = expiring
    except Exception as e:
        logger.warning("Weekly review: inventory data unavailable: %s", e)

    return summary

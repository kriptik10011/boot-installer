"""
Pydantic schemas for Summary API (Home dashboard).
"""

from typing import List
from pydantic import BaseModel


class WeekReviewResponse(BaseModel):
    week_start: str
    week_end: str
    meals_planned: int = 0
    meals_cooked: int = 0
    meals_skipped: int = 0
    top_recipes: List[str] = []
    events_total: int = 0
    events_completed: int = 0
    total_income: float = 0.0
    total_expenses: float = 0.0
    bills_paid: int = 0
    bills_unpaid: int = 0
    budget_categories_over: int = 0
    savings_contributed: float = 0.0
    low_stock_count: int = 0
    expiring_soon_count: int = 0
    shopping_items_completed: int = 0
    shopping_items_total: int = 0

"""
MealPlanEntry model.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Date, ForeignKey, DateTime, Enum, Boolean
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class MealType(str, enum.Enum):
    """Type of meal."""
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"


class MealPlanEntry(Base):
    """Meal plan entry linking a date/meal slot to a recipe."""

    __tablename__ = "meal_plan_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    meal_type = Column(Enum(MealType), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), nullable=True)
    description = Column(String(200), nullable=True)  # For manual entries like "Leftovers"
    planned_servings = Column(Integer, nullable=True)  # Planned servings for portion scaling (null = use recipe default)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Cooking session data (populated when user completes cooking)
    actual_servings = Column(Integer, nullable=True)  # Servings actually made
    actual_prep_minutes = Column(Integer, nullable=True)  # Actual prep time
    actual_cook_minutes = Column(Integer, nullable=True)  # Actual cook time
    cooked_at = Column(DateTime, nullable=True)  # When cooking was completed
    cooking_notes = Column(String(500), nullable=True)  # User notes from cooking
    inventory_depleted = Column(Boolean, default=False)  # Idempotency guard for depletion

    # Relationships
    recipe = relationship("Recipe", back_populates="meal_plans")

    # Unique constraint: one entry per date/meal_type combination
    __table_args__ = (
        # Handled by application logic for now
    )


class MealPlanTemplate(Base):
    """
    Recurring meal template (V2).

    "Every Monday is taco night" — stores day_of_week + meal_type + recipe.
    When generating next week's meal plan, auto-fill from templates.
    User can override any specific week without breaking the template.
    """

    __tablename__ = "meal_plan_templates"

    id = Column(Integer, primary_key=True, index=True)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday (ISO weekday)
    meal_type = Column(Enum(MealType), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), nullable=True)
    description = Column(String(200), nullable=True)  # For non-recipe entries
    planned_servings = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    recipe = relationship("Recipe")

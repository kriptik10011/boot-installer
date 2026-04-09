"""
Dietary restriction models for recipe filtering.

- DietaryRestriction: Named restrictions (vegan, gluten-free, etc.)
- RecipeDietaryRestriction: Junction table linking recipes to restrictions
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from app.database import Base


# Default dietary restrictions to seed
DEFAULT_DIETARY_RESTRICTIONS = [
    {"name": "Vegetarian", "icon": "leaf", "description": "No meat or fish"},
    {"name": "Vegan", "icon": "sprout", "description": "No animal products"},
    {"name": "Gluten-Free", "icon": "wheat-off", "description": "No gluten-containing grains"},
    {"name": "Dairy-Free", "icon": "milk-off", "description": "No dairy products"},
    {"name": "Nut-Free", "icon": "ban", "description": "No tree nuts or peanuts"},
    {"name": "Egg-Free", "icon": "egg-off", "description": "No eggs"},
    {"name": "Soy-Free", "icon": "bean-off", "description": "No soy products"},
    {"name": "Shellfish-Free", "icon": "fish-off", "description": "No shellfish"},
    {"name": "Low-Carb", "icon": "salad", "description": "Reduced carbohydrate content"},
    {"name": "Keto", "icon": "flame", "description": "Very low carb, high fat"},
    {"name": "Paleo", "icon": "bone", "description": "No grains, legumes, or processed foods"},
    {"name": "Halal", "icon": "check-circle", "description": "Prepared according to Islamic law"},
    {"name": "Kosher", "icon": "check-circle", "description": "Prepared according to Jewish law"},
]


class DietaryRestriction(Base):
    """Named dietary restriction for recipe filtering."""

    __tablename__ = "dietary_restrictions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    icon = Column(String(50), nullable=True)
    description = Column(String(300), nullable=True)
    is_system = Column(Boolean, default=False)  # True for defaults, False for user-created
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RecipeDietaryRestriction(Base):
    """Junction table linking recipes to dietary restrictions."""

    __tablename__ = "recipe_dietary_restrictions"

    recipe_id = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    restriction_id = Column(Integer, ForeignKey("dietary_restrictions.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

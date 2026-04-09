"""
ShoppingListItem model for shopping list feature.

Unified ingredient architecture:
- Links to Ingredient master via ingredient_id FK
- Parsed quantity fields for calculations
- Category derived from ingredient when linked
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship

from app.database import Base


class ShoppingListItem(Base):
    """
    Shopping list item with ingredient linking.

    Unified ingredient architecture:
    - Links to master Ingredient via ingredient_id FK
    - quantity kept as String for flexibility ("2 cups", "1 bottle")
    - quantity_amount/quantity_unit for parsed numeric values
    - Category derived from linked ingredient when available
    """

    __tablename__ = "shopping_list_items"

    id = Column(Integer, primary_key=True, index=True)

    # Link to master ingredient (all items linked via find_or_create_ingredient)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False, index=True)

    # Display name (UI display, ingredient.name is the canonical source)
    name = Column(String(200), nullable=False)

    # Keep as String for flexibility ("2 cups", "1 bottle", "1-2 servings")
    # Parsing happens at runtime via quantity_parser service
    quantity = Column(String(50), nullable=True)

    # Parsed numeric quantity for calculations (populated when quantity is parsed)
    quantity_amount = Column(Float, nullable=True)
    quantity_unit = Column(String(50), nullable=True)

    # Category (stored, but can be derived from ingredient when linked)
    category = Column(String(50), nullable=True, default="Other")

    is_checked = Column(Boolean, nullable=False, default=False)
    source_recipe_id = Column(Integer, ForeignKey("recipes.id"), nullable=True)
    week_start = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    source_recipe = relationship("Recipe")
    ingredient = relationship("Ingredient", back_populates="shopping_items")

    def get_category(self) -> str:
        """
        Get category from linked ingredient or fallback to stored string.

        Per UX Decision: Shopping categories derived from ingredient master
        for consistency, with fallback for custom items.
        """
        if self.ingredient and self.ingredient.category:
            from app.models.recipe import IngredientCategory

            # Map ingredient category to shopping category
            category_map = {
                IngredientCategory.LIQUID: "Condiments",
                IngredientCategory.PRODUCE: "Produce",
                IngredientCategory.PROTEIN: "Meat & Seafood",
                IngredientCategory.DAIRY: "Dairy",
                IngredientCategory.SOLID: "Pantry",
                IngredientCategory.SPICE: "Pantry",
                IngredientCategory.OTHER: "Other",
            }
            return category_map.get(self.ingredient.category, "Other")
        return self.category or "Other"

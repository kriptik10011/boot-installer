"""
Ingredient Alias Model

Maps alternative ingredient names to canonical ingredients.
Enables natural language parsing: "scallions" → "green onions"

Examples:
- "cilantro" → "coriander leaves"
- "bell pepper" → "pepper bell"
- "cornstarch" → "corn starch"
- "confectioners sugar" → "powdered sugar"

Used by ingredient parser to normalize recipe ingredient names
before creating/matching Ingredient records.

V2: Unified Food System
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class IngredientAlias(Base):
    """
    Maps alternative ingredient names to canonical ingredients.

    Bidirectional aliases are stored as separate rows.
    Example: "scallions" → "green onion" AND "green onion" → "scallion"

    Used during recipe parsing to normalize ingredient names before
    finding or creating Ingredient records.
    """
    __tablename__ = "ingredient_aliases"

    id = Column(Integer, primary_key=True, index=True)

    # Alternative name (lowercase, normalized)
    alias_name = Column(String(200), nullable=False, index=True, unique=True)

    # Maps to Ingredient.canonical_name (lowercase)
    canonical_name = Column(String(200), nullable=False, index=True)

    # Direct FK link (optional - can be populated after ingredient creation)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=True)

    # User-added vs system default
    is_custom = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship
    ingredient = relationship("Ingredient")

    def __repr__(self):
        return (
            f"<IngredientAlias("
            f"alias='{self.alias_name}' → "
            f"canonical='{self.canonical_name}')>"
        )


# Default ingredient aliases: common mappings
# Format: alias_name → canonical_name, both lowercase
# RULE: All variants in a group point to ONE canonical name.
# Choose the most common US English name as canonical.
DEFAULT_ALIASES = {
    # Green onions / scallions → canonical: "green onion"
    "scallions": "green onion",
    "scallion": "green onion",
    "spring onion": "green onion",
    "spring onions": "green onion",

    # Cilantro / coriander → canonical: "cilantro"
    "coriander": "cilantro",
    "coriander leaves": "cilantro",
    "fresh coriander": "cilantro",
    "chinese parsley": "cilantro",

    # Peppers → canonical: "bell pepper"
    "capsicum": "bell pepper",

    # Starches → canonical: "cornstarch"
    "corn starch": "cornstarch",
    "corn flour": "cornstarch",

    # Sugars → canonical: "powdered sugar"
    "confectioners sugar": "powdered sugar",
    "confectioners' sugar": "powdered sugar",
    "icing sugar": "powdered sugar",

    # Dairy → canonical: "heavy cream"
    "heavy whipping cream": "heavy cream",
    "double cream": "heavy cream",
    "whipping cream": "heavy cream",

    # Cheese (shorthand → full name)
    "parmesan": "parmesan cheese",
    "parm": "parmesan cheese",
    "parmigiano reggiano": "parmesan cheese",
    "mozz": "mozzarella cheese",
    "mozzarella": "mozzarella cheese",

    # Proteins
    "ground beef": "beef ground",
    "minced beef": "beef ground",
    "mince": "beef ground",
    "chicken breast": "chicken breasts",
    "chicken thigh": "chicken thighs",

    # Produce
    "courgette": "zucchini",
    "aubergine": "eggplant",
    "rocket": "arugula",
    "coriander root": "cilantro root",
    "garbanzo beans": "chickpeas",
    "chick peas": "chickpeas",

    # Pantry
    "bicarbonate of soda": "baking soda",
    "bicarb": "baking soda",

    # Milk variants → canonical: "milk"
    "milk of choice": "milk",
    "whole milk": "milk",
    "2% milk": "milk",
    "skim milk": "milk",
    "1% milk": "milk",
    "reduced fat milk": "milk",

    # Onion variants → canonical: "onion"
    "yellow onion": "onion",
    "white onion": "onion",
    "sweet onion": "onion",
    "vidalia onion": "onion",

    # Butter variants
    "unsalted butter": "butter",
    "salted butter": "butter",

    # Garlic
    "garlic clove": "garlic",
    "garlic cloves": "garlic",

    # Oil
    "extra virgin olive oil": "olive oil",
    "evoo": "olive oil",
    "vegetable oil": "cooking oil",
    "canola oil": "cooking oil",

    # Broth/stock
    "chicken stock": "chicken broth",
    "beef stock": "beef broth",
    "vegetable stock": "vegetable broth",
}

"""
Ingredient Package Model

Maps ingredients to their typical purchase units.
Enables conversion from cooking units (tbsp, cups) to shopping units (bottle, can, bag).

Example:
- "olive oil" → purchased as "bottle"
- "flour" → purchased as "bag"
- "eggs" → purchased as "dozen"
"""

from sqlalchemy import Column, Integer, String, Boolean
from app.database import Base


class IngredientPackage(Base):
    """
    Maps ingredients to their typical purchase package type.

    Used when generating shopping lists to show "1 bottle olive oil"
    instead of "2 tbsp olive oil".
    """
    __tablename__ = "ingredient_packages"

    id = Column(Integer, primary_key=True, index=True)

    # Pattern to match ingredient names (case-insensitive contains match)
    # Examples: "olive oil", "oil", "mustard", "flour"
    ingredient_pattern = Column(String(200), nullable=False, index=True)

    # The purchase unit type
    # Examples: "bottle", "can", "jar", "bag", "box", "carton", "stick", "dozen", "loaf", "block"
    package_type = Column(String(50), nullable=False)

    # Default quantity to buy (usually 1)
    default_quantity = Column(Integer, default=1, nullable=False)

    # Whether this is a user-customized mapping (vs default)
    is_custom = Column(Boolean, default=False, nullable=False)

    def __repr__(self):
        return f"<IngredientPackage(pattern='{self.ingredient_pattern}', type='{self.package_type}')>"


# Default package mappings - seeded on first run
# Pattern: (ingredient_pattern, package_type, default_quantity)
DEFAULT_PACKAGE_MAPPINGS = [
    # Oils
    ("olive oil", "bottle", 1),
    ("vegetable oil", "bottle", 1),
    ("canola oil", "bottle", 1),
    ("sesame oil", "bottle", 1),
    ("coconut oil", "jar", 1),
    ("avocado oil", "bottle", 1),

    # Condiments (liquid)
    ("soy sauce", "bottle", 1),
    ("fish sauce", "bottle", 1),
    ("worcestershire", "bottle", 1),
    ("hot sauce", "bottle", 1),
    ("vinegar", "bottle", 1),
    ("balsamic", "bottle", 1),
    ("maple syrup", "bottle", 1),
    ("honey", "bottle", 1),

    # Condiments (creamy)
    ("mustard", "jar", 1),
    ("ketchup", "bottle", 1),
    ("mayonnaise", "jar", 1),
    ("mayo", "jar", 1),
    ("relish", "jar", 1),
    ("peanut butter", "jar", 1),
    ("almond butter", "jar", 1),
    ("tahini", "jar", 1),
    ("jam", "jar", 1),
    ("jelly", "jar", 1),

    # Dairy
    ("milk", "carton", 1),
    ("cream", "carton", 1),
    ("half and half", "carton", 1),
    ("buttermilk", "carton", 1),
    ("butter", "stick", 1),
    ("eggs", "dozen", 1),
    ("cheese", "block", 1),
    ("yogurt", "container", 1),
    ("sour cream", "container", 1),
    ("cream cheese", "block", 1),

    # Baking
    ("flour", "bag", 1),
    ("sugar", "bag", 1),
    ("brown sugar", "bag", 1),
    ("powdered sugar", "bag", 1),
    ("baking soda", "box", 1),
    ("baking powder", "can", 1),
    ("cornstarch", "box", 1),
    ("yeast", "packet", 1),
    ("vanilla extract", "bottle", 1),
    ("vanilla", "bottle", 1),

    # Grains
    ("rice", "bag", 1),
    ("pasta", "box", 1),
    ("noodles", "package", 1),
    ("oats", "container", 1),
    ("oatmeal", "container", 1),
    ("quinoa", "bag", 1),
    ("couscous", "box", 1),
    ("bread crumbs", "container", 1),
    ("panko", "container", 1),

    # Bread
    ("bread", "loaf", 1),
    ("tortillas", "package", 1),
    ("pita", "package", 1),
    ("buns", "package", 1),
    ("rolls", "package", 1),
    ("bagels", "package", 1),

    # Canned goods
    ("tomato paste", "can", 1),
    ("tomato sauce", "can", 1),
    ("diced tomatoes", "can", 1),
    ("crushed tomatoes", "can", 1),
    ("beans", "can", 1),
    ("black beans", "can", 1),
    ("chickpeas", "can", 1),
    ("coconut milk", "can", 1),
    ("broth", "carton", 1),
    ("stock", "carton", 1),
    ("tuna", "can", 1),

    # Spices (containers - typically larger amounts)
    ("salt", "container", 1),
    ("pepper", "container", 1),
    ("black pepper", "container", 1),
    ("paprika", "container", 1),
    ("cumin", "container", 1),
    ("cinnamon", "container", 1),
    ("oregano", "container", 1),
    ("basil", "container", 1),
    ("thyme", "container", 1),
    ("rosemary", "container", 1),
    ("garlic powder", "container", 1),
    ("onion powder", "container", 1),
    ("chili powder", "container", 1),
    ("cayenne", "container", 1),
    ("italian seasoning", "container", 1),

    # Nuts & Seeds
    ("almonds", "bag", 1),
    ("walnuts", "bag", 1),
    ("pecans", "bag", 1),
    ("cashews", "bag", 1),
    ("pine nuts", "bag", 1),
    ("sesame seeds", "bag", 1),
    ("chia seeds", "bag", 1),
    ("flax", "bag", 1),

    # Beverages
    ("juice", "carton", 1),
    ("orange juice", "carton", 1),
    ("coffee", "bag", 1),
    ("tea", "box", 1),
]

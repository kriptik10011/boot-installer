"""
Package Conversion Model

Maps ingredient packages to their cooking unit equivalents.
Enables the V2 flow: cooking amounts <-> package amounts.

Example:
- "olive oil" bottle (32oz) = 96 tablespoons
- "flour" bag (5lb) = 22.5 cups
- "eggs" carton (12 count) = 12 count

This replaces the V1 IngredientPackage model which only stored
package_type without conversion data. IngredientPackage is kept
for backward compatibility; PackageConversion adds the missing
cooking_equivalent and package_size data.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime

from app.database import Base


class PackageConversion(Base):
    """
    Maps packages to cooking unit equivalents for an ingredient pattern.

    Used by PackageConverter service to translate between:
    - Recipe amounts (3 cups olive oil) -> Package amounts (1 bottle)
    - Package amounts (1 bottle) -> Cooking amounts (96 tbsp)

    Supports graceful fallback: if no conversion exists for an ingredient,
    the system shows V1 behavior (cooking amounts only).
    """
    __tablename__ = "package_conversions"

    id = Column(Integer, primary_key=True, index=True)

    # Pattern to match ingredient names (case-insensitive contains)
    ingredient_pattern = Column(String(200), nullable=False, index=True)

    # Package description
    package_type = Column(String(50), nullable=False)  # bottle, bag, can, carton, etc.
    package_size = Column(Float, nullable=False)        # Size number (32.0)
    package_unit = Column(String(50), nullable=False)   # Unit of size (oz, lb, ml)

    # Cooking equivalent: how many cooking units in one package
    cooking_equivalent = Column(Float, nullable=False)  # e.g., 96.0
    cooking_unit = Column(String(50), nullable=False)   # e.g., "tablespoon"

    # User customization
    is_custom = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return (
            f"<PackageConversion("
            f"pattern='{self.ingredient_pattern}', "
            f"{self.package_size}{self.package_unit} {self.package_type} "
            f"= {self.cooking_equivalent} {self.cooking_unit})>"
        )


# Default package conversion data: ~50 common ingredients
# Format: (ingredient_pattern, package_type, package_size, package_unit,
#          cooking_equivalent, cooking_unit)
DEFAULT_PACKAGE_CONVERSIONS = [
    # === OILS (volume) ===
    # 1 US fl oz = 2 tbsp; bottles typically 16-32oz
    ("olive oil", "bottle", 16.9, "fl oz", 33.8, "tablespoon"),
    ("vegetable oil", "bottle", 48.0, "fl oz", 96.0, "tablespoon"),
    ("canola oil", "bottle", 48.0, "fl oz", 96.0, "tablespoon"),
    ("sesame oil", "bottle", 8.45, "fl oz", 16.9, "tablespoon"),
    ("coconut oil", "jar", 14.0, "fl oz", 28.0, "tablespoon"),
    ("avocado oil", "bottle", 16.9, "fl oz", 33.8, "tablespoon"),

    # === CONDIMENTS (liquid) ===
    ("soy sauce", "bottle", 15.0, "fl oz", 30.0, "tablespoon"),
    ("fish sauce", "bottle", 6.76, "fl oz", 13.5, "tablespoon"),
    ("worcestershire", "bottle", 10.0, "fl oz", 20.0, "tablespoon"),
    ("hot sauce", "bottle", 5.0, "fl oz", 10.0, "tablespoon"),
    ("vinegar", "bottle", 16.0, "fl oz", 32.0, "tablespoon"),
    ("balsamic", "bottle", 8.45, "fl oz", 16.9, "tablespoon"),
    ("maple syrup", "bottle", 12.0, "fl oz", 24.0, "tablespoon"),
    ("honey", "bottle", 12.0, "oz", 16.0, "tablespoon"),
    ("vanilla extract", "bottle", 2.0, "fl oz", 12.0, "teaspoon"),

    # === CONDIMENTS (creamy) ===
    ("mustard", "jar", 8.0, "oz", 16.0, "tablespoon"),
    ("ketchup", "bottle", 20.0, "oz", 40.0, "tablespoon"),
    ("mayonnaise", "jar", 15.0, "fl oz", 30.0, "tablespoon"),
    ("peanut butter", "jar", 16.0, "oz", 32.0, "tablespoon"),
    ("tahini", "jar", 16.0, "oz", 32.0, "tablespoon"),

    # === DAIRY ===
    ("milk", "carton", 64.0, "fl oz", 8.0, "cup"),
    ("cream", "carton", 16.0, "fl oz", 2.0, "cup"),
    ("half and half", "carton", 16.0, "fl oz", 2.0, "cup"),
    ("buttermilk", "carton", 32.0, "fl oz", 4.0, "cup"),
    ("butter", "stick", 4.0, "oz", 8.0, "tablespoon"),
    ("eggs", "carton", 12.0, "count", 12.0, "count"),
    ("yogurt", "container", 32.0, "oz", 4.0, "cup"),
    ("sour cream", "container", 16.0, "oz", 2.0, "cup"),
    ("cream cheese", "block", 8.0, "oz", 1.0, "cup"),

    # === BAKING ===
    ("flour", "bag", 5.0, "lb", 17.0, "cup"),
    ("sugar", "bag", 4.0, "lb", 9.0, "cup"),
    ("brown sugar", "bag", 2.0, "lb", 4.5, "cup"),
    ("powdered sugar", "bag", 2.0, "lb", 7.5, "cup"),
    ("baking soda", "box", 16.0, "oz", 96.0, "teaspoon"),
    ("baking powder", "can", 8.8, "oz", 53.0, "teaspoon"),
    ("cornstarch", "box", 16.0, "oz", 96.0, "tablespoon"),

    # === GRAINS ===
    ("rice", "bag", 2.0, "lb", 4.5, "cup"),
    ("pasta", "box", 16.0, "oz", 8.0, "cup"),
    ("oats", "container", 18.0, "oz", 6.0, "cup"),
    ("quinoa", "bag", 16.0, "oz", 2.75, "cup"),

    # === CANNED GOODS ===
    ("tomato paste", "can", 6.0, "oz", 12.0, "tablespoon"),
    ("tomato sauce", "can", 15.0, "oz", 1.875, "cup"),
    ("diced tomatoes", "can", 14.5, "oz", 1.75, "cup"),
    ("crushed tomatoes", "can", 28.0, "oz", 3.5, "cup"),
    ("black beans", "can", 15.0, "oz", 1.75, "cup"),
    ("chickpeas", "can", 15.0, "oz", 1.75, "cup"),
    ("coconut milk", "can", 13.5, "fl oz", 1.69, "cup"),
    ("broth", "carton", 32.0, "fl oz", 4.0, "cup"),
    ("stock", "carton", 32.0, "fl oz", 4.0, "cup"),

    # === SALT & PEPPER ===
    ("salt", "container", 26.0, "oz", 156.0, "teaspoon"),
    ("black pepper", "container", 4.0, "oz", 72.0, "teaspoon"),

    # === SPICES — McCormick standard jar sizes ===
    ("garlic powder", "jar", 3.12, "oz", 30.0, "teaspoon"),
    ("onion powder", "jar", 2.62, "oz", 26.0, "teaspoon"),
    ("cumin", "jar", 1.5, "oz", 25.0, "teaspoon"),
    ("paprika", "jar", 2.12, "oz", 25.0, "teaspoon"),
    ("smoked paprika", "jar", 1.75, "oz", 20.0, "teaspoon"),
    ("cinnamon", "jar", 2.37, "oz", 25.0, "teaspoon"),
    ("chili powder", "jar", 2.5, "oz", 25.0, "teaspoon"),
    ("oregano", "jar", 0.75, "oz", 24.0, "teaspoon"),
    ("thyme", "jar", 0.75, "oz", 24.0, "teaspoon"),
    ("turmeric", "jar", 1.37, "oz", 25.0, "teaspoon"),
    ("curry powder", "jar", 1.75, "oz", 25.0, "teaspoon"),
    ("red pepper flakes", "jar", 1.5, "oz", 18.0, "teaspoon"),
    ("nutmeg", "jar", 1.1, "oz", 28.0, "teaspoon"),
    ("rosemary", "jar", 0.75, "oz", 24.0, "teaspoon"),
    ("italian seasoning", "jar", 0.87, "oz", 28.0, "teaspoon"),
    ("cayenne", "jar", 1.75, "oz", 25.0, "teaspoon"),
    ("bay leaves", "jar", 0.12, "oz", 15.0, "count"),
    ("basil", "jar", 0.62, "oz", 24.0, "teaspoon"),
    ("parsley flakes", "jar", 0.5, "oz", 16.0, "teaspoon"),
    ("ginger", "jar", 1.5, "oz", 25.0, "teaspoon"),
    ("allspice", "jar", 1.5, "oz", 25.0, "teaspoon"),
    ("cloves", "jar", 1.0, "oz", 25.0, "teaspoon"),
    ("dill", "jar", 0.5, "oz", 16.0, "teaspoon"),
    ("coriander", "jar", 0.87, "oz", 24.0, "teaspoon"),
    ("cardamom", "jar", 1.0, "oz", 24.0, "teaspoon"),

    # === PRODUCE — standard US store packaging ===
    ("strawberries", "container", 16.0, "oz", 3.0, "cup"),
    ("blueberries", "container", 6.0, "oz", 1.0, "cup"),
    ("raspberries", "container", 6.0, "oz", 1.25, "cup"),
    ("spinach", "bag", 5.0, "oz", 5.0, "cup"),
    ("lettuce", "head", 1.0, "count", 6.0, "cup"),
    ("parsley", "bunch", 1.0, "count", 12.0, "tablespoon"),
    ("cilantro", "bunch", 1.0, "count", 12.0, "tablespoon"),

    # === CHEESE — standard bag/block sizes ===
    ("parmesan", "wedge", 5.0, "oz", 1.25, "cup"),
    ("mozzarella", "bag", 8.0, "oz", 2.0, "cup"),
    ("cheddar", "block", 8.0, "oz", 2.0, "cup"),
    ("pepper jack", "block", 8.0, "oz", 2.0, "cup"),
    ("feta", "container", 6.0, "oz", 1.0, "cup"),

    # === MEAT — standard pack sizes ===
    ("chicken breast", "pack", 1.5, "lb", 1.5, "pound"),
    ("chicken thigh", "pack", 1.5, "lb", 1.5, "pound"),
    ("ground beef", "pack", 1.0, "lb", 1.0, "pound"),
    ("ground turkey", "pack", 1.0, "lb", 1.0, "pound"),
    ("bacon", "pack", 12.0, "oz", 12.0, "slice"),
    ("salmon", "pack", 1.0, "lb", 1.0, "pound"),
    ("pork chop", "pack", 1.5, "lb", 1.5, "pound"),
    ("pork tenderloin", "pack", 1.25, "lb", 1.25, "pound"),

    # === DAIRY (additional) ===
    ("heavy cream", "pint", 16.0, "fl oz", 2.0, "cup"),
    ("whipping cream", "pint", 16.0, "fl oz", 2.0, "cup"),
    ("greek yogurt", "container", 32.0, "oz", 4.0, "cup"),
    ("ricotta", "container", 15.0, "oz", 1.875, "cup"),

    # === DRY GOODS (additional) ===
    ("bread crumbs", "canister", 15.0, "oz", 3.75, "cup"),
    ("panko", "box", 8.0, "oz", 4.0, "cup"),
    ("lentils", "bag", 16.0, "oz", 2.5, "cup"),
    ("couscous", "box", 10.0, "oz", 1.75, "cup"),
    ("cornmeal", "bag", 2.0, "lb", 6.0, "cup"),
    ("chocolate chips", "bag", 12.0, "oz", 2.0, "cup"),

    # === CONDIMENTS (additional) ===
    ("sriracha", "bottle", 17.0, "oz", 34.0, "tablespoon"),
    ("bbq sauce", "bottle", 18.0, "oz", 36.0, "tablespoon"),
    ("hoisin sauce", "bottle", 8.0, "oz", 16.0, "tablespoon"),
    ("oyster sauce", "bottle", 9.0, "oz", 18.0, "tablespoon"),
    ("teriyaki sauce", "bottle", 10.0, "fl oz", 20.0, "tablespoon"),
    ("dijon mustard", "jar", 8.5, "oz", 17.0, "tablespoon"),
    ("salsa", "jar", 16.0, "oz", 2.0, "cup"),
    ("marinara", "jar", 24.0, "oz", 3.0, "cup"),
    ("pasta sauce", "jar", 24.0, "oz", 3.0, "cup"),

    # === BREAD ===
    ("bread", "loaf", 20.0, "oz", 20.0, "slice"),
    ("tortilla", "pack", 10.0, "count", 10.0, "count"),
]

"""
Recipe, RecipeCategory, Ingredient, and RecipeIngredient models.

Unified ingredient architecture:
- Ingredient is the single source of truth for all ingredient data
- TrackingMode enum for count vs percentage tracking (LinUCB learning)
- IngredientCategory enum for cold-start inference
- Canonical name matching eliminates fragile ILIKE queries
"""

import enum
import re
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float, Enum, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class TrackingMode(str, enum.Enum):
    """
    How an ingredient's inventory level is tracked.

    A contextual bandit (LinUCB) learns per-ingredient preferences,
    starting with cold-start defaults based on category.
    """
    COUNT = "count"           # eggs, cans, bottles - discrete units
    PERCENTAGE = "percentage" # oil, spices, flour - fill level 0-100


class IngredientCategory(str, enum.Enum):
    """
    Category for ingredients - used for cold-start tracking mode inference.

    Cold start defaults:
    - LIQUID → TrackingMode.PERCENTAGE
    - All others → TrackingMode.COUNT
    """
    LIQUID = "liquid"         # oils, sauces, milk
    SOLID = "solid"           # flour, sugar, rice
    PRODUCE = "produce"       # vegetables, fruits
    PROTEIN = "protein"       # meat, eggs, tofu
    DAIRY = "dairy"           # cheese, butter, yogurt
    SPICE = "spice"           # seasonings, herbs
    OTHER = "other"


_MASS_NOUNS = frozenset({
    "molasses", "hummus", "couscous", "asparagus", "citrus",
    "quinoa", "jus", "grits", "oats",
})


def _singularize_last_word(name: str) -> str:
    """Basic English singular: only the last word (the food noun)."""
    words = name.split()
    if not words:
        return name
    last = words[-1]
    if last in _MASS_NOUNS:
        return name
    # ies → y (berries → berry)
    if last.endswith('ies') and len(last) > 4:
        last = last[:-3] + 'y'
    # ves → f/fe only for known plurals (leaves → leaf, knives → knife).
    # Words like cloves, olives, chives fall through to the generic -s strip.
    elif last in {'leaves', 'loaves', 'halves', 'wolves', 'shelves', 'calves', 'scarves'}:
        last = last[:-3] + 'f'
    elif last in {'knives', 'wives', 'lives'}:
        last = last[:-3] + 'fe'
    # oes → o (tomatoes → tomato, potatoes → potato)
    elif last.endswith('oes') and len(last) > 4:
        last = last[:-2]
    # es after sh/x/z → strip es (dishes → dish) — but not -sses (molasses)
    elif last.endswith('es') and not last.endswith('ses') and len(last) > 4 and last[-3] in 'shxz':
        last = last[:-2]
    # s → strip (lemons → lemon, breasts → breast) — but not "ss" words
    elif last.endswith('s') and not last.endswith('ss') and len(last) > 3:
        last = last[:-1]
    words[-1] = last
    return ' '.join(words)


def generate_canonical_name(name: str) -> str:
    """
    Normalize ingredient name for matching.

    Examples:
    - "Extra Virgin Olive Oil" → "olive oil"
    - "olive oil (cold pressed)" → "olive oil"
    - "fresh basil leaves" → "basil leaves"
    - "flour, all-purpose" → "flour"

    This enables matching "OLIVE OIL" to "olive oil" without ILIKE.
    """
    # Lowercase
    canonical = name.lower().strip()
    # Remove parentheticals: "olive oil (extra virgin)" → "olive oil"
    canonical = re.sub(r'\([^)]*\)', '', canonical).strip()
    # Remove common prefixes (applied repeatedly to handle stacked descriptors
    # like "freshly ground" → strip "freshly" then "ground")
    prefixes = [
        "fresh", "freshly", "dried", "organic", "raw", "cooked", "canned",
        "frozen", "ground", "finely", "thinly", "roughly", "chopped",
        "minced", "sliced", "diced", "grated", "shredded", "crushed",
        "extra-virgin", "extra virgin", "extra", "whole", "boneless",
        "skinless", "unsalted", "salted",
        # Size descriptors — "large eggs" → "eggs", "small onion" → "onion"
        "small", "medium", "large", "extra-large", "jumbo", "mini",
        "thin", "thick",
    ]
    changed = True
    while changed:
        changed = False
        for prefix in prefixes:
            if canonical.startswith(prefix + " "):
                canonical = canonical[len(prefix)+1:]
                changed = True
    # Remove trailing descriptors after comma: "flour, all-purpose" → "flour"
    if "," in canonical:
        canonical = canonical.split(",")[0].strip()
    # Normalize whitespace
    canonical = re.sub(r'\s+', ' ', canonical).strip()

    # Guard: if all words were stripped, fall back to original lowercased name
    if not canonical:
        canonical = name.lower().strip()
        if "," in canonical:
            canonical = canonical.split(",")[0].strip()
        canonical = re.sub(r'\([^)]*\)', '', canonical).strip()
        canonical = re.sub(r'\s+', ' ', canonical).strip()

    # Singularize the last word: "chicken breasts" → "chicken breast"
    canonical = _singularize_last_word(canonical)

    return canonical


def infer_category_from_name(name: str) -> IngredientCategory:
    """
    Infer category from ingredient name for cold start.

    Used when creating new ingredients to set initial tracking mode.
    """
    name_lower = name.lower()

    liquids = ["oil", "sauce", "vinegar", "milk", "cream", "broth", "stock", "juice", "syrup", "honey"]
    proteins = ["chicken", "beef", "pork", "fish", "tofu", "egg", "shrimp", "salmon", "turkey", "lamb", "bacon"]
    produce = ["onion", "garlic", "tomato", "pepper", "lettuce", "carrot", "celery", "cucumber", "spinach",
               "kale", "broccoli", "potato", "apple", "banana", "lemon", "lime", "avocado", "mushroom"]
    dairy = ["cheese", "butter", "yogurt", "cream cheese", "sour cream", "parmesan", "mozzarella"]
    spices = ["salt", "pepper", "cumin", "paprika", "oregano", "basil", "thyme", "cinnamon", "nutmeg",
              "cayenne", "chili powder", "garlic powder", "onion powder", "seasoning"]

    if any(l in name_lower for l in liquids):
        return IngredientCategory.LIQUID
    if any(p in name_lower for p in proteins):
        return IngredientCategory.PROTEIN
    if any(p in name_lower for p in produce):
        return IngredientCategory.PRODUCE
    if any(d in name_lower for d in dairy):
        return IngredientCategory.DAIRY
    if any(s in name_lower for s in spices):
        return IngredientCategory.SPICE
    return IngredientCategory.SOLID  # Default for flour, sugar, rice, etc.


class RecipeCategory(Base):
    """Category for recipes (Breakfast, Lunch, Dinner, etc.)."""

    __tablename__ = "recipe_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    recipes = relationship("Recipe", back_populates="category")


class Recipe(Base):
    """Recipe with instructions and metadata."""

    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey("recipe_categories.id"), nullable=True)
    instructions = Column(Text, nullable=False)
    prep_time_minutes = Column(Integer, nullable=True)
    cook_time_minutes = Column(Integer, nullable=True)
    servings = Column(Integer, nullable=True)
    source = Column(String(500), nullable=True)
    image_url = Column(String(2000), nullable=True)
    notes = Column(Text, nullable=True)
    cuisine_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("RecipeCategory", back_populates="recipes")
    ingredients = relationship("RecipeIngredient", back_populates="recipe")
    meal_plans = relationship("MealPlanEntry", back_populates="recipe")
    tags = relationship(
        "RecipeTag",
        secondary="recipe_tag_associations",
        back_populates="recipes"
    )


class Ingredient(Base):
    """
    Master ingredient record - single source of truth for all ingredient data.

    Unified ingredient architecture:
    - Links to InventoryItem and ShoppingListItem via FK
    - Tracks preferred tracking mode (learned via LinUCB)
    - Canonical name enables reliable matching without ILIKE
    - Category enables cold-start tracking mode inference

    Intelligence Integration:
    - OBSERVE: Track interactions with each mode
    - INFER: Learn user preference after 5+ interactions
    - DECIDE: Use learned mode or cold-start default
    - ADAPT: Update preference when pattern changes
    """

    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)

    # Display name (as entered by user, for UI display)
    # NOT unique anymore - allows variants, matching happens on canonical_name
    name = Column(String(200), nullable=False)

    # Normalized for matching: "Extra Virgin Olive Oil" → "olive oil"
    # UNIQUE: 1:1 canonical→ingredient invariant (D13 migration for existing DBs)
    canonical_name = Column(String(200), nullable=True, unique=True, index=True)

    # Category for cold-start tracking mode inference
    category = Column(Enum(IngredientCategory), default=IngredientCategory.OTHER)

    # Learned tracking preference (starts null, system learns over time)
    # Cold start: inferred from category (LIQUID→PERCENTAGE, others→COUNT)
    preferred_tracking_mode = Column(Enum(TrackingMode), nullable=True)

    # LinUCB learning state: how many times tracked in each mode.
    # These are ACTIVE columns used by the LinUCB recommendation algorithm
    # (not related to the deprecated COUNT/PERCENTAGE dual-tracking modes).
    count_interactions = Column(Integer, default=0)
    percentage_interactions = Column(Integer, default=0)

    # Package info (merged from IngredientPackage - will be migrated)
    package_type = Column(String(50), nullable=True)  # "bottle", "bag", "can"
    default_package_qty = Column(Float, default=1.0)

    # Common aliases for matching ["EVOO", "virgin olive oil", "evoo"]
    aliases = Column(JSON, default=list)

    # Default unit when none specified
    default_unit = Column(String(50), nullable=True)

    # Food category for expiration defaults (persisted from detect_food_category)
    food_category = Column(String(50), nullable=True)

    # Relationships
    inventory_items = relationship("InventoryItem", back_populates="ingredient")
    shopping_items = relationship("ShoppingListItem", back_populates="ingredient")

    def get_effective_tracking_mode(self) -> TrackingMode:
        """
        Get tracking mode: learned preference or cold-start inference.

        LinUCB with cold-start templates:
        - Liquids → PERCENTAGE (oils, sauces, milk)
        - Solids → COUNT (eggs, cans, packages)

        After 5+ interactions, use learned preference based on majority.
        """
        # If user has explicitly set preference, use it
        if self.preferred_tracking_mode:
            return self.preferred_tracking_mode

        # Cold start: infer from category
        if self.category == IngredientCategory.LIQUID:
            return TrackingMode.PERCENTAGE
        if self.category == IngredientCategory.SPICE:
            return TrackingMode.PERCENTAGE  # Spices also track by % full
        return TrackingMode.COUNT

    def record_tracking_interaction(self, mode: TrackingMode):
        """
        Record an interaction for tracking mode learning.

        Records only — never auto-sets preferred_tracking_mode. Auto-executing
        the change would take control away from the user. Call
        get_suggested_tracking_mode() to surface a suggestion to the user, who
        can then explicitly set their preference.
        """
        if mode == TrackingMode.COUNT:
            self.count_interactions = (self.count_interactions or 0) + 1
        else:
            self.percentage_interactions = (self.percentage_interactions or 0) + 1

    def get_suggested_tracking_mode(self) -> "TrackingMode | None":
        """
        Return what tracking mode the system would suggest based on
        interaction history, or None if insufficient data.

        Requires 5+ interactions and a clear majority. Does NOT write
        anything — caller is responsible for surfacing to user.
        """
        total = (self.count_interactions or 0) + (self.percentage_interactions or 0)
        if total < 5:
            return None
        count = self.count_interactions or 0
        pct = self.percentage_interactions or 0
        if count > pct:
            return TrackingMode.COUNT
        elif pct > count:
            return TrackingMode.PERCENTAGE
        return None  # Tied — no clear suggestion


class RecipeIngredient(Base):
    """Junction table for recipe-ingredient relationship."""

    __tablename__ = "recipe_ingredients"

    recipe_id = Column(Integer, ForeignKey("recipes.id"), primary_key=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), primary_key=True)
    quantity = Column(String(50), nullable=True)
    unit = Column(String(50), nullable=True)
    notes = Column(String(200), nullable=True)

    # Relationships
    recipe = relationship("Recipe", back_populates="ingredients")
    ingredient = relationship("Ingredient")


class RecipeTag(Base):
    """
    Tags for recipe organization and filtering.

    Tags are user-defined labels that can be applied to recipes for
    flexible categorization beyond the single category system.

    Intelligence Integration:
    - OBSERVE: Track tag usage patterns
    - INFER: Learn tag preferences and associations
    - DECIDE: Suggest tags based on recipe content
    - SURFACE: "Recipes like this are often tagged..."
    - ADAPT: Learn from tag corrections
    """

    __tablename__ = "recipe_tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), nullable=True)  # Hex color like #FF5733
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    recipes = relationship(
        "Recipe",
        secondary="recipe_tag_associations",
        back_populates="tags"
    )


class RecipeTagAssociation(Base):
    """Junction table for recipe-tag many-to-many relationship."""

    __tablename__ = "recipe_tag_associations"

    recipe_id = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("recipe_tags.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

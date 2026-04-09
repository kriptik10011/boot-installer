"""
InventoryItem and InventoryCategory models for food inventory tracking.

Supports:
- Auto-filled expiration dates based on food safety guidelines
- Leftover tracking linked to meal plans
- User feedback for expiration learning

Unified ingredient architecture:
- Links to Ingredient master via FK (ingredient_id)
- Supports both COUNT and PERCENTAGE tracking modes
- Reference Class Forecasting for smart restock thresholds
- Consumption history for learning depletion patterns
"""

import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Enum, Boolean, Float, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class StorageLocation(str, enum.Enum):
    """Storage location for inventory items."""
    PANTRY = "pantry"
    FRIDGE = "fridge"
    FREEZER = "freezer"


class ItemSource(str, enum.Enum):
    """Source of the inventory item."""
    PURCHASED = "purchased"  # Bought from store
    LEFTOVER = "leftover"    # From cooking/meal
    HOMEMADE = "homemade"    # Made at home (e.g., bread, stock)
    GIFTED = "gifted"        # Received as gift


class InventoryCategory(Base):
    """Category for inventory items (Produce, Dairy, Meat, etc.)."""

    __tablename__ = "inventory_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    items = relationship("InventoryItem", back_populates="category")


class InventoryItem(Base):
    """
    Food inventory item with smart expiration and depletion tracking.

    Unified ingredient architecture:
    - Links to Ingredient master via ingredient_id FK
    - Supports both COUNT and PERCENTAGE tracking modes
    - Quantity is Float (supports fractional amounts)
    - Reference Class Forecasting for smart restock thresholds

    Package-Aware Tracking:
    - package_size/package_unit: Physical package capacity (e.g., 32.0 oz)
    - package_label: Display label (e.g., "32oz bottle")
    - packages_count: How many packages user has (e.g., 2 bottles)
    - amount_used/amount_used_unit: Cumulative cooking depletion from package(s)
    - Enables progress bar display: "32oz bottle — 81% remaining"

    Tracking Modes:
    - COUNT: quantity = 3.0 eggs, 1.5 bottles (Float)
    - PERCENTAGE: percent_full = 75 (0-100 integer)
    """

    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)

    # Link to master ingredient (all items linked via find_or_create_ingredient)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False, index=True)

    # Display name (UI display, ingredient.name is the canonical source)
    name = Column(String(200), nullable=False)

    # CRITICAL FIX: Float instead of Integer (was losing precision!)
    # For COUNT mode: 3.0 eggs, 1.5 bottles, 0.5 bags
    # For PERCENTAGE mode: unused (use percent_full instead)
    quantity = Column(Float, nullable=False, default=1.0)
    unit = Column(String(50), nullable=True)

    # Percentage tracking (0-100) - for PERCENTAGE mode items
    # For PERCENTAGE mode: 75.5 means 75.5% full (Float for sub-1% precision)
    # For COUNT mode: null (use quantity instead)
    percent_full = Column(Float, nullable=True)

    # Reference Class Forecasting fields for smart thresholds
    # Tracks consumption history for dynamic threshold calculation
    last_restocked_at = Column(DateTime, nullable=True)
    consumption_history = Column(JSON, default=list)  # [{date, amount_used, meal_id}, ...]

    # Existing fields
    category_id = Column(Integer, ForeignKey("inventory_categories.id"), nullable=True)
    location = Column(Enum(StorageLocation), nullable=False, default=StorageLocation.PANTRY)
    expiration_date = Column(Date, nullable=True, index=True)
    notes = Column(String(1000), nullable=True)

    # Expiration tracking
    purchase_date = Column(Date, nullable=True)  # When item was purchased/added
    default_shelf_life = Column(Integer, nullable=True)  # Default days (from food safety)
    expiration_auto_filled = Column(Boolean, default=True)  # Whether expiration was auto-set
    food_category = Column(String(50), nullable=True)  # Detected food category

    # V2: Package-aware tracking
    # Physical package capacity (e.g., 32.0 for a 32oz bottle)
    package_size = Column(Float, nullable=True)
    # Unit of the package capacity (e.g., "oz", "lb", "ml")
    package_unit = Column(String(50), nullable=True)
    # Display label (e.g., "32oz bottle", "5lb bag")
    package_label = Column(String(100), nullable=True)
    # How many packages the user has (e.g., 2 bottles; Float for partial)
    packages_count = Column(Float, nullable=True, default=1.0)
    # Cumulative amount used from package(s) via cooking depletion
    amount_used = Column(Float, nullable=True, default=0.0)
    # Unit of amount_used (matches package_unit or cooking unit)
    amount_used_unit = Column(String(50), nullable=True)

    # Per-item step size for +/- buttons (NULL = use default: 10 for percentage, 1 for count)
    adjustment_step = Column(Float, nullable=True)

    # Per-item tracking mode override: "count", "percentage", or NULL (inherit from ingredient)
    tracking_mode_override = Column(String(20), nullable=True)

    # Unified inventory tracking columns
    # "discrete" or "continuous" — derived from unit classification
    unit_type = Column(String(20), nullable=True)
    # Canonical unit for quantity (e.g., "cup", "ounce", "count")
    quantity_unit = Column(String(50), nullable=True)
    # Backup/unopened packages (replaces overloaded packages_count semantics)
    packages_backup = Column(Float, nullable=True)
    # Per-item reorder point in quantity units
    reorder_threshold = Column(Float, nullable=True)

    # Leftover support
    source = Column(Enum(ItemSource), nullable=False, default=ItemSource.PURCHASED)
    linked_meal_id = Column(Integer, ForeignKey("meal_plan_entries.id"), nullable=True)
    original_meal_name = Column(String(200), nullable=True)  # For context

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("InventoryCategory", back_populates="items")
    ingredient = relationship("Ingredient", back_populates="inventory_items")

    def get_tracking_mode(self):
        """
        Get tracking mode with priority:
          1. Per-item override
          2. Linked ingredient preference
          3. Data heuristic: percent_full is set → PERCENTAGE
          4. Fallback: COUNT

        Returns TrackingMode enum (imported at runtime to avoid circular import).
        """
        from app.models.recipe import TrackingMode

        # 1. Per-item override takes priority
        if self.tracking_mode_override:
            return TrackingMode(self.tracking_mode_override)
        # 2. Linked ingredient preference
        if self.ingredient:
            return self.ingredient.get_effective_tracking_mode()
        # 3. Data heuristic: if percent_full was ever set, this is a percentage item
        #    Covers legacy items created before tracking_mode_override existed
        if self.percent_full is not None:
            return TrackingMode.PERCENTAGE
        # 4. Fallback for unlinked items: use COUNT
        return TrackingMode.COUNT

    @property
    def tracking_mode(self) -> str:
        """String form of tracking mode for API serialization."""
        return self.get_tracking_mode().value

    def get_unit_type(self) -> str:
        """
        Get unit type: 'discrete' or 'continuous'.

        Priority: (1) stored unit_type column, (2) derive from unit.
        """
        if self.unit_type:
            return self.unit_type
        from app.services.parsing.quantity_parser import classify_unit_type, normalize_unit
        canon = normalize_unit(self.unit) if self.unit else None
        return classify_unit_type(canon)

    def get_package_percent_remaining(self) -> Optional[float]:
        """
        Calculate percentage remaining based on quantity / package_size.

        Returns None if no package data is available.
        """
        if not self.package_size or self.package_size <= 0:
            return None
        remaining = max(0.0, self.quantity or 0.0)
        return round(remaining / self.package_size * 100, 1)

    def get_amount_remaining(self) -> Optional[float]:
        """
        Get the absolute amount remaining — reads quantity directly.

        Returns None if no package data available.
        """
        if not self.package_size or self.package_size <= 0:
            return None
        return max(0.0, round(self.quantity or 0.0, 2))

    def get_status_level(self) -> str:
        """
        Get status for UI display: 'full', 'medium', 'low', 'empty'.

        Unified: uses quantity + unit_type instead of mode branching.
        Evaluates the open container independently; packages_backup only prevents 'empty'.
        """
        qty = self.quantity or 0
        ut = self.get_unit_type()

        if ut == 'discrete':
            if qty >= 3:
                return 'full'
            if qty >= 1:
                return 'medium'
            if qty > 0:
                return 'low'
            return 'empty'

        # Continuous items — compute percentage of capacity
        if self.quantity_unit == "percent":
            # 0-100 pseudo-scale — qty IS the percentage
            pct = qty
        elif self.package_size and self.package_size > 0:
            # Evaluate open container against ONE package capacity
            pct = (qty / self.package_size) * 100
        elif self.reorder_threshold and self.reorder_threshold > 0:
            # No package info — use reorder_threshold as reference (5x = "full")
            pct = (qty / (self.reorder_threshold * 5)) * 100
        else:
            # No reference point — simple presence check
            if qty > 0:
                return 'medium'
            if (self.packages_backup or 0) > 0:
                return 'low'
            return 'empty'

        if pct >= 50:
            return 'full'
        if pct >= 20:
            return 'medium'
        if pct > 0:
            return 'low'
        # qty=0 but has backups — still 'low' (auto-open will fire on next depletion)
        if (self.packages_backup or 0) > 0:
            return 'low'
        return 'empty'

    def needs_restock(self, days_until_shopping: int = 7) -> bool:
        """
        Smart threshold using Reference Class Forecasting.

        Unified priority chain:
        1. reorder_threshold if set → quantity < reorder_threshold
        2. Reference Class Forecasting from consumption_history
        3. Heuristic: 20% of package_size for continuous, 1 for discrete
        """
        qty = self.quantity or 0

        # 1. Explicit reorder_threshold takes priority
        if self.reorder_threshold is not None and self.reorder_threshold > 0:
            return qty < self.reorder_threshold

        # 2. Reference Class Forecasting from consumption history
        history = self.consumption_history or []
        if len(history) >= 3:
            durations = [h.get("days_lasted", 14) for h in history[-5:] if h.get("days_lasted")]
            if durations:
                median_duration = sorted(durations)[len(durations) // 2]
                if self.last_restocked_at:
                    restocked = self.last_restocked_at
                    if restocked.tzinfo is None:
                        restocked = restocked.replace(tzinfo=timezone.utc)
                    days_since_restock = (datetime.now(timezone.utc) - restocked).days
                else:
                    days_since_restock = 999
                return days_since_restock + days_until_shopping > median_duration

        # 3. Heuristic fallback
        ut = self.get_unit_type()
        if ut == 'continuous':
            if self.package_size and self.package_size > 0:
                return qty < self.package_size * 0.20
            # No package info — use 25 for 0-100 scale, or just check low
            if self.quantity_unit == "percent":
                return qty < 25
            return qty <= 0
        # Discrete: restock when 1 or fewer
        return qty <= 1


class ExpirationFeedback(Base):
    """
    User feedback on food expiration accuracy.

    Used to learn and adjust default expiration times.
    Requires 3+ confirmations before adjusting defaults.
    """

    __tablename__ = "expiration_feedback"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String(200), nullable=False, index=True)
    food_category = Column(String(50), nullable=False, index=True)
    storage_location = Column(Enum(StorageLocation), nullable=False)

    # Feedback data
    feedback_type = Column(String(20), nullable=False)  # "spoiled_early" or "lasted_longer"
    expected_days = Column(Integer, nullable=False)  # What we predicted
    actual_days = Column(Integer, nullable=False)    # How long it actually lasted
    difference_days = Column(Integer, nullable=False)  # actual - expected

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

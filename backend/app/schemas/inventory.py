"""
Pydantic schemas for food inventory API.

Extracted from app/routers/inventory.py for better organization.
Supports:
- Inventory categories and items
- Expiration tracking and feedback
- Leftover creation from meals
- Post-cooking depletion and undo
"""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.inventory import StorageLocation, ItemSource


# =============================================================================
# Category Schemas
# =============================================================================

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# Item Schemas
# =============================================================================

class ItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    # Float type supports fractional quantities (e.g. 1.5 bottles)
    quantity: float = Field(..., ge=0, le=999999)
    unit: Optional[str] = Field(None, max_length=50)
    category_id: Optional[int] = None
    location: StorageLocation = StorageLocation.PANTRY
    expiration_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)
    # Percentage tracking (0-100) for PERCENTAGE mode items (Float for sub-1% precision)
    percent_full: Optional[float] = Field(None, ge=0, le=100)


class ItemCreate(ItemBase):
    """Create inventory item. Expiration is auto-filled if not provided."""
    purchase_date: Optional[date] = None  # Defaults to today
    source: ItemSource = ItemSource.PURCHASED
    # If creating a leftover, optionally link to a meal
    linked_meal_id: Optional[int] = None
    original_meal_name: Optional[str] = Field(None, max_length=200)
    # V2: Package tracking fields
    package_size: Optional[float] = Field(None, ge=0)
    package_unit: Optional[str] = Field(None, max_length=50)
    package_label: Optional[str] = Field(None, max_length=100)
    packages_count: Optional[float] = Field(None, ge=0)
    # Per-item tracking overrides
    adjustment_step: Optional[float] = Field(None, ge=0.0001, le=100)
    tracking_mode_override: Optional[str] = Field(None, pattern="^(count|percentage)$")
    # Unified tracking (auto-derived from unit if not provided)
    quantity_unit: Optional[str] = Field(None, max_length=50)
    packages_backup: Optional[float] = Field(None, ge=0)


class ItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    # Float type supports fractional quantities
    quantity: Optional[float] = Field(None, ge=0, le=999999)
    unit: Optional[str] = Field(None, max_length=50)
    category_id: Optional[int] = None
    location: Optional[StorageLocation] = None
    expiration_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)
    # Allow marking expiration as manually set
    expiration_auto_filled: Optional[bool] = None
    # Percentage tracking (0-100, Float for sub-1% precision)
    percent_full: Optional[float] = Field(None, ge=0, le=100)
    # Package tracking fields
    package_size: Optional[float] = Field(None, ge=0)
    package_unit: Optional[str] = Field(None, max_length=50)
    package_label: Optional[str] = Field(None, max_length=100)
    packages_count: Optional[float] = Field(None, ge=0)
    adjustment_step: Optional[float] = Field(None, ge=0.0001, le=100)
    tracking_mode_override: Optional[str] = Field(None, pattern="^(count|percentage)$")
    # Unified tracking fields
    quantity_unit: Optional[str] = Field(None, max_length=50)
    packages_backup: Optional[float] = Field(None, ge=0)


class ItemResponse(ItemBase):
    id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryResponse] = None
    # Expiration tracking fields
    purchase_date: Optional[date] = None
    default_shelf_life: Optional[int] = None
    expiration_auto_filled: bool = True
    food_category: Optional[str] = None
    # Leftover fields
    source: ItemSource = ItemSource.PURCHASED
    linked_meal_id: Optional[int] = None
    original_meal_name: Optional[str] = None
    # Unified ingredient architecture fields
    ingredient_id: Optional[int] = None
    last_restocked_at: Optional[datetime] = None
    # V2: Package tracking fields
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    package_label: Optional[str] = None
    packages_count: Optional[float] = None
    amount_used: Optional[float] = None
    amount_used_unit: Optional[str] = None
    # Mode-aware fields
    tracking_mode: str = "count"
    adjustment_step: Optional[float] = None
    tracking_mode_override: Optional[str] = None
    # Unified tracking fields
    unit_type: Optional[str] = None
    quantity_unit: Optional[str] = None
    packages_backup: Optional[float] = None
    reorder_threshold: Optional[float] = None
    # Consumption tracking
    consumption_history: Optional[List[dict]] = None

    @computed_field
    @property
    def days_until_expiration(self) -> Optional[int]:
        """Calendar days until expiration. Negative = expired. None if no expiration date."""
        if self.expiration_date is None:
            return None
        return (self.expiration_date - date.today()).days

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# Bulk Create Schemas
# =============================================================================

class BulkItemCreateRequest(BaseModel):
    """Bulk create multiple inventory items in a single request."""
    items: List[ItemCreate] = Field(..., min_length=1, max_length=100)


class BulkItemCreateResponse(BaseModel):
    """Response for bulk create — reports successes and failures."""
    created: List[ItemResponse]
    failed: List[dict]  # { index: int, name: str, error: str }
    total_requested: int
    total_created: int


# =============================================================================
# Expiration Feedback Schemas
# =============================================================================

class ExpirationFeedbackCreate(BaseModel):
    """Record user feedback about item expiration accuracy."""
    item_id: int
    feedback_type: str = Field(..., pattern="^(spoiled_early|lasted_longer)$")
    actual_days: int = Field(..., ge=0, description="Actual days the item lasted")


class ExpirationFeedbackResponse(BaseModel):
    id: int
    item_name: str
    food_category: str
    storage_location: StorageLocation
    feedback_type: str
    expected_days: int
    actual_days: int
    difference_days: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# Leftover Schemas
# =============================================================================

class RecentMealResponse(BaseModel):
    """A recent meal that can be selected for leftover creation."""
    id: int
    date: date
    meal_type: str
    description: Optional[str] = None
    recipe_name: Optional[str] = None
    # Combined display name for UI
    display_name: str


class LeftoverCreate(BaseModel):
    """Create a leftover item from a meal."""
    meal_id: int
    quantity: int = Field(default=1, ge=1)
    unit: Optional[str] = Field(None, max_length=50)
    location: StorageLocation = StorageLocation.FRIDGE
    notes: Optional[str] = Field(None, max_length=1000)
    # Optional: override the auto-calculated expiration
    expiration_date: Optional[date] = None


class QuantityAdjustment(BaseModel):
    adjustment: float = Field(..., ge=-999999, le=999999, description="Positive or negative amount to adjust by")


# =============================================================================
# Post-Cooking Depletion Schemas
# =============================================================================

class DepletionAdjustment(BaseModel):
    """Adjustment for a single ingredient during depletion."""
    ingredient_id: int
    # For PERCENTAGE mode: percent used (0-100)
    percent_used: Optional[int] = Field(None, ge=0, le=100)
    # For COUNT mode: count used
    count_used: Optional[float] = Field(None, ge=0, le=999999)


class DepletionRequest(BaseModel):
    """Request body for post-cooking depletion."""
    adjustments: Optional[List[DepletionAdjustment]] = None


class DepletionLogEntry(BaseModel):
    """Log entry for a single depleted ingredient."""
    ingredient_id: int
    ingredient_name: str
    mode: str  # "count" or "percentage"
    amount_depleted: float
    remaining: float
    status: str  # "full", "medium", "low", "empty", "skipped"


class SkippedEntry(BaseModel):
    """Entry for an ingredient that was skipped during depletion."""
    ingredient_name: str
    reason: str  # "no_ingredient_link" | "not_in_inventory"


class DepletionResponse(BaseModel):
    """Response for post-cooking depletion."""
    depleted: List[DepletionLogEntry]
    skipped: List[SkippedEntry] = []
    undo_available_for_seconds: int = 5


class UndoDepletionResponse(BaseModel):
    """Response for undo depletion."""
    restored_count: int
    message: str


# =============================================================================
# Food Group Summary
# =============================================================================

class FoodGroupSummaryResponse(BaseModel):
    """Aggregated food group counts for inventory bezel arcs."""
    protein: int = 0
    dairy: int = 0
    grains: int = 0
    vegetables: int = 0
    fruits: int = 0
    total_classified: int = 0
    total_items: int = 0

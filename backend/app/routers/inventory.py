"""
Food Inventory API endpoints.

Supports:
- Auto-filled expiration dates based on food safety guidelines
- Expiration learning from user feedback (Conservative Gating: 3+ confirmations)
- Leftover tracking linked to meal plans
- Post-cooking depletion with undo

Business logic extracted to services/inventory_service.py.
"""

import logging
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.inventory import (
    InventoryItem, InventoryCategory, StorageLocation,
    ItemSource, ExpirationFeedback
)
from app.models.meal import MealPlanEntry
from app.services.ingredient_service import find_or_create_ingredient
from app.services.expiration_defaults import (
    get_leftover_expiration,
    detect_food_category,
    expiration_learner,
    FoodCategory,
)
from app.services import inventory_service
from app.schemas.inventory import (
    CategoryCreate, CategoryResponse, ItemCreate, ItemUpdate,
    ItemResponse, BulkItemCreateRequest, BulkItemCreateResponse, ExpirationFeedbackCreate,
    ExpirationFeedbackResponse, RecentMealResponse,
    LeftoverCreate, QuantityAdjustment,
    DepletionRequest, DepletionLogEntry, DepletionResponse, SkippedEntry,
    UndoDepletionResponse,
    FoodGroupSummaryResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger("weekly_review")


# =============================================================================
# Category Endpoints
# =============================================================================

@router.get("/categories", response_model=List[CategoryResponse])
@limiter.limit("100/minute")
def list_categories(request: Request, db: Session = Depends(get_db)):
    """List all inventory categories."""
    return db.query(InventoryCategory).order_by(InventoryCategory.name).limit(1000).all()


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_category(request: Request, category: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new inventory category."""
    existing = db.query(InventoryCategory).filter(InventoryCategory.name == category.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{category.name}' already exists"
        )

    db_category = InventoryCategory(**category.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


@router.delete("/categories/{category_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_category(request: Request, category_id: int, db: Session = Depends(get_db)):
    """Delete an inventory category."""
    db_category = db.query(InventoryCategory).filter(InventoryCategory.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    db.query(InventoryItem).filter(InventoryItem.category_id == category_id).update({"category_id": None})
    db.delete(db_category)
    db.commit()
    return None


# =============================================================================
# Item Endpoints
# =============================================================================

@router.get("/items", response_model=List[ItemResponse])
@limiter.limit("100/minute")
def list_items(
    request: Request,
    location: Optional[StorageLocation] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List all inventory items. Optionally filter by location or category."""
    query = db.query(InventoryItem)
    if location:
        query = query.filter(InventoryItem.location == location)
    if category_id:
        query = query.filter(InventoryItem.category_id == category_id)
    return query.order_by(InventoryItem.name).limit(1000).all()


@router.get("/items/expiring", response_model=List[ItemResponse])
@limiter.limit("100/minute")
def list_expiring_items(
    request: Request,
    days: int = Query(default=7, ge=1, le=365),
    db: Session = Depends(get_db)
):
    """List items expiring within the specified number of days."""
    cutoff = date.today() + timedelta(days=days)
    return db.query(InventoryItem).filter(
        InventoryItem.expiration_date != None,
        InventoryItem.expiration_date <= cutoff
    ).order_by(InventoryItem.expiration_date).limit(1000).all()


@router.get("/items/low-stock", response_model=List[ItemResponse])
@limiter.limit("100/minute")
def list_low_stock_items(
    request: Request,
    threshold: int = Query(default=1, ge=0, le=100),
    db: Session = Depends(get_db)
):
    """List items with quantity at or below threshold."""
    return db.query(InventoryItem).filter(
        InventoryItem.quantity <= threshold
    ).order_by(InventoryItem.name).limit(1000).all()


@router.post("/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_item(request: Request, item: ItemCreate, db: Session = Depends(get_db)):
    """Create a new inventory item with auto-filled expiration."""
    if item.category_id:
        category = db.query(InventoryCategory).filter(InventoryCategory.id == item.category_id).first()
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category not found")

    item_data = inventory_service.prepare_item_data(item.model_dump(), db)

    db_item, merged = inventory_service.upsert_inventory_item(db, item_data)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.post("/items/bulk", response_model=BulkItemCreateResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def bulk_create_items(request: Request, data: BulkItemCreateRequest, db: Session = Depends(get_db)):
    """Create multiple inventory items in a single request."""
    created: list = []
    failed: list = []

    for idx, item in enumerate(data.items):
        try:
            if item.category_id:
                category = db.query(InventoryCategory).filter(
                    InventoryCategory.id == item.category_id
                ).first()
                if not category:
                    failed.append({"index": idx, "name": item.name, "error": "Category not found"})
                    continue

            item_data = inventory_service.prepare_item_data(item.model_dump(), db)

            db_item, merged = inventory_service.upsert_inventory_item(db, item_data)
            created.append(db_item)
        except Exception as e:
            logger.error("Bulk create failed for item %d (%s): %s", idx, item.name, e)
            failed.append({"index": idx, "name": item.name, "error": "Failed to create item"})

    if created:
        db.commit()
        for item in created:
            db.refresh(item)

    return BulkItemCreateResponse(
        created=created, failed=failed,
        total_requested=len(data.items), total_created=len(created),
    )


@router.get("/items/leftovers", response_model=List[ItemResponse])
@limiter.limit("100/minute")
def list_leftovers(request: Request, include_expired: bool = False, db: Session = Depends(get_db)):
    """List all leftover items in inventory."""
    query = db.query(InventoryItem).filter(InventoryItem.source == ItemSource.LEFTOVER)
    if not include_expired:
        query = query.filter(
            (InventoryItem.expiration_date == None) |
            (InventoryItem.expiration_date >= date.today())
        )
    return query.order_by(desc(InventoryItem.expiration_date)).limit(1000).all()


# =============================================================================
# Food Group Summary — MUST be before /items/{item_id} to avoid route collision
# =============================================================================

# Map FoodCategory enum values to the 5 bezel-arc food groups
_FOOD_GROUP_MAP: dict[str, str] = {
    "meat_poultry": "protein",
    "seafood": "protein",
    "deli": "protein",
    "frozen_meat": "protein",
    "dairy": "dairy",
    "eggs": "dairy",
    "ice_cream": "dairy",
    "dry_goods": "grains",
    "canned": "grains",
    "bread": "grains",
    "produce_leafy": "vegetables",
    "produce_root": "vegetables",
    "frozen_vegetables": "vegetables",
    "produce_fruit": "fruits",
}


@router.get("/items/food-group-summary", response_model=FoodGroupSummaryResponse)
@limiter.limit("60/minute")
def food_group_summary(request: Request, db: Session = Depends(get_db)):
    """Aggregate active inventory items into 5 food groups for bezel arcs."""
    active_items = (
        db.query(InventoryItem.food_category)
        .filter(InventoryItem.quantity > 0)
        .limit(1000)
        .all()
    )
    counts: dict[str, int] = {"protein": 0, "dairy": 0, "grains": 0, "vegetables": 0, "fruits": 0}
    classified = 0
    for (fc,) in active_items:
        group = _FOOD_GROUP_MAP.get(fc or "")
        if group:
            counts[group] += 1
            classified += 1
    return FoodGroupSummaryResponse(
        **counts,
        total_classified=classified,
        total_items=len(active_items),
    )


@router.get("/items/{item_id}", response_model=ItemResponse)
@limiter.limit("100/minute")
def get_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Get a single inventory item by ID."""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


@router.put("/items/{item_id}", response_model=ItemResponse)
@limiter.limit("30/minute")
def update_item(request: Request, item_id: int, item: ItemUpdate, db: Session = Depends(get_db)):
    """Update an existing inventory item."""
    db_item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    update_data = item.model_dump(exclude_unset=True)
    if "category_id" in update_data and update_data["category_id"]:
        category = db.query(InventoryCategory).filter(
            InventoryCategory.id == update_data["category_id"]
        ).first()
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category not found")

    original_package_size = db_item.package_size

    for key, value in update_data.items():
        setattr(db_item, key, value)

    # Reset amount_used when package_size changes (new bottle/package)
    if "package_size" in update_data and update_data["package_size"] != original_package_size:
        db_item.amount_used = 0.0

    # Normalize package_unit to canonical form
    if "package_unit" in update_data and update_data["package_unit"]:
        from app.services.parsing.quantity_parser import normalize_unit, classify_unit_type
        db_item.package_unit = normalize_unit(update_data["package_unit"])

    # Auto-derive quantity_unit when unit changes (Gap 2 fix)
    if "unit" in update_data and update_data["unit"]:
        from app.services.parsing.quantity_parser import normalize_unit, classify_unit_type
        normed = normalize_unit(update_data["unit"])
        db_item.unit = normed
        # Only auto-derive if not explicitly set in this same request
        if "quantity_unit" not in update_data and db_item.quantity_unit != "percent":
            db_item.quantity_unit = normed
            db_item.unit_type = classify_unit_type(normed)

    # Sync quantity_unit when tracking mode switches
    if "tracking_mode_override" in update_data:
        mode = update_data["tracking_mode_override"]
        if mode == "percentage":
            db_item.quantity_unit = "percent"
            db_item.unit_type = "continuous"
        elif mode == "count" and (not db_item.quantity_unit or db_item.quantity_unit == "percent"):
            db_item.quantity_unit = db_item.unit or "count"

    # Sync audit columns when quantity changes directly (edit form)
    if "quantity" in update_data:
        if db_item.quantity_unit == "percent":
            db_item.percent_full = db_item.quantity
        elif db_item.package_size and db_item.package_size > 0:
            db_item.amount_used = max(0.0, round(db_item.package_size - (db_item.quantity or 0), 4))

    # Reverse sync: percent_full → quantity for percentage items
    if "percent_full" in update_data and db_item.quantity_unit == "percent":
        db_item.quantity = db_item.percent_full

    # Re-derive unit_type when quantity_unit changes
    if "quantity_unit" in update_data and update_data["quantity_unit"]:
        from app.services.parsing.quantity_parser import classify_unit_type
        db_item.unit_type = classify_unit_type(db_item.quantity_unit)

    db.commit()
    db.refresh(db_item)
    return db_item


@router.patch("/items/{item_id}/quantity", response_model=ItemResponse)
@limiter.limit("30/minute")
def adjust_quantity(
    request: Request, item_id: int, body: QuantityAdjustment, db: Session = Depends(get_db)
):
    """Adjust item quantity by a delta.

    Quantity is the single source of truth for 'how much is left'.
    percent items: clamps [0, 100], syncs percent_full.
    Package items: clamps at 0, syncs amount_used as audit trail.
    All items: auto-opens backup package if depleted.
    """
    db_item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    # Unified: quantity is the single source of truth for "how much is left"
    new_quantity = round((db_item.quantity or 0) + body.adjustment, 4)

    # Clamp: percent items cap at 100, all items floor at 0
    if db_item.quantity_unit == "percent":
        new_quantity = max(0.0, min(100.0, new_quantity))
    else:
        if new_quantity < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Adjustment would result in negative quantity ({new_quantity})",
            )
        new_quantity = max(0.0, new_quantity)

    db_item.quantity = new_quantity

    # Sync audit columns
    if db_item.quantity_unit == "percent":
        db_item.percent_full = new_quantity
    elif db_item.package_size and db_item.package_size > 0:
        db_item.amount_used = max(0.0, round(db_item.package_size - new_quantity, 4))

    # Auto-open backup package if depleted
    if db_item.quantity <= 0 and (db_item.packages_backup or 0) > 0:
        from app.services.inventory_service import convert_package_to_item_unit
        pkg_qty = convert_package_to_item_unit(
            db_item.package_size or 0, db_item.package_unit, db_item, db
        )
        if pkg_qty is not None:
            db_item.quantity = pkg_qty
            db_item.packages_backup -= 1
            if db_item.package_size and db_item.package_size > 0:
                db_item.amount_used = max(
                    0.0, round(db_item.package_size - db_item.quantity, 4)
                )
        else:
            logger.warning(
                "Cannot open backup for item %d: no conversion from '%s' to '%s'",
                db_item.id, db_item.package_unit, db_item.quantity_unit,
            )

    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/items/{item_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Delete an inventory item."""
    db_item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    db.delete(db_item)
    db.commit()
    return None


# =============================================================================
# Expiration Feedback
# =============================================================================

@router.post("/items/{item_id}/expiration-feedback", response_model=ExpirationFeedbackResponse)
@limiter.limit("30/minute")
def record_expiration_feedback(
    request: Request, item_id: int, feedback: ExpirationFeedbackCreate, db: Session = Depends(get_db)
):
    """Record user feedback about item expiration accuracy."""
    db_item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if db_item.purchase_date and db_item.expiration_date:
        expected_days = (db_item.expiration_date - db_item.purchase_date).days
    elif db_item.default_shelf_life:
        expected_days = db_item.default_shelf_life
    else:
        expected_days = 7

    db_feedback = ExpirationFeedback(
        item_name=db_item.name,
        food_category=db_item.food_category or "other",
        storage_location=db_item.location,
        feedback_type=feedback.feedback_type,
        expected_days=expected_days,
        actual_days=feedback.actual_days,
        difference_days=feedback.actual_days - expected_days
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)

    food_cat = detect_food_category(db_item.name)
    expiration_learner.record_feedback(
        item_name=db_item.name, category=food_cat,
        actual_days=feedback.actual_days, expected_days=expected_days,
        feedback_type=feedback.feedback_type
    )

    return db_feedback


@router.get("/expiration-feedback", response_model=List[ExpirationFeedbackResponse])
@limiter.limit("100/minute")
def list_expiration_feedback(
    request: Request,
    food_category: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """List recorded expiration feedback."""
    query = db.query(ExpirationFeedback)
    if food_category:
        query = query.filter(ExpirationFeedback.food_category == food_category)
    return query.order_by(desc(ExpirationFeedback.created_at)).limit(limit).all()


# =============================================================================
# Leftover Endpoints
# =============================================================================

@router.get("/leftovers/recent-meals", response_model=List[RecentMealResponse])
@limiter.limit("100/minute")
def get_recent_meals_for_leftover(
    request: Request,
    days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db)
):
    """Get recent meals that could have leftovers."""
    cutoff = date.today() - timedelta(days=days)

    meals = db.query(MealPlanEntry).filter(
        MealPlanEntry.date >= cutoff,
        MealPlanEntry.date <= date.today()
    ).order_by(desc(MealPlanEntry.date)).limit(500).all()

    results = []
    for meal in meals:
        if meal.recipe:
            recipe_name = meal.recipe.name
            display = f"{meal.date.strftime('%a %m/%d')} - {recipe_name}"
        elif meal.description:
            recipe_name = None
            display = f"{meal.date.strftime('%a %m/%d')} - {meal.description}"
        else:
            recipe_name = None
            display = f"{meal.date.strftime('%a %m/%d')} - {meal.meal_type.value.title()}"

        results.append(RecentMealResponse(
            id=meal.id, date=meal.date, meal_type=meal.meal_type.value,
            description=meal.description, recipe_name=recipe_name, display_name=display
        ))

    priority = {"dinner": 0, "lunch": 1, "breakfast": 2}
    results.sort(key=lambda m: (m.date, priority.get(m.meal_type, 3)), reverse=True)
    return results


@router.post("/leftovers", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_leftover(request: Request, leftover: LeftoverCreate, db: Session = Depends(get_db)):
    """Create a leftover inventory item from a meal."""
    meal = db.query(MealPlanEntry).filter(MealPlanEntry.id == leftover.meal_id).first()
    if not meal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found")

    if meal.recipe:
        leftover_name = f"Leftover {meal.recipe.name}"
        original_meal_name = meal.recipe.name
    elif meal.description:
        leftover_name = f"Leftover {meal.description}"
        original_meal_name = meal.description
    else:
        leftover_name = f"Leftover from {meal.meal_type.value.title()}"
        original_meal_name = meal.meal_type.value.title()

    cooked_date = meal.date
    if leftover.expiration_date:
        expiration_date = leftover.expiration_date
        expiration_auto_filled = False
        shelf_life = (expiration_date - cooked_date).days
    else:
        expiration_date, shelf_life = get_leftover_expiration(
            meal_name=original_meal_name, cooked_date=cooked_date
        )
        if leftover.location == StorageLocation.FREEZER:
            shelf_life = 90
            expiration_date = cooked_date + timedelta(days=shelf_life)
        expiration_auto_filled = True

    ingredient = find_or_create_ingredient(db, leftover_name, leftover.unit)

    item_data = dict(
        ingredient_id=ingredient.id, name=leftover_name,
        quantity=leftover.quantity, unit=leftover.unit, location=leftover.location,
        expiration_date=expiration_date, notes=leftover.notes,
        purchase_date=cooked_date, default_shelf_life=shelf_life,
        expiration_auto_filled=expiration_auto_filled,
        food_category=FoodCategory.LEFTOVERS.value,
        source=ItemSource.LEFTOVER, linked_meal_id=meal.id,
        original_meal_name=original_meal_name
    )

    db_item, merged = inventory_service.upsert_inventory_item(db, item_data)
    db.commit()
    db.refresh(db_item)
    return db_item


# =============================================================================
# Post-Cooking Depletion
# =============================================================================

@router.post("/deplete-from-cooking/{meal_id}", response_model=DepletionResponse)
@limiter.limit("30/minute")
def deplete_from_cooking(
    request: Request,
    meal_id: int,
    body: Optional[DepletionRequest] = None,
    db: Session = Depends(get_db)
):
    """Auto-deplete inventory based on recipe ingredients after cooking."""
    adjustments = (body.adjustments or []) if body else []
    result = inventory_service.deplete_from_cooking(db, meal_id, adjustments)

    if "error" in result:
        raise HTTPException(
            status_code=result.get("status_code", 400),
            detail=result["error"]
        )

    return DepletionResponse(
        depleted=[DepletionLogEntry(**d) for d in result["depleted"]],
        skipped=[SkippedEntry(**s) for s in result.get("skipped", [])],
        undo_available_for_seconds=result["undo_available_for_seconds"],
    )


@router.post("/undo-depletion/{meal_id}", response_model=UndoDepletionResponse)
@limiter.limit("10/minute")
def undo_depletion(request: Request, meal_id: int, db: Session = Depends(get_db)):
    """Undo the last depletion for a meal within the 5-second window."""
    result = inventory_service.undo_depletion(db, meal_id)
    return UndoDepletionResponse(**result)

"""
Shopping List API endpoints.

Unified ingredient architecture:
- Uses ingredient_id FK joins instead of ILIKE string matching
- find_or_create_ingredient helper for consistent ingredient linking
- Smart thresholds via needs_restock() using Reference Class Forecasting
- Pre-parsed quantity_amount/quantity_unit fields for accurate inventory transfer

Business logic is extracted to services/shopping_service.py.
"""

import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import ShoppingListItem
from app.schemas.shopping import (
    ShoppingListItemCreate,
    ShoppingListItemUpdate,
    ShoppingListItemResponse,
    GenerateResponse,
    PackageDataItem,
    CompleteShoppingTripRequest,
    CompleteShoppingTripResponse,
)
from app.services.ingredient_service import find_or_create_ingredient
from app.services.parsing.quantity_parser import parse_quantity
from app.services import shopping_service

logger = logging.getLogger("weekly_review")
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


DEFAULT_CATEGORIES = [
    "Produce", "Dairy", "Meat & Seafood", "Frozen",
    "Pantry", "Beverages", "Condiments", "Snacks",
]


# =============================================================================
# CRUD Endpoints
# =============================================================================

@router.get("/week/{week_start}", response_model=List[ShoppingListItemResponse])
@limiter.limit("100/minute")
def get_shopping_list_for_week(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Get shopping list items for a specific week with V2 package data."""
    items = db.query(ShoppingListItem).filter(
        ShoppingListItem.week_start == week_start
    ).order_by(ShoppingListItem.category, ShoppingListItem.name).limit(500).all()
    return shopping_service.enrich_with_package_data(items, db)


@router.get("/categories", response_model=List[str])
def get_categories():
    """Get the list of available categories."""
    return DEFAULT_CATEGORIES


@router.get("/{item_id}", response_model=ShoppingListItemResponse)
@limiter.limit("100/minute")
def get_shopping_list_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Get a single shopping list item by ID."""
    item = db.query(ShoppingListItem).filter(ShoppingListItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list item not found")
    return item


@router.post("", response_model=ShoppingListItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
def create_shopping_list_item(request: Request, item: ShoppingListItemCreate, db: Session = Depends(get_db)):
    """Create a new shopping list item. Returns existing item if duplicate name+week found."""
    existing = db.query(ShoppingListItem).filter(
        ShoppingListItem.week_start == item.week_start,
        func.lower(ShoppingListItem.name) == item.name.strip().lower(),
    ).first()
    if existing:
        return existing

    item_data = item.model_dump()

    ingredient = find_or_create_ingredient(db, item.name)
    item_data["ingredient_id"] = ingredient.id

    # Infer category from ingredient name when default "Other" is used
    if not item.category or item.category == "Other":
        inferred = shopping_service.categorize_ingredient(item.name)
        item_data["category"] = inferred

    if item.quantity:
        try:
            parsed = parse_quantity(item.quantity)
            item_data["quantity_amount"] = parsed.amount if parsed.amount > 0 else None
            item_data["quantity_unit"] = parsed.unit
        except (ValueError, AttributeError) as e:
            logger.debug("Quantity parse fallback for '%s': %s", item.quantity, e)

    db_item = ShoppingListItem(**item_data)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id}", response_model=ShoppingListItemResponse)
@limiter.limit("60/minute")
def update_shopping_list_item(
    request: Request, item_id: int, item: ShoppingListItemUpdate, db: Session = Depends(get_db)
):
    """Update an existing shopping list item."""
    db_item = db.query(ShoppingListItem).filter(ShoppingListItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list item not found")

    update_data = item.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    db.commit()
    db.refresh(db_item)
    return db_item


@router.post("/{item_id}/toggle", response_model=ShoppingListItemResponse)
@limiter.limit("60/minute")
def toggle_shopping_list_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Toggle the checked status of a shopping list item."""
    db_item = db.query(ShoppingListItem).filter(ShoppingListItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list item not found")

    db_item.is_checked = not db_item.is_checked
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
def delete_shopping_list_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Delete a shopping list item."""
    db_item = db.query(ShoppingListItem).filter(ShoppingListItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list item not found")

    db.delete(db_item)
    db.commit()
    return None


@router.delete("/week/{week_start}/clear", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def clear_shopping_list_for_week(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Clear all shopping list items for a specific week."""
    db.query(ShoppingListItem).filter(ShoppingListItem.week_start == week_start).delete()
    db.commit()
    return None


# =============================================================================
# Generate & Complete
# =============================================================================

@router.post("/generate/{week_start}", response_model=GenerateResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def generate_shopping_list(request: Request, week_start: date, db: Session = Depends(get_db)):
    """Generate shopping list from meal plan for the specified week."""
    result = shopping_service.generate_shopping_list(db, week_start)
    return GenerateResponse(**result)


@router.post("/week/{week_start}/complete", response_model=CompleteShoppingTripResponse)
@limiter.limit("10/minute")
def complete_shopping_trip(
    request: Request,
    week_start: date,
    body: Optional[CompleteShoppingTripRequest] = None,
    db: Session = Depends(get_db),
):
    """Complete a shopping trip: transfer checked items to inventory and clear them."""
    package_data_map: dict = {}
    if body and body.package_data:
        for pd in body.package_data:
            package_data_map[pd.shopping_item_id] = pd

    result = shopping_service.complete_shopping_trip(db, week_start, package_data_map)
    return CompleteShoppingTripResponse(**result)



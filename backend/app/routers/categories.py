"""
Categories API endpoints.

Parameterized CRUD for event, recipe, and financial categories.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import EventCategory, RecipeCategory, FinancialCategory
from app.schemas.categories import CategoryDomain, CategoryCreate, CategoryResponse

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Domain mapping
# =============================================================================

CATEGORY_MODELS = {
    CategoryDomain.events: EventCategory,
    CategoryDomain.recipes: RecipeCategory,
    CategoryDomain.finances: FinancialCategory,
}


# =============================================================================
# Parameterized endpoints
# =============================================================================

@router.get("/{domain}", response_model=List[CategoryResponse])
@limiter.limit("100/minute")
def list_categories(domain: CategoryDomain, request: Request, db: Session = Depends(get_db)):
    """List all categories for the given domain."""
    model = CATEGORY_MODELS[domain]
    return db.query(model).order_by(model.name).limit(1000).all()


@router.post("/{domain}", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_category(domain: CategoryDomain, request: Request, category: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new category in the given domain."""
    model = CATEGORY_MODELS[domain]
    db_category = model(**category.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

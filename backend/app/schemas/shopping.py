"""
Pydantic schemas for Shopping List API.
"""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ShoppingListItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    quantity: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field("Other", max_length=50)


class ShoppingListItemCreate(ShoppingListItemBase):
    week_start: date
    source_recipe_id: Optional[int] = None


class ShoppingListItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    quantity: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=50)
    is_checked: Optional[bool] = None


class ShoppingListItemResponse(ShoppingListItemBase):
    id: int
    is_checked: bool
    source_recipe_id: Optional[int]
    week_start: date
    created_at: datetime
    updated_at: datetime
    ingredient_id: Optional[int] = None
    quantity_amount: Optional[float] = None
    quantity_unit: Optional[str] = None
    package_display: Optional[str] = None
    package_detail: Optional[str] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    package_type: Optional[str] = None
    packages_needed: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class GenerateResponse(BaseModel):
    items_created: int
    recipes_processed: int


class PackageDataItem(BaseModel):
    shopping_item_id: int
    package_label: str = Field(..., max_length=100)
    package_size: float = Field(..., gt=0)
    package_unit: str = Field(..., max_length=50)
    package_type: Optional[str] = Field(None, max_length=50)
    store: Optional[str] = Field(None, max_length=200)
    price: Optional[float] = Field(None, ge=0)


class CompleteShoppingTripRequest(BaseModel):
    package_data: Optional[List[PackageDataItem]] = None


class CompleteShoppingTripResponse(BaseModel):
    items_transferred: int
    items_cleared: int

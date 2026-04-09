"""
Pydantic schemas for the unified food item parser API.

Supports:
- Preview parsing (no DB writes)
- Single-line and multi-line parsing
- CSV and simple text formats
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class FoodParserRequest(BaseModel):
    """Request body for parsing food item text."""
    text: str = Field(..., min_length=1, max_length=10000)
    context: str = Field(default="inventory", pattern="^(inventory|recipe|shopping)$")


class ParsedFoodItemSchema(BaseModel):
    """A single parsed food item."""
    name: str
    quantity: float = 1.0
    unit: Optional[str] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[str] = None
    category_hint: Optional[str] = None
    raw_text: str = ""
    confidence: float = 1.0


class FoodParserResponse(BaseModel):
    """Response for multi-line parsing."""
    items: List[ParsedFoodItemSchema]
    format_detected: str  # "csv" or "simple"
    total_lines: int
    parsed_count: int

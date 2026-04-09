"""
Food Parser Router

Stateless preview endpoints for parsing food item text.
No database writes — returns structured data for frontend preview.
"""

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.schemas.food_parser import (
    FoodParserRequest,
    FoodParserResponse,
    ParsedFoodItemSchema,
)
from app.services.parsing.food_item_parser import (
    parse_food_item,
    parse_food_items,
    detect_format,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/preview", response_model=FoodParserResponse)
@limiter.limit("60/minute")
async def preview_parse(body: FoodParserRequest, request: Request):
    """Parse multi-line text and return structured preview (no DB writes)."""
    items = parse_food_items(body.text, body.context)
    total_lines = len([l for l in body.text.split('\n') if l.strip()])
    format_detected = detect_format(body.text)

    return FoodParserResponse(
        items=[
            ParsedFoodItemSchema(
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                package_size=item.package_size,
                package_unit=item.package_unit,
                notes=item.notes,
                expiration_date=item.expiration_date,
                category_hint=item.category_hint,
                raw_text=item.raw_text,
                confidence=item.confidence,
            )
            for item in items
        ],
        format_detected=format_detected,
        total_lines=total_lines,
        parsed_count=len(items),
    )


@router.post("/preview-single", response_model=ParsedFoodItemSchema)
@limiter.limit("60/minute")
async def preview_single(body: FoodParserRequest, request: Request):
    """Parse a single line and return structured data."""
    item = parse_food_item(body.text, body.context)

    return ParsedFoodItemSchema(
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        package_size=item.package_size,
        package_unit=item.package_unit,
        notes=item.notes,
        expiration_date=item.expiration_date,
        category_hint=item.category_hint,
        raw_text=item.raw_text,
        confidence=item.confidence,
    )

"""
Package Converter Service

Converts between cooking amounts and package amounts for inventory items.
Core V2 service that enables the unified food system flow:

  Recipe (3 cups olive oil)
    → Shopping List (1 bottle olive oil, 3 cups needed)
    → Purchase (32oz bottle via PackageSizeModal)
    → Inventory (32oz bottle — 81% remaining)
    → Cooking depletion (use 6.1oz, update amount_used)

Graceful fallback: if no PackageConversion exists for an ingredient,
returns None and callers fall back to V1 behavior (cooking amounts only).
"""

import math
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models.package_conversion import PackageConversion
from app.models.purchase_history import PurchaseHistory
from app.services.parsing.quantity_parser import normalize_unit
from app.services.parsing.quantity_consolidator import convert_same_type


@dataclass
class PackageResult:
    """Result of converting a cooking amount to packages."""
    packages_needed: int
    package_label: str
    package_type: str
    package_size: float
    package_unit: str
    cooking_amount: float
    cooking_unit: str
    leftover_amount: float
    leftover_unit: str


@dataclass
class CookingResult:
    """Result of converting a package count to cooking amount."""
    amount: float
    unit: str
    package_label: str


def find_conversion(
    db: Session,
    ingredient_name: str,
) -> Optional[PackageConversion]:
    """
    Find the best PackageConversion match for an ingredient name.

    Matching strategy (ordered by specificity):
    1. Exact pattern match (case-insensitive)
    2. Pattern contained in ingredient name
    3. Ingredient name contained in pattern

    Returns None if no match found (triggers V1 fallback).
    """
    if not ingredient_name:
        return None

    name_lower = ingredient_name.lower().strip()

    # 1. Exact match first
    exact = (
        db.query(PackageConversion)
        .filter(PackageConversion.ingredient_pattern == name_lower)
        .first()
    )
    if exact:
        return exact

    # 2. Pattern contained in ingredient name (e.g., "olive oil" matches "extra virgin olive oil")
    all_conversions = db.query(PackageConversion).all()

    best_match = None
    best_len = 0

    for conv in all_conversions:
        pattern = conv.ingredient_pattern.lower()
        if pattern in name_lower and len(pattern) > best_len:
            best_match = conv
            best_len = len(pattern)

    if best_match:
        return best_match

    # 3. Ingredient name contained in pattern (e.g., "oil" matches "olive oil")
    for conv in all_conversions:
        pattern = conv.ingredient_pattern.lower()
        if name_lower in pattern:
            return conv

    return None


def cooking_to_packages(
    db: Session,
    amount: float,
    unit: str,
    ingredient_name: str,
) -> Optional[PackageResult]:
    """
    Convert a cooking amount to the number of packages needed.

    Example:
        cooking_to_packages(db, 3.0, "cup", "olive oil")
        → PackageResult(packages_needed=1, package_label="16.9fl oz bottle",
                        cooking_amount=3.0, cooking_unit="cup",
                        leftover_amount=~30 tbsp, ...)

    Returns None if no conversion exists (callers fall back to V1).
    """
    if amount <= 0 or not unit:
        return None

    conversion = find_conversion(db, ingredient_name)
    if not conversion:
        return None

    norm_unit = normalize_unit(unit)
    cooking_eq = conversion.cooking_equivalent
    conv_cooking_unit = normalize_unit(conversion.cooking_unit)

    # Convert input amount to the conversion's cooking unit
    if norm_unit != conv_cooking_unit:
        converted_amount = convert_same_type(amount, norm_unit, conv_cooking_unit)
        if converted_amount is None:
            return None  # Can't convert between these unit types
        amount_in_conv_unit = converted_amount
    else:
        amount_in_conv_unit = amount

    # Calculate packages needed (round up — can't buy half a bottle)
    packages_needed = math.ceil(amount_in_conv_unit / cooking_eq)
    leftover = (packages_needed * cooking_eq) - amount_in_conv_unit

    package_label = f"{conversion.package_size}{conversion.package_unit} {conversion.package_type}"

    return PackageResult(
        packages_needed=packages_needed,
        package_label=package_label,
        package_type=conversion.package_type,
        package_size=conversion.package_size,
        package_unit=conversion.package_unit,
        cooking_amount=round(amount_in_conv_unit, 2),
        cooking_unit=conv_cooking_unit,
        leftover_amount=round(leftover, 2),
        leftover_unit=conv_cooking_unit,
    )


def package_to_cooking(
    db: Session,
    packages: float,
    ingredient_name: str,
) -> Optional[CookingResult]:
    """
    Convert a package count to cooking amount.

    Example:
        package_to_cooking(db, 1.0, "olive oil")
        → CookingResult(amount=33.8, unit="tablespoon", package_label="16.9fl oz bottle")

    Returns None if no conversion exists.
    """
    if packages <= 0:
        return None

    conversion = find_conversion(db, ingredient_name)
    if not conversion:
        return None

    amount = packages * conversion.cooking_equivalent
    package_label = f"{conversion.package_size}{conversion.package_unit} {conversion.package_type}"

    return CookingResult(
        amount=round(amount, 2),
        unit=conversion.cooking_unit,
        package_label=package_label,
    )


def convert_cooking_to_package_unit(
    db: Session,
    amount: float,
    cooking_unit: str,
    ingredient_name: str,
) -> Optional[float]:
    """
    Convert a cooking amount to the package's unit for depletion tracking.

    Example:
        convert_cooking_to_package_unit(db, 2.0, "cup", "olive oil")
        → 6.1  (2 cups ≈ 6.1 fl oz, since package is measured in fl oz)

    Used by deplete_from_cooking() to update amount_used on InventoryItem.
    Returns None if conversion not possible.
    """
    if amount <= 0 or not cooking_unit:
        return None

    conversion = find_conversion(db, ingredient_name)
    if not conversion:
        return None

    norm_cooking = normalize_unit(cooking_unit)
    conv_cooking_unit = normalize_unit(conversion.cooking_unit)

    # Step 1: Convert input to conversion's cooking unit
    if norm_cooking != conv_cooking_unit:
        amount_in_conv = convert_same_type(amount, norm_cooking, conv_cooking_unit)
        if amount_in_conv is None:
            return None
    else:
        amount_in_conv = amount

    # Step 2: Convert cooking units to package units
    # cooking_equivalent = how many cooking_units per package
    # package_size = size of package in package_unit
    # So: amount_in_package_unit = amount_in_conv * (package_size / cooking_equivalent)
    if conversion.cooking_equivalent <= 0:
        return None

    package_amount = amount_in_conv * (conversion.package_size / conversion.cooking_equivalent)
    return round(package_amount, 4)


def record_purchase(
    db: Session,
    ingredient_id: int,
    package_label: str,
    package_size: float,
    package_unit: str,
    package_type: Optional[str] = None,
    store: Optional[str] = None,
    price: Optional[float] = None,
) -> PurchaseHistory:
    """
    Record a purchase for learning preferred package sizes.

    Called during complete_shopping_trip() after user confirms package size.
    """
    from datetime import date as date_type

    purchase = PurchaseHistory(
        ingredient_id=ingredient_id,
        package_label=package_label,
        package_size=package_size,
        package_unit=package_unit,
        package_type=package_type,
        store=store,
        price=price,
        purchase_date=date_type.today(),
    )

    db.add(purchase)
    return purchase

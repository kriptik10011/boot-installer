"""
Inventory depletion forecasting service.

Provides linear projection forecasting based on consumption history.
Each InventoryItem tracks consumption_history as JSON list of dicts.
This service calculates daily usage rates and projects when items will run out.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional, List
from statistics import median

from app.models.inventory import InventoryItem


@dataclass
class DepletionForecast:
    """Forecast of when an inventory item will be depleted."""
    item_id: int
    item_name: str
    days_remaining: Optional[float]  # None if insufficient data
    depletion_date: Optional[date]
    confidence: float  # 0.0-1.0
    current_level: str  # "full", "medium", "low", "empty", "unknown"
    percent_remaining: Optional[float]
    daily_usage_rate: Optional[float]
    usage_unit: Optional[str]
    needs_restock: bool
    restock_urgency: str  # "none", "soon", "urgent", "critical"


def _calculate_current_level(percent_remaining: Optional[float]) -> str:
    """Determine current level category from percentage."""
    if percent_remaining is None:
        return "unknown"
    if percent_remaining <= 0:
        return "empty"
    if percent_remaining < 25:
        return "low"
    if percent_remaining < 75:
        return "medium"
    return "full"


def _calculate_restock_urgency(days_remaining: Optional[float]) -> str:
    """Determine restock urgency from days remaining."""
    if days_remaining is None:
        return "none"
    if days_remaining < 2:
        return "critical"
    if days_remaining < 5:
        return "urgent"
    if days_remaining < 10:
        return "soon"
    return "none"


def _calculate_daily_usage_rate(consumption_history: List[dict]) -> Optional[float]:
    """
    Calculate median daily usage rate from consumption history.

    Returns None if insufficient data.
    Expects history entries with "amount_used" and "date" fields.
    """
    if len(consumption_history) < 3:
        return None

    # Filter entries with valid amount_used
    valid_entries = [
        entry for entry in consumption_history
        if entry.get("amount_used") and entry.get("amount_used") > 0 and entry.get("date")
    ]

    if len(valid_entries) < 3:
        return None

    # Sort by date
    sorted_entries = sorted(valid_entries, key=lambda e: e["date"])

    # Calculate daily usage rates between consecutive entries
    daily_rates = []
    for i in range(1, len(sorted_entries)):
        prev_entry = sorted_entries[i - 1]
        curr_entry = sorted_entries[i]

        # Parse dates
        try:
            if isinstance(prev_entry["date"], str):
                prev_date = datetime.fromisoformat(prev_entry["date"].replace("Z", "+00:00")).date()
            else:
                prev_date = prev_entry["date"]

            if isinstance(curr_entry["date"], str):
                curr_date = datetime.fromisoformat(curr_entry["date"].replace("Z", "+00:00")).date()
            else:
                curr_date = curr_entry["date"]

            days_between = (curr_date - prev_date).days
            if days_between > 0:
                # Use amount_used from current entry, divide by days since previous use
                daily_rate = curr_entry["amount_used"] / days_between
                daily_rates.append(daily_rate)
        except (ValueError, TypeError):
            continue

    if not daily_rates:
        return None

    # Return median daily usage rate
    return median(daily_rates)


def forecast_item(item: InventoryItem, days_until_shopping: int = 7) -> DepletionForecast:
    """
    Generate depletion forecast for a single inventory item.

    Uses linear projection from consumption history if available (3+ entries).
    Falls back to static thresholds if insufficient data.
    """
    # Get current amount remaining
    amount_remaining = item.get_amount_remaining()
    percent_remaining = item.get_package_percent_remaining()

    # Determine current level
    current_level = _calculate_current_level(percent_remaining)

    # Get consumption history
    consumption_history = item.consumption_history or []

    # Calculate daily usage rate
    daily_usage_rate = _calculate_daily_usage_rate(consumption_history)

    # Initialize forecast values
    days_remaining: Optional[float] = None
    depletion_date: Optional[date] = None
    confidence: float = 0.3  # Low confidence by default

    # If we have sufficient data for projection
    if daily_usage_rate is not None and daily_usage_rate > 0:
        if amount_remaining is not None and amount_remaining > 0:
            # Linear projection
            days_remaining = amount_remaining / daily_usage_rate
            depletion_date = date.today() + timedelta(days=days_remaining)

            # Confidence increases with more data points (cap at 0.95)
            confidence = min(0.95, 0.5 + len(consumption_history) * 0.05)
        else:
            # No amount remaining but have usage rate
            days_remaining = 0.0
            depletion_date = date.today()
            confidence = min(0.95, 0.5 + len(consumption_history) * 0.05)
    else:
        # Insufficient data - use static thresholds
        # If we know percentage, estimate based on that
        if percent_remaining is not None:
            if percent_remaining <= 0:
                days_remaining = 0.0
                depletion_date = date.today()
            elif percent_remaining < 25:
                # Assume ~3 days at low level
                days_remaining = 3.0
                depletion_date = date.today() + timedelta(days=3)
            elif percent_remaining < 50:
                # Assume ~7 days at medium-low level
                days_remaining = 7.0
                depletion_date = date.today() + timedelta(days=7)
            else:
                # Assume ~14 days at higher levels
                days_remaining = 14.0
                depletion_date = date.today() + timedelta(days=14)
        # else: days_remaining stays None (unknown)

    # Determine needs_restock using item's smart threshold
    needs_restock = item.needs_restock(days_until_shopping=days_until_shopping)

    # Determine restock urgency
    restock_urgency = _calculate_restock_urgency(days_remaining)

    # Determine usage unit (prefer package_unit if available)
    usage_unit = item.package_unit if item.package_unit else item.unit

    return DepletionForecast(
        item_id=item.id,
        item_name=item.name,
        days_remaining=days_remaining,
        depletion_date=depletion_date,
        confidence=confidence,
        current_level=current_level,
        percent_remaining=percent_remaining,
        daily_usage_rate=daily_usage_rate,
        usage_unit=usage_unit,
        needs_restock=needs_restock,
        restock_urgency=restock_urgency,
    )

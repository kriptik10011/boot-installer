"""
Investment portfolio analysis service.

Handles: allocation calculation, performance tracking, drift detection,
rebalancing suggestions. All deterministic — no AI, no price APIs.
"""

import logging
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.investment import (
    InvestmentAccount, InvestmentHolding, TargetAllocation, InvestmentContribution,
)

logger = logging.getLogger("weekly_review")


@dataclass
class AllocationEntry:
    """Single asset class allocation."""
    asset_class: str
    current_value: float
    current_pct: float
    target_pct: Optional[float] = None
    drift_pct: Optional[float] = None


@dataclass
class HoldingPerf:
    """Performance data for a single holding."""
    holding_id: int
    name: str
    symbol: Optional[str]
    asset_class: str
    quantity: float
    cost_basis: float
    current_value: float
    gain_loss: float
    gain_loss_pct: float
    weight_pct: float


@dataclass
class RebalanceTrade:
    """Single rebalancing trade suggestion."""
    asset_class: str
    current_value: float
    current_pct: float
    target_pct: float
    target_value: float
    trade_amount: float
    action: str  # "buy" or "sell"


def calculate_allocation(
    db: Session,
    account_id: Optional[int] = None,
) -> dict:
    """
    Calculate current asset allocation by class.

    If account_id is provided, calculates for that account only.
    Otherwise, calculates portfolio-wide allocation.
    """
    query = db.query(InvestmentHolding)
    if account_id is not None:
        query = query.join(InvestmentAccount).filter(
            InvestmentAccount.id == account_id,
            InvestmentAccount.is_active == True,
        )
    else:
        query = query.join(InvestmentAccount).filter(InvestmentAccount.is_active == True)

    holdings = query.all()
    total_value = sum(h.current_value for h in holdings)

    # Aggregate by asset class
    class_values: dict[str, float] = {}
    for h in holdings:
        class_values[h.asset_class] = class_values.get(h.asset_class, 0.0) + h.current_value

    # Load targets if account-specific
    targets: dict[str, float] = {}
    if account_id is not None:
        for ta in db.query(TargetAllocation).filter(TargetAllocation.account_id == account_id).all():
            targets[ta.asset_class] = ta.target_pct

    allocations = []
    for asset_class, value in sorted(class_values.items()):
        current_pct = round((value / total_value * 100.0) if total_value > 0 else 0.0, 2)
        target_pct = targets.get(asset_class)
        drift_pct = round(current_pct - target_pct, 2) if target_pct is not None else None

        allocations.append(AllocationEntry(
            asset_class=asset_class,
            current_value=round(value, 2),
            current_pct=current_pct,
            target_pct=target_pct,
            drift_pct=drift_pct,
        ))

    # Include target classes that have 0 holdings
    for asset_class, target_pct in targets.items():
        if asset_class not in class_values:
            allocations.append(AllocationEntry(
                asset_class=asset_class,
                current_value=0.0,
                current_pct=0.0,
                target_pct=target_pct,
                drift_pct=round(0.0 - target_pct, 2),
            ))

    return {
        "account_id": account_id,
        "total_value": round(total_value, 2),
        "allocations": allocations,
    }


def calculate_performance(
    db: Session,
    account_id: Optional[int] = None,
) -> dict:
    """
    Calculate portfolio performance: gain/loss per holding and total.

    Returns cost basis, current value, gain/loss, and weight for each holding.
    """
    query = db.query(InvestmentHolding)
    if account_id is not None:
        query = query.join(InvestmentAccount).filter(
            InvestmentAccount.id == account_id,
            InvestmentAccount.is_active == True,
        )
    else:
        query = query.join(InvestmentAccount).filter(InvestmentAccount.is_active == True)

    holdings = query.all()

    total_cost_basis = sum(h.cost_basis for h in holdings)
    total_current_value = sum(h.current_value for h in holdings)
    total_gain_loss = total_current_value - total_cost_basis
    total_gain_loss_pct = round(
        (total_gain_loss / total_cost_basis * 100.0) if total_cost_basis > 0 else 0.0, 2
    )

    # Total contributions
    contrib_query = db.query(func.coalesce(func.sum(InvestmentContribution.amount), 0.0))
    if account_id is not None:
        contrib_query = contrib_query.filter(InvestmentContribution.account_id == account_id)
    total_contributions = contrib_query.scalar() or 0.0

    holding_perfs = []
    for h in holdings:
        weight_pct = round(
            (h.current_value / total_current_value * 100.0) if total_current_value > 0 else 0.0, 2
        )
        holding_perfs.append(HoldingPerf(
            holding_id=h.id,
            name=h.name,
            symbol=h.symbol,
            asset_class=h.asset_class,
            quantity=h.quantity,
            cost_basis=round(h.cost_basis, 2),
            current_value=round(h.current_value, 2),
            gain_loss=round(h.gain_loss, 2),
            gain_loss_pct=h.gain_loss_pct,
            weight_pct=weight_pct,
        ))

    return {
        "account_id": account_id,
        "total_cost_basis": round(total_cost_basis, 2),
        "total_current_value": round(total_current_value, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "total_gain_loss_pct": total_gain_loss_pct,
        "total_contributions": round(total_contributions, 2),
        "holdings": holding_perfs,
    }


def preview_rebalance(
    db: Session,
    account_id: int,
) -> dict:
    """
    Generate rebalancing suggestions for an account.

    Compares current allocation to target allocation and suggests
    buy/sell trades to bring portfolio back to target.

    Returns empty trades list if no targets are set.
    """
    targets = db.query(TargetAllocation).filter(
        TargetAllocation.account_id == account_id,
    ).all()

    if not targets:
        return {
            "account_id": account_id,
            "total_value": 0.0,
            "trades": [],
            "total_buys": 0.0,
            "total_sells": 0.0,
        }

    # Get current allocation
    holdings = db.query(InvestmentHolding).filter(
        InvestmentHolding.account_id == account_id,
    ).all()

    total_value = sum(h.current_value for h in holdings)
    if total_value <= 0:
        return {
            "account_id": account_id,
            "total_value": 0.0,
            "trades": [],
            "total_buys": 0.0,
            "total_sells": 0.0,
        }

    # Current allocation by asset class
    class_values: dict[str, float] = {}
    for h in holdings:
        class_values[h.asset_class] = class_values.get(h.asset_class, 0.0) + h.current_value

    # Build target map
    target_map = {t.asset_class: t.target_pct for t in targets}

    # Calculate trades for each asset class in targets
    trades = []
    total_buys = 0.0
    total_sells = 0.0

    all_classes = set(list(class_values.keys()) + list(target_map.keys()))

    for asset_class in sorted(all_classes):
        current_value = class_values.get(asset_class, 0.0)
        current_pct = round((current_value / total_value * 100.0), 2)
        target_pct = target_map.get(asset_class, 0.0)
        target_value = round(total_value * target_pct / 100.0, 2)
        trade_amount = round(target_value - current_value, 2)

        # Only include meaningful trades (> $1 threshold)
        if abs(trade_amount) < 1.0:
            continue

        action = "buy" if trade_amount > 0 else "sell"

        if trade_amount > 0:
            total_buys += trade_amount
        else:
            total_sells += abs(trade_amount)

        trades.append(RebalanceTrade(
            asset_class=asset_class,
            current_value=round(current_value, 2),
            current_pct=current_pct,
            target_pct=target_pct,
            target_value=target_value,
            trade_amount=trade_amount,
            action=action,
        ))

    return {
        "account_id": account_id,
        "total_value": round(total_value, 2),
        "trades": trades,
        "total_buys": round(total_buys, 2),
        "total_sells": round(total_sells, 2),
    }


def get_investment_summary(db: Session) -> dict:
    """
    Get portfolio-wide investment summary.

    Aggregates all active accounts: total value, gain/loss, contributions,
    tax-advantaged vs taxable split.
    """
    accounts = db.query(InvestmentAccount).filter(InvestmentAccount.is_active == True).all()

    total_value = 0.0
    total_cost_basis = 0.0
    total_holding_count = 0
    tax_advantaged_value = 0.0
    taxable_value = 0.0

    for acct in accounts:
        acct_value = acct.total_value
        total_value += acct_value
        total_cost_basis += acct.total_cost_basis
        total_holding_count += len(acct.holdings)

        if acct.is_tax_advantaged:
            tax_advantaged_value += acct_value
        else:
            taxable_value += acct_value

    total_gain_loss = total_value - total_cost_basis
    total_gain_loss_pct = round(
        (total_gain_loss / total_cost_basis * 100.0) if total_cost_basis > 0 else 0.0, 2
    )

    # Total contributions across all accounts
    total_contributions = db.query(
        func.coalesce(func.sum(InvestmentContribution.amount), 0.0)
    ).scalar() or 0.0

    return {
        "total_portfolio_value": round(total_value, 2),
        "total_cost_basis": round(total_cost_basis, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "total_gain_loss_pct": total_gain_loss_pct,
        "total_contributions": round(total_contributions, 2),
        "account_count": len(accounts),
        "holding_count": total_holding_count,
        "tax_advantaged_value": round(tax_advantaged_value, 2),
        "taxable_value": round(taxable_value, 2),
    }

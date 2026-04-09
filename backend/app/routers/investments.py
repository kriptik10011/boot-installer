"""
Investment Portfolio API router — accounts, holdings, allocation, performance, rebalancing.
"""

from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.investment import (
    InvestmentAccount, InvestmentHolding, TargetAllocation, InvestmentContribution,
)
from app.schemas.investments import (
    InvestmentAccountCreate, InvestmentAccountUpdate, InvestmentAccountResponse,
    InvestmentHoldingCreate, InvestmentHoldingUpdate, InvestmentHoldingResponse,
    TargetAllocationCreate, TargetAllocationResponse, InvestmentContributionCreate,
    InvestmentContributionResponse, AllocationEntry as AllocationEntrySchema,
    AllocationResponse,
    HoldingPerformance,
    PerformanceResponse, RebalanceTrade as RebalanceTradeSchema,
    RebalancePreviewResponse,
    InvestmentSummaryResponse,
)
from app.services.investment_service import (
    calculate_allocation, calculate_performance,
    preview_rebalance, get_investment_summary,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# --- Investment Accounts ---

@router.get("/accounts", response_model=List[InvestmentAccountResponse])
@limiter.limit("30/minute")
def list_accounts(
    request: Request,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """List investment accounts."""
    query = db.query(InvestmentAccount)
    if active_only:
        query = query.filter(InvestmentAccount.is_active == True)
    accounts = query.order_by(InvestmentAccount.name).limit(1000).all()
    return [_account_to_response(a) for a in accounts]


@router.post("/accounts", response_model=InvestmentAccountResponse, status_code=201)
@limiter.limit("30/minute")
def create_account(request: Request, data: InvestmentAccountCreate, db: Session = Depends(get_db)):
    """Create a new investment account."""
    account = InvestmentAccount(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return _account_to_response(account)


@router.get("/accounts/{account_id}", response_model=InvestmentAccountResponse)
@limiter.limit("30/minute")
def get_account(request: Request, account_id: int, db: Session = Depends(get_db)):
    """Get a single investment account."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")
    return _account_to_response(account)


@router.put("/accounts/{account_id}", response_model=InvestmentAccountResponse)
@limiter.limit("30/minute")
def update_account(
    request: Request, account_id: int, data: InvestmentAccountUpdate, db: Session = Depends(get_db)
):
    """Update an investment account."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return _account_to_response(account)


@router.delete("/accounts/{account_id}", status_code=204)
@limiter.limit("30/minute")
def archive_account(request: Request, account_id: int, db: Session = Depends(get_db)):
    """Archive an investment account (soft delete)."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")
    account.is_active = False
    db.commit()


# --- Holdings ---

@router.get("/holdings/{account_id}", response_model=List[InvestmentHoldingResponse])
@limiter.limit("30/minute")
def list_holdings(request: Request, account_id: int, db: Session = Depends(get_db)):
    """List holdings in an investment account."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")
    holdings = db.query(InvestmentHolding).filter(
        InvestmentHolding.account_id == account_id,
    ).order_by(InvestmentHolding.name).limit(1000).all()
    return [_holding_to_response(h) for h in holdings]


@router.post("/holdings", response_model=InvestmentHoldingResponse, status_code=201)
@limiter.limit("30/minute")
def create_holding(request: Request, data: InvestmentHoldingCreate, db: Session = Depends(get_db)):
    """Add a new holding to an investment account."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == data.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")

    holding = InvestmentHolding(**data.model_dump(), last_updated=date.today())
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return _holding_to_response(holding)


@router.get("/holdings/detail/{holding_id}", response_model=InvestmentHoldingResponse)
@limiter.limit("30/minute")
def get_holding(request: Request, holding_id: int, db: Session = Depends(get_db)):
    """Get a single holding."""
    holding = db.query(InvestmentHolding).filter(InvestmentHolding.id == holding_id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    return _holding_to_response(holding)


@router.put("/holdings/{holding_id}", response_model=InvestmentHoldingResponse)
@limiter.limit("30/minute")
def update_holding(
    request: Request, holding_id: int, data: InvestmentHoldingUpdate, db: Session = Depends(get_db)
):
    """Update a holding (price, quantity, value, etc.)."""
    holding = db.query(InvestmentHolding).filter(InvestmentHolding.id == holding_id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(holding, field, value)

    holding.last_updated = date.today()
    db.commit()
    db.refresh(holding)
    return _holding_to_response(holding)


@router.delete("/holdings/{holding_id}", status_code=204)
@limiter.limit("30/minute")
def delete_holding(request: Request, holding_id: int, db: Session = Depends(get_db)):
    """Delete a holding from an account."""
    holding = db.query(InvestmentHolding).filter(InvestmentHolding.id == holding_id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()


# --- Target Allocation ---

@router.get("/allocation/targets/{account_id}", response_model=List[TargetAllocationResponse])
@limiter.limit("30/minute")
def list_targets(request: Request, account_id: int, db: Session = Depends(get_db)):
    """List target allocations for an account."""
    return db.query(TargetAllocation).filter(
        TargetAllocation.account_id == account_id,
    ).order_by(TargetAllocation.asset_class).limit(1000).all()


@router.post("/allocation/targets/{account_id}", response_model=TargetAllocationResponse, status_code=201)
@limiter.limit("30/minute")
def set_target(
    request: Request, account_id: int, data: TargetAllocationCreate, db: Session = Depends(get_db)
):
    """Set or update a target allocation for an asset class in an account."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")

    # Upsert: check if target already exists for this asset class
    existing = db.query(TargetAllocation).filter(
        TargetAllocation.account_id == account_id,
        TargetAllocation.asset_class == data.asset_class,
    ).first()

    if existing:
        existing.target_pct = data.target_pct
        db.commit()
        db.refresh(existing)
        return existing

    target = TargetAllocation(account_id=account_id, **data.model_dump())
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/allocation/targets/{account_id}/{asset_class}", status_code=204)
@limiter.limit("30/minute")
def delete_target(request: Request, account_id: int, asset_class: str, db: Session = Depends(get_db)):
    """Remove a target allocation for an asset class."""
    target = db.query(TargetAllocation).filter(
        TargetAllocation.account_id == account_id,
        TargetAllocation.asset_class == asset_class,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target allocation not found")
    db.delete(target)
    db.commit()


# --- Contributions ---

@router.get("/contributions/{account_id}", response_model=List[InvestmentContributionResponse])
@limiter.limit("30/minute")
def list_contributions(request: Request, account_id: int, db: Session = Depends(get_db)):
    """List contributions for an investment account."""
    return db.query(InvestmentContribution).filter(
        InvestmentContribution.account_id == account_id,
    ).order_by(InvestmentContribution.date.desc()).limit(1000).all()


@router.post("/contributions/{account_id}", response_model=InvestmentContributionResponse, status_code=201)
@limiter.limit("30/minute")
def record_contribution(
    request: Request, account_id: int, data: InvestmentContributionCreate, db: Session = Depends(get_db)
):
    """Record a contribution or withdrawal for an investment account."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")

    contrib = InvestmentContribution(account_id=account_id, **data.model_dump())
    db.add(contrib)
    db.commit()
    db.refresh(contrib)
    return contrib


# --- Allocation Analysis ---

@router.get("/allocation", response_model=AllocationResponse)
@limiter.limit("30/minute")
def portfolio_allocation(
    request: Request,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get current asset allocation (portfolio-wide or per-account)."""
    result = calculate_allocation(db, account_id)
    return AllocationResponse(
        account_id=result["account_id"],
        total_value=result["total_value"],
        allocations=[
            AllocationEntrySchema(
                asset_class=a.asset_class,
                current_value=a.current_value,
                current_pct=a.current_pct,
                target_pct=a.target_pct,
                drift_pct=a.drift_pct,
            )
            for a in result["allocations"]
        ],
    )


# --- Performance ---

@router.get("/performance", response_model=PerformanceResponse)
@limiter.limit("30/minute")
def portfolio_performance(
    request: Request,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get portfolio performance (gain/loss per holding and total)."""
    result = calculate_performance(db, account_id)
    return PerformanceResponse(
        account_id=result["account_id"],
        total_cost_basis=result["total_cost_basis"],
        total_current_value=result["total_current_value"],
        total_gain_loss=result["total_gain_loss"],
        total_gain_loss_pct=result["total_gain_loss_pct"],
        total_contributions=result["total_contributions"],
        holdings=[
            HoldingPerformance(
                holding_id=h.holding_id,
                name=h.name,
                symbol=h.symbol,
                asset_class=h.asset_class,
                quantity=h.quantity,
                cost_basis=h.cost_basis,
                current_value=h.current_value,
                gain_loss=h.gain_loss,
                gain_loss_pct=h.gain_loss_pct,
                weight_pct=h.weight_pct,
            )
            for h in result["holdings"]
        ],
    )


# --- Rebalancing ---

@router.post("/rebalance/preview", response_model=RebalancePreviewResponse)
@limiter.limit("30/minute")
def rebalance_preview(
    request: Request,
    account_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Preview rebalancing trades to match target allocation."""
    account = db.query(InvestmentAccount).filter(InvestmentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Investment account not found")

    result = preview_rebalance(db, account_id)
    return RebalancePreviewResponse(
        account_id=result["account_id"],
        total_value=result["total_value"],
        trades=[
            RebalanceTradeSchema(
                asset_class=t.asset_class,
                current_value=t.current_value,
                current_pct=t.current_pct,
                target_pct=t.target_pct,
                target_value=t.target_value,
                trade_amount=t.trade_amount,
                action=t.action,
            )
            for t in result["trades"]
        ],
        total_buys=result["total_buys"],
        total_sells=result["total_sells"],
    )


# --- Summary ---

@router.get("/summary", response_model=InvestmentSummaryResponse)
@limiter.limit("30/minute")
def investment_summary(request: Request, db: Session = Depends(get_db)):
    """Get portfolio-wide investment summary."""
    result = get_investment_summary(db)
    return InvestmentSummaryResponse(**result)


# --- Helpers ---

def _account_to_response(account: InvestmentAccount) -> InvestmentAccountResponse:
    """Convert model to response with computed fields."""
    return InvestmentAccountResponse(
        id=account.id,
        name=account.name,
        type=account.type,
        institution=account.institution,
        account_last_four=account.account_last_four,
        is_tax_advantaged=account.is_tax_advantaged,
        is_active=account.is_active,
        notes=account.notes,
        total_value=account.total_value,
        total_cost_basis=account.total_cost_basis,
        total_gain_loss=account.total_gain_loss,
        total_gain_loss_pct=account.total_gain_loss_pct,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def _holding_to_response(holding: InvestmentHolding) -> InvestmentHoldingResponse:
    """Convert holding model to response with computed fields."""
    return InvestmentHoldingResponse(
        id=holding.id,
        account_id=holding.account_id,
        symbol=holding.symbol,
        name=holding.name,
        asset_class=holding.asset_class,
        quantity=holding.quantity,
        cost_basis=holding.cost_basis,
        current_price=holding.current_price,
        current_value=holding.current_value,
        gain_loss=holding.gain_loss,
        gain_loss_pct=holding.gain_loss_pct,
        cost_per_share=holding.cost_per_share,
        last_updated=holding.last_updated,
        notes=holding.notes,
        created_at=holding.created_at,
        updated_at=holding.updated_at,
    )

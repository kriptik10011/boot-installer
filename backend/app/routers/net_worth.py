"""
Net Worth & Assets API router — track assets and calculate net worth.
"""

from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.asset import Asset, AssetHistory
from app.models.debt import DebtAccount
from app.schemas.budget import (
    AssetCreate, AssetUpdate, AssetResponse,
    AssetHistoryResponse, NetWorthResponse,
    LowBalanceWarning, NetWorthTrendEntry as NetWorthTrendSchema,
    NetWorthMilestoneResponse, NetWorthSnapshotResponse,
    CashFlowForecastResponse, CashFlowDayEntry as CashFlowDaySchema,
)
from app.services.net_worth_service import (
    get_net_worth_trend, detect_net_worth_milestones, forecast_cash_flow,
)
from app.utils.debt_formatters import account_to_response as _debt_to_response

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# --- Net Worth ---

@router.get("/current", response_model=NetWorthResponse)
@limiter.limit("30/minute")
def get_current_net_worth(request: Request, db: Session = Depends(get_db)):
    """Get current net worth with asset/liability breakdown."""
    assets = db.query(Asset).limit(1000).all()
    debts = db.query(DebtAccount).filter(DebtAccount.is_active == True).limit(1000).all()

    total_assets = sum(a.current_value for a in assets)
    total_liabilities = sum(d.current_balance for d in debts)
    liquid_assets = sum(a.current_value for a in assets if a.is_liquid)
    illiquid_assets = total_assets - liquid_assets

    return NetWorthResponse(
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liabilities, 2),
        net_worth=round(total_assets - total_liabilities, 2),
        liquid_assets=round(liquid_assets, 2),
        illiquid_assets=round(illiquid_assets, 2),
        assets=[AssetResponse.model_validate(a) for a in assets],
        debts=[_debt_to_response(d) for d in debts],
    )


@router.post("/snapshot", response_model=NetWorthSnapshotResponse)
@limiter.limit("10/minute")
def take_snapshot(request: Request, db: Session = Depends(get_db)):
    """Record point-in-time net worth snapshot for all assets."""
    assets = db.query(Asset).limit(1000).all()
    today = date.today()
    count = 0

    for asset in assets:
        # Check if snapshot already exists for today
        existing = db.query(AssetHistory).filter(
            AssetHistory.asset_id == asset.id,
            AssetHistory.date == today,
        ).first()

        if existing:
            existing.value = asset.current_value
        else:
            # Get previous value for change calculation
            prev = db.query(AssetHistory).filter(
                AssetHistory.asset_id == asset.id,
            ).order_by(AssetHistory.date.desc()).first()

            change = asset.current_value - prev.value if prev else None

            db.add(AssetHistory(
                asset_id=asset.id,
                date=today,
                value=asset.current_value,
                change_amount=change,
            ))
            count += 1

    db.commit()

    # M-10: Also capture total debt at snapshot time for historical net worth accuracy
    debt_total = sum(d.current_balance for d in db.query(DebtAccount).filter(DebtAccount.is_active == True).limit(1000).all())

    return NetWorthSnapshotResponse(
        message=f"Snapshot recorded for {count} assets",
        date=today,
        total_assets_snapshot=round(sum(a.current_value for a in assets), 2),
        total_debt_snapshot=round(debt_total, 2),
    )


@router.get("/trend", response_model=List[NetWorthTrendSchema])
@limiter.limit("30/minute")
def net_worth_trend(
    request: Request,
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """Get net worth trend over time (monthly data points)."""
    results = get_net_worth_trend(db, months)
    return [
        NetWorthTrendSchema(
            date=e.date,
            total_assets=e.total_assets,
            total_liabilities=e.total_liabilities,
            net_worth=e.net_worth,
        )
        for e in results
    ]


@router.get("/milestones", response_model=List[NetWorthMilestoneResponse])
@limiter.limit("30/minute")
def net_worth_milestones(request: Request, db: Session = Depends(get_db)):
    """Get net worth milestone achievements."""
    results = detect_net_worth_milestones(db)
    return [
        NetWorthMilestoneResponse(
            amount=m.amount,
            label=m.label,
            achieved=m.achieved,
            achieved_date=m.achieved_date,
        )
        for m in results
    ]


@router.get("/forecast", response_model=CashFlowForecastResponse)
@limiter.limit("30/minute")
def cash_flow_forecast(
    request: Request,
    days: int = Query(default=30, ge=7, le=90),
    threshold: float = Query(default=500.0, ge=0),
    db: Session = Depends(get_db),
):
    """Get cash flow projection for next N days with low balance warnings."""
    result = forecast_cash_flow(db, days, threshold)
    return CashFlowForecastResponse(
        start_balance=result.start_balance,
        days=result.days,
        daily_projections=[
            CashFlowDaySchema(
                date=d.date,
                projected_balance=d.projected_balance,
                income=d.income,
                expenses=d.expenses,
                bills=d.bills,
                net_change=d.net_change,
            )
            for d in result.daily_projections
        ],
        low_balance_warnings=[
            LowBalanceWarning(
                date=w["date"],
                projected_balance=w["projected_balance"],
                threshold=w["threshold"],
                message=w["message"],
            )
            for w in result.low_balance_warnings
        ],
        min_projected_balance=result.min_projected_balance,
        min_balance_date=result.min_balance_date,
    )


# --- Assets CRUD ---

@router.get("/assets", response_model=List[AssetResponse])
@limiter.limit("30/minute")
def list_assets(request: Request, db: Session = Depends(get_db)):
    """List all assets."""
    return db.query(Asset).order_by(Asset.type, Asset.name).limit(1000).all()


@router.post("/assets", response_model=AssetResponse, status_code=201)
@limiter.limit("30/minute")
def create_asset(request: Request, data: AssetCreate, db: Session = Depends(get_db)):
    """Create a new asset."""
    asset = Asset(**data.model_dump(), last_updated=date.today())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.put("/assets/{asset_id}", response_model=AssetResponse)
@limiter.limit("30/minute")
def update_asset(
    request: Request, asset_id: int, data: AssetUpdate, db: Session = Depends(get_db)
):
    """Update an asset value."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)

    asset.last_updated = date.today()
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}", status_code=204)
@limiter.limit("30/minute")
def archive_asset(request: Request, asset_id: int, db: Session = Depends(get_db)):
    """Delete an asset."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()


@router.get("/assets/{asset_id}/history", response_model=List[AssetHistoryResponse])
@limiter.limit("30/minute")
def get_asset_history(request: Request, asset_id: int, db: Session = Depends(get_db)):
    """Get value history for an asset."""
    return db.query(AssetHistory).filter(
        AssetHistory.asset_id == asset_id
    ).order_by(AssetHistory.date.desc()).limit(1000).all()


    # L-4: _debt_to_response imported from app.routers.debt to avoid duplication

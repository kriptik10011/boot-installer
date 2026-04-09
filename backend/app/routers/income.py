"""
Income API router — track income streams.
"""

from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.income import IncomeSource
from app.schemas.budget import IncomeSourceCreate, IncomeSourceUpdate, IncomeSourceResponse, IncomeSummaryResponse
from app.services.transaction_service import get_income_summary

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/summary/{period_start}", response_model=IncomeSummaryResponse)
@limiter.limit("30/minute")
def income_summary(request: Request, period_start: date, db: Session = Depends(get_db)):
    """Get expected vs actual income comparison for a period."""
    summary = get_income_summary(db, period_start)
    return {
        "period_start": summary.period_start,
        "period_end": summary.period_end,
        "expected_income": summary.expected_income,
        "actual_income": summary.actual_income,
        "difference": summary.difference,
        "sources": summary.sources,
    }


@router.get("/sources", response_model=List[IncomeSourceResponse])
@limiter.limit("30/minute")
def list_income_sources(request: Request, db: Session = Depends(get_db)):
    """List all income sources."""
    return db.query(IncomeSource).order_by(IncomeSource.sort_order).limit(1000).all()


@router.post("/sources", response_model=IncomeSourceResponse, status_code=201)
@limiter.limit("30/minute")
def create_income_source(request: Request, data: IncomeSourceCreate, db: Session = Depends(get_db)):
    """Create a new income source."""
    source = IncomeSource(**data.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.get("/sources/{source_id}", response_model=IncomeSourceResponse)
@limiter.limit("30/minute")
def get_income_source(request: Request, source_id: int, db: Session = Depends(get_db)):
    """Get a single income source."""
    source = db.query(IncomeSource).filter(IncomeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Income source not found")
    return source


@router.put("/sources/{source_id}", response_model=IncomeSourceResponse)
@limiter.limit("30/minute")
def update_income_source(
    request: Request, source_id: int, data: IncomeSourceUpdate, db: Session = Depends(get_db)
):
    """Update an income source."""
    source = db.query(IncomeSource).filter(IncomeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Income source not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(source, field, value)

    db.commit()
    db.refresh(source)
    return source


@router.delete("/sources/{source_id}", status_code=204)
@limiter.limit("30/minute")
def deactivate_income_source(request: Request, source_id: int, db: Session = Depends(get_db)):
    """Deactivate an income source (soft delete)."""
    source = db.query(IncomeSource).filter(IncomeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Income source not found")
    source.is_active = False
    db.commit()

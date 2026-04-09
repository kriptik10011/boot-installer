"""
Financial Reports & Analytics API router.
"""

from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
import csv
import io

from app.database import get_db
from app.schemas.reports import (
    SpendingBreakdownResponse, SpendingBreakdownEntry,
    IncomeVsExpensesResponse, IncomeVsExpensesEntry,
    CategoryTrendsResponse, CategoryTrendEntry,
    MerchantAnalysisResponse, MerchantEntry,
    SavingsRateResponse, SavingsRateEntry,
    HealthScoreResponse,
    MonthlyCloseResponse,
    YearReviewResponse,
)
from app.services.reports_service import (
    get_spending_breakdown,
    get_income_vs_expenses,
    get_category_trends,
    get_merchant_analysis,
    get_savings_rate,
    calculate_health_score,
    get_monthly_close,
    get_year_review,
    export_transactions,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/spending/{period_start}", response_model=SpendingBreakdownResponse)
@limiter.limit("30/minute")
def spending_breakdown(
    request: Request,
    period_start: date,
    period_end: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Get spending breakdown by category for a period."""
    if not period_end:
        # Default to end of month
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

    breakdown = get_spending_breakdown(db, period_start, period_end)
    total = sum(b.total_spent for b in breakdown)

    return SpendingBreakdownResponse(
        period_start=period_start,
        period_end=period_end,
        total_spent=round(total, 2),
        categories=[
            SpendingBreakdownEntry(
                category_id=b.category_id,
                category_name=b.category_name,
                category_type=b.category_type,
                total_spent=b.total_spent,
                pct_of_total=b.pct_of_total,
                transaction_count=b.transaction_count,
            )
            for b in breakdown
        ],
    )


@router.get("/income-vs-expenses", response_model=IncomeVsExpensesResponse)
@limiter.limit("30/minute")
def income_vs_expenses(
    request: Request,
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Get monthly income vs expenses comparison."""
    data = get_income_vs_expenses(db, months)
    return IncomeVsExpensesResponse(
        months=months,
        data=[
            IncomeVsExpensesEntry(
                period_label=d.period_label,
                period_start=d.period_start,
                period_end=d.period_end,
                total_income=d.total_income,
                total_expenses=d.total_expenses,
                surplus=d.surplus,
            )
            for d in data
        ],
    )


@router.get("/category-trends", response_model=CategoryTrendsResponse)
@limiter.limit("30/minute")
def category_trends(
    request: Request,
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Get spending trend per category over multiple months."""
    trends = get_category_trends(db, months)
    return CategoryTrendsResponse(
        months=months,
        trends=[
            CategoryTrendEntry(
                category_id=t.category_id,
                category_name=t.category_name,
                monthly_amounts=t.monthly_amounts,
            )
            for t in trends
        ],
    )


@router.get("/merchants", response_model=MerchantAnalysisResponse)
@limiter.limit("30/minute")
def merchant_analysis(
    request: Request,
    period_start: date = Query(...),
    period_end: Optional[date] = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get spending analysis by merchant."""
    if not period_end:
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

    merchants = get_merchant_analysis(db, period_start, period_end, limit)
    return MerchantAnalysisResponse(
        period_start=period_start,
        period_end=period_end,
        merchants=[
            MerchantEntry(
                merchant=m.merchant,
                total_spent=m.total_spent,
                transaction_count=m.transaction_count,
                avg_amount=m.avg_amount,
                last_transaction_date=m.last_transaction_date,
                most_common_category=m.most_common_category,
            )
            for m in merchants
        ],
    )


@router.get("/savings-rate", response_model=SavingsRateResponse)
@limiter.limit("30/minute")
def savings_rate(
    request: Request,
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Get monthly savings rate trend."""
    data = get_savings_rate(db, months)
    return SavingsRateResponse(
        months=months,
        data=[SavingsRateEntry(**d) for d in data],
    )


@router.get("/health-score", response_model=HealthScoreResponse)
@limiter.limit("30/minute")
def health_score(request: Request, db: Session = Depends(get_db)):
    """Get composite financial health score (0-100) with breakdown."""
    score = calculate_health_score(db)
    return HealthScoreResponse(
        total_score=score.total_score,
        savings_rate_score=score.savings_rate_score,
        bills_on_time_score=score.bills_on_time_score,
        budget_adherence_score=score.budget_adherence_score,
        emergency_fund_score=score.emergency_fund_score,
        debt_to_income_score=score.debt_to_income_score,
        details=score.details,
    )


@router.get("/monthly-close/{month_date}", response_model=MonthlyCloseResponse)
@limiter.limit("30/minute")
def monthly_close(
    request: Request,
    month_date: date,
    db: Session = Depends(get_db),
):
    """Get end-of-month financial summary."""
    return MonthlyCloseResponse(**get_monthly_close(db, month_date))


@router.get("/year-review/{year}", response_model=YearReviewResponse)
@limiter.limit("30/minute")
def year_review(
    request: Request,
    year: int = Path(..., ge=2020, le=2100),
    db: Session = Depends(get_db),
):
    """Get annual financial summary."""
    return YearReviewResponse(**get_year_review(db, year))


@router.get("/export")
@limiter.limit("10/minute")
def export_data(
    request: Request,
    period_start: date = Query(...),
    period_end: Optional[date] = None,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
):
    """Export transactions as JSON or CSV."""
    if not period_end:
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

    rows = export_transactions(db, period_start, period_end)

    if format == "csv":
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        content = output.getvalue()
        return StreamingResponse(
            io.BytesIO(content.encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=transactions_{period_start}_{period_end}.csv"},
        )

    return {"period_start": period_start.isoformat(), "period_end": period_end.isoformat(), "transactions": rows}

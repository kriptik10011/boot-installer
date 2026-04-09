"""
Debt Management API router — track debts and payments.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.debt import DebtAccount, DebtPayment
from app.schemas.budget import (
    DebtAccountCreate, DebtAccountUpdate, DebtAccountResponse,
    DebtPaymentCreate, DebtPaymentResponse,
    PayoffPlanResponse, PayoffScheduleEntry,
    StrategyComparisonResponse, ExtraPaymentSimResponse, DebtSummaryResponse,
)
from app.services.debt_service import (
    calculate_payoff_plan, compare_strategies,
    simulate_extra_payment, get_debt_summary,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# --- Debt Accounts ---

@router.get("/accounts", response_model=List[DebtAccountResponse])
@limiter.limit("30/minute")
def list_debt_accounts(request: Request, db: Session = Depends(get_db)):
    """List all debt accounts."""
    accounts = db.query(DebtAccount).filter(DebtAccount.is_active == True).limit(1000).all()
    return [_account_to_response(a) for a in accounts]


@router.post("/accounts", response_model=DebtAccountResponse, status_code=201)
@limiter.limit("30/minute")
def create_debt_account(request: Request, data: DebtAccountCreate, db: Session = Depends(get_db)):
    """Create a new debt account."""
    account = DebtAccount(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return _account_to_response(account)


@router.get("/payoff-plan", response_model=PayoffPlanResponse)
@limiter.limit("30/minute")
def payoff_plan(
    request: Request,
    strategy: str = "avalanche",
    extra_monthly: float = 0.0,
    db: Session = Depends(get_db),
):
    """Get full payoff schedule with chosen strategy (snowball or avalanche)."""
    plan = calculate_payoff_plan(db, strategy, extra_monthly)
    return PayoffPlanResponse(
        strategy=plan.strategy,
        total_months=plan.total_months,
        total_interest=plan.total_interest,
        total_paid=plan.total_paid,
        debt_free_date=plan.debt_free_date,
        schedule=[
            PayoffScheduleEntry(
                month=e.month, debt_name=e.debt_name,
                payment=e.payment, principal=e.principal,
                interest=e.interest, balance_after=e.balance_after,
            )
            for e in plan.schedule
        ],
    )


@router.get("/compare-strategies", response_model=StrategyComparisonResponse)
@limiter.limit("30/minute")
def compare_debt_strategies(
    request: Request,
    extra_monthly: float = 0.0,
    db: Session = Depends(get_db),
):
    """Compare snowball vs avalanche payoff strategies."""
    result = compare_strategies(db, extra_monthly)
    def _plan_to_response(plan):
        return PayoffPlanResponse(
            strategy=plan.strategy,
            total_months=plan.total_months,
            total_interest=plan.total_interest,
            total_paid=plan.total_paid,
            debt_free_date=plan.debt_free_date,
            schedule=[
                PayoffScheduleEntry(
                    month=e.month, debt_name=e.debt_name,
                    payment=e.payment, principal=e.principal,
                    interest=e.interest, balance_after=e.balance_after,
                )
                for e in plan.schedule
            ],
        )
    return StrategyComparisonResponse(
        snowball=_plan_to_response(result["snowball"]),
        avalanche=_plan_to_response(result["avalanche"]),
        interest_savings=result["interest_savings"],
        time_difference_months=result["time_difference_months"],
    )


@router.get("/what-if", response_model=ExtraPaymentSimResponse)
@limiter.limit("30/minute")
def what_if_extra_payment(
    request: Request,
    extra: float = 100.0,
    strategy: str = "avalanche",
    db: Session = Depends(get_db),
):
    """Simulate adding extra monthly payment: how much time/interest saved?"""
    result = simulate_extra_payment(db, extra, strategy)
    def _plan_to_response(plan):
        return PayoffPlanResponse(
            strategy=plan.strategy,
            total_months=plan.total_months,
            total_interest=plan.total_interest,
            total_paid=plan.total_paid,
            debt_free_date=plan.debt_free_date,
            schedule=[
                PayoffScheduleEntry(
                    month=e.month, debt_name=e.debt_name,
                    payment=e.payment, principal=e.principal,
                    interest=e.interest, balance_after=e.balance_after,
                )
                for e in plan.schedule
            ],
        )
    return ExtraPaymentSimResponse(
        current_plan=_plan_to_response(result["current_plan"]),
        extra_plan=_plan_to_response(result["extra_plan"]),
        months_saved=result["months_saved"],
        interest_saved=result["interest_saved"],
        extra_monthly=result["extra_monthly"],
    )


@router.get("/accounts/{account_id}", response_model=DebtAccountResponse)
@limiter.limit("30/minute")
def get_debt_account(request: Request, account_id: int, db: Session = Depends(get_db)):
    """Get a single debt account."""
    account = db.query(DebtAccount).filter(DebtAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Debt account not found")
    return _account_to_response(account)


@router.put("/accounts/{account_id}", response_model=DebtAccountResponse)
@limiter.limit("30/minute")
def update_debt_account(
    request: Request, account_id: int, data: DebtAccountUpdate, db: Session = Depends(get_db)
):
    """Update a debt account."""
    account = db.query(DebtAccount).filter(DebtAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Debt account not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return _account_to_response(account)


@router.delete("/accounts/{account_id}", status_code=204)
@limiter.limit("30/minute")
def archive_debt_account(request: Request, account_id: int, db: Session = Depends(get_db)):
    """Archive a debt account (soft delete)."""
    account = db.query(DebtAccount).filter(DebtAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Debt account not found")
    account.is_active = False
    db.commit()


# --- Debt Payments ---

@router.post("/accounts/{account_id}/payment", response_model=DebtPaymentResponse, status_code=201)
@limiter.limit("30/minute")
def record_debt_payment(
    request: Request, account_id: int, data: DebtPaymentCreate, db: Session = Depends(get_db)
):
    """Record a payment toward a debt account."""
    account = db.query(DebtAccount).filter(DebtAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Debt account not found")

    payment = DebtPayment(debt_id=account_id, **data.model_dump())

    # Update account balance
    account.current_balance = max(0, account.current_balance - data.amount)
    if data.balance_after is not None:
        account.current_balance = data.balance_after

    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/accounts/{account_id}/payments", response_model=List[DebtPaymentResponse])
@limiter.limit("30/minute")
def list_debt_payments(request: Request, account_id: int, db: Session = Depends(get_db)):
    """List payment history for a debt account."""
    return db.query(DebtPayment).filter(
        DebtPayment.debt_id == account_id
    ).order_by(DebtPayment.date.desc()).limit(1000).all()


@router.get("/summary", response_model=DebtSummaryResponse)
@limiter.limit("30/minute")
def debt_summary(request: Request, db: Session = Depends(get_db)):
    """Get total debt summary: total balance, total minimums, etc."""
    accounts = db.query(DebtAccount).filter(DebtAccount.is_active == True).limit(1000).all()

    total_balance = sum(a.current_balance for a in accounts)
    total_original = sum(a.original_balance for a in accounts)
    total_minimums = sum(a.minimum_payment for a in accounts)
    total_interest_remaining = sum(a.total_interest_remaining for a in accounts if hasattr(a, "total_interest_remaining") and a.total_interest_remaining)

    # Calculate weighted average interest rate
    weighted_avg_interest = 0.0
    if total_balance > 0:
        total_interest = sum(a.interest_rate * a.current_balance for a in accounts if a.interest_rate)
        weighted_avg_interest = round(total_interest / total_balance, 2) if total_balance > 0 else 0.0

    return DebtSummaryResponse(
        total_debt=round(total_balance, 2),
        total_minimum_payments=round(total_minimums, 2),
        weighted_avg_interest=weighted_avg_interest,
        debt_count=len(accounts),
        projected_debt_free_date=None,
        total_interest_remaining=round(total_interest_remaining, 2),
    )


from app.utils.debt_formatters import account_to_response as _account_to_response

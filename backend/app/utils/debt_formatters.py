"""Shared debt formatting utilities — used by debt.py and net_worth.py routers."""

from app.models.debt import DebtAccount
from app.schemas.budget import DebtAccountResponse


def account_to_response(account: DebtAccount) -> DebtAccountResponse:
    """Convert DebtAccount model to response schema with computed fields."""
    return DebtAccountResponse(
        id=account.id,
        name=account.name,
        current_balance=account.current_balance,
        original_balance=account.original_balance,
        interest_rate=account.interest_rate,
        minimum_payment=account.minimum_payment,
        due_day_of_month=account.due_day_of_month,
        type=account.type,
        lender=account.lender,
        account_last_four=account.account_last_four,
        payoff_strategy=account.payoff_strategy,
        extra_payment_amount=account.extra_payment_amount,
        is_active=account.is_active,
        paid_off_pct=account.paid_off_pct,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )

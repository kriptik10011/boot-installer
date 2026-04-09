"""
Savings goal calculation service.

Handles: goal projections, emergency fund calculator,
monthly contribution recommendations, milestone detection.
All deterministic — no AI, no estimates.
"""

import math
from dataclasses import dataclass
from datetime import date
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.savings_goal import SavingsGoal
from app.models.transaction import Transaction
from app.models.budget import BudgetCategory


@dataclass
class GoalProjection:
    """Projected completion date and monthly contribution needed."""
    goal_id: int
    goal_name: str
    target_amount: float
    current_amount: float
    remaining: float
    monthly_contribution: float
    months_to_goal: Optional[int]  # None if no contribution set
    projected_completion: Optional[date]  # None if no contribution
    on_track: bool  # True if projected date <= target_date
    required_monthly: Optional[float]  # Monthly amount needed to hit target_date


@dataclass
class EmergencyFundStatus:
    """Emergency fund recommendation based on actual spending."""
    monthly_expenses: float
    three_month_target: float
    six_month_target: float
    current_emergency_fund: float
    months_covered: float
    status: str  # "none", "building", "partial", "adequate", "strong"
    shortfall_3mo: float
    shortfall_6mo: float


@dataclass
class GoalMilestone:
    """A milestone reached on a savings goal."""
    goal_id: int
    goal_name: str
    milestone_pct: int  # 25, 50, 75, 100
    amount_at_milestone: float
    target_amount: float


def calculate_goal_projections(
    db: Session,
) -> List[GoalProjection]:
    """
    Calculate projected completion for all active savings goals.

    Uses monthly_contribution to project months until target reached.
    If target_date is set, calculates required monthly to hit deadline.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()
    goals = db.query(SavingsGoal).filter(
        SavingsGoal.is_achieved == False,
    ).order_by(SavingsGoal.priority, SavingsGoal.id).all()

    results = []
    for goal in goals:
        remaining = max(0.0, goal.target_amount - goal.current_amount)

        # Project months to goal based on current contribution
        months_to_goal = None
        projected_completion = None
        if goal.monthly_contribution > 0 and remaining > 0:
            months_to_goal = max(1, math.ceil(remaining / goal.monthly_contribution))
            projected_completion = today + relativedelta(months=months_to_goal)
        elif remaining <= 0:
            months_to_goal = 0
            projected_completion = today

        # Calculate required monthly to hit target_date
        required_monthly = None
        on_track = True
        if goal.target_date and remaining > 0:
            months_until_target = (
                (goal.target_date.year - today.year) * 12
                + (goal.target_date.month - today.month)
            )
            if months_until_target > 0:
                required_monthly = round(remaining / months_until_target, 2)
            else:
                # Target date is in the past — goal is overdue
                required_monthly = remaining
                on_track = False

            # Check if on track (only if not already marked overdue)
            if on_track and projected_completion and goal.target_date:
                on_track = projected_completion <= goal.target_date
            elif goal.monthly_contribution <= 0 and months_until_target > 0:
                on_track = False

        results.append(GoalProjection(
            goal_id=goal.id,
            goal_name=goal.name,
            target_amount=goal.target_amount,
            current_amount=goal.current_amount,
            remaining=round(remaining, 2),
            monthly_contribution=goal.monthly_contribution,
            months_to_goal=months_to_goal,
            projected_completion=projected_completion,
            on_track=on_track,
            required_monthly=required_monthly,
        ))

    return results


def calculate_emergency_fund(
    db: Session,
    months_lookback: int = 3,
) -> EmergencyFundStatus:
    """
    Calculate emergency fund status based on actual spending data.

    Uses median of last N months of expenses (excluding savings/debt payments).
    Checks current emergency fund savings goal amount.
    """
    from dateutil.relativedelta import relativedelta

    today = date.today()

    # Calculate average monthly expenses from transaction history
    # Single query with GROUP BY month instead of per-month queries
    oldest_month_start = (today - relativedelta(months=months_lookback)).replace(day=1)
    month_rows = db.query(
        func.strftime('%Y-%m', Transaction.date).label('month'),
        func.sum(Transaction.amount).label('total'),
    ).filter(
        Transaction.date >= oldest_month_start,
        Transaction.date < today.replace(day=1),
        Transaction.is_income == False,
    ).group_by(
        func.strftime('%Y-%m', Transaction.date)
    ).all()

    monthly_totals = [float(row.total) for row in month_rows if row.total and float(row.total) > 0]

    # Use median for stability (or average if fewer than 3 months)
    if monthly_totals:
        monthly_totals.sort()
        mid = len(monthly_totals) // 2
        if len(monthly_totals) % 2 == 0 and len(monthly_totals) > 1:
            monthly_expenses = (monthly_totals[mid - 1] + monthly_totals[mid]) / 2
        else:
            monthly_expenses = monthly_totals[mid]
    else:
        # No transaction history — estimate from budget allocations (needs + wants)
        total_budget = db.query(
            func.coalesce(func.sum(BudgetCategory.budget_amount), 0.0)
        ).filter(
            BudgetCategory.is_active == True,
            BudgetCategory.type.in_(["need", "want"]),
        ).scalar() or 0.0
        monthly_expenses = total_budget
        # If also no budget categories, monthly_expenses stays 0.0
        # This is intentional — we can't guess a reasonable number

    three_month_target = round(monthly_expenses * 3, 2)
    six_month_target = round(monthly_expenses * 6, 2)

    # Find emergency fund savings goal
    emergency_goal = db.query(SavingsGoal).filter(
        SavingsGoal.category == "emergency_fund",
        SavingsGoal.is_achieved == False,
    ).first()

    current_fund = emergency_goal.current_amount if emergency_goal else 0.0

    # Calculate months covered
    months_covered = round(current_fund / monthly_expenses, 1) if monthly_expenses > 0 else 0.0

    # Determine status
    if current_fund <= 0:
        status = "none"
    elif months_covered < 1:
        status = "building"
    elif months_covered < 3:
        status = "partial"
    elif months_covered < 6:
        status = "adequate"
    else:
        status = "strong"

    return EmergencyFundStatus(
        monthly_expenses=round(monthly_expenses, 2),
        three_month_target=three_month_target,
        six_month_target=six_month_target,
        current_emergency_fund=round(current_fund, 2),
        months_covered=months_covered,
        status=status,
        shortfall_3mo=round(max(0, three_month_target - current_fund), 2),
        shortfall_6mo=round(max(0, six_month_target - current_fund), 2),
    )


def detect_milestones(
    db: Session,
) -> List[GoalMilestone]:
    """
    Detect which savings goals have reached 25/50/75/100% milestones.

    Returns milestones for all goals that have crossed a threshold.
    """
    goals = db.query(SavingsGoal).filter(
        SavingsGoal.target_amount > 0,
    ).all()

    milestones = []
    for goal in goals:
        pct = goal.progress_pct
        for threshold in [100, 75, 50, 25]:
            if pct >= threshold:
                milestones.append(GoalMilestone(
                    goal_id=goal.id,
                    goal_name=goal.name,
                    milestone_pct=threshold,
                    amount_at_milestone=goal.current_amount,
                    target_amount=goal.target_amount,
                ))
                break  # Only report highest milestone reached

    return milestones

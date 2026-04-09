"""
Savings Goals API router — track progress toward financial goals.
"""

from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.savings_goal import SavingsGoal
from app.schemas.budget import (
    SavingsGoalCreate, SavingsGoalUpdate, SavingsGoalResponse, ContributeRequest,
    GoalProjectionResponse, EmergencyFundResponse, GoalMilestoneResponse,
)
from app.services.savings_service import (
    calculate_goal_projections, calculate_emergency_fund, detect_milestones,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/goals", response_model=List[SavingsGoalResponse])
@limiter.limit("30/minute")
def list_savings_goals(request: Request, db: Session = Depends(get_db)):
    """List all savings goals."""
    goals = db.query(SavingsGoal).order_by(SavingsGoal.priority, SavingsGoal.id).limit(1000).all()
    return [_goal_to_response(g) for g in goals]


@router.post("/goals", response_model=SavingsGoalResponse, status_code=201)
@limiter.limit("30/minute")
def create_savings_goal(request: Request, data: SavingsGoalCreate, db: Session = Depends(get_db)):
    """Create a new savings goal."""
    goal = SavingsGoal(**data.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _goal_to_response(goal)


@router.get("/projections", response_model=List[GoalProjectionResponse])
@limiter.limit("30/minute")
def goal_projections(request: Request, db: Session = Depends(get_db)):
    """Get projected completion dates and required contributions for all active goals."""
    results = calculate_goal_projections(db)
    return [
        GoalProjectionResponse(
            goal_id=p.goal_id,
            goal_name=p.goal_name,
            target_amount=p.target_amount,
            current_amount=p.current_amount,
            remaining=p.remaining,
            monthly_contribution=p.monthly_contribution,
            months_to_goal=p.months_to_goal,
            projected_completion=p.projected_completion,
            on_track=p.on_track,
            required_monthly=p.required_monthly,
        )
        for p in results
    ]


@router.get("/emergency-fund", response_model=EmergencyFundResponse)
@limiter.limit("30/minute")
def emergency_fund_status(request: Request, db: Session = Depends(get_db)):
    """Calculate emergency fund status based on actual spending."""
    result = calculate_emergency_fund(db)
    return EmergencyFundResponse(
        monthly_expenses=result.monthly_expenses,
        three_month_target=result.three_month_target,
        six_month_target=result.six_month_target,
        current_emergency_fund=result.current_emergency_fund,
        months_covered=result.months_covered,
        status=result.status,
        shortfall_3mo=result.shortfall_3mo,
        shortfall_6mo=result.shortfall_6mo,
    )


@router.get("/milestones", response_model=List[GoalMilestoneResponse])
@limiter.limit("30/minute")
def savings_milestones(request: Request, db: Session = Depends(get_db)):
    """Get milestone achievements for all savings goals."""
    results = detect_milestones(db)
    return [
        GoalMilestoneResponse(
            goal_id=m.goal_id,
            goal_name=m.goal_name,
            milestone_pct=m.milestone_pct,
            amount_at_milestone=m.amount_at_milestone,
            target_amount=m.target_amount,
        )
        for m in results
    ]


@router.get("/goals/{goal_id}", response_model=SavingsGoalResponse)
@limiter.limit("30/minute")
def get_savings_goal(request: Request, goal_id: int, db: Session = Depends(get_db)):
    """Get a single savings goal."""
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    return _goal_to_response(goal)


@router.put("/goals/{goal_id}", response_model=SavingsGoalResponse)
@limiter.limit("30/minute")
def update_savings_goal(
    request: Request, goal_id: int, data: SavingsGoalUpdate, db: Session = Depends(get_db)
):
    """Update a savings goal."""
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)

    db.commit()
    db.refresh(goal)
    return _goal_to_response(goal)


@router.delete("/goals/{goal_id}", status_code=204)
@limiter.limit("30/minute")
def archive_savings_goal(request: Request, goal_id: int, db: Session = Depends(get_db)):
    """Archive a savings goal (preserve history)."""
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    db.delete(goal)
    db.commit()


@router.post("/goals/{goal_id}/contribute", response_model=SavingsGoalResponse)
@limiter.limit("30/minute")
def contribute_to_goal(
    request: Request, goal_id: int, data: ContributeRequest, db: Session = Depends(get_db)
):
    """Add a contribution to a savings goal."""
    goal = db.query(SavingsGoal).filter(SavingsGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")

    goal.current_amount += data.amount

    # Check if goal is now achieved
    if goal.current_amount >= goal.target_amount and not goal.is_achieved:
        goal.is_achieved = True
        goal.achieved_date = date.today()

    db.commit()
    db.refresh(goal)
    return _goal_to_response(goal)


def _goal_to_response(goal: SavingsGoal) -> SavingsGoalResponse:
    """Convert SavingsGoal model to response schema with computed fields."""
    return SavingsGoalResponse(
        id=goal.id,
        name=goal.name,
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        target_date=goal.target_date,
        priority=goal.priority,
        category=goal.category,
        monthly_contribution=goal.monthly_contribution,
        icon=goal.icon,
        color=goal.color,
        notes=goal.notes,
        is_achieved=goal.is_achieved,
        achieved_date=goal.achieved_date,
        progress_pct=goal.progress_pct,
        remaining=goal.remaining,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )

"""
Financial insight builders for the pattern detection engine.

Extracted from engine.py (Phase H4) to keep the orchestrator under 800 lines.
These functions build V2 financial insights: spending velocity, upcoming bills,
and savings goal pacing.
"""

import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

log = logging.getLogger("weekly_review")


def _build_evidence(
    observation_count=None, pattern_strength=None,
    last_observed=None, context=None,
) -> dict:
    """Build an evidence dict for insight Glass Box display."""
    evidence = {}
    if observation_count is not None:
        evidence["observation_count"] = observation_count
    if pattern_strength is not None:
        evidence["pattern_strength"] = round(pattern_strength, 2)
    if last_observed is not None:
        evidence["last_observed"] = last_observed
    if context is not None:
        evidence["context"] = context
    return evidence


def build_financial_insights(db: Session, today_iso: str) -> list[dict]:
    """Build V2 financial insights: spending velocity, upcoming bills, savings goals."""
    results = []
    try:
        from app.services.transaction_service import calculate_spending_velocity
        from app.models.transaction_recurrence import TransactionRecurrence
        from app.models.savings_goal import SavingsGoal

        # Spending velocity alerts (budget pacing per category)
        velocities = calculate_spending_velocity(db)
        for v in velocities:
            if v.velocity > 1.3 and v.spent_amount > 0:
                overspend_pct = int((v.velocity - 1) * 100)
                results.append({
                    "type": "spending_velocity_high",
                    "message": f"{v.category_name}: On pace to exceed budget by {overspend_pct}%",
                    "priority": 2,
                    "confidence": 0.85,
                    "evidence": _build_evidence(
                        observation_count=v.days_remaining,
                        pattern_strength=min(0.95, (v.velocity - 1) / 2),
                        last_observed=today_iso,
                        context=f"${v.spent_amount:,.2f} of ${v.budget_amount:,.2f} spent ({v.pct_budget_used:.0f}%) with {v.days_remaining} days left in period",
                    ),
                })
            elif v.velocity >= 0.95 and v.pct_budget_used >= 90 and v.days_remaining > 5:
                results.append({
                    "type": "budget_nearly_depleted",
                    "message": f"{v.category_name}: {v.pct_budget_used:.0f}% of budget used with {v.days_remaining} days remaining",
                    "priority": 2,
                    "confidence": 0.9,
                    "evidence": _build_evidence(
                        pattern_strength=0.9,
                        last_observed=today_iso,
                        context=f"${v.budget_amount - v.spent_amount:,.2f} remaining in {v.category_name}",
                    ),
                })

        # Upcoming bills (next 48 hours)
        two_days_out = date.today() + timedelta(days=2)
        upcoming_bills = db.query(TransactionRecurrence).filter(
            TransactionRecurrence.is_active == True,
            TransactionRecurrence.next_due_date != None,
            TransactionRecurrence.next_due_date <= two_days_out,
            TransactionRecurrence.next_due_date >= date.today(),
        ).all()

        for bill in upcoming_bills:
            days_until = (bill.next_due_date - date.today()).days
            priority = 1 if days_until == 0 else 2
            time_label = "due today" if days_until == 0 else f"due in {days_until} day{'s' if days_until > 1 else ''}"
            results.append({
                "type": "bill_due_soon",
                "message": f"{bill.description} (${bill.amount:,.2f}) — {time_label}",
                "priority": priority,
                "confidence": 1.0,
                "evidence": _build_evidence(
                    pattern_strength=1.0,
                    last_observed=today_iso,
                    context=f"Recurring {bill.frequency} payment of ${bill.amount:,.2f}",
                ),
            })

        # Savings goal pacing
        active_goals = db.query(SavingsGoal).filter(
            SavingsGoal.is_achieved == False,
            SavingsGoal.target_amount > 0,
        ).all()

        for goal in active_goals:
            pct = goal.current_amount / goal.target_amount * 100
            if goal.target_date:
                months_left = max(1, (goal.target_date.year - date.today().year) * 12 + goal.target_date.month - date.today().month)
                needed_monthly = (goal.target_amount - goal.current_amount) / months_left
                if needed_monthly > (goal.monthly_contribution or 0) * 1.5 and goal.monthly_contribution:
                    results.append({
                        "type": "savings_behind_pace",
                        "message": f"{goal.name}: Need ${needed_monthly:,.0f}/mo to reach goal by target date",
                        "priority": 3,
                        "confidence": 0.85,
                        "evidence": _build_evidence(
                            pattern_strength=0.85,
                            last_observed=today_iso,
                            context=f"${goal.current_amount:,.0f} of ${goal.target_amount:,.0f} saved ({pct:.0f}%). Current: ${goal.monthly_contribution:,.0f}/mo, needed: ${needed_monthly:,.0f}/mo",
                        ),
                    })
            for milestone in [25, 50, 75]:
                if pct >= milestone and pct < milestone + 5:
                    results.append({
                        "type": "savings_milestone",
                        "message": f"{goal.name}: {milestone}% of goal reached!",
                        "priority": 4,
                        "confidence": 1.0,
                        "evidence": _build_evidence(
                            pattern_strength=1.0,
                            last_observed=today_iso,
                            context=f"${goal.current_amount:,.0f} of ${goal.target_amount:,.0f} saved",
                        ),
                    })
                    break

    except Exception as e:
        log.debug("Finance insight generation skipped (tables may not exist): %s", e)
    return results

"""
Property Pattern Detection

Intelligence for rental property management:
- Vacancy duration trends (EWMA)
- Maintenance cost forecasting (EWMA)
- Rent collection health (on-time payment rate)
- Portfolio scoring (weighted composite)

Intelligence Principles Applied:
- EWMA (alpha=0.3) for trend smoothing
- Confidence threshold: 0.5 minimum for surfacing
- Glass Box: All insights include reasoning
- No-Shame: Neutral framing for underperformance
"""

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session
from app.services.pattern_detection.constants import EWMA_ALPHA

from app.models.property import (
    Property, PropertyUnit, Lease, RentPayment, PropertyExpense,
    MaintenanceRequest, Mortgage,
    LeaseStatus, RentStatus, MaintenanceStatus,
)


class PropertyPatternEngine:
    """Detects property management patterns from historical data."""

    def __init__(self, db: Session):
        self.db = db

    def get_vacancy_trend(self, property_id: int) -> dict:
        """
        Analyze vacancy duration trends for a property.

        Uses EWMA on vacancy durations to detect if units are
        getting harder or easier to fill.
        """
        prop = self.db.query(Property).filter(Property.id == property_id).first()
        if not prop:
            return {"error": "Property not found", "trend": "unknown", "confidence": 0.0}

        # Get all expired/terminated leases to measure gaps between tenants
        units = self.db.query(PropertyUnit).filter(
            PropertyUnit.property_id == property_id,
            PropertyUnit.is_active == True,  # noqa: E712
        ).all()

        vacancy_durations: list[int] = []

        # Batch-load all relevant leases for all units at once
        unit_ids = [u.id for u in units]
        all_leases = (
            self.db.query(Lease)
            .filter(
                Lease.unit_id.in_(unit_ids),
                Lease.status.in_([LeaseStatus.EXPIRED.value, LeaseStatus.TERMINATED.value]),
            )
            .order_by(Lease.unit_id, Lease.end_date)
            .all()
        ) if unit_ids else []

        # Group leases by unit_id
        leases_by_unit: dict[int, list] = {}
        for lease in all_leases:
            leases_by_unit.setdefault(lease.unit_id, []).append(lease)

        for unit in units:
            leases = leases_by_unit.get(unit.id, [])

            # Measure gap between consecutive leases
            for i in range(len(leases) - 1):
                end = leases[i].end_date
                next_start = leases[i + 1].start_date
                if end and next_start:
                    gap_days = (next_start - end).days
                    if gap_days > 0:
                        vacancy_durations.append(gap_days)

        if len(vacancy_durations) < 2:
            return {
                "property_id": property_id,
                "avg_vacancy_days": 0,
                "ewma_vacancy_days": 0,
                "trend": "insufficient_data",
                "sample_count": len(vacancy_durations),
                "confidence": 0.0,
                "current_vacancy_rate": prop.vacancy_rate,
            }

        # Calculate EWMA
        ewma = float(vacancy_durations[0])
        for val in vacancy_durations[1:]:
            ewma = EWMA_ALPHA * val + (1 - EWMA_ALPHA) * ewma

        avg = sum(vacancy_durations) / len(vacancy_durations)
        confidence = min(0.9, len(vacancy_durations) * 0.15)

        # Trend: compare recent EWMA to overall average
        if ewma > avg * 1.2:
            trend = "increasing"
        elif ewma < avg * 0.8:
            trend = "decreasing"
        else:
            trend = "stable"

        return {
            "property_id": property_id,
            "avg_vacancy_days": round(avg, 1),
            "ewma_vacancy_days": round(ewma, 1),
            "trend": trend,
            "sample_count": len(vacancy_durations),
            "confidence": round(confidence, 2),
            "current_vacancy_rate": prop.vacancy_rate,
        }

    def get_maintenance_forecast(self, property_id: int) -> dict:
        """
        Forecast maintenance costs using EWMA on monthly spend.

        Flags if current month pace exceeds trailing average by >20%.
        """
        today = date.today()
        year_ago = today - timedelta(days=365)

        # Get monthly maintenance costs for the last 12 months
        expenses = self.db.query(
            func.strftime('%Y-%m', PropertyExpense.date).label('month'),
            func.sum(PropertyExpense.amount).label('total'),
        ).filter(
            PropertyExpense.property_id == property_id,
            PropertyExpense.category == 'maintenance',
            PropertyExpense.date >= year_ago,
        ).group_by(
            func.strftime('%Y-%m', PropertyExpense.date)
        ).order_by(
            func.strftime('%Y-%m', PropertyExpense.date)
        ).all()

        if len(expenses) < 3:
            return {
                "property_id": property_id,
                "monthly_avg": 0,
                "ewma_monthly": 0,
                "trend": "insufficient_data",
                "sample_count": len(expenses),
                "confidence": 0.0,
            }

        monthly_costs = [float(e.total) for e in expenses]

        # EWMA
        ewma = monthly_costs[0]
        for val in monthly_costs[1:]:
            ewma = EWMA_ALPHA * val + (1 - EWMA_ALPHA) * ewma

        avg = sum(monthly_costs) / len(monthly_costs)
        confidence = min(0.9, len(monthly_costs) * 0.1)

        # Current month spend
        month_start = today.replace(day=1)
        current_month = self.db.query(
            func.sum(PropertyExpense.amount)
        ).filter(
            PropertyExpense.property_id == property_id,
            PropertyExpense.category == 'maintenance',
            PropertyExpense.date >= month_start,
        ).scalar() or 0

        # Project current month (linear extrapolation)
        day_of_month = today.day
        days_in_month = 30
        projected = (float(current_month) / max(day_of_month, 1)) * days_in_month

        if ewma > avg * 1.2:
            trend = "increasing"
        elif ewma < avg * 0.8:
            trend = "decreasing"
        else:
            trend = "stable"

        return {
            "property_id": property_id,
            "monthly_avg": round(avg, 2),
            "ewma_monthly": round(ewma, 2),
            "current_month_spend": round(float(current_month), 2),
            "projected_month_spend": round(projected, 2),
            "trend": trend,
            "sample_count": len(monthly_costs),
            "confidence": round(confidence, 2),
        }

    def get_collection_health(self, property_id: int) -> dict:
        """
        Calculate rent collection health (on-time payment rate).

        Looks at last 6 months of rent payments.
        """
        six_months_ago = date.today() - timedelta(days=180)

        payments = self.db.query(RentPayment).join(Lease).join(PropertyUnit).filter(
            PropertyUnit.property_id == property_id,
            RentPayment.paid_date >= six_months_ago,
        ).all()

        if len(payments) < 3:
            return {
                "property_id": property_id,
                "on_time_rate": 0,
                "late_rate": 0,
                "total_payments": len(payments),
                "confidence": 0.0,
            }

        on_time = sum(1 for p in payments if p.status == RentStatus.PAID.value)
        late = sum(1 for p in payments if p.status == RentStatus.LATE.value)
        partial = sum(1 for p in payments if p.status == RentStatus.PARTIAL.value)

        total = len(payments)
        on_time_rate = round((on_time / total) * 100, 1) if total > 0 else 0
        late_rate = round(((late + partial) / total) * 100, 1) if total > 0 else 0

        confidence = min(0.9, total * 0.05)

        return {
            "property_id": property_id,
            "on_time_rate": on_time_rate,
            "late_rate": late_rate,
            "total_payments": total,
            "on_time_count": on_time,
            "late_count": late,
            "partial_count": partial,
            "confidence": round(confidence, 2),
        }

    def get_portfolio_score(self) -> dict:
        """
        Calculate portfolio-wide intelligence score (0-100).

        Weighted composite:
        - Vacancy rate (25%): lower is better
        - Collection rate (25%): higher is better
        - NOI trend (25%): positive is better
        - Maintenance trend (25%): stable/decreasing is better
        """
        properties = self.db.query(Property).filter(
            Property.is_active == True  # noqa: E712
        ).all()

        if not properties:
            return {
                "score": 0,
                "components": {},
                "property_count": 0,
                "confidence": 0.0,
            }

        # Vacancy score (0-25): 0% vacancy = 25, 100% vacancy = 0
        avg_vacancy = sum(p.vacancy_rate for p in properties) / len(properties)
        vacancy_score = max(0, 25 * (1 - avg_vacancy / 100))

        # Collection score (0-25): 100% on-time = 25
        collection_scores = []
        for p in properties:
            health = self.get_collection_health(p.id)
            if health["total_payments"] >= 3:
                collection_scores.append(health["on_time_rate"])
        avg_collection = sum(collection_scores) / len(collection_scores) if collection_scores else 50
        collection_score = 25 * (avg_collection / 100)

        # Maintenance score (0-25): stable/decreasing = 25, increasing = 12.5
        maint_scores = []
        for p in properties:
            forecast = self.get_maintenance_forecast(p.id)
            if forecast["trend"] == "decreasing":
                maint_scores.append(25)
            elif forecast["trend"] == "stable":
                maint_scores.append(20)
            elif forecast["trend"] == "increasing":
                maint_scores.append(10)
            else:
                maint_scores.append(15)  # insufficient data
        maintenance_score = sum(maint_scores) / len(maint_scores) if maint_scores else 15

        # NOI score (0-25): positive NOI = 25, break-even = 12.5, negative = 0
        noi_scores = []
        for p in properties:
            annual_income = p.total_monthly_rent * 12
            year_ago = date.today() - timedelta(days=365)
            annual_expenses = self.db.query(
                func.sum(PropertyExpense.amount)
            ).filter(
                PropertyExpense.property_id == p.id,
                PropertyExpense.date >= year_ago,
            ).scalar() or 0
            noi = annual_income - float(annual_expenses)
            if annual_income > 0:
                noi_ratio = noi / annual_income
                noi_scores.append(max(0, min(25, 12.5 + noi_ratio * 25)))
            else:
                noi_scores.append(12.5)
        noi_score = sum(noi_scores) / len(noi_scores) if noi_scores else 12.5

        total_score = round(vacancy_score + collection_score + maintenance_score + noi_score)
        confidence = min(0.9, len(properties) * 0.2)

        return {
            "score": min(100, max(0, total_score)),
            "components": {
                "vacancy": round(vacancy_score, 1),
                "collection": round(collection_score, 1),
                "maintenance": round(maintenance_score, 1),
                "noi": round(noi_score, 1),
            },
            "property_count": len(properties),
            "avg_vacancy_rate": round(avg_vacancy, 1),
            "avg_collection_rate": round(avg_collection, 1),
            "confidence": round(confidence, 2),
        }

    def get_property_intelligence(self, property_id: int) -> dict:
        """
        Get all intelligence insights for a single property.

        Combines vacancy, maintenance, collection, and lease data
        into actionable insights with Glass Box reasoning.
        """
        vacancy = self.get_vacancy_trend(property_id)
        maintenance = self.get_maintenance_forecast(property_id)
        collection = self.get_collection_health(property_id)

        insights: list[dict] = []

        # Vacancy insights
        if vacancy.get("current_vacancy_rate", 0) > 0:
            insights.append({
                "type": "vacancy",
                "level": "warning",
                "message": f"Vacancy rate at {vacancy['current_vacancy_rate']}%",
                "reasoning": f"Vacant units cost money. Average time to fill: {vacancy.get('avg_vacancy_days', 'N/A')} days.",
            })

        if vacancy.get("trend") == "increasing" and vacancy.get("confidence", 0) >= 0.5:
            insights.append({
                "type": "vacancy_trend",
                "level": "alert",
                "message": "Vacancy durations trending up",
                "reasoning": f"EWMA vacancy duration: {vacancy['ewma_vacancy_days']} days vs {vacancy['avg_vacancy_days']} avg. Units taking longer to fill.",
            })

        # Maintenance insights
        if maintenance.get("trend") == "increasing" and maintenance.get("confidence", 0) >= 0.5:
            insights.append({
                "type": "maintenance_trend",
                "level": "warning",
                "message": "Maintenance costs trending up",
                "reasoning": f"EWMA monthly: ${maintenance['ewma_monthly']:.0f} vs ${maintenance['monthly_avg']:.0f} avg. Consider preventive maintenance.",
            })

        if maintenance.get("projected_month_spend", 0) > maintenance.get("ewma_monthly", 0) * 1.5:
            insights.append({
                "type": "maintenance_spike",
                "level": "alert",
                "message": "High maintenance spend this month",
                "reasoning": f"Projected: ${maintenance['projected_month_spend']:.0f} vs typical ${maintenance['ewma_monthly']:.0f}.",
            })

        # Collection insights
        if collection.get("late_rate", 0) > 15 and collection.get("confidence", 0) >= 0.3:
            insights.append({
                "type": "collection",
                "level": "warning",
                "message": f"Late payment rate at {collection['late_rate']}%",
                "reasoning": f"{collection.get('late_count', 0)} late + {collection.get('partial_count', 0)} partial out of {collection['total_payments']} payments in 6 months.",
            })

        # Lease expiry warnings
        thirty_days = date.today() + timedelta(days=30)
        sixty_days = date.today() + timedelta(days=60)
        expiring_leases = self.db.query(Lease).join(PropertyUnit).filter(
            PropertyUnit.property_id == property_id,
            Lease.status == LeaseStatus.ACTIVE.value,
            Lease.end_date <= sixty_days,
        ).all()

        for lease in expiring_leases:
            days_until = (lease.end_date - date.today()).days
            if days_until <= 30:
                insights.append({
                    "type": "lease_expiry",
                    "level": "alert",
                    "message": f"Lease expires in {days_until} days",
                    "reasoning": f"Unit {lease.unit_id} lease ends {lease.end_date}. Start renewal process.",
                })
            else:
                insights.append({
                    "type": "lease_expiry",
                    "level": "info",
                    "message": f"Lease expiring in {days_until} days",
                    "reasoning": f"Unit {lease.unit_id} lease ends {lease.end_date}. Plan ahead for renewal.",
                })

        return {
            "property_id": property_id,
            "vacancy": vacancy,
            "maintenance": maintenance,
            "collection": collection,
            "insights": insights,
        }

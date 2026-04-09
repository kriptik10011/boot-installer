"""
Property management models: Property, Unit, Tenant, Lease, RentPayment,
PropertyExpense, MaintenanceRequest, SecurityDeposit, Mortgage.

For small landlords (<5 properties). Manual entry, no bank API integration.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


# --- Enums ---

class PropertyType(str, enum.Enum):
    SINGLE_FAMILY = "single_family"
    MULTI_FAMILY = "multi_family"
    CONDO = "condo"
    TOWNHOUSE = "townhouse"
    COMMERCIAL = "commercial"
    OTHER = "other"


class LeaseStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"
    PENDING = "pending"


class RentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    LATE = "late"
    WAIVED = "waived"


class ExpenseCategory(str, enum.Enum):
    MAINTENANCE = "maintenance"
    REPAIR = "repair"
    INSURANCE = "insurance"
    TAX = "tax"
    UTILITY = "utility"
    MANAGEMENT = "management"
    LEGAL = "legal"
    MORTGAGE = "mortgage"
    HOA = "hoa"
    LANDSCAPING = "landscaping"
    CLEANING = "cleaning"
    ADVERTISING = "advertising"
    OTHER = "other"


class MaintenancePriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EMERGENCY = "emergency"


class MaintenanceStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# --- Models ---

class Property(Base):
    """Rental property with units, expenses, and mortgage."""

    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    address = Column(String(500), nullable=True)
    property_type = Column(String(30), nullable=False, default=PropertyType.SINGLE_FAMILY.value)
    purchase_price = Column(CentsType, nullable=True)
    purchase_date = Column(Date, nullable=True)
    current_value = Column(CentsType, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    units = relationship("PropertyUnit", back_populates="parent_property", order_by="PropertyUnit.unit_number")
    expenses = relationship("PropertyExpense", back_populates="parent_property", order_by="PropertyExpense.date.desc()")
    maintenance_requests = relationship("MaintenanceRequest", back_populates="parent_property")
    mortgages = relationship("Mortgage", back_populates="parent_property")

    @property
    def total_monthly_rent(self) -> float:
        """Sum of monthly rent across all units."""
        return sum(u.monthly_rent or 0 for u in self.units)

    @property
    def unit_count(self) -> int:
        return len(self.units)

    @property
    def occupied_unit_count(self) -> int:
        """Units with an active lease."""
        return sum(
            1 for u in self.units
            if any(l.status == LeaseStatus.ACTIVE.value for l in u.leases)
        )

    @property
    def vacancy_rate(self) -> float:
        """Percentage of units without active lease."""
        if not self.units:
            return 0.0
        vacant = self.unit_count - self.occupied_unit_count
        return round((vacant / self.unit_count) * 100.0, 1)


class PropertyUnit(Base):
    """Individual rentable unit within a property."""

    __tablename__ = "property_units"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False, index=True)
    unit_number = Column(String(50), nullable=False)
    bedrooms = Column(Integer, nullable=True)
    bathrooms = Column(Float, nullable=True)
    sqft = Column(Integer, nullable=True)
    monthly_rent = Column(CentsType, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    parent_property = relationship("Property", back_populates="units")
    leases = relationship("Lease", back_populates="unit", order_by="Lease.start_date.desc()")
    maintenance_requests = relationship("MaintenanceRequest", back_populates="unit")
    expenses = relationship("PropertyExpense", back_populates="unit")


class Tenant(Base):
    """Tenant contact record."""

    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True)
    phone = Column(String(30), nullable=True)
    move_in_date = Column(Date, nullable=True)
    move_out_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    leases = relationship("Lease", back_populates="tenant")
    maintenance_requests = relationship("MaintenanceRequest", back_populates="tenant")


class Lease(Base):
    """Lease agreement linking a tenant to a unit."""

    __tablename__ = "leases"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("property_units.id"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    monthly_rent = Column(CentsType, nullable=False)
    security_deposit = Column(CentsType, nullable=True, default=0.0)
    terms_notes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default=LeaseStatus.ACTIVE.value)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    unit = relationship("PropertyUnit", back_populates="leases")
    tenant = relationship("Tenant", back_populates="leases")
    rent_payments = relationship("RentPayment", back_populates="lease", order_by="RentPayment.period_month.desc()")
    security_deposits = relationship("SecurityDeposit", back_populates="lease")


class RentPayment(Base):
    """Monthly rent payment record for a lease."""

    __tablename__ = "rent_payments"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("leases.id"), nullable=False, index=True)
    period_month = Column(String(7), nullable=False)  # "YYYY-MM"
    amount_due = Column(CentsType, nullable=False)
    amount_paid = Column(CentsType, nullable=False, default=0.0)
    paid_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default=RentStatus.PENDING.value)
    late_fee = Column(CentsType, nullable=False, default=0.0)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    lease = relationship("Lease", back_populates="rent_payments")

    @property
    def balance_due(self) -> float:
        return max(0.0, self.amount_due + self.late_fee - self.amount_paid)


class PropertyExpense(Base):
    """Expense record for a property (opex or capex)."""

    __tablename__ = "property_expenses"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("property_units.id"), nullable=True, index=True)
    category = Column(String(30), nullable=False, default=ExpenseCategory.OTHER.value)
    amount = Column(CentsType, nullable=False)
    date = Column(Date, nullable=False, index=True)
    vendor = Column(String(200), nullable=True)
    description = Column(String(500), nullable=True)
    is_capex = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    parent_property = relationship("Property", back_populates="expenses")
    unit = relationship("PropertyUnit", back_populates="expenses")


class MaintenanceRequest(Base):
    """Maintenance/repair request for a unit."""

    __tablename__ = "maintenance_requests"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("property_units.id"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    description = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default=MaintenancePriority.MEDIUM.value)
    status = Column(String(20), nullable=False, default=MaintenanceStatus.OPEN.value)
    created_date = Column(Date, nullable=False)
    completed_date = Column(Date, nullable=True)
    vendor_name = Column(String(200), nullable=True)
    cost = Column(CentsType, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    parent_property = relationship("Property", back_populates="maintenance_requests")
    unit = relationship("PropertyUnit", back_populates="maintenance_requests")
    tenant = relationship("Tenant", back_populates="maintenance_requests")


class SecurityDeposit(Base):
    """Security deposit tracking for a lease."""

    __tablename__ = "security_deposits"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("leases.id"), nullable=False, index=True)
    amount = Column(CentsType, nullable=False)
    date_received = Column(Date, nullable=False)
    interest_rate = Column(Float, nullable=False, default=0.0)
    deductions_json = Column(Text, nullable=True)  # JSON string for deduction items
    refund_amount = Column(CentsType, nullable=True)
    refund_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    lease = relationship("Lease", back_populates="security_deposits")


class Mortgage(Base):
    """Mortgage/loan on a property."""

    __tablename__ = "mortgages"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False, index=True)
    lender = Column(String(200), nullable=True)
    original_amount = Column(CentsType, nullable=False)
    current_balance = Column(CentsType, nullable=False)
    interest_rate = Column(Float, nullable=False)  # APR as percentage
    monthly_payment = Column(CentsType, nullable=False)
    start_date = Column(Date, nullable=True)
    term_years = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    parent_property = relationship("Property", back_populates="mortgages")

    @property
    def ltv_ratio(self) -> float:
        """Loan-to-value ratio as percentage."""
        prop = self.parent_property
        if prop and prop.current_value and prop.current_value > 0:
            return round((self.current_balance / prop.current_value) * 100.0, 1)
        return 0.0

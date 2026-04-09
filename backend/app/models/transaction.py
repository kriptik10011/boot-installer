"""
Transaction model — core financial event.

Every dollar in and out is tracked as a Transaction.
Links to BudgetCategory for envelope budgeting.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.cents_type import CentsType


class Transaction(Base):
    """
    Financial transaction — an individual income or expense event.

    Deterministic: every dollar traceable.
    """

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(CentsType, nullable=False)
    description = Column(String(300), nullable=False)
    merchant = Column(String(200), nullable=True)
    category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=True, index=True)
    payment_method = Column(String(100), nullable=True)
    is_income = Column(Boolean, nullable=False, default=False)
    income_source_id = Column(Integer, ForeignKey("income_sources.id"), nullable=True)
    is_recurring = Column(Boolean, nullable=False, default=False)
    recurrence_id = Column(Integer, ForeignKey("transaction_recurrences.id"), nullable=True)
    notes = Column(String(1000), nullable=True)
    receipt_note = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("BudgetCategory", back_populates="transactions")
    income_source = relationship("IncomeSource")
    recurrence = relationship("TransactionRecurrence")

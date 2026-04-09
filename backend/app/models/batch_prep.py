"""
Batch Meal Prep models — "Prep Sunday, eat all week."
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Date, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class BatchPrepSession(Base):
    """A batch meal prep session linking multiple meals."""

    __tablename__ = "batch_prep_sessions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    prep_date = Column(Date, nullable=False, index=True)
    prep_start_time = Column(String(5), nullable=True)  # "09:00"
    estimated_duration_minutes = Column(Integer, nullable=True)
    actual_duration_minutes = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    tasks = relationship("BatchPrepTask", back_populates="session", cascade="all, delete-orphan")
    meal_links = relationship("BatchPrepMeal", back_populates="session", cascade="all, delete-orphan")


class BatchPrepTask(Base):
    """Individual prep task within a batch session."""

    __tablename__ = "batch_prep_tasks"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("batch_prep_sessions.id"), nullable=False)
    task_name = Column(String(200), nullable=False)
    is_completed = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    estimated_minutes = Column(Integer, nullable=True)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    session = relationship("BatchPrepSession", back_populates="tasks")


class BatchPrepMeal(Base):
    """Links a prep session to a meal plan entry (many-to-many)."""

    __tablename__ = "batch_prep_meals"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("batch_prep_sessions.id"), nullable=False)
    meal_id = Column(Integer, ForeignKey("meal_plan_entries.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    session = relationship("BatchPrepSession", back_populates="meal_links")

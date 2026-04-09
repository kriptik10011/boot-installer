"""
Intelligence Model Persistence

Stores Bayesian models that power the intelligence layer.
Allows models to survive browser localStorage clears.

Model persistence strategy:
- Backend persists models to SQLite
- Frontend syncs with backend on load
- Falls back to localStorage if backend unavailable
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from app.database import Base


class IntelligenceModel(Base):
    """
    Persisted Bayesian model for intelligence features.

    Models stored:
    - spending: Weekly spending patterns (mean, variance from EWMA)
    - cooking_time: Recipe cooking time estimates

    Schema is generic to support various model types.
    """
    __tablename__ = "intelligence_models"

    id = Column(Integer, primary_key=True, index=True)

    # Model identification
    model_type = Column(String(50), nullable=False, unique=True, index=True)
    """Type of model (e.g., 'spending', 'cooking_time')"""

    # Bayesian model parameters
    mean = Column(Float, nullable=False, default=0.0)
    """Model mean/average value"""

    variance = Column(Float, nullable=False, default=0.0)
    """Model variance (uncertainty)"""

    count = Column(Integer, nullable=False, default=0)
    """Number of observations used to train this model"""

    # Flexible extra data for model-specific parameters
    extra_data = Column(SQLiteJSON, nullable=True)
    """Additional model-specific data (e.g., alpha for EWMA)"""

    # Timestamps
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "model_type": self.model_type,
            "mean": self.mean,
            "variance": self.variance,
            "count": self.count,
            "extra_data": self.extra_data,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

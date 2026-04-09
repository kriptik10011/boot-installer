"""
Asset models: Asset and AssetHistory.

For net worth tracking. Tracks cash, savings, investments, real estate, vehicles.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import enum

from app.database import Base
from app.utils.cents_type import CentsType


class AssetType(str, enum.Enum):
    """Types of assets for net worth tracking."""
    CASH = "cash"
    CHECKING = "checking"
    SAVINGS = "savings"
    INVESTMENT = "investment"
    REAL_ESTATE = "real_estate"
    VEHICLE = "vehicle"
    OTHER = "other"


class Asset(Base):
    """
    Asset for net worth tracking.

    Net worth = sum(Asset.current_value) - sum(DebtAccount.current_balance)
    """

    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    current_value = Column(CentsType, nullable=False, default=0.0)
    type = Column(String(30), nullable=False, default=AssetType.OTHER.value)
    institution = Column(String(200), nullable=True)
    account_last_four = Column(String(4), nullable=True)
    is_liquid = Column(Boolean, nullable=False, default=True)
    notes = Column(String(500), nullable=True)
    last_updated = Column(Date, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    history = relationship("AssetHistory", back_populates="asset", order_by="AssetHistory.date.desc()",
                           cascade="all, delete-orphan")


class AssetHistory(Base):
    """
    Point-in-time asset value snapshot.

    Used for net worth trend tracking over time.
    """

    __tablename__ = "asset_history"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    value = Column(CentsType, nullable=False)
    change_amount = Column(CentsType, nullable=True)
    change_note = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    asset = relationship("Asset", back_populates="history")

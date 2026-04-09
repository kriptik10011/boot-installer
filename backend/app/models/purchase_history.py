"""
Purchase History Model

Tracks what package sizes users buy for each ingredient.
Learns preferences over time to pre-fill PackageSizeModal.

Example:
- User buys "32oz bottle" of olive oil 3 times
  → PackageSizeModal defaults to "32oz bottle" next time
- User buys "5lb bag" of flour at $4.99 from Costco
  → System learns preferred package size AND store

V2: Unified Food System
"""

from datetime import datetime, date, timezone
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.cents_type import CentsType


class PurchaseHistory(Base):
    """
    Records each purchase of an ingredient to learn user preferences.

    Primary use: default package size selection in PackageSizeModal.
    Secondary use: price tracking, store preferences, purchase frequency.
    """
    __tablename__ = "purchase_history"

    id = Column(Integer, primary_key=True, index=True)

    # Link to master ingredient
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False, index=True)

    # Package details (what they bought)
    package_label = Column(String(100), nullable=False)  # "32oz bottle"
    package_size = Column(Float, nullable=False)          # 32.0
    package_unit = Column(String(50), nullable=False)     # "oz"
    package_type = Column(String(50), nullable=True)      # "bottle"

    # Optional purchase context
    store = Column(String(200), nullable=True)
    price = Column(CentsType, nullable=True)
    purchase_date = Column(Date, nullable=False, default=lambda: date.today())

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    ingredient = relationship("Ingredient", backref="purchase_history")

    def __repr__(self):
        return (
            f"<PurchaseHistory("
            f"ingredient_id={self.ingredient_id}, "
            f"label='{self.package_label}', "
            f"date={self.purchase_date})>"
        )

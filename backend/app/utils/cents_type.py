"""SQLAlchemy TypeDecorator for integer-cents monetary storage.

Stores money as integer cents in the database but presents as float
dollars to Python code. This eliminates floating-point precision errors
for monetary calculations while keeping the service layer unchanged.

Usage in models:
    from app.utils.cents_type import CentsType
    amount = Column(CentsType, nullable=False, default=0)

Python sees: 19.99 (float dollars)
DB stores:  1999  (integer cents)
"""

from sqlalchemy import Integer
from sqlalchemy.types import TypeDecorator


class CentsType(TypeDecorator):
    """Store monetary values as integer cents, expose as float dollars."""

    impl = Integer
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Python → DB: dollars to cents."""
        if value is None:
            return None
        return int(round(value * 100))

    def process_result_value(self, value, dialect):
        """DB → Python: cents to dollars."""
        if value is None:
            return None
        return value / 100.0

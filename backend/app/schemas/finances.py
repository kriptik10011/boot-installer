"""
Finances Schemas

Pydantic models for financial items and import operations.

Note: ImportConfirmRequest renamed to FinanceImportConfirmRequest
to avoid naming collision with recipe import's ImportConfirmRequest.
"""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field


class FinancialItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., ge=0, le=999999999.99)
    due_date: date
    type: str = Field("bill", max_length=50)
    category_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=5000)
    recurrence_rule_id: Optional[int] = None


class FinancialItemCreate(FinancialItemBase):
    pass


class FinancialItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, ge=0, le=999999999.99)
    due_date: Optional[date] = None
    type: Optional[str] = Field(None, max_length=50)
    category_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=5000)
    recurrence_rule_id: Optional[int] = None
    # is_paid is intentionally excluded — use the dedicated /mark-paid endpoint
    # to ensure the corresponding Transaction row is created atomically.


class FinancialItemResponse(FinancialItemBase):
    id: int
    is_paid: bool
    paid_date: Optional[date]
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def days_until_due(self) -> int:
        """Calendar days until due. Negative = overdue. Matches recurring endpoint formula."""
        return (self.due_date - date.today()).days

    @computed_field
    @property
    def is_overdue(self) -> bool:
        """True if past due and not paid. Recurring endpoint omits paid check (no is_paid field)."""
        return self.due_date < date.today() and not self.is_paid

    model_config = ConfigDict(from_attributes=True)


class FinancialItemOccurrenceResponse(FinancialItemResponse):
    """Financial item response with occurrence metadata for recurring bills."""
    is_occurrence: bool = False  # True if this is a virtual occurrence
    master_id: Optional[int] = None  # ID of the master bill (if is_occurrence=True)
    occurrence_date: Optional[date] = None  # The date of this specific occurrence


class ImportConfirmItem(BaseModel):
    """A single item to confirm for import."""
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., ge=0, le=999999999.99)
    due_date: date
    type: str = Field(default='bill', max_length=50)
    is_recurring: bool = False
    frequency: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=5000)


class FinanceImportConfirmRequest(BaseModel):
    """Request to confirm imported items. Renamed from ImportConfirmRequest to avoid collision with recipes."""
    items: List[ImportConfirmItem] = Field(..., max_length=1000)


class ImportConfirmResponse(BaseModel):
    """Response after confirming import."""
    imported_count: int
    failed_count: int
    items: List[FinancialItemResponse]


class ImportParseErrorItem(BaseModel):
    """A parsing error for a specific row."""
    row: int
    column: str
    message: str


class ImportExtractedItem(BaseModel):
    """An extracted financial item from import."""
    name: str
    amount: Optional[float] = None
    due_date: Optional[str] = None
    type: str = "bill"
    is_recurring: bool = False
    frequency: Optional[str] = None
    notes: Optional[str] = None
    source_row: int = 0
    confidence: float = 1.0
    validation_errors: List[str] = Field(default_factory=list)
    is_valid: bool = True


class ImportUploadResponse(BaseModel):
    """Response for file upload preview."""
    items: List[ImportExtractedItem] = Field(default_factory=list)
    detected_columns: dict = Field(default_factory=dict)
    unmapped_columns: List[str] = Field(default_factory=list)
    parse_errors: List[ImportParseErrorItem] = Field(default_factory=list)
    total_rows: int = 0
    valid_rows: int = 0
    error_rows: int = 0

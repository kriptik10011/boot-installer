"""
Financial Importer Service

Parses CSV and Excel files to import financial items (bills, income).
Supports column auto-detection and provides AI fallback for malformed data.

Financial data import from CSV/Excel.
"""

import csv
import io
import logging
import re
from datetime import datetime, date
from typing import List, Dict, Optional, Any
from decimal import Decimal, InvalidOperation

log = logging.getLogger("weekly_review")


# Common column name mappings
COLUMN_MAPPINGS = {
    # Name/Description
    'name': ['name', 'description', 'item', 'payee', 'vendor', 'merchant', 'title', 'bill', 'what'],
    # Amount
    'amount': ['amount', 'price', 'cost', 'value', 'total', 'sum', 'payment', 'charge'],
    # Due Date
    'due_date': ['due_date', 'due', 'date', 'when', 'payment_date', 'due_on', 'deadline'],
    # Type (bill/income)
    'type': ['type', 'category', 'kind', 'classification'],
    # Recurring
    'is_recurring': ['recurring', 'is_recurring', 'repeat', 'subscription', 'monthly', 'yearly'],
    # Frequency
    'frequency': ['frequency', 'recurrence', 'interval', 'period', 'how_often'],
    # Notes
    'notes': ['notes', 'memo', 'comment', 'description', 'details'],
}


class ParseError:
    """Represents a parsing error for a specific row."""
    def __init__(self, row: int, column: str, message: str):
        self.row = row
        self.column = column
        self.message = message

    def to_dict(self) -> dict:
        return {
            'row': self.row,
            'column': self.column,
            'message': self.message,
        }


class ExtractedFinancialItem:
    """A financial item extracted from import file."""
    def __init__(
        self,
        name: str,
        amount: Optional[float],
        due_date: Optional[date],
        item_type: str = 'bill',
        is_recurring: bool = False,
        frequency: Optional[str] = None,
        notes: Optional[str] = None,
        source_row: int = 0,
        confidence: float = 1.0,
    ):
        self.name = name
        self.amount = amount
        self.due_date = due_date
        self.item_type = item_type
        self.is_recurring = is_recurring
        self.frequency = frequency
        self.notes = notes
        self.source_row = source_row
        self.confidence = confidence
        self.validation_errors: List[str] = []

    def validate(self) -> bool:
        """Validate the item and populate validation_errors."""
        self.validation_errors = []

        if not self.name or not self.name.strip():
            self.validation_errors.append('Name is required')

        if self.amount is None:
            self.validation_errors.append('Amount is required')
        elif self.amount < 0:
            self.validation_errors.append('Amount must be positive')

        if self.due_date is None:
            self.validation_errors.append('Due date is required')

        return len(self.validation_errors) == 0

    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'amount': self.amount,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'type': self.item_type,
            'is_recurring': self.is_recurring,
            'frequency': self.frequency,
            'notes': self.notes,
            'source_row': self.source_row,
            'confidence': self.confidence,
            'validation_errors': self.validation_errors,
            'is_valid': len(self.validation_errors) == 0,
        }


class ParseResult:
    """Result of parsing an import file."""
    def __init__(self):
        self.items: List[ExtractedFinancialItem] = []
        self.detected_columns: Dict[str, str] = {}  # field -> column_name
        self.unmapped_columns: List[str] = []
        self.parse_errors: List[ParseError] = []
        self.total_rows: int = 0

    @property
    def valid_rows(self) -> int:
        return sum(1 for item in self.items if item.validate())

    @property
    def error_rows(self) -> int:
        return sum(1 for item in self.items if not item.validate())

    def to_dict(self) -> dict:
        return {
            'items': [item.to_dict() for item in self.items],
            'detected_columns': self.detected_columns,
            'unmapped_columns': self.unmapped_columns,
            'parse_errors': [e.to_dict() for e in self.parse_errors],
            'total_rows': self.total_rows,
            'valid_rows': self.valid_rows,
            'error_rows': self.error_rows,
        }


class FinancialImporter:
    """Service for importing financial data from CSV/Excel files."""

    def parse_csv(self, content: str) -> ParseResult:
        """Parse CSV content into financial items."""
        result = ParseResult()

        try:
            # Use StringIO to read CSV
            reader = csv.DictReader(io.StringIO(content))

            if not reader.fieldnames:
                result.parse_errors.append(ParseError(0, '', 'No headers found in CSV'))
                return result

            # Detect column mappings
            result.detected_columns = self._detect_columns(list(reader.fieldnames))
            result.unmapped_columns = [
                col for col in reader.fieldnames
                if col not in result.detected_columns.values()
            ]

            # Parse rows
            for row_num, row in enumerate(reader, start=2):  # Start at 2 (1 = header)
                result.total_rows += 1
                item = self._parse_row(row, result.detected_columns, row_num)
                result.items.append(item)

        except csv.Error as e:
            log.error("CSV parsing error: %s", e)
            result.parse_errors.append(ParseError(0, '', 'CSV format error — check file encoding and structure'))

        return result

    def parse_excel(self, content: bytes) -> ParseResult:
        """Parse Excel content into financial items."""
        result = ParseResult()

        try:
            import openpyxl
            from io import BytesIO

            workbook = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
            sheet = workbook.active

            if sheet is None:
                result.parse_errors.append(ParseError(0, '', 'No active sheet found'))
                return result

            rows = list(sheet.iter_rows(values_only=True))
            if not rows:
                result.parse_errors.append(ParseError(0, '', 'Empty spreadsheet'))
                return result

            # First row is headers
            headers = [str(cell) if cell else '' for cell in rows[0]]
            result.detected_columns = self._detect_columns(headers)
            result.unmapped_columns = [
                col for col in headers
                if col and col not in result.detected_columns.values()
            ]

            # Parse data rows
            for row_num, row in enumerate(rows[1:], start=2):
                result.total_rows += 1
                row_dict = {headers[i]: row[i] for i in range(len(headers)) if i < len(row)}
                item = self._parse_row(row_dict, result.detected_columns, row_num)
                result.items.append(item)

        except ImportError:
            result.parse_errors.append(ParseError(0, '', 'openpyxl not installed for Excel support'))
        except Exception as e:
            log.error("Excel parsing error: %s", e)
            result.parse_errors.append(ParseError(0, '', 'Excel format error — check file format and structure'))

        return result

    def _detect_columns(self, headers: List[str]) -> Dict[str, str]:
        """Auto-detect column mappings based on header names."""
        detected: Dict[str, str] = {}
        headers_lower = {h.lower().strip(): h for h in headers if h}

        for field, aliases in COLUMN_MAPPINGS.items():
            for alias in aliases:
                if alias in headers_lower:
                    detected[field] = headers_lower[alias]
                    break

        return detected

    def _parse_row(self, row: Dict[str, Any], columns: Dict[str, str], row_num: int) -> ExtractedFinancialItem:
        """Parse a single row into an ExtractedFinancialItem."""
        def get_value(field: str) -> Any:
            col_name = columns.get(field)
            if col_name and col_name in row:
                return row[col_name]
            return None

        # Parse name
        name = str(get_value('name') or '').strip()

        # Parse amount
        amount = self._parse_amount(get_value('amount'))

        # Parse due date
        due_date = self._parse_date(get_value('due_date'))

        # Parse type
        raw_type = str(get_value('type') or '').lower().strip()
        item_type = 'income' if raw_type in ['income', 'payment', 'salary', 'revenue'] else 'bill'

        # Parse recurring
        raw_recurring = get_value('is_recurring')
        is_recurring = self._parse_boolean(raw_recurring)

        # Parse frequency
        frequency = str(get_value('frequency') or '').strip() or None
        # Auto-detect frequency from name
        if not frequency and name:
            frequency = self._detect_frequency(name)
            if frequency:
                is_recurring = True

        # Parse notes
        notes = str(get_value('notes') or '').strip() or None

        # Calculate confidence
        confidence = 1.0
        if not name:
            confidence -= 0.3
        if amount is None:
            confidence -= 0.3
        if due_date is None:
            confidence -= 0.2

        item = ExtractedFinancialItem(
            name=name,
            amount=amount,
            due_date=due_date,
            item_type=item_type,
            is_recurring=is_recurring,
            frequency=frequency,
            notes=notes,
            source_row=row_num,
            confidence=max(0, confidence),
        )

        item.validate()
        return item

    def _parse_amount(self, value: Any) -> Optional[float]:
        """Parse amount from various formats."""
        if value is None:
            return None

        if isinstance(value, (int, float)):
            return abs(float(value))

        # Clean string
        s = str(value).strip()
        if not s:
            return None

        # Remove currency symbols and thousands separators
        s = re.sub(r'[$€£¥₹,\s]', '', s)

        # Handle parentheses for negative (accounting format)
        if s.startswith('(') and s.endswith(')'):
            s = s[1:-1]

        # Handle negative sign
        s = s.lstrip('-')

        try:
            return abs(float(Decimal(s)))
        except (InvalidOperation, ValueError):
            return None

    def _parse_date(self, value: Any) -> Optional[date]:
        """Parse date from various formats."""
        if value is None:
            return None

        if isinstance(value, date):
            return value

        if isinstance(value, datetime):
            return value.date()

        s = str(value).strip()
        if not s:
            return None

        # Try common date formats
        formats = [
            '%Y-%m-%d',      # 2026-02-15
            '%m/%d/%Y',      # 02/15/2026
            '%d/%m/%Y',      # 15/02/2026
            '%m-%d-%Y',      # 02-15-2026
            '%d-%m-%Y',      # 15-02-2026
            '%Y/%m/%d',      # 2026/02/15
            '%b %d, %Y',     # Feb 15, 2026
            '%B %d, %Y',     # February 15, 2026
            '%d %b %Y',      # 15 Feb 2026
            '%d %B %Y',      # 15 February 2026
        ]

        for fmt in formats:
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue

        return None

    def _parse_boolean(self, value: Any) -> bool:
        """Parse boolean from various formats."""
        if value is None:
            return False

        if isinstance(value, bool):
            return value

        s = str(value).lower().strip()
        return s in ['true', 'yes', 'y', '1', 'x', 'recurring', 'monthly', 'weekly', 'yearly']

    def _detect_frequency(self, name: str) -> Optional[str]:
        """Detect recurrence frequency from item name."""
        name_lower = name.lower()

        if any(word in name_lower for word in ['monthly', 'month', '/mo']):
            return 'monthly'
        if any(word in name_lower for word in ['weekly', 'week', '/wk']):
            return 'weekly'
        if any(word in name_lower for word in ['yearly', 'annual', 'year', '/yr']):
            return 'yearly'
        if 'subscription' in name_lower:
            return 'monthly'  # Default subscriptions to monthly

        return None

    def get_sample_csv(self) -> str:
        """Return a sample CSV template."""
        return """name,amount,due_date,type,recurring,frequency,notes
Electric Bill,135.00,2026-02-15,bill,yes,monthly,Utility company
Internet,89.99,2026-02-01,bill,yes,monthly,Fiber connection
Rent,1500.00,2026-02-01,bill,yes,monthly,
Salary,5000.00,2026-02-15,income,yes,monthly,Direct deposit
Car Insurance,450.00,2026-03-01,bill,no,,6-month policy
"""

    def get_ai_prompt(self, raw_data: str) -> str:
        """Generate an AI extraction prompt for malformed data."""
        return f'''I need to extract financial data from the following spreadsheet and convert it to this JSON format:

Expected Format:
{{
  "items": [
    {{
      "name": "Item description",
      "amount": 99.99,
      "due_date": "2026-02-15",
      "type": "bill",
      "is_recurring": true,
      "frequency": "monthly"
    }}
  ]
}}

Rules:
- "amount" must be a positive number (remove $ signs, commas)
- "due_date" must be YYYY-MM-DD format
- "type" is either "bill" or "income"
- "is_recurring" is true for bills that repeat
- "frequency" is only needed if is_recurring is true (options: weekly, monthly, yearly)

Here's my data:
---
{raw_data[:3000]}
---

Please convert this to the JSON format above.'''

"""
Finances API endpoints.
"""

import logging
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session, joinedload
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import FinancialItem
from app.models.financial import FinancialItemType
from app.models.recurrence import RecurrenceRule, RecurrenceFrequency, RecurrenceEndType
from app.models.transaction import Transaction
from app.services.recurrence_expander import expand_recurrence
from app.schemas.finances import (
    FinancialItemCreate,
    FinancialItemUpdate,
    FinancialItemResponse,
    FinancialItemOccurrenceResponse,
    FinanceImportConfirmRequest,
    ImportConfirmResponse,
    ImportUploadResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=List[FinancialItemResponse])
@limiter.limit("100/minute")
def list_financial_items(
    request: Request,
    type: Optional[str] = None,
    is_paid: Optional[bool] = None,
    category_id: Optional[int] = None,
    status: Optional[str] = Query(None, pattern="^(overdue|upcoming)$"),
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db)
):
    """List all financial items with optional filters.

    status=overdue: unpaid items past due date
    status=upcoming: unpaid items due within `days` days
    """
    query = db.query(FinancialItem)
    if type:
        query = query.filter(FinancialItem.type == type)
    if is_paid is not None:
        query = query.filter(FinancialItem.is_paid == is_paid)
    if category_id:
        query = query.filter(FinancialItem.category_id == category_id)
    if status == "overdue":
        query = query.filter(
            FinancialItem.is_paid == False,
            FinancialItem.due_date < date.today(),
        )
    elif status == "upcoming":
        today = date.today()
        query = query.filter(
            FinancialItem.is_paid == False,
            FinancialItem.due_date >= today,
            FinancialItem.due_date <= today + timedelta(days=days),
        )
    return query.order_by(FinancialItem.due_date).limit(1000).all()


@router.get("/overdue", response_model=List[FinancialItemResponse])
@limiter.limit("100/minute")
def get_overdue_items(request: Request, db: Session = Depends(get_db)):
    """Get all overdue, unpaid financial items."""
    today = date.today()
    return db.query(FinancialItem).filter(
        FinancialItem.is_paid == False,
        FinancialItem.due_date < today
    ).order_by(FinancialItem.due_date).limit(1000).all()


@router.get("/upcoming", response_model=List[FinancialItemOccurrenceResponse])
@limiter.limit("100/minute")
def get_upcoming_items(
    request: Request,
    days: int = 30,
    db: Session = Depends(get_db)
):
    """Get unpaid financial items due within the specified number of days.

    Args:
        days: Number of days to look ahead (default: 30, max: 90)

    Returns items due from today through today + days, sorted by due_date.
    Includes expanded occurrences of recurring bills.
    """
    # Clamp days to reasonable range
    days = max(1, min(days, 90))

    today = date.today()
    end_date = today + timedelta(days=days)

    # Get non-recurring unpaid items in range
    non_recurring = db.query(FinancialItem).filter(
        FinancialItem.is_paid == False,
        FinancialItem.due_date >= today,
        FinancialItem.due_date <= end_date,
        FinancialItem.recurrence_rule_id.is_(None)
    ).limit(500).all()

    # Get recurring bills (master may be outside range)
    recurring_bills = db.query(FinancialItem).options(
        joinedload(FinancialItem.recurrence_rule)
    ).filter(
        FinancialItem.recurrence_rule_id.isnot(None)
    ).limit(1000).all()

    # Build result list
    results: List[dict] = []

    # Add non-recurring items
    for item in non_recurring:
        results.append({
            "id": item.id,
            "name": item.name,
            "amount": item.amount,
            "due_date": item.due_date,
            "type": item.type.value if hasattr(item.type, 'value') else item.type,
            "category_id": item.category_id,
            "notes": item.notes,
            "recurrence_rule_id": item.recurrence_rule_id,
            "is_paid": item.is_paid,
            "paid_date": item.paid_date,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "is_occurrence": False,
            "master_id": None,
            "occurrence_date": None,
        })

    # Expand recurring bills
    for item in recurring_bills:
        rule = item.recurrence_rule
        if not rule:
            continue

        # Get all occurrence dates within the range
        occurrence_dates = expand_recurrence(
            rule=rule,
            start_date=today,
            end_date=end_date + timedelta(days=1),  # inclusive
            master_date=item.due_date,
        )

        for occ_date in occurrence_dates:
            is_master = occ_date == item.due_date
            # For recurring bills, each occurrence is treated as unpaid unless master is paid
            # In future: track paid status per occurrence
            results.append({
                "id": item.id,
                "name": item.name,
                "amount": item.amount,
                "due_date": occ_date,  # Use occurrence date
                "type": item.type.value if hasattr(item.type, 'value') else item.type,
                "category_id": item.category_id,
                "notes": item.notes,
                "recurrence_rule_id": item.recurrence_rule_id,
                "is_paid": item.is_paid if is_master else False,
                "paid_date": item.paid_date if is_master else None,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
                "is_occurrence": not is_master,
                "master_id": item.id if not is_master else None,
                "occurrence_date": occ_date,
            })

    # Sort by due_date
    results.sort(key=lambda x: x["due_date"])

    return results


@router.get("/{item_id}", response_model=FinancialItemResponse)
@limiter.limit("100/minute")
def get_financial_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Get a single financial item by ID."""
    item = db.query(FinancialItem).filter(FinancialItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial item not found"
        )
    return item


@router.post("", response_model=FinancialItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_financial_item(request: Request, item: FinancialItemCreate, db: Session = Depends(get_db)):
    """Create a new financial item."""
    db_item = FinancialItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id}", response_model=FinancialItemResponse)
@limiter.limit("30/minute")
def update_financial_item(request: Request, item_id: int, item: FinancialItemUpdate, db: Session = Depends(get_db)):
    """Update an existing financial item."""
    db_item = db.query(FinancialItem).filter(FinancialItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial item not found"
        )

    update_data = item.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    db.commit()
    db.refresh(db_item)
    return db_item


@router.post("/{item_id}/mark-paid", response_model=FinancialItemResponse)
@limiter.limit("30/minute")
def mark_item_paid(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Mark a financial item as paid."""
    db_item = db.query(FinancialItem).filter(FinancialItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial item not found"
        )

    db_item.is_paid = True
    db_item.paid_date = date.today()

    # Create a Transaction row so reports/budget/cash-flow see this payment
    if db_item.type == FinancialItemType.BILL:
        payment_txn = Transaction(
            date=date.today(),
            amount=db_item.amount,
            description=f"Bill payment: {db_item.name}",
            is_income=False,
            is_recurring=False,
            category_id=db_item.budget_category_id,
            notes=f"Auto-created from bill mark-paid (item #{db_item.id})",
        )
        db.add(payment_txn)

    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{item_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_financial_item(request: Request, item_id: int, db: Session = Depends(get_db)):
    """Delete a financial item."""
    db_item = db.query(FinancialItem).filter(FinancialItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial item not found"
        )

    db.delete(db_item)
    db.commit()
    return None


# =============================================================================
# IMPORT ENDPOINTS
# =============================================================================

from fastapi import UploadFile, File
from app.services.financial_importer import FinancialImporter


@router.post("/import/upload", response_model=ImportUploadResponse)
@limiter.limit("10/minute")
async def upload_for_import(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Upload a CSV or Excel file for import preview.

    Returns parsed items with auto-detected columns and validation errors.
    """
    importer = FinancialImporter()

    # Check file type
    filename = file.filename or ''
    is_excel = filename.lower().endswith(('.xlsx', '.xls'))
    is_csv = filename.lower().endswith('.csv')

    if not is_excel and not is_csv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be CSV (.csv) or Excel (.xlsx, .xls)"
        )

    MAX_IMPORT_SIZE = 10 * 1024 * 1024  # 10MB
    content = await file.read()
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10MB limit")

    if is_excel:
        result = importer.parse_excel(content)
    else:
        # Decode CSV content
        try:
            text_content = content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text_content = content.decode('latin-1')
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Could not decode file. Please use UTF-8 encoding."
                )
        result = importer.parse_csv(text_content)

    return result.to_dict()


@router.post("/import/confirm", response_model=ImportConfirmResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def confirm_import(
    request: Request,
    data: FinanceImportConfirmRequest,
    db: Session = Depends(get_db)
):
    """
    Confirm and save imported financial items.

    Items must have valid name, amount, and due_date.
    """
    imported = []
    failed_count = 0

    for item in data.items:
        try:
            # Create the financial item
            db_item = FinancialItem(
                name=item.name,
                amount=item.amount,
                due_date=item.due_date,
                type=FinancialItemType(item.type) if item.type else FinancialItemType.BILL,
                is_paid=False,
                notes=item.notes,
            )
            db.add(db_item)
            db.flush()  # Get ID

            # Create recurrence rule for recurring bills
            if item.is_recurring and item.frequency:
                _FREQ_MAP = {
                    'daily': RecurrenceFrequency.DAILY,
                    'weekly': RecurrenceFrequency.WEEKLY,
                    'monthly': RecurrenceFrequency.MONTHLY,
                    'yearly': RecurrenceFrequency.YEARLY,
                    'annual': RecurrenceFrequency.YEARLY,
                }
                freq_enum = _FREQ_MAP.get(item.frequency.lower())
                if freq_enum:
                    rule = RecurrenceRule(
                        frequency=freq_enum,
                        interval=1,
                        end_type=RecurrenceEndType.NEVER,
                    )
                    db.add(rule)
                    db.flush()
                    db_item.recurrence_rule_id = rule.id

            imported.append(db_item)
        except (ValueError, TypeError, KeyError) as e:
            logging.getLogger("weekly_review").debug("Finance import: skipped item: %s", e)
            failed_count += 1

    db.commit()

    # Refresh all items to get updated timestamps
    for item in imported:
        db.refresh(item)

    return ImportConfirmResponse(
        imported_count=len(imported),
        failed_count=failed_count,
        items=imported,
    )

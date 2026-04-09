"""
Property Maintenance API router — maintenance requests (split from property.py for file size).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.property import (
    MaintenanceRequest, Property, PropertyUnit, MaintenanceStatus,
)
from app.schemas.property import (
    MaintenanceRequestCreate, MaintenanceRequestUpdate, MaintenanceRequestResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/maintenance", response_model=MaintenanceRequestResponse, status_code=201)
@limiter.limit("30/minute")
def create_maintenance_request(
    request: Request, data: MaintenanceRequestCreate, db: Session = Depends(get_db)
):
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    unit = db.query(PropertyUnit).filter(PropertyUnit.id == data.unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    req = MaintenanceRequest(**data.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/maintenance", response_model=List[MaintenanceRequestResponse])
@limiter.limit("30/minute")
def list_maintenance_requests(
    request: Request,
    property_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MaintenanceRequest)
    if property_id:
        query = query.filter(MaintenanceRequest.property_id == property_id)
    if status:
        query = query.filter(MaintenanceRequest.status == status)
    return query.order_by(MaintenanceRequest.created_date.desc()).limit(1000).all()


@router.get("/maintenance/open", response_model=List[MaintenanceRequestResponse])
@limiter.limit("30/minute")
def get_open_maintenance(request: Request, db: Session = Depends(get_db)):
    return db.query(MaintenanceRequest).filter(
        MaintenanceRequest.status.in_([
            MaintenanceStatus.OPEN.value,
            MaintenanceStatus.IN_PROGRESS.value,
        ])
    ).order_by(MaintenanceRequest.created_date.desc()).limit(1000).all()


@router.get("/maintenance/{request_id}", response_model=MaintenanceRequestResponse)
@limiter.limit("30/minute")
def get_maintenance_request(request: Request, request_id: int, db: Session = Depends(get_db)):
    req = db.query(MaintenanceRequest).filter(MaintenanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Maintenance request not found")
    return req


@router.put("/maintenance/{request_id}", response_model=MaintenanceRequestResponse)
@limiter.limit("30/minute")
def update_maintenance_request(
    request: Request, request_id: int, data: MaintenanceRequestUpdate, db: Session = Depends(get_db)
):
    req = db.query(MaintenanceRequest).filter(MaintenanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Maintenance request not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(req, field, value)
    db.commit()
    db.refresh(req)
    return req

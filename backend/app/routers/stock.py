"""
Stock router — storage location management and location confirmation.

Endpoints
---------
POST /api/stock/confirm-location
    Human confirms a storage slot for a medicine after the intake flow
    offered candidate locations.

GET /api/stock/locations
    Lists all active storage locations with current occupancy.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.models.medicine import Medicine
from app.models.medicine_location import MedicineLocation
from app.models.storage_location import StorageLocation
from app.models.audit_log import AuditLog
from app.services.location_service import get_slot_occupancy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stock", tags=["stock"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ConfirmLocationRequest(BaseModel):
    medicine_id: int = Field(..., description="ID of the medicine to assign")
    location_id: int = Field(..., description="ID of the chosen storage slot")
    quantity: int = Field(..., ge=1, description="Number of units to store here")


class ConfirmLocationResponse(BaseModel):
    medicine_id: int
    location_id: int
    quantity: int
    assigned_by: str
    label: str
    message: str


class CreateLocationRequest(BaseModel):
    rack_name: str = Field(..., max_length=50, description="Rack identifier, e.g. 'Rack A'")
    row: int = Field(..., ge=1, description="Row number (1-indexed)")
    column: int = Field(..., ge=1, description="Column number (1-indexed)")
    capacity: int = Field(default=20, ge=1, description="Capacity of this slot")
    storage_type: str = Field(default="shelf", max_length=50, description="Type: shelf, refrigerator, controlled")


class LocationDetail(BaseModel):
    id: int
    rack_name: str
    row: int
    column: int
    capacity: int
    current_occupancy: int
    available: int
    storage_type: str
    is_active: bool
    label: str


class LocationsListResponse(BaseModel):
    locations: list[LocationDetail]
    total: int


# ---------------------------------------------------------------------------
# POST /api/stock/confirm-location
# ---------------------------------------------------------------------------

@router.post(
    "/confirm-location",
    response_model=ConfirmLocationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm a storage location for a medicine",
    description=(
        "After the intake flow suggests candidate locations, the human picks one. "
        "This endpoint validates capacity and creates/updates the medicine_location row."
    ),
)
def confirm_location(
    body: ConfirmLocationRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> ConfirmLocationResponse:
    if current_user.role not in ("admin", "pharmacist"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins and Pharmacists can assign storage locations.",
        )

    # Validate medicine exists
    medicine = db.query(Medicine).filter(Medicine.id == body.medicine_id).first()
    if not medicine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medicine {body.medicine_id} not found.",
        )

    # Validate location exists and is active
    location = (
        db.query(StorageLocation)
        .filter(StorageLocation.id == body.location_id, StorageLocation.is_active == True)  # noqa: E712
        .first()
    )
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storage location {body.location_id} not found or inactive.",
        )

    # Check remaining capacity
    occupancy = get_slot_occupancy(db, location.id)
    available = location.capacity - occupancy
    if body.quantity > available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Not enough space in {location.rack_name} R{location.row}C{location.column}. "
                f"Available: {available}, requested: {body.quantity}."
            ),
        )

    # Create or update medicine_location
    existing_ml = (
        db.query(MedicineLocation)
        .filter(
            MedicineLocation.medicine_id == body.medicine_id,
            MedicineLocation.location_id == body.location_id,
        )
        .first()
    )

    if existing_ml:
        existing_ml.quantity += body.quantity
        existing_ml.assigned_by = "human"
        existing_ml.assigned_at = datetime.now(timezone.utc)
    else:
        new_ml = MedicineLocation(
            medicine_id=body.medicine_id,
            location_id=body.location_id,
            quantity=body.quantity,
            assigned_by="human",
        )
        db.add(new_ml)

    # Audit log
    label = f"{location.rack_name}, Row {location.row}, Column {location.column}"
    audit = AuditLog(
        medicine_id=body.medicine_id,
        action="location_assigned",
        changed_by=f"{current_user.email} ({current_user.role})",
        old_value=None,
        new_value=f"Assigned {body.quantity} units to {label} (human)",
    )
    db.add(audit)

    db.commit()

    logger.info(
        "Human confirmed location: medicine_id=%d → %s (%d units) by %s",
        body.medicine_id, label, body.quantity, current_user.email,
    )

    return ConfirmLocationResponse(
        medicine_id=body.medicine_id,
        location_id=body.location_id,
        quantity=body.quantity,
        assigned_by="human",
        label=label,
        message=f"Successfully assigned {body.quantity} units to {label}.",
    )


# ---------------------------------------------------------------------------
# POST /api/stock/locations
# ---------------------------------------------------------------------------

@router.post(
    "/locations",
    response_model=LocationDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new storage location",
    description="Creates a new storage slot. If an inactive one exists, reactivates it.",
)
def create_location(
    body: CreateLocationRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> LocationDetail:
    if current_user.role not in ("admin", "pharmacist"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins and Pharmacists can create storage locations.",
        )

    # Check if slot already exists
    existing = (
        db.query(StorageLocation)
        .filter(
            StorageLocation.rack_name == body.rack_name.strip(),
            StorageLocation.row == body.row,
            StorageLocation.column == body.column,
        )
        .first()
    )

    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.capacity = body.capacity
            existing.storage_type = body.storage_type
            db.commit()
            db.refresh(existing)
            occ = get_slot_occupancy(db, existing.id)
            return LocationDetail(
                id=existing.id,
                rack_name=existing.rack_name,
                row=existing.row,
                column=existing.column,
                capacity=existing.capacity,
                current_occupancy=occ,
                available=existing.capacity - occ,
                storage_type=existing.storage_type,
                is_active=existing.is_active,
                label=f"{existing.rack_name}, Row {existing.row}, Column {existing.column}",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Storage slot {body.rack_name} Row {body.row} Column {body.column} already exists.",
        )

    new_loc = StorageLocation(
        rack_name=body.rack_name.strip(),
        row=body.row,
        column=body.column,
        capacity=body.capacity,
        storage_type=body.storage_type,
        is_active=True,
    )
    db.add(new_loc)
    db.commit()
    db.refresh(new_loc)
    occ = get_slot_occupancy(db, new_loc.id)
    return LocationDetail(
        id=new_loc.id,
        rack_name=new_loc.rack_name,
        row=new_loc.row,
        column=new_loc.column,
        capacity=new_loc.capacity,
        current_occupancy=occ,
        available=new_loc.capacity - occ,
        storage_type=new_loc.storage_type,
        is_active=new_loc.is_active,
        label=f"{new_loc.rack_name}, Row {new_loc.row}, Column {new_loc.column}",
    )


# ---------------------------------------------------------------------------
# GET /api/stock/locations
# ---------------------------------------------------------------------------

@router.get(
    "/locations",
    response_model=LocationsListResponse,
    summary="List all active storage locations with occupancy",
    description="Returns every active storage slot and its current occupancy.",
)
def list_locations(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> LocationsListResponse:
    locations = (
        db.query(StorageLocation)
        .filter(StorageLocation.is_active == True)  # noqa: E712
        .order_by(StorageLocation.rack_name, StorageLocation.row, StorageLocation.column)
        .all()
    )

    details = []
    for loc in locations:
        occ = get_slot_occupancy(db, loc.id)
        details.append(LocationDetail(
            id=loc.id,
            rack_name=loc.rack_name,
            row=loc.row,
            column=loc.column,
            capacity=loc.capacity,
            current_occupancy=occ,
            available=loc.capacity - occ,
            storage_type=loc.storage_type,
            is_active=loc.is_active,
            label=f"{loc.rack_name}, Row {loc.row}, Column {loc.column}",
        ))

    return LocationsListResponse(locations=details, total=len(details))

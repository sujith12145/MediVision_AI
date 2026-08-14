"""
Medicines router — inventory management endpoints.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.models.medicine import Medicine

router = APIRouter(prefix="/medicines", tags=["medicines"])


class MedicineResponse(BaseModel):
    id: int
    name: str
    strength: str | None = None
    manufacturer: str | None = None
    batch_number: str | None = None
    expiry_date: date | None = None
    mrp: float | None = None
    purchase_price: float
    quantity: int
    reorder_threshold: int
    storage_location: str | None = None
    intake_status: str | None = None
    qr_code_id: str | None = None
    qr_code_image: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get(
    "",
    response_model=list[MedicineResponse],
    summary="List all medicine inventory items",
    description="Returns all medicine rows, ordered by creation date descending.",
)
def list_medicines(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[MedicineResponse]:
    medicines = (
        db.query(Medicine)
        .order_by(Medicine.created_at.desc())
        .all()
    )
    return medicines


from fastapi import HTTPException, status
from sqlalchemy import or_

@router.get(
    "/search",
    response_model=list[MedicineResponse],
    summary="Search medicines by name or batch number",
    description="Returns a list of medicines matching the query in name or batch number using parameterized query pattern.",
)
def search_medicines(
    q: str,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[MedicineResponse]:
    if not q or not q.strip():
        return []
    term = f"%{q.strip()}%"
    results = (
        db.query(Medicine)
        .filter(
            or_(
                Medicine.name.ilike(term),
                Medicine.batch_number.ilike(term),
            )
        )
        .order_by(Medicine.name.asc())
        .limit(20)
        .all()
    )
    return results


@router.get(
    "/lookup/{qr_code_id}",
    response_model=MedicineResponse,
    summary="Look up a medicine by QR code ID",
    description="Returns details for a single medicine matched by its unique QR code ID.",
)
def lookup_medicine(
    qr_code_id: str,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> MedicineResponse:
    medicine = (
        db.query(Medicine)
        .filter(Medicine.qr_code_id == qr_code_id.strip())
        .first()
    )
    if not medicine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medicine with QR code ID '{qr_code_id}' not found.",
        )
    return medicine


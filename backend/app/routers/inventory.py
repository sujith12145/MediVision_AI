"""
Inventory router — paginated inventory list and filters.
"""

from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.models.sale import Sale  # type: ignore
from app.models.sale_item import SaleItem  # type: ignore


router = APIRouter(prefix="/inventory", tags=["inventory"])


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


class AuditLogResponse(BaseModel):
    id: int
    medicine_id: int | None = None
    action: str
    changed_by: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    timestamp: datetime

    class Config:
        from_attributes = True


class PaginatedInventoryResponse(BaseModel):
    items: list[MedicineResponse]
    total: int
    limit: int
    offset: int


@router.get(
    "",
    response_model=PaginatedInventoryResponse,
    summary="List inventory items with pagination and filters",
    description=(
        "Returns a paginated list of medicines. Supports parameterized "
        "search (by name, case-insensitive) and filter (by manufacturer and expiry status)."
    ),
)
def list_inventory(
    limit: int = 10,
    offset: int = 0,
    search: str | None = None,
    manufacturer: str | None = None,
    expiry_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> PaginatedInventoryResponse:
    # Build query
    query = db.query(Medicine)

    # 1. Parameterized search by name (partial match, case-insensitive)
    if search and search.strip():
        query = query.filter(Medicine.name.ilike(f"%{search.strip()}%"))

    # 2. Parameterized filter by manufacturer (partial match, case-insensitive)
    if manufacturer and manufacturer.strip():
        query = query.filter(Medicine.manufacturer.ilike(f"%{manufacturer.strip()}%"))

    # 3. Parameterized filter by expiry status
    if expiry_status and expiry_status.strip():
        status_val = expiry_status.strip().lower()
        today = date.today()
        near_expiry_threshold = today + timedelta(days=30)
        
        if status_val == "expired":
            query = query.filter(Medicine.expiry_date < today)
        elif status_val == "near_expiry":
            query = query.filter(
                Medicine.expiry_date >= today,
                Medicine.expiry_date <= near_expiry_threshold
            )
        elif status_val == "valid":
            query = query.filter(
                or_(
                    Medicine.expiry_date > near_expiry_threshold,
                    Medicine.expiry_date.is_(None)
                )
            )

    # Get total count
    total_count = query.count()

    # Get items paginated and ordered by soonest-expiring first (nulls last)
    items = (
        query.order_by(Medicine.expiry_date.asc().nulls_last(), Medicine.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return PaginatedInventoryResponse(
        items=items,
        total=total_count,
        limit=limit,
        offset=offset
    )


@router.get(
    "/manufacturers",
    response_model=list[str],
    summary="Get all unique manufacturers",
    description="Returns a list of all unique manufacturer names currently present in inventory.",
)
def list_manufacturers(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[str]:
    results = (
        db.query(Medicine.manufacturer)
        .filter(Medicine.manufacturer.isnot(None))
        .distinct()
        .all()
    )
    # Flatten and sort unique stripped values
    return sorted(list({r[0].strip() for r in results if r[0] and r[0].strip()}))


class ExpirySummaryResponse(BaseModel):
    red: int
    amber: int
    green: int


@router.get(
    "/expiry-summary",
    response_model=ExpirySummaryResponse,
    summary="Get count of medicines in each expiry status bucket",
    description="Returns the total counts of medicines classified as Red (<=30 days), Amber (31-90 days), and Green (>90 days or Null).",
)
def get_expiry_summary(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> ExpirySummaryResponse:
    today = date.today()
    
    # Query only the expiry date to make it performant
    results = db.query(Medicine.expiry_date).all()
    
    red = 0
    amber = 0
    green = 0
    
    for r in results:
        expiry_date = r[0]
        if not expiry_date:
            green += 1
            continue
            
        days_until = (expiry_date - today).days
        if days_until <= 30:
            red += 1
        elif days_until <= 90:
            amber += 1
        else:
            green += 1
            
    return ExpirySummaryResponse(red=red, amber=amber, green=green)


class ReorderSuggestionResponse(BaseModel):
    medicine_id: int
    name: str
    strength: str | None = None
    manufacturer: str | None = None
    batch_number: str | None = None
    quantity: int
    reorder_threshold: int
    suggested_reorder_quantity: int
    storage_location: str | None = None


class SmartReorderPredictionResponse(BaseModel):
    medicine_id: int
    name: str
    strength: str | None = None
    manufacturer: str | None = None
    batch_number: str | None = None
    quantity: int
    reorder_threshold: int
    daily_sales_velocity: float | None = None
    estimated_days_until_stockout: float | None = None
    suggested_reorder_quantity: int
    status: str

    class Config:
        from_attributes = True



@router.get(
    "/reorder-suggestions",
    response_model=list[ReorderSuggestionResponse],
    summary="Get list of medicines that need reordering",
    description="Returns a list of medicines where quantity is below or equal to reorder_threshold, with a suggested reorder amount calculated as (reorder_threshold * 2) - current_quantity.",
)
def get_reorder_suggestions(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[ReorderSuggestionResponse]:
    # Query medicines where quantity falls below or equal to the reorder threshold
    medicines = (
        db.query(Medicine)
        .filter(Medicine.quantity <= Medicine.reorder_threshold)
        .all()
    )
    
    suggestions = []
    for med in medicines:
        # Rule-based calculation: suggested = (threshold * 2) - current_quantity
        suggested = (med.reorder_threshold * 2) - med.quantity
        suggested = max(suggested, 1) # Ensure a positive reorder suggestion
        
        suggestions.append(
            ReorderSuggestionResponse(
                medicine_id=med.id,
                name=med.name,
                strength=med.strength,
                manufacturer=med.manufacturer,
                batch_number=med.batch_number,
                quantity=med.quantity,
                reorder_threshold=med.reorder_threshold,
                suggested_reorder_quantity=suggested,
                storage_location=med.storage_location,
            )
        )
        
    return suggestions


@router.get(
    "/smart-reorder-predictions",
    response_model=list[SmartReorderPredictionResponse],
    summary="Get smart reorder predictions using sales velocity",
    description=(
        "Computes average daily sales velocity over the last 30 days. "
        "Flags urgent (<7 days) and upcoming (<14 days) stockouts with velocity-based suggestions. "
        "Falls back to threshold logic for low-history medicines."
    ),
)
def get_smart_reorder_predictions(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[SmartReorderPredictionResponse]:
    medicines = db.query(Medicine).all()
    thirty_days_ago = datetime.now() - timedelta(days=30)
    
    predictions = []
    for med in medicines:
        # Fetch recorded sale items in the last 30 days
        sale_items = (
            db.query(SaleItem)
            .join(Sale)
            .filter(
                SaleItem.medicine_id == med.id,
                Sale.sold_at >= thirty_days_ago
            )
            .all()
        )
        
        num_sales = len(sale_items)
        
        if num_sales < 5:
            # Low sales volume / insufficient history fallback
            status_flag = "insufficient_history"
            daily_velocity = None
            days_until_stockout = None
            
            # Suggest based on rule-based reorder threshold
            if med.quantity <= med.reorder_threshold:
                suggested_qty = max((med.reorder_threshold * 2) - med.quantity, 1)
            else:
                suggested_qty = 0
        else:
            # Sales velocity logic
            total_qty_sold = sum(item.quantity_sold for item in sale_items)
            daily_velocity = total_qty_sold / 30.0
            
            if daily_velocity > 0.0:
                days_until_stockout = med.quantity / daily_velocity
            else:
                days_until_stockout = 9999.0
            
            if days_until_stockout < 7.0:
                status_flag = "urgent"
                suggested_qty = round(daily_velocity * 14.0)
            elif days_until_stockout < 14.0:
                status_flag = "upcoming"
                suggested_qty = round(daily_velocity * 14.0)
            else:
                status_flag = "safe"
                suggested_qty = 0
        
        predictions.append(
            SmartReorderPredictionResponse(
                medicine_id=med.id,
                name=med.name,
                strength=med.strength,
                manufacturer=med.manufacturer,
                batch_number=med.batch_number,
                quantity=med.quantity,
                reorder_threshold=med.reorder_threshold,
                daily_sales_velocity=daily_velocity,
                estimated_days_until_stockout=days_until_stockout,
                suggested_reorder_quantity=suggested_qty,
                status=status_flag,
            )
        )
        
    return predictions



@router.get(
    "/{medicine_id}/history",
    response_model=list[AuditLogResponse],
    summary="Get audit history for a medicine",
    description="Returns a list of all audit logs for a specific medicine, newest first.",
)
def get_medicine_history(
    medicine_id: int,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[AuditLogResponse]:
    from fastapi import HTTPException, status
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins can view audit logs."
        )

    # Ensure medicine exists first
    medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not medicine:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medicine with ID {medicine_id} not found."
        )
    
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.medicine_id == medicine_id)
        .order_by(AuditLog.timestamp.desc())
        .all()
    )
    return logs

"""
Sales router — POST /api/sales, GET /api/sales
Supports multi-item checkout and concurrency safety via row locking.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.models.sale import Sale
from app.models.sale_item import SaleItem

router = APIRouter(prefix="/sales", tags=["sales"])

# ── Schemas ──────────────────────────────────────────────────────────────────

class CreateSaleItemRequest(BaseModel):
    medicine_id: int = Field(..., description="ID of the medicine to sell")
    quantity_sold: int = Field(..., ge=1, description="Quantity sold (must be a positive integer)")
    sale_price: float = Field(..., ge=0.0, description="Price per unit for this line item")


class CreateSaleRequest(BaseModel):
    items: list[CreateSaleItemRequest] = Field(..., min_length=1, description="List of items to purchase")
    customer_name: str | None = Field(None, max_length=255, description="Optional customer name")
    customer_phone: str | None = Field(None, description="Optional customer phone number")


class SaleItemResponse(BaseModel):
    id: int
    medicine_id: int | None = None
    medicine_name: str
    quantity_sold: int
    sale_price: float
    line_total: float

    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    id: int
    sold_by: str | None = None
    sold_at: datetime
    total_amount: float
    items: list[SaleItemResponse]
    customer_name: str | None = None
    customer_phone: str | None = None

    class Config:
        from_attributes = True



# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=SaleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a new multi-item sales transaction with concurrency safety",
    description=(
        "Processes a multi-item sale in a single database transaction. "
        "Locks medicine rows in ascending ID order to prevent deadlocks, "
        "verifies stock AFTER obtaining locks, updates stock levels, "
        "and creates audit logs."
    ),
)
def record_sale(
    request_data: CreateSaleRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> SaleResponse:
    # Validate uniqueness of items in checkout
    med_ids = [item.medicine_id for item in request_data.items]
    if len(med_ids) != len(set(med_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate items in sale are not allowed."
        )

    # Validate optional phone number loosely (only checking formatting and length digits range 7-15)
    if request_data.customer_phone:
        cleaned_phone = (
            request_data.customer_phone
            .replace(" ", "")
            .replace("-", "")
            .replace("+", "")
            .replace("(", "")
            .replace(")", "")
        )
        if not cleaned_phone.isdigit() or not (7 <= len(cleaned_phone) <= 15):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provided phone number is invalid. It must contain only digits and be a reasonable length (7-15 digits)."
            )

    # Sort items by medicine_id to prevent deadlocks under concurrency
    sorted_items = sorted(request_data.items, key=lambda x: x.medicine_id)

    try:
        locked_medicines = {}
        
        # 1. Lock rows in ascending order
        for item in sorted_items:
            med = (
                db.query(Medicine)
                .filter(Medicine.id == item.medicine_id)
                .with_for_update()  # acquires row lock (SELECT ... FOR UPDATE)
                .first()
            )
            if not med:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Medicine with ID {item.medicine_id} not found."
                )
            locked_medicines[med.id] = med

        # 2. Re-check stock levels AFTER acquiring locks
        for item in request_data.items:
            med = locked_medicines[item.medicine_id]
            if item.quantity_sold > med.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="insufficient stock"
                )
            if item.quantity_sold <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Quantity sold must be positive."
                )

        # 3. All items passed validation. Create records.
        sale_items = []
        audit_logs = []
        total_amount = 0.0

        for item in request_data.items:
            med = locked_medicines[item.medicine_id]
            old_quantity = med.quantity
            new_quantity = old_quantity - item.quantity_sold
            med.quantity = new_quantity
            
            mrp_val = float(med.mrp) if med.mrp is not None else 0.0
            line_total = float(item.quantity_sold) * mrp_val
            total_amount += line_total

            sale_item = SaleItem(
                medicine_id=med.id,
                quantity_sold=item.quantity_sold,
                sale_price=mrp_val,
                line_total=line_total,
            )
            sale_items.append(sale_item)

            audit = AuditLog(
                medicine_id=med.id,
                action="sale",
                changed_by=f"{current_user.email} ({current_user.role})",
                old_value=str(old_quantity),
                new_value=str(new_quantity),
            )
            audit_logs.append(audit)

        # Create master sale record
        sale = Sale(
            sold_by=f"{current_user.email} ({current_user.role})",
            total_amount=total_amount,
            items=sale_items,
            customer_name=request_data.customer_name,
            customer_phone=request_data.customer_phone,
        )
        db.add(sale)

        # Write audit logs
        for log in audit_logs:
            db.add(log)

        db.commit()
        db.refresh(sale)

        # Form response
        response_items = []
        for item in sale.items:
            # Re-fetch medicine name safely (handling SET NULL case)
            med_name = item.medicine.name if item.medicine else "[Deleted Medicine]"
            response_items.append(
                SaleItemResponse(
                    id=item.id,
                    medicine_id=item.medicine_id,
                    medicine_name=med_name,
                    quantity_sold=item.quantity_sold,
                    sale_price=float(item.sale_price),
                    line_total=float(item.line_total),
                )
            )

        return SaleResponse(
            id=sale.id,
            sold_by=sale.sold_by,
            sold_at=sale.sold_at,
            total_amount=sale.total_amount,
            items=response_items,
            customer_name=sale.customer_name,
            customer_phone=sale.customer_phone,
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        # Ensure we do NOT log or output customer_phone or any database exceptions that might expose it
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record sale."
        )


@router.get(
    "",
    response_model=list[SaleResponse],
    summary="Get multi-item sales transaction history",
    description="Returns a list of past sales, with optional filters for start_date and end_date (YYYY-MM-DD).",
)
def get_sales_history(
    start_date: str | None = None,
    end_date: str | None = None,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[SaleResponse]:
    query = db.query(Sale)

    # Apply date filters
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(Sale.sold_at >= start_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be in YYYY-MM-DD format"
            )

    if end_date:
        try:
            # End of the specified day (23:59:59.999)
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999)
            query = query.filter(Sale.sold_at <= end_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="end_date must be in YYYY-MM-DD format"
            )

    sales = query.order_by(Sale.sold_at.desc()).all()

    responses = []
    for sale in sales:
        item_responses = []
        for item in sale.items:
            med_name = item.medicine.name if item.medicine else "[Deleted Medicine]"
            item_responses.append(
                SaleItemResponse(
                    id=item.id,
                    medicine_id=item.medicine_id,
                    medicine_name=med_name,
                    quantity_sold=item.quantity_sold,
                    sale_price=float(item.sale_price),
                    line_total=float(item.line_total),
                )
            )

        responses.append(
            SaleResponse(
                id=sale.id,
                sold_by=sale.sold_by,
                sold_at=sale.sold_at,
                total_amount=float(sale.total_amount),
                items=item_responses,
                customer_name=sale.customer_name,
                customer_phone=sale.customer_phone,
            )
        )

    return responses


class RecentSalesResponse(BaseModel):
    date: str
    sales: float


@router.get(
    "/recent",
    response_model=list[RecentSalesResponse],
    summary="Get recent sales aggregated by day for the last 7 days",
    description="Returns total sales amount for each day in the last 7 days.",
)
def get_recent_sales(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> list[RecentSalesResponse]:
    from datetime import date, timedelta
    today = date.today()
    start_date = today - timedelta(days=6)
    
    start_dt = datetime.combine(start_date, datetime.min.time())
    sales = db.query(Sale).filter(Sale.sold_at >= start_dt).all()
    
    sales_by_date = {}
    for i in range(7):
        d = today - timedelta(days=i)
        sales_by_date[d.strftime("%Y-%m-%d")] = 0.0
        
    for sale in sales:
        date_str = sale.sold_at.strftime("%Y-%m-%d")
        if date_str in sales_by_date:
            sales_by_date[date_str] += float(sale.total_amount)
            
    result = [
        RecentSalesResponse(date=d_str, sales=sales_by_date[d_str])
        for d_str in sorted(sales_by_date.keys())
    ]
    return result



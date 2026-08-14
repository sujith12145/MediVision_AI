import io
import re
import csv
import json
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.models.medicine import Medicine
from app.models.purchase_order import PurchaseOrder

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OrderItem(BaseModel):
    medicine_id: int
    quantity: int = Field(..., gt=0, description="Quantity to reorder")


class POStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Target status ('Draft', 'Sent', 'Fulfilled')")


class PurchaseOrderResponse(BaseModel):
    id: int
    supplier_name: str
    items: List[dict]
    total_cost: float
    status: str
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/generate-po",
    summary="Generate a Purchase Order and download distributor CSV"
)
def generate_purchase_order(
    request_data: List[OrderItem],
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user)
):
    if not request_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order items list cannot be empty"
        )

    items_list = []
    for item in request_data:
        med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first()
        if not med:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Medicine ID {item.medicine_id} not found"
            )

        items_list.append({
            "medicine_id": med.id,
            "name": med.name,
            "strength": med.strength,
            "manufacturer": med.manufacturer,
            "purchase_price": float(med.purchase_price),
            "quantity": item.quantity,
            "line_total": item.quantity * float(med.purchase_price)
        })

    # Pick distributor name based on the manufacturer of the first item (or fallback)
    supplier_name = (
        items_list[0]["manufacturer"]
        if (items_list and items_list[0]["manufacturer"])
        else "General Distributor"
    )
    total_cost = sum(item["line_total"] for item in items_list)

    # Save to database
    po = PurchaseOrder(
        supplier_name=supplier_name,
        items_json=json.dumps(items_list),
        total_cost=total_cost,
        status="Draft"
    )
    db.add(po)
    db.commit()
    db.refresh(po)

    # Generate CSV stream
    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)

    writer.writerow(["PURCHASE ORDER", f"PO-{po.id}"])
    writer.writerow(["Distributor Name", po.supplier_name])
    writer.writerow(["Date Created", po.created_at.strftime("%Y-%m-%d %H:%M:%S")])
    writer.writerow(["Created By", current_user.email])
    writer.writerow([])
    writer.writerow(["Medicine ID", "Medicine Name", "Strength", "Quantity Ordered", "Unit Price ($)", "Total Amount ($)"])

    for item in items_list:
        writer.writerow([
            item["medicine_id"],
            item["name"],
            item["strength"] or "—",
            item["quantity"],
            f"{item['purchase_price']:.2f}",
            f"{item['line_total']:.2f}"
        ])

    writer.writerow([])
    writer.writerow(["", "", "", "", "GRAND TOTAL", f"{po.total_cost:.2f}"])

    csv_bytes = csv_buffer.getvalue().encode('utf-8')

    # Filename matching: PO_Supplier_{date}.csv
    sanitized_supplier = re.sub(r'[^a-zA-Z0-9]', '_', supplier_name)
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"PO_Supplier_{sanitized_supplier}_{date_str}.csv"

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.get(
    "/history",
    response_model=List[PurchaseOrderResponse],
    summary="Get purchase orders history log"
)
def get_purchase_orders_history(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user)
):
    orders = db.query(PurchaseOrder).order_by(PurchaseOrder.created_at.desc()).all()
    return [
        PurchaseOrderResponse(
            id=o.id,
            supplier_name=o.supplier_name,
            items=json.loads(o.items_json),
            total_cost=float(o.total_cost),
            status=o.status,
            created_at=o.created_at.isoformat()
        )
        for o in orders
    ]


@router.put(
    "/{po_id}/status",
    summary="Update the status of an existing Purchase Order"
)
def update_purchase_order_status(
    po_id: int,
    request_data: POStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user)
):
    if request_data.status not in ["Draft", "Sent", "Fulfilled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be one of 'Draft', 'Sent', or 'Fulfilled'"
        )

    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )

    po.status = request_data.status
    db.commit()
    db.refresh(po)

    return {
        "status": "success",
        "po_id": po.id,
        "new_status": po.status
    }

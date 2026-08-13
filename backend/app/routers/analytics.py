import io
import re
import json
import logging
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.models.medicine import Medicine
from app.models.sale import Sale
from app.models.sale_item import SaleItem

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class FinancialRiskResponse(BaseModel):
    total_value_at_risk: float
    items_affected: int


class StockForecastResponse(BaseModel):
    medicine_id: int
    name: str
    predicted_demand: int
    current_stock: int
    action: str


class MedicineGstConfig(BaseModel):
    hsn_code: str | None = None
    gst_rate: float = Field(..., ge=0.0, le=100.0, description="GST rate as percentage")


class GstReportRequest(BaseModel):
    month: str = Field(..., description="Month in YYYY-MM format (e.g. 2026-07)")
    medicines_config: dict[str, MedicineGstConfig] = Field(default_factory=dict, description="Map of medicine_id (str) to config")


# ---------------------------------------------------------------------------
# Helper: Predictive demand forecasting using scikit-learn or moving average
# ---------------------------------------------------------------------------

def predict_7_day_demand(db: Session, medicine_id: int, total_qty_sold: int) -> int:
    try:
        from sklearn.linear_model import LinearRegression
        import numpy as np

        # Fetch daily sales for the last 90 days
        cutoff = datetime.now() - timedelta(days=90)
        daily_sales = (
            db.query(
                func.date(Sale.sold_at).label("sale_date"),
                func.sum(SaleItem.quantity_sold).label("daily_qty")
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
            .filter(SaleItem.medicine_id == medicine_id, Sale.sold_at >= cutoff)
            .group_by(func.date(Sale.sold_at))
            .all()
        )

        today = date.today()
        ninety_days_ago = today - timedelta(days=90)

        # Build 90-day timeseries (fill empty days with 0)
        y = np.zeros(90)
        for row in daily_sales:
            sale_date = row.sale_date
            if isinstance(sale_date, str):
                sale_date = datetime.strptime(sale_date, "%Y-%m-%d").date()
            elif isinstance(sale_date, datetime):
                sale_date = sale_date.date()

            offset = (sale_date - ninety_days_ago).days
            if 0 <= offset < 90:
                y[offset] = float(row.daily_qty)

        # Train Linear Regression model
        X = np.arange(90).reshape(-1, 1)
        model = LinearRegression()
        model.fit(X, y)

        # Predict next 7 days (offsets 90 to 96)
        X_next = np.arange(90, 97).reshape(-1, 1)
        predictions = model.predict(X_next)

        predicted_demand = max(0, int(round(sum(predictions))))
        return predicted_demand

    except Exception:
        # Fallback: Simple moving average (daily sales * 7)
        daily_avg = total_qty_sold / 90.0
        predicted_demand = int(round(daily_avg * 7.0))
        return predicted_demand


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/financial-risk",
    response_model=FinancialRiskResponse,
    summary="Get total value of inventory expiring within the next 30 days"
)
def get_financial_risk(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user)
):
    today = date.today()
    thirty_days_later = today + timedelta(days=30)

    result = (
        db.query(
            func.coalesce(func.sum(Medicine.purchase_price * Medicine.quantity), 0).label("total_value"),
            func.count(Medicine.id).label("total_items")
        )
        .filter(
            Medicine.expiry_date >= today,
            Medicine.expiry_date <= thirty_days_later,
            Medicine.quantity > 0
        )
        .first()
    )

    return FinancialRiskResponse(
        total_value_at_risk=float(result.total_value),
        items_affected=result.total_items
    )


@router.get(
    "/forecast",
    response_model=list[StockForecastResponse],
    summary="Forecast medicine demand for the next 7 days"
)
def get_stock_forecast(
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user)
):
    medicines = db.query(Medicine).all()

    # Total quantity sold per medicine in the last 90 days
    cutoff = datetime.now() - timedelta(days=90)
    sales_sums = (
        db.query(
            SaleItem.medicine_id,
            func.sum(SaleItem.quantity_sold).label("total_sold")
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.sold_at >= cutoff)
        .group_by(SaleItem.medicine_id)
        .all()
    )

    sales_map = {row.medicine_id: int(row.total_sold) for row in sales_sums if row.medicine_id}

    forecasts = []
    for med in medicines:
        total_sold = sales_map.get(med.id, 0)
        predicted_demand = predict_7_day_demand(db, med.id, total_sold)

        current_stock = med.quantity
        if predicted_demand > 0:
            if current_stock <= predicted_demand * 0.3:
                action = "URGENT"
            elif current_stock <= predicted_demand * 0.75:
                action = "REORDER"
            else:
                action = "OK"
        else:
            action = "OK"

        forecasts.append(
            StockForecastResponse(
                medicine_id=med.id,
                name=med.name,
                predicted_demand=predicted_demand,
                current_stock=current_stock,
                action=action
            )
        )

    return forecasts


@router.post(
    "/gst-report",
    summary="Generate a PDF GST Sales Report with mocked HSN/SAC codes"
)
def generate_gst_report(
    request_data: GstReportRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user)
):
    month = request_data.month
    if not re.match(r"^\d{4}-\d{2}$", month):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be in YYYY-MM format (e.g., 2026-07)"
        )

    year, month_num = map(int, month.split("-"))
    import calendar
    last_day = calendar.monthrange(year, month_num)[1]
    start_dt = datetime(year, month_num, 1, 0, 0, 0)
    end_dt = datetime(year, month_num, last_day, 23, 59, 59, 999999)

    items = (
        db.query(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.sold_at >= start_dt, Sale.sold_at <= end_dt)
        .order_by(Sale.sold_at.asc())
        .all()
    )

    data_rows = []
    total_taxable = 0.0
    total_tax = 0.0
    total_grand = 0.0

    for item in items:
        med_name = item.medicine.name if item.medicine else "[Deleted Medicine]"
        med_id_str = str(item.medicine_id) if item.medicine_id else ""
        config = request_data.medicines_config.get(med_id_str)

        # Mock HSN and GST Rate if not provided
        hsn = (config.hsn_code if config else None) or f"3004.{9000 + (item.medicine_id or 1) % 1000}"
        gst_rate = (config.gst_rate if config else None) or 12.0

        taxable = item.quantity_sold * float(item.sale_price)
        tax_amount = taxable * (gst_rate / 100.0)
        total = taxable + tax_amount

        total_taxable += taxable
        total_tax += tax_amount
        total_grand += total

        data_rows.append({
            "date": item.sale.sold_at.strftime("%Y-%m-%d"),
            "name": med_name,
            "hsn": hsn,
            "qty": item.quantity_sold,
            "price": float(item.sale_price),
            "taxable": taxable,
            "rate": gst_rate,
            "tax_amount": tax_amount,
            "total": total
        })

    # Generate ReportLab PDF
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        textColor=colors.HexColor('#0A74DA'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        textColor=colors.HexColor('#595959'),
        spaceAfter=10
    )

    disclaimer_style = ParagraphStyle(
        'Disclaimer',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        textColor=colors.HexColor('#E64A19'),
        leading=11,
        spaceAfter=15
    )

    table_text_style = ParagraphStyle(
        'TableText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    table_total_style = ParagraphStyle(
        'TableTotal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10
    )

    elements = []
    elements.append(Paragraph("MediVision AI - GST Sales Report", title_style))
    elements.append(Paragraph(f"Report Period: {month}", subtitle_style))
    elements.append(Paragraph("This report is for reference only. Verify all figures and file directly through the official GST portal or your accountant.", disclaimer_style))

    table_data = [
        [
            Paragraph("Date", table_header_style),
            Paragraph("Medicine Name", table_header_style),
            Paragraph("HSN/SAC Code", table_header_style),
            Paragraph("Qty", table_header_style),
            Paragraph("Price", table_header_style),
            Paragraph("Taxable", table_header_style),
            Paragraph("GST Rate", table_header_style),
            Paragraph("GST Tax", table_header_style),
            Paragraph("Total Amount", table_header_style)
        ]
    ]

    for r in data_rows:
        table_data.append([
            Paragraph(r["date"], table_text_style),
            Paragraph(r["name"], table_text_style),
            Paragraph(r["hsn"], table_text_style),
            Paragraph(str(r["qty"]), table_text_style),
            Paragraph(f"${r['price']:.2f}", table_text_style),
            Paragraph(f"${r['taxable']:.2f}", table_text_style),
            Paragraph(f"{r['rate']:.1f}%", table_text_style),
            Paragraph(f"${r['tax_amount']:.2f}", table_text_style),
            Paragraph(f"${r['total']:.2f}", table_text_style)
        ])

    table_data.append([
        Paragraph("Total", table_total_style),
        Paragraph("", table_total_style),
        Paragraph("", table_total_style),
        Paragraph("", table_total_style),
        Paragraph("", table_total_style),
        Paragraph(f"${total_taxable:.2f}", table_total_style),
        Paragraph("", table_total_style),
        Paragraph(f"${total_tax:.2f}", table_total_style),
        Paragraph(f"${total_grand:.2f}", table_total_style)
    ])

    col_widths = [55, 135, 60, 25, 45, 55, 45, 55, 65]
    t = Table(table_data, colWidths=col_widths, repeatRows=1)

    t_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0A74DA')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('TOPPADDING', (0, 0), (-1, 0), 4),
        ('GRID', (0, 0), (-1, -2), 0.5, colors.HexColor('#D9D9D9')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#E9EDF4')),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.black),
        ('LINEBELOW', (0, -1), (-1, -1), 2, colors.black),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 4),
        ('TOPPADDING', (0, -1), (-1, -1), 4),
    ])

    for i in range(1, len(data_rows) + 1):
        if i % 2 == 0:
            t_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F2F2F2'))

    t.setStyle(t_style)
    elements.append(t)

    doc.build(elements)
    output.seek(0)
    file_bytes = output.getvalue()

    filename = f"GST_Report_{month}.pdf"

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

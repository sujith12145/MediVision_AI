"""
SQLAlchemy ORM model for the `medicines` table.

Columns
-------
id                  Primary key (auto-increment)
name                Medicine/drug name — indexed for fast text queries
strength            Dosage strength, e.g. "500 mg", "10 ml"
manufacturer        Manufacturer / brand name
batch_number        Batch / lot number
expiry_date         Date the medicine expires — indexed for expiry queries
mrp                 Maximum retail price (2-decimal precision)
quantity            Current stock quantity
reorder_threshold   Quantity below which a reorder alert should fire
storage_location    Physical shelf / rack location string
created_at          Row creation timestamp (UTC, auto-set)
updated_at          Row last-modified timestamp (UTC, auto-updated)
"""

from datetime import date, datetime, timezone

from sqlalchemy import (
    Date,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.database import Base


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Core identification
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    strength: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Dates & inventory
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    mrp: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, server_default="0.0")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reorder_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    storage_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    intake_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Barcode/QR Code scanner lookup fields
    qr_code_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    qr_code_image: Mapped[str | None] = mapped_column(String, nullable=True)

    # Audit timestamps (UTC)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Indexes ──────────────────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_medicines_name", "name"),
        Index("ix_medicines_expiry_date", "expiry_date"),
        Index("ix_medicines_qr_code_id", "qr_code_id", unique=True),
    )

    @validates("purchase_price")
    def validate_purchase_price(self, key, value):
        if value is not None and value < 0:
            raise ValueError("Purchase price must be non-negative")
        return value

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Medicine id={self.id} name={self.name!r} batch={self.batch_number!r}>"

"""
SQLAlchemy ORM model for the `purchase_orders` table.
"""

from datetime import datetime
from sqlalchemy import (
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False)
    items_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON-encoded array of ordered medicines
    total_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Draft")  # "Draft", "Sent", "Fulfilled"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<PurchaseOrder id={self.id} supplier={self.supplier_name!r} total={self.total_cost} status={self.status}>"

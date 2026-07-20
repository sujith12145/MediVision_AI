"""
SQLAlchemy ORM model for the `sales` table.
Stores records of master sales transactions containing one or more items.
"""

from datetime import datetime
from sqlalchemy import (
    DateTime,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sold_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sold_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Relationships
    items: Mapped[list["SaleItem"]] = relationship( # type: ignore
        "SaleItem", back_populates="sale", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Sale id={self.id} sold_by={self.sold_by} total={self.total_amount} customer={self.customer_name}>"


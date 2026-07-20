"""
SQLAlchemy ORM model for the `sale_items` table.
Stores individual items sold in a sales transaction.
"""

from sqlalchemy import (
    ForeignKey,
    Integer,
    Numeric,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sale_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    medicine_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("medicines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quantity_sold: Mapped[int] = mapped_column(Integer, nullable=False)
    sale_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    # Relationships
    sale: Mapped["Sale"] = relationship("Sale", back_populates="items") # type: ignore
    medicine: Mapped["Medicine"] = relationship("Medicine") # type: ignore

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<SaleItem id={self.id} sale_id={self.sale_id} medicine_id={self.medicine_id}"
            f" quantity={self.quantity_sold} total={self.line_total}>"
        )

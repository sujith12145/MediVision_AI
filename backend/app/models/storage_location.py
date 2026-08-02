"""
SQLAlchemy ORM model for the `storage_locations` table.

Represents a physical storage slot in the pharmacy (a specific position
on a rack/shelf identified by rack name, row, and column).

Columns
-------
id              Primary key (auto-increment)
rack_name       Human-readable rack identifier, e.g. "Rack A"
row             Row number within the rack (1-indexed)
column          Column/slot number within the row (1-indexed)
capacity        Maximum number of medicine units this slot can hold
storage_type    Category: 'shelf', 'refrigerator', 'controlled'
is_active       Soft-delete flag (default True)
created_at      Row creation timestamp (UTC, auto-set)
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.medicine_location import MedicineLocation


class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    rack_name: Mapped[str] = mapped_column(String(50), nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    storage_type: Mapped[str] = mapped_column(String(50), nullable=False, default="shelf")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationship to medicine_locations
    medicine_locations: Mapped[list["MedicineLocation"]] = relationship(  # noqa: F821
        "MedicineLocation", back_populates="location", lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("rack_name", "row", "column", name="uq_rack_row_col"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<StorageLocation id={self.id} {self.rack_name} "
            f"R{self.row}C{self.column} cap={self.capacity}>"
        )

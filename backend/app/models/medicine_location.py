"""
SQLAlchemy ORM model for the `medicine_locations` table.

Tracks where each medicine is physically stored and how many units occupy
that slot.  One medicine can span multiple slots, and one slot can hold
multiple medicines, but each (medicine_id, location_id) pair is unique.

Columns
-------
id              Primary key (auto-increment)
medicine_id     FK → medicines.id
location_id     FK → storage_locations.id
quantity        Number of units of this medicine stored in this slot
assigned_by     Who placed it: 'system' (auto-assigned) or 'human'
assigned_at     When the assignment was made (UTC, auto-set)
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.medicine import Medicine
    from app.models.storage_location import StorageLocation


class MedicineLocation(Base):
    __tablename__ = "medicine_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    medicine_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("medicines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("storage_locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assigned_by: Mapped[str] = mapped_column(String(20), nullable=False, default="system")

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    medicine: Mapped["Medicine"] = relationship(  # noqa: F821
        "Medicine", foreign_keys=[medicine_id],
    )
    location: Mapped["StorageLocation"] = relationship(  # noqa: F821
        "StorageLocation", back_populates="medicine_locations",
    )

    __table_args__ = (
        UniqueConstraint("medicine_id", "location_id", name="uq_medicine_location"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<MedicineLocation id={self.id} med={self.medicine_id} "
            f"loc={self.location_id} qty={self.quantity}>"
        )

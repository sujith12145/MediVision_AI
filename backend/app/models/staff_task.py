"""
SQLAlchemy ORM model for the `staff_tasks` table.
Tracks operational tasks dispatched to staff.
"""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class StaffTask(Base):
    __tablename__ = "staff_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    related_medicine_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("medicines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Lazy-loaded relationship
    medicine = relationship("Medicine", foreign_keys=[related_medicine_id])

    def __repr__(self) -> str:
        return f"<StaffTask id={self.id} assigned_to={self.assigned_to!r} status={self.status!r}>"

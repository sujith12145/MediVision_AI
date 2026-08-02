"""
SQLAlchemy ORM model for the `reminders` table.
Manages persistent inventory reminders.
"""

from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pharmacy_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    medicine_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("medicines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reminder_type: Mapped[str] = mapped_column(String(50), nullable=False) # 'daily', 'weekly', 'custom', 'until_resolved'
    reminder_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    repeat_interval: Mapped[str | None] = mapped_column(String(100), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stop_condition: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationship linking back to Medicine
    medicine = relationship("Medicine", foreign_keys=[medicine_id])

    def __repr__(self) -> str:
        return f"<Reminder id={self.id} type={self.reminder_type} active={self.active}>"

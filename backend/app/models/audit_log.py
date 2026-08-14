"""
SQLAlchemy ORM model for the `audit_log` table.

Every write operation that touches a Medicine row should create one or more
AuditLog entries so there is a complete, tamper-evident history of every
change — who made it, what the old value was, and what the new value is.

Columns
-------
id              Primary key (auto-increment)
medicine_id     FK → medicines.id (SET NULL on delete so logs survive deletions)
action          Short action label: 'created' | 'quantity_updated' |
                'expiry_corrected' | 'deleted' | etc.
changed_by      Free-text identifier of the actor (username, system process, etc.)
old_value       JSON string representing the field/state before the change
new_value       JSON string representing the field/state after the change
timestamp       When the action occurred (UTC, auto-set)
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # FK — nullable so audit rows survive medicine deletions
    medicine_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("medicines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # JSON payloads stored as TEXT (compatible with both SQLite and Postgres)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    # Relationship (lazy-load by default)
    medicine: Mapped["Medicine"] = relationship(  # noqa: F821
        "Medicine", foreign_keys=[medicine_id]
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<AuditLog id={self.id} medicine_id={self.medicine_id}"
            f" action={self.action!r}>"
        )

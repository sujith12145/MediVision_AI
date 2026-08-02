"""
SQLAlchemy ORM model for the `decision_audit_log` table.
Stores decisions made by the owner/manager during voice/web assistant interactions.
"""

from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DecisionAuditLog(Base):
    __tablename__ = "decision_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    decided_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return f"<DecisionAuditLog id={self.id} decision={self.decision[:30]!r}>"

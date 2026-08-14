"""
SQLAlchemy ORM model for `voice_call_records` table.
Tracks completed conversations, durations, smart summaries, decisions, and extractions.
"""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class VoiceCallRecord(Base):
    __tablename__ = "voice_call_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    caller: Mapped[str] = mapped_column(String(255), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True
    )
    duration: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "1m 24s"
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    medicines: Mapped[str | None] = mapped_column(Text, nullable=True)
    actions: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignments: Mapped[str | None] = mapped_column(Text, nullable=True)
    supplier_followups: Mapped[str | None] = mapped_column(Text, nullable=True)
    reminder_created: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed")
    structured_extraction: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON representation

    def __repr__(self) -> str:
        return f"<VoiceCallRecord id={self.id} caller={self.caller!r} duration={self.duration!r}>"

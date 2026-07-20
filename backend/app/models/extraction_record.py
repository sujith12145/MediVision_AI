"""
SQLAlchemy ORM model for the `extraction_records` table.

Tracks every AI-based extraction attempt: the image that was uploaded, the
raw AI response, per-field confidence scores, the final agreed values, and
who confirmed them.

Columns
-------
id                  Primary key (auto-increment)
medicine_id         FK → medicines.id (nullable — record may exist before a
                    Medicine row is created/confirmed)
image_path          Relative path inside backend/uploads/
status              Lifecycle state:
                    'pending' | 'processing' | 'awaiting_confirmation' |
                    'extraction_failed' | 'done' | 'failed'
raw_ai_response     Full JSON blob returned by the AI/Vision model
confidence_scores   Per-field confidence floats as a JSON object,
                    e.g. {"name": 0.97, "expiry_date": 0.82}
final_values        Human-reviewed / finalised field values as JSON
confirmed_by        Free-text user identifier who approved the extraction
confirmed_at        Timestamp when the extraction was confirmed (nullable until
                    a human reviews it)
created_at          When the extraction was initiated (UTC, auto-set)
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Valid status values — enforced at the application layer
STATUS_PENDING                = "pending"
STATUS_PROCESSING             = "processing"
STATUS_AWAITING_CONFIRMATION  = "awaiting_confirmation"
STATUS_EXTRACTION_FAILED      = "extraction_failed"
STATUS_DONE                   = "done"
STATUS_FAILED                 = "failed"
VALID_STATUSES = {
    STATUS_PENDING,
    STATUS_PROCESSING,
    STATUS_AWAITING_CONFIRMATION,
    STATUS_EXTRACTION_FAILED,
    STATUS_DONE,
    STATUS_FAILED,
}


class ExtractionRecord(Base):
    __tablename__ = "extraction_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Nullable FK — the medicine row may not exist yet at extraction time
    medicine_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("medicines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    image_path: Mapped[str] = mapped_column(String(512), nullable=False)

    # Lifecycle status — starts as 'pending', AI pipeline updates it
    status: Mapped[str] = mapped_column(
        String(50),          # widened: 'awaiting_confirmation' = 22 chars
        nullable=False,
        default=STATUS_PENDING,
        server_default=STATUS_PENDING,
        index=True,
    )

    # JSON payloads stored as TEXT (cross-DB compatible)
    raw_ai_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_scores: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_values: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Human-review fields
    confirmed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    # Relationship
    medicine: Mapped["Medicine"] = relationship(  # noqa: F821
        "Medicine", foreign_keys=[medicine_id]
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ExtractionRecord id={self.id} status={self.status!r}"
            f" medicine_id={self.medicine_id}>"
        )

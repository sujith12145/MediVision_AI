"""Initial schema — medicines, audit_log, extraction_records

Revision ID: 001_initial_schema
Revises:     (none — this is the first migration)
Create Date: 2026-07-07

Tables created
--------------
medicines           Core medicine inventory
audit_log           Immutable history of every change to a medicine row
extraction_records  AI extraction attempt per uploaded image

Indexes
-------
ix_medicines_name           → medicines.name
ix_medicines_expiry_date    → medicines.expiry_date
ix_audit_log_medicine_id    → audit_log.medicine_id       (FK lookup)
ix_audit_log_action         → audit_log.action             (filter by type)
ix_audit_log_timestamp      → audit_log.timestamp          (time-range queries)
ix_extraction_medicine_id   → extraction_records.medicine_id
ix_extraction_created_at    → extraction_records.created_at
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ───────────────────────────────────────────────────
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Upgrade: create all tables ─────────────────────────────────────────────
def upgrade() -> None:
    # ── medicines ─────────────────────────────────────────────────────────
    op.create_table(
        "medicines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("strength", sa.String(length=100), nullable=True),
        sa.Column("manufacturer", sa.String(length=255), nullable=True),
        sa.Column("batch_number", sa.String(length=100), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("mrp", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reorder_threshold", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("storage_location", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_medicines"),
    )
    op.create_index("ix_medicines_name", "medicines", ["name"])
    op.create_index("ix_medicines_expiry_date", "medicines", ["expiry_date"])

    # ── audit_log ─────────────────────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("medicine_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("changed_by", sa.String(length=255), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["medicine_id"],
            ["medicines.id"],
            name="fk_audit_log_medicine_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
    )
    op.create_index("ix_audit_log_medicine_id", "audit_log", ["medicine_id"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])

    # ── extraction_records ────────────────────────────────────────────────
    op.create_table(
        "extraction_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("medicine_id", sa.Integer(), nullable=True),
        sa.Column("image_path", sa.String(length=512), nullable=False),
        sa.Column("raw_ai_response", sa.Text(), nullable=True),
        sa.Column("confidence_scores", sa.Text(), nullable=True),
        sa.Column("final_values", sa.Text(), nullable=True),
        sa.Column("confirmed_by", sa.String(length=255), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["medicine_id"],
            ["medicines.id"],
            name="fk_extraction_records_medicine_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_extraction_records"),
    )
    op.create_index(
        "ix_extraction_records_medicine_id", "extraction_records", ["medicine_id"]
    )
    op.create_index(
        "ix_extraction_records_created_at", "extraction_records", ["created_at"]
    )


# ── Downgrade: drop all tables in reverse dependency order ─────────────────
def downgrade() -> None:
    # Drop dependents first to avoid FK violations
    op.drop_index("ix_extraction_records_created_at", table_name="extraction_records")
    op.drop_index("ix_extraction_records_medicine_id", table_name="extraction_records")
    op.drop_table("extraction_records")

    op.drop_index("ix_audit_log_timestamp", table_name="audit_log")
    op.drop_index("ix_audit_log_action", table_name="audit_log")
    op.drop_index("ix_audit_log_medicine_id", table_name="audit_log")
    op.drop_table("audit_log")

    op.drop_index("ix_medicines_expiry_date", table_name="medicines")
    op.drop_index("ix_medicines_name", table_name="medicines")
    op.drop_table("medicines")

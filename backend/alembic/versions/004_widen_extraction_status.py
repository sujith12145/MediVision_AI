"""Widen extraction_records.status to VARCHAR(50)

Revision ID: 004_widen_extraction_status
Revises:     003_add_status_to_extraction_records
Create Date: 2026-07-07

'awaiting_confirmation' is 22 characters — the previous VARCHAR(20) is too
narrow.  Widening to 50 gives room for all current and future status values.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_widen_extraction_status"
down_revision: Union[str, None] = "003_add_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("extraction_records") as batch_op:
        batch_op.alter_column(
            "status",
            type_=sa.String(50),
            existing_type=sa.String(20),
            nullable=False,
            server_default="pending",
        )


def downgrade() -> None:
    with op.batch_alter_table("extraction_records") as batch_op:
        batch_op.alter_column(
            "status",
            type_=sa.String(20),
            existing_type=sa.String(50),
            nullable=False,
            server_default="pending",
        )

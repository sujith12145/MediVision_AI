"""Add status column to extraction_records

Revision ID: 003_add_status_to_extraction_records
Revises:     002_add_users_table
Create Date: 2026-07-07

Adds
----
extraction_records.status  VARCHAR(20) NOT NULL DEFAULT 'pending'
ix_extraction_records_status  index on status for pipeline queue queries
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_add_status"
down_revision: Union[str, None] = "002_add_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # render_as_batch=True in env.py handles SQLite's lack of native ALTER TABLE
    with op.batch_alter_table("extraction_records") as batch_op:
        batch_op.add_column(
            sa.Column(
                "status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            )
        )
        batch_op.create_index("ix_extraction_records_status", ["status"])


def downgrade() -> None:
    with op.batch_alter_table("extraction_records") as batch_op:
        batch_op.drop_index("ix_extraction_records_status")
        batch_op.drop_column("status")

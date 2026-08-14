"""add intake_status to medicines

Revision ID: a32f99d9cb11
Revises: 8e92f15951d8
Create Date: 2026-07-16 18:33:00

"""
from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = 'a32f99d9cb11'
down_revision: Union[str, None] = '8e92f15951d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('medicines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('intake_status', sa.String(length=50), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('medicines', schema=None) as batch_op:
        batch_op.drop_column('intake_status')

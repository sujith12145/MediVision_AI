"""add role to users

Revision ID: 8e92f15951d8
Revises: bbd74b9ba0fc
Create Date: 2026-07-15 12:30:00

"""
from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '8e92f15951d8'
down_revision: Union[str, None] = 'bbd74b9ba0fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role', sa.String(length=50), nullable=False, server_default='staff'))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('role')

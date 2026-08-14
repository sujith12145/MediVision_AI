"""add customer details to sales

Revision ID: c82f99d9cb22
Revises: a32f99d9cb11
Create Date: 2026-07-17 09:30:00

"""
from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = 'c82f99d9cb22'
down_revision: Union[str, None] = 'a32f99d9cb11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable customer_name and customer_phone columns to the sales table
    op.add_column('sales', sa.Column('customer_name', sa.String(length=255), nullable=True))
    op.add_column('sales', sa.Column('customer_phone', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('sales', 'customer_phone')
    op.drop_column('sales', 'customer_name')

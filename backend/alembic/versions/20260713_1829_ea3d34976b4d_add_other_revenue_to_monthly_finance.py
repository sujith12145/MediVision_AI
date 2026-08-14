"""Generic single-database configuration with an async dbapi."""
from alembic import op
from typing import Sequence, Union
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea3d34976b4d'
down_revision: Union[str, None] = '7305a2043528'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('monthly_finance', sa.Column('other_revenue', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.0'))


def downgrade() -> None:
    op.drop_column('monthly_finance', 'other_revenue')

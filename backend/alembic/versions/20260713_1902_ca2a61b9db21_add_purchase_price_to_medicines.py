"""Generic single-database configuration with an async dbapi."""
from alembic import op
from typing import Sequence, Union
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca2a61b9db21'
down_revision: Union[str, None] = 'ea3d34976b4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medicines",
        sa.Column(
            "purchase_price",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default="0.0",
        ),
    )


def downgrade() -> None:
    op.drop_column("medicines", "purchase_price")


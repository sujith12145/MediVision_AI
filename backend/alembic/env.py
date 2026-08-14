"""
Alembic environment script.

Key behaviours
--------------
1. DATABASE_URL is read from the environment (falls back to the SQLite dev DB).
2. All ORM models are imported so that `autogenerate` can diff them against
   the live DB.  Import order: Medicine first (no FKs), then dependents.
3. `render_as_batch=True` enables ALTER TABLE support on SQLite (which does
   not support ALTER natively).
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# ── Make the `app` package importable when running alembic from backend/ ───
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()


# ── Import Base *after* path is fixed, and import all models so their
#    metadata is registered on Base.metadata ──────────────────────────────
from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401  ← registers Medicine, AuditLog, ExtractionRecord

# ── Alembic Config object ─────────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url with the real DATABASE_URL from the environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./medivision_dev.db")
config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Offline migrations (generate SQL script without a live DB connection) ──
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite compatibility
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online migrations (connect to the real DB and apply changes) ───────────
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite compatibility
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

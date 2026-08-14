"""
Database session factory.
Prefers PostgreSQL (DATABASE_URL env var).
Falls back to SQLite for local development when DATABASE_URL is not set.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

# ---------------------------------------------------------------------------
# Connection URL — use Postgres in production, SQLite locally
# ---------------------------------------------------------------------------
DATABASE_URL: str = settings.DATABASE_URL

# SQLite requires the "check_same_thread" flag; ignore it for other engines
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
def get_db():
    """Yield a database session and ensure it is closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

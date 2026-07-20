"""
SQLAlchemy ORM model for the `users` table.

Single-role, single user for now — no RBAC.
Passwords are stored as bcrypt hashes; plaintext is never persisted.

Columns
-------
id              Primary key (auto-increment)
username        Unique login name (indexed for fast lookup)
hashed_password bcrypt hash of the password — never plaintext
is_active       Soft-disable a user without deleting the row
created_at      Row creation timestamp (UTC, auto-set)
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(150), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="staff")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} username={self.username!r}>"

"""
SQLAlchemy ORM model for the `monthly_finance` table.

Tracks monthly operational costs (rent, utilities, salaries, other) and revenue
to calculate metrics (total cost, net profit, ROI) for the business dashboard.
"""

from datetime import datetime
from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MonthlyFinance(Base):
    __tablename__ = "monthly_finance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Month identifier formatted as YYYY-MM (e.g. 2026-07)
    month: Mapped[str] = mapped_column(String(7), nullable=False, unique=True, index=True)

    # Manually entered cost metrics (all non-negative)
    rent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    electricity_and_bills: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    staff_salaries: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    other_expenses: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)

    # Manually entered total sales/revenue for the month
    total_revenue: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)

    # Manually entered other revenue for any sales not recorded in billing
    other_revenue: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MonthlyFinance id={self.id} month={self.month!r} revenue={self.total_revenue}>"

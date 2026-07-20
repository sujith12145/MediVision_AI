"""
models/__init__.py

Re-exports all ORM models so Alembic's env.py (and any code that does
`from app.models import *`) sees the full metadata graph in one import.

Import order matters — independent tables first, then tables with FKs.
"""

from app.models.user import User
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.models.extraction_record import ExtractionRecord
from app.models.monthly_finance import MonthlyFinance
from app.models.sale import Sale
from app.models.sale_item import SaleItem

__all__ = [
    "User",
    "Medicine",
    "AuditLog",
    "ExtractionRecord",
    "MonthlyFinance",
    "Sale",
    "SaleItem",
]

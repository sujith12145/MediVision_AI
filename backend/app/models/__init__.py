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
from app.models.decision_audit_log import DecisionAuditLog
from app.models.staff_task import StaffTask
from app.models.reminder import Reminder
from app.models.storage_location import StorageLocation
from app.models.medicine_location import MedicineLocation
from app.models.voice_call_record import VoiceCallRecord
from app.models.purchase_order import PurchaseOrder

__all__ = [
    "User",
    "Medicine",
    "AuditLog",
    "ExtractionRecord",
    "MonthlyFinance",
    "Sale",
    "SaleItem",
    "DecisionAuditLog",
    "StaffTask",
    "Reminder",
    "StorageLocation",
    "MedicineLocation",
    "VoiceCallRecord",
    "PurchaseOrder",
]

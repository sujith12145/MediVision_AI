"""
Secure query service layer for the AI assistant.
Contains a small, fixed set of parameterized query functions.
Direct raw SQL execution or generic SQL parameters are strictly prohibited.
"""

from datetime import date, timedelta
from sqlalchemy.orm import Session
from app.models.medicine import Medicine


def get_medicines_expiring_within(db: Session, days: int) -> list[Medicine]:
    """
    Get medicines expiring within a given number of days.
    
    Safe Parameterized SQL Compiled Under the Hood:
    SELECT * FROM medicines WHERE expiry_date >= :today AND expiry_date <= :target_date;
    """
    # Coerce parameters to guarantee strict type safety
    days_int = int(days)
    today = date.today()
    target_date = today + timedelta(days=days_int)
    
    return (
        db.query(Medicine)
        .filter(Medicine.expiry_date >= today, Medicine.expiry_date <= target_date)
        .order_by(Medicine.expiry_date.asc())
        .all()
    )


def get_medicines_below_stock_threshold(db: Session) -> list[Medicine]:
    """
    Get medicines where quantity is below or equal to reorder_threshold.
    
    Safe Parameterized SQL Compiled Under the Hood:
    SELECT * FROM medicines WHERE quantity <= reorder_threshold;
    """
    return (
        db.query(Medicine)
        .filter(Medicine.quantity <= Medicine.reorder_threshold)
        .all()
    )


def get_medicines_by_manufacturer(db: Session, name: str) -> list[Medicine]:
    """
    Get medicines by manufacturer (fuzzy match, case-insensitive).
    
    Safe Parameterized SQL Compiled Under the Hood:
    SELECT * FROM medicines WHERE manufacturer ILIKE :name;
    """
    # Force string parameterization and strip whitespace
    search_term = str(name).strip()
    return (
        db.query(Medicine)
        .filter(Medicine.manufacturer.ilike(f"%{search_term}%"))
        .all()
    )


def get_inventory_value_above(db: Session, amount: float) -> list[Medicine]:
    """
    Get medicines where the total inventory value (quantity * MRP) exceeds the threshold.
    
    Safe Parameterized SQL Compiled Under the Hood:
    SELECT * FROM medicines WHERE (quantity * mrp) > :amount;
    """
    # Coerce parameter to guarantee strict type safety
    amount_val = float(amount)
    return (
        db.query(Medicine)
        .filter((Medicine.quantity * Medicine.mrp) > amount_val)
        .all()
    )


def get_medicines_expiring_soonest(db: Session, limit: int) -> list[Medicine]:
    """
    Get medicines expiring soonest (excluding items with no expiry date).
    
    Safe Parameterized SQL Compiled Under the Hood:
    SELECT * FROM medicines WHERE expiry_date IS NOT NULL ORDER BY expiry_date ASC LIMIT :limit;
    """
    # Coerce parameter to guarantee strict type safety
    limit_val = int(limit)
    return (
        db.query(Medicine)
        .filter(Medicine.expiry_date.isnot(None))
        .order_by(Medicine.expiry_date.asc())
        .limit(limit_val)
        .all()
    )

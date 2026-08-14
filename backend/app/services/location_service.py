"""
Location resolution service.

Core logic for deciding where incoming medicine stock should be stored:

1. If the medicine already has a slot with enough remaining capacity
   → auto-assign (system), return immediately.
2. If the medicine has a slot but it's full, or the medicine is brand-new
   → suggest 2-3 candidate empty/matching slots for a human to choose.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from app.models.medicine_location import MedicineLocation
from app.models.storage_location import StorageLocation

logger = logging.getLogger(__name__)


@dataclass
class CandidateSlot:
    """A storage slot offered as a candidate for human selection."""
    location_id: int
    rack_name: str
    row: int
    column: int
    capacity: int
    current_occupancy: int
    available: int
    storage_type: str

    def to_dict(self) -> dict:
        return {
            "location_id": self.location_id,
            "rack_name": self.rack_name,
            "row": self.row,
            "column": self.column,
            "capacity": self.capacity,
            "current_occupancy": self.current_occupancy,
            "available": self.available,
            "storage_type": self.storage_type,
            "label": f"{self.rack_name}, Row {self.row}, Column {self.column}",
        }


@dataclass
class LocationResolution:
    """Result of resolve_location()."""
    auto_assigned: bool
    assigned_location: dict | None = None
    candidates: list[dict] | None = None
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "auto_assigned": self.auto_assigned,
            "assigned_location": self.assigned_location,
            "candidates": self.candidates,
            "message": self.message,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_slot_occupancy(db: Session, location_id: int) -> int:
    """Return the total quantity of all medicines stored in a given slot."""
    result = (
        db.query(sqlfunc.coalesce(sqlfunc.sum(MedicineLocation.quantity), 0))
        .filter(MedicineLocation.location_id == location_id)
        .scalar()
    )
    return int(result)


def _build_candidate(loc: StorageLocation, occupancy: int) -> CandidateSlot:
    return CandidateSlot(
        location_id=loc.id,
        rack_name=loc.rack_name,
        row=loc.row,
        column=loc.column,
        capacity=loc.capacity,
        current_occupancy=occupancy,
        available=loc.capacity - occupancy,
        storage_type=loc.storage_type,
    )


# ---------------------------------------------------------------------------
# Main resolver
# ---------------------------------------------------------------------------

def resolve_location(
    db: Session,
    medicine_id: int,
    quantity: int,
) -> LocationResolution:
    """
    Decide where to store *quantity* units of *medicine_id*.

    Returns a LocationResolution with either an auto-assignment or
    a list of candidate slots for human selection.
    """

    # ── 1. Check existing assignments for this medicine ────────────────────
    existing_assignments = (
        db.query(MedicineLocation)
        .filter(MedicineLocation.medicine_id == medicine_id)
        .all()
    )

    for ml in existing_assignments:
        loc = ml.location
        if loc is None or not loc.is_active:
            continue

        occupancy = get_slot_occupancy(db, loc.id)
        available = loc.capacity - occupancy

        if available >= quantity:
            # Auto-assign: enough space in the same slot
            ml.quantity += quantity
            ml.assigned_at = datetime.now(timezone.utc)
            db.flush()

            label = f"{loc.rack_name}, Row {loc.row}, Column {loc.column}"
            logger.info(
                "Auto-assigned %d units of medicine_id=%d to location %s",
                quantity, medicine_id, label,
            )
            return LocationResolution(
                auto_assigned=True,
                assigned_location={
                    "location_id": loc.id,
                    "rack_name": loc.rack_name,
                    "row": loc.row,
                    "column": loc.column,
                    "label": label,
                },
                message=f"Store in {label} — same as existing stock.",
            )

    # ── 2. No auto-assign possible — find candidate slots ──────────────────
    # Prefer slots on the same rack as existing stock (if any)
    existing_rack_names = {
        ml.location.rack_name
        for ml in existing_assignments
        if ml.location and ml.location.is_active
    }

    all_active_slots = (
        db.query(StorageLocation)
        .filter(StorageLocation.is_active == True)  # noqa: E712
        .all()
    )

    # Build candidates with occupancy info, filtering to slots that can fit
    candidates: list[CandidateSlot] = []
    for loc in all_active_slots:
        occupancy = get_slot_occupancy(db, loc.id)
        available = loc.capacity - occupancy
        if available >= quantity:
            candidates.append(_build_candidate(loc, occupancy))

    if not candidates:
        # Fallback: offer slots with any available space at all
        for loc in all_active_slots:
            occupancy = get_slot_occupancy(db, loc.id)
            if occupancy < loc.capacity:
                candidates.append(_build_candidate(loc, occupancy))

    # Sort: same-rack first, then by most available space
    def sort_key(c: CandidateSlot) -> tuple:
        same_rack = 0 if c.rack_name in existing_rack_names else 1
        return (same_rack, -c.available)

    candidates.sort(key=sort_key)

    # Return top 3 candidates
    top = candidates[:3]

    if not top:
        return LocationResolution(
            auto_assigned=False,
            candidates=[],
            message="No storage slots with available capacity. Please add new storage locations.",
        )

    return LocationResolution(
        auto_assigned=False,
        candidates=[c.to_dict() for c in top],
        message="Please select a storage location for this medicine.",
    )

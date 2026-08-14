"""
voice_service.py — Service layer for voice assistant database queries, decision evaluations, and persistent reminders.
"""

import json
import logging
from datetime import date, datetime, timedelta
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.models.medicine import Medicine
from app.models.decision_audit_log import DecisionAuditLog
from app.models.staff_task import StaffTask
from app.models.reminder import Reminder
from app.models.audit_log import AuditLog
from app.models.voice_call_record import VoiceCallRecord

logger = logging.getLogger(__name__)


def get_low_stock(db: Session) -> list[Medicine]:
    """
    Get medicines where quantity is below or equal to reorder_threshold.
    """
    return (
        db.query(Medicine)
        .filter(Medicine.quantity <= Medicine.reorder_threshold)
        .order_by(Medicine.quantity.asc())
        .all()
    )


def get_expiring_medicines(db: Session, days: int = 30) -> list[Medicine]:
    """
    Get medicines expiring within a given number of days.
    """
    today = date.today()
    target_date = today + timedelta(days=days)
    return (
        db.query(Medicine)
        .filter(Medicine.expiry_date >= today, Medicine.expiry_date <= target_date)
        .order_by(Medicine.expiry_date.asc())
        .all()
    )


def get_inventory_summary(db: Session) -> dict:
    """
    Get general summary stats of the pharmacy inventory.
    """
    total_items = db.query(func.sum(Medicine.quantity)).scalar() or 0

    total_val_res = db.query(func.sum(Medicine.quantity * Medicine.mrp)).scalar()
    total_value = float(total_val_res) if total_val_res is not None else 0.0

    low_stock_count = db.query(Medicine).filter(Medicine.quantity <= Medicine.reorder_threshold).count()

    today = date.today()
    near_expiry_threshold = today + timedelta(days=30)
    expiring_count = db.query(Medicine).filter(Medicine.expiry_date >= today, Medicine.expiry_date <= near_expiry_threshold).count()

    return {
        "total_items": int(total_items),
        "total_value": total_value,
        "low_stock_count": low_stock_count,
        "expiring_count": expiring_count
    }


def record_owner_decision(
    db: Session,
    alert_id: str | None,
    decision: str,
    decided_by: str | None = None,
    channel: str | None = "voice"
) -> DecisionAuditLog:
    """
    Record an owner's action decision regarding an alert.
    """
    log = DecisionAuditLog(
        alert_id=alert_id,
        decision=decision,
        decided_by=decided_by or "Owner",
        channel=channel
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def dispatch_task(
    db: Session,
    assigned_to: str | None,
    message: str,
    related_medicine_id: int | None = None
) -> StaffTask:
    """
    Dispatch a task assignment to a staff member.
    """
    task = StaffTask(
        assigned_to=assigned_to,
        message=message,
        related_medicine_id=related_medicine_id,
        status="pending"
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def check_medicine_status(db: Session, medicine_id: int) -> tuple[bool, str]:
    """
    Decision Engine: Evaluates if a medicine is still in an unresolved warning state.
    Returns (is_unresolved, reason_phrase).
    """
    medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not medicine:
        return False, "removed"

    # Check if a pending staff task to order this medicine already exists
    pending_reorder_task = (
        db.query(StaffTask)
        .filter(
            StaffTask.related_medicine_id == medicine_id,
            StaffTask.status == "pending",
            StaffTask.message.ilike("%order%")
        )
        .first()
    )
    if pending_reorder_task:
        return False, "reordered"

    # Critical & stock level evaluation
    today = date.today()
    if medicine.expiry_date:
        days_to_expiry = (medicine.expiry_date - today).days
        if days_to_expiry < 0:
            return True, f"expired ({abs(days_to_expiry)} days ago)"
        elif days_to_expiry <= 7:
            return True, f"expires critically in {days_to_expiry} days"
        elif days_to_expiry <= 30:
            return True, f"expires soon in {days_to_expiry} days"

    if medicine.quantity == 0:
        return True, "completely out of stock (0 units remaining)"
    elif medicine.quantity <= medicine.reorder_threshold:
        return True, f"below the reorder level ({medicine.quantity} units remaining)"

    return False, "resolved"


def create_inventory_reminder(
    db: Session,
    medicine_id: int | None,
    reminder_type: str,
    reminder_time_val: datetime | str,
    repeat_interval: str | None = None,
    pharmacy_id: str | None = None,
    stop_condition: str | None = None,
    title: str | None = None
) -> Reminder:
    """
    Creates a new reminder in PostgreSQL, enforcing no duplicates for the same medicine.
    Registers the job with APScheduler.
    """
    # Prevent duplicate active reminders for the same medicine
    if medicine_id is not None:
        existing = (
            db.query(Reminder)
            .filter(Reminder.medicine_id == medicine_id, Reminder.active == True)
            .first()
        )
        if existing:
            logger.info(f"Active reminder already exists for medicine_id {medicine_id}. Skipping duplicate.")
            return existing

    if isinstance(reminder_time_val, str):
        try:
            reminder_time = datetime.fromisoformat(reminder_time_val.replace("Z", "+00:00"))
        except Exception:
            reminder_time = datetime.now() + timedelta(hours=1)
    else:
        reminder_time = reminder_time_val

    medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first() if medicine_id is not None else None
    med_name = medicine.name if medicine else (f"Medicine #{medicine_id}" if medicine_id else "General Alert")
    
    if not title:
        title = f"Alert reminder for {med_name}"

    reminder = Reminder(
        pharmacy_id=pharmacy_id or "PHARM-MAIN",
        medicine_id=medicine_id,
        reminder_type=reminder_type,
        reminder_time=reminder_time,
        repeat_interval=repeat_interval,
        active=True,
        stop_condition=stop_condition,
        title=title,
        created_at=datetime.now()
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)

    try:
        from app.voice.scheduler import add_reminder_job
        add_reminder_job(reminder)
    except Exception as e:
        logger.error(f"Error registering reminder {reminder.id} job with APScheduler: {e}")

    return reminder


def create_reminder(
    db: Session,
    title: str,
    reminder_at_str: str,
    related_medicine_id: int | None = None,
    is_recurring: bool = False,
    recurrence_pattern: str | None = None
) -> Reminder:
    """
    Backward-compatible fallback mapping helper.
    """
    reminder_type = "daily" if is_recurring else "custom"
    return create_inventory_reminder(
        db=db,
        medicine_id=related_medicine_id,
        reminder_type=reminder_type,
        reminder_time_val=reminder_at_str,
        repeat_interval=recurrence_pattern,
        title=title
    )


def cancel_reminder(db: Session, reminder_id: int) -> bool:
    """
    Cancel (mark completed) an existing reminder by ID and remove from scheduler.
    """
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if reminder:
        reminder.active = False
        reminder.resolved_at = datetime.now()
        db.commit()

        # Remove from APScheduler
        try:
            from app.voice.scheduler import remove_reminder_job
            remove_reminder_job(reminder_id)
        except Exception as e:
            logger.error(f"Error removing job for cancelled reminder {reminder_id}: {e}")
        return True
    return False


def get_pending_reminders(db: Session) -> list[Reminder]:
    """
    Get all active reminders.
    """
    return (
        db.query(Reminder)
        .filter(Reminder.active == True)
        .order_by(Reminder.reminder_time.asc())
        .all()
    )


def auto_resolve_medicine_issues(db: Session, medicine_id: int) -> bool:
    """
    After inventory changes, check if the medicine's issues (low stock / expiry) are now resolved.
    If so:
      - Cancel all active reminders linked to this medicine
      - Mark any pending reorder tasks as completed
      - Write an audit log entry
      - Return True if any resolution occurred, False otherwise.
    """
    is_unresolved, reason = check_medicine_status(db, medicine_id)
    if is_unresolved:
        return False

    resolved_any = False

    # Auto-cancel active reminders for this medicine
    active_reminders = (
        db.query(Reminder)
        .filter(Reminder.medicine_id == medicine_id, Reminder.active == True)
        .all()
    )
    for reminder in active_reminders:
        reminder.active = False
        reminder.resolved_at = datetime.now()
        try:
            from app.voice.scheduler import remove_reminder_job
            remove_reminder_job(reminder.id)
        except Exception as e:
            logger.warning(f"Could not remove scheduler job for reminder {reminder.id}: {e}")
        resolved_any = True
        logger.info(f"Auto-resolved reminder {reminder.id} for medicine_id {medicine_id}: {reason}")

    # Auto-complete pending reorder tasks for this medicine
    pending_tasks = (
        db.query(StaffTask)
        .filter(
            StaffTask.related_medicine_id == medicine_id,
            StaffTask.status == "pending",
        )
        .all()
    )
    for task in pending_tasks:
        task.status = "completed"
        resolved_any = True
        logger.info(f"Auto-completed task {task.id} for medicine_id {medicine_id}: {reason}")

    if resolved_any:
        audit = AuditLog(
            medicine_id=medicine_id,
            action="auto_resolved",
            changed_by="system",
            new_value=f"Auto-resolved reminders and tasks for medicine_id={medicine_id} because status is '{reason}'.",
        )
        db.add(audit)
        db.commit()

        # Broadcast resolution event to all WebSocket notification clients
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                from app.voice.scheduler import broadcast_notification
                asyncio.ensure_future(broadcast_notification({
                    "type": "reminder_resolved",
                    "medicine_id": medicine_id,
                    "message": f"Medicine issues resolved automatically: {reason}.",
                }))
        except Exception as e:
            logger.warning(f"Could not broadcast auto-resolve event: {e}")

    return resolved_any


def create_voice_call_record(
    db: Session,
    caller: str,
    duration: str,
    transcript: str,
    medicines: list[str] | None = None,
    actions: list[str] | None = None,
    assignments: list[str] | None = None,
    supplier_followups: list[str] | None = None,
    reminder_created: str | None = None,
    structured_extraction: dict | None = None,
) -> VoiceCallRecord:
    """
    Persist a completed voice call summary to the database.
    """
    record = VoiceCallRecord(
        caller=caller,
        duration=duration,
        transcript=transcript.strip()[:10000],  # sanitize and cap
        medicines=json.dumps(medicines or []),
        actions=json.dumps(actions or []),
        assignments=json.dumps(assignments or []),
        supplier_followups=json.dumps(supplier_followups or []),
        reminder_created=reminder_created,
        status="completed",
        structured_extraction=json.dumps(structured_extraction or {}),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_voice_calls(db: Session, limit: int = 30) -> list[VoiceCallRecord]:
    """
    Retrieve the latest voice call records.
    """
    return (
        db.query(VoiceCallRecord)
        .order_by(VoiceCallRecord.timestamp.desc())
        .limit(limit)
        .all()
    )


def update_voice_call_structured_extraction(
    db: Session,
    call_id: int,
    structured_extraction: dict,
) -> VoiceCallRecord | None:
    """
    Update the structured extraction payload for a call record after user edits.
    """
    record = db.query(VoiceCallRecord).filter(VoiceCallRecord.id == call_id).first()
    if not record:
        return None
    record.structured_extraction = json.dumps(structured_extraction)
    db.commit()
    db.refresh(record)
    return record


def get_dashboard_summary(db: Session) -> dict:
    """
    Compute aggregate statistics for the AI Operations Dashboard.
    """
    total_calls = db.query(VoiceCallRecord).count()
    reminders_active = db.query(Reminder).filter(Reminder.active == True).count()
    reminders_resolved = db.query(Reminder).filter(Reminder.active == False).count()
    tasks_pending = db.query(StaffTask).filter(StaffTask.status == "pending").count()
    tasks_completed = db.query(StaffTask).filter(StaffTask.status == "completed").count()

    today = date.today()
    near_expiry = today + timedelta(days=30)
    low_stock_count = db.query(Medicine).filter(Medicine.quantity <= Medicine.reorder_threshold).count()
    expiry_alert_count = db.query(Medicine).filter(
        Medicine.expiry_date >= today,
        Medicine.expiry_date <= near_expiry
    ).count()

    return {
        "total_calls": total_calls,
        "reminders_active": reminders_active,
        "reminders_resolved": reminders_resolved,
        "tasks_pending": tasks_pending,
        "tasks_completed": tasks_completed,
        "low_stock_alerts": low_stock_count,
        "expiry_alerts": expiry_alert_count,
    }


def snooze_reminder(db: Session, reminder_id: int, snooze_minutes: int = 30) -> Reminder | None:
    """
    Delay a reminder by snooze_minutes. Updates the DB and reschedules the APScheduler job.
    """
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.active == True).first()
    if not reminder:
        return None

    reminder.reminder_time = reminder.reminder_time + timedelta(minutes=snooze_minutes)
    db.commit()
    db.refresh(reminder)

    try:
        from app.voice.scheduler import add_reminder_job
        add_reminder_job(reminder)
    except Exception as e:
        logger.warning(f"Could not reschedule snoozed reminder {reminder_id}: {e}")

    return reminder

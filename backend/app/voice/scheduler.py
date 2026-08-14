"""
scheduler.py — APScheduler configuration and event broadcast mapping for persistent AI reminders.
"""

import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from app.database import SessionLocal

logger = logging.getLogger(__name__)

# Global singleton scheduler
scheduler = AsyncIOScheduler()

# Active voice sessions mapping: session_id -> { "worker": PipelineWorker, "context": LLMContext }
active_voice_sessions = {}

# Active notifications browser WebSocket connections
active_notification_connections = set()


async def broadcast_notification(event_data: dict):
    """
    Broadcasts real-time events to all active dashboard notification WebSocket clients.
    """
    import json
    for ws in list(active_notification_connections):
        try:
            await ws.send_json(event_data)
        except Exception as e:
            logger.warning(f"Failed to send JSON notification to browser: {e}")
            active_notification_connections.discard(ws)


async def run_reminder_job(reminder_id: int, title: str):
    """
    Fires when a scheduled reminder is due.
    Evaluates DB stock status, auto-resolves if cleared, or triggers vocal reminders
    with dynamic stock intelligence (velocity + days-to-stockout) in browser.
    """
    logger.info(f"Executing scheduled check for reminder {reminder_id}: '{title}'")
    db = SessionLocal()
    try:
        from app.models.reminder import Reminder
        from app.models.audit_log import AuditLog
        from app.models.medicine import Medicine
        from app.services.voice_service import check_medicine_status, cancel_reminder

        reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
        if not reminder or not reminder.active:
            logger.info(f"Reminder {reminder_id} is no longer active or exists. Skipping.")
            return

        is_unresolved, reason = check_medicine_status(db, reminder.medicine_id)

        if not is_unresolved:
            # Automatic stop condition met — deactivate the reminder
            cancel_reminder(db, reminder.id)

            audit = AuditLog(
                action="reminder_auto_resolved",
                changed_by="scheduler",
                new_value=f"Reminder auto-stopped for medicine ID {reminder.medicine_id} because state is '{reason}'."
            )
            db.add(audit)
            db.commit()
            logger.info(f"Auto-resolved reminder {reminder_id}: {reason}")

            await broadcast_notification({
                "type": "reminder_resolved",
                "reminder_id": reminder.id,
                "message": f"Reminder resolved because medicine is {reason}."
            })
            return

        # Problem still exists — update last_reminded_at
        reminder.last_reminded_at = datetime.now()
        db.commit()

        medicine = db.query(Medicine).filter(Medicine.id == reminder.medicine_id).first()
        med_name = medicine.name if medicine else "Medicine"

        # ── Dynamic Reminder Intelligence ─────────────────────────────────────
        # Compute average daily outflow velocity from the last 14 days of AuditLog
        velocity_context = ""
        days_to_stockout_str = ""
        if medicine:
            try:
                cutoff = datetime.now() - timedelta(days=14)
                recent_logs = (
                    db.query(AuditLog)
                    .filter(
                        AuditLog.medicine_id == medicine.id,
                        AuditLog.action.in_(["quantity_updated", "sold", "dispensed"]),
                        AuditLog.created_at >= cutoff,
                    )
                    .all()
                )

                # Sum all outflows (old_value > new_value = stock was reduced)
                total_outflow = 0
                for log in recent_logs:
                    try:
                        old_q = int(log.old_value or 0)
                        new_q = int(log.new_value or 0)
                        if old_q > new_q:
                            total_outflow += (old_q - new_q)
                    except (ValueError, TypeError):
                        pass

                if total_outflow > 0:
                    daily_velocity = total_outflow / 14.0  # avg units/day over 2 weeks
                    if daily_velocity > 0 and medicine.quantity > 0:
                        days_to_stockout = int(medicine.quantity / daily_velocity)
                        if days_to_stockout <= 1:
                            days_to_stockout_str = "stockout imminent (less than 1 day remaining)"
                        elif days_to_stockout <= 7:
                            days_to_stockout_str = f"stockout in approximately {days_to_stockout} day{'s' if days_to_stockout != 1 else ''}"
                        else:
                            days_to_stockout_str = f"approximately {days_to_stockout} days of stock remaining"
                        velocity_context = f" At current sales velocity of {daily_velocity:.1f} units/day, {days_to_stockout_str}."
            except Exception as ve:
                logger.warning(f"Could not compute stock velocity for reminder {reminder_id}: {ve}")
        # ─────────────────────────────────────────────────────────────────────

        # Construct conversational notification message with dynamic context
        qty_info = f" ({medicine.quantity} units on hand)" if medicine else ""
        if "expiry" in reason or "expired" in reason:
            alert_text = (
                f"{med_name} still {reason}.{velocity_context} Would you like to take action now?"
            )
        else:
            alert_text = (
                f"{med_name} is still {reason}{qty_info}.{velocity_context} Would you like to reorder it now?"
            )

        # If a voice session is active, inject the speech alert immediately
        from pipecat.frames.frames import LLMRunFrame
        session_triggered = False

        for session_id, session_data in list(active_voice_sessions.items()):
            worker = session_data.get("worker")
            context = session_data.get("context")
            if worker and context:
                logger.info(f"Injecting voice alert directly into active WebRTC session {session_id}")
                context.add_message({
                    "role": "developer",
                    "content": f"Attention: speak this reminder to the owner immediately: '{alert_text}'."
                })
                await worker.queue_frames([LLMRunFrame()])
                session_triggered = True

        # If no voice session is currently open, notify browser to prompt the user
        if not session_triggered:
            logger.info(f"Broadcasting browser alert event for reminder {reminder_id}.")
            await broadcast_notification({
                "type": "trigger_reminder",
                "text": alert_text,
                "reminder_id": reminder.id,
                "medicine_name": med_name,
                "days_to_stockout": days_to_stockout_str or None,
            })

    except Exception as e:
        logger.error(f"Error executing scheduled reminder check {reminder_id}: {e}", exc_info=True)
    finally:
        db.close()



def add_reminder_job(reminder):
    """
    Registers or updates an active APScheduler job based on the reminder schema.
    """
    job_id = f"reminder_{reminder.id}"
    
    # Remove existing job with the same ID
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not reminder.active:
        return

    hour = reminder.reminder_time.hour
    minute = reminder.reminder_time.minute

    if reminder.reminder_type == "daily":
        scheduler.add_job(
            run_reminder_job,
            "cron",
            hour=hour,
            minute=minute,
            args=[reminder.id, reminder.title],
            id=job_id
        )
        logger.info(f"Registered daily cron job {job_id} at {hour:02d}:{minute:02d}")
        
    elif reminder.reminder_type == "weekly":
        weekday = reminder.reminder_time.weekday() # 0 = Monday, 6 = Sunday
        scheduler.add_job(
            run_reminder_job,
            "cron",
            day_of_week=weekday,
            hour=hour,
            minute=minute,
            args=[reminder.id, reminder.title],
            id=job_id
        )
        logger.info(f"Registered weekly cron job {job_id} on weekday {weekday} at {hour:02d}:{minute:02d}")
        
    elif reminder.reminder_type == "until_resolved":
        # Checks every 10 minutes by default unless specified
        minutes_interval = 10
        if reminder.repeat_interval == "every_hour":
            minutes_interval = 60
        elif reminder.repeat_interval == "every_day":
            minutes_interval = 1440

        scheduler.add_job(
            run_reminder_job,
            "interval",
            minutes=minutes_interval,
            args=[reminder.id, reminder.title],
            id=job_id
        )
        logger.info(f"Registered persistent interval check {job_id} every {minutes_interval} minutes.")
        
    else:
        # Default to single date-based job
        run_date = reminder.reminder_time
        scheduler.add_job(
            run_reminder_job,
            "date",
            run_date=run_date,
            args=[reminder.id, reminder.title],
            id=job_id
        )
        logger.info(f"Registered date job {job_id} at {run_date}")


def remove_reminder_job(reminder_id: int):
    """
    Cancels and removes the active job from the scheduler queue.
    """
    job_id = f"reminder_{reminder_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Removed active scheduled job {job_id}")


def load_all_pending_reminders():
    """
    Restores all active database reminders to the scheduler queue.
    """
    db = SessionLocal()
    try:
        from app.models.reminder import Reminder
        pending = db.query(Reminder).filter(Reminder.active == True).all()
        logger.info(f"Loading {len(pending)} active reminders from DB into scheduler.")
        
        now = datetime.now()
        for r in pending:
            # Missed past one-shot reminders are triggered in 5 seconds
            if r.reminder_type not in ["daily", "weekly", "until_resolved"] and r.reminder_time.replace(tzinfo=None) < now:
                run_date = datetime.now() + timedelta(seconds=5)
                scheduler.add_job(
                    run_reminder_job,
                    "date",
                    run_date=run_date,
                    args=[r.id, r.title],
                    id=f"reminder_{r.id}"
                )
                logger.info(f"Scheduled missed past reminder {r.id} for trigger in 5s.")
            else:
                add_reminder_job(r)
    except Exception as e:
        logger.error(f"Failed to load pending reminders on startup: {e}", exc_info=True)
    finally:
        db.close()

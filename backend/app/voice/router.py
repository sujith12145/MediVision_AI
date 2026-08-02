"""
router.py — FastAPI router for Pipecat Voice Assistant operations with notification endpoints, retries, and strict schema tools.
"""

import logging
import asyncio
import time
from typing import Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.services.auth_service import decode_access_token
from app.services import voice_service
from app.dependencies import get_current_user, SupabaseUser

# Pipecat imports
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.serializers.protobuf import ProtobufFrameSerializer
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.workers.runner import WorkerRunner
from pipecat.services.llm_service import FunctionCallParams

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


def run_with_retry(func, *args, **kwargs):
    """
    Retries database reads/writes in case of transient remote database connectivity lag.
    """
    retries = 3
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if i == retries - 1:
                raise e
            logger.warning(f"Database query failed, retrying ({i+1}/{retries}). Error: {e}")
            time.sleep(0.5)


@router.get("/health")
async def voice_health():
    """
    Detailed health check for the voice operations module.
    """
    db = None
    db_ok = False
    try:
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.error(f"Voice router health check db error: {e}")
    finally:
        if db is not None:
            db.close()

    from app.voice.scheduler import active_voice_sessions, scheduler
    return {
        "status": "ok" if db_ok else "unhealthy",
        "database_connected": db_ok,
        "scheduler_running": scheduler.running,
        "active_voice_sessions_count": len(active_voice_sessions)
    }


@router.get("/reminders")
async def get_reminders(current_user: SupabaseUser = Depends(get_current_user)):
    """
    HTTP GET endpoint for retrieving all active pending reminders.
    """
    db = SessionLocal()
    try:
        reminders = voice_service.get_pending_reminders(db)
        return [
            {
                "id": r.id,
                "title": r.title,
                "reminder_time": r.reminder_time.isoformat() if r.reminder_time else None,
                "reminder_type": r.reminder_type,
                "repeat_interval": r.repeat_interval,
                "medicine_id": r.medicine_id,
                "active": r.active,
                "last_reminded_at": r.last_reminded_at.isoformat() if r.last_reminded_at else None,
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None
            }
            for r in reminders
        ]
    finally:
        db.close()


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: int, current_user: SupabaseUser = Depends(get_current_user)):
    """
    HTTP DELETE endpoint to cancel a reminder.
    """
    db = SessionLocal()
    try:
        success = voice_service.cancel_reminder(db, reminder_id)
        if success:
            return {"status": "success"}
        return {"status": "error", "message": "Reminder not found or already cancelled"}
    finally:
        db.close()


@router.post("/reminders/{reminder_id}/snooze")
async def snooze_reminder(reminder_id: int, minutes: int = 30, current_user: SupabaseUser = Depends(get_current_user)):
    """
    Snooze a reminder by N minutes (default 30).
    """
    db = SessionLocal()
    try:
        updated = voice_service.snooze_reminder(db, reminder_id, snooze_minutes=minutes)
        if updated:
            return {
                "status": "snoozed",
                "reminder_id": updated.id,
                "new_reminder_time": updated.reminder_time.isoformat(),
                "snooze_minutes": minutes
            }
        return {"status": "error", "message": "Reminder not found or already inactive"}
    finally:
        db.close()


@router.post("/reminders/{reminder_id}/resolve")
async def resolve_reminder(reminder_id: int, current_user: SupabaseUser = Depends(get_current_user)):
    """
    Manually mark a reminder as resolved (owner confirms the issue is handled).
    """
    db = SessionLocal()
    try:
        success = voice_service.cancel_reminder(db, reminder_id)
        if success:
            from app.voice.scheduler import broadcast_notification
            await broadcast_notification({
                "type": "reminder_resolved",
                "reminder_id": reminder_id,
                "message": "Reminder manually resolved by owner."
            })
            return {"status": "resolved"}
        return {"status": "error", "message": "Reminder not found"}
    finally:
        db.close()


@router.get("/calls")
async def get_calls(limit: int = 30, current_user: SupabaseUser = Depends(get_current_user)):
    """
    Retrieve voice call history records.
    """
    db = SessionLocal()
    try:
        calls = voice_service.get_voice_calls(db, limit=limit)
        import json as _json
        return [
            {
                "id": c.id,
                "caller": c.caller,
                "timestamp": c.timestamp.isoformat() if c.timestamp else None,
                "duration": c.duration,
                "transcript": c.transcript,
                "medicines": _json.loads(c.medicines) if c.medicines else [],
                "actions": _json.loads(c.actions) if c.actions else [],
                "assignments": _json.loads(c.assignments) if c.assignments else [],
                "supplier_followups": _json.loads(c.supplier_followups) if c.supplier_followups else [],
                "reminder_created": c.reminder_created,
                "status": c.status,
                "structured_extraction": _json.loads(c.structured_extraction) if c.structured_extraction else {},
            }
            for c in calls
        ]
    finally:
        db.close()


@router.put("/calls/{call_id}")
async def update_call_extraction(
    call_id: int,
    body: dict,
    current_user: SupabaseUser = Depends(get_current_user)
):
    """
    Update the structured extraction for a call record (after user edits).
    """
    db = SessionLocal()
    try:
        updated = voice_service.update_voice_call_structured_extraction(db, call_id, body)
        if updated:
            return {"status": "updated", "call_id": updated.id}
        return {"status": "error", "message": "Call record not found"}
    finally:
        db.close()


@router.get("/dashboard-summary")
async def get_dashboard_summary(current_user: SupabaseUser = Depends(get_current_user)):
    """
    Aggregate counts for the AI Operations Dashboard.
    """
    db = SessionLocal()
    try:
        return voice_service.get_dashboard_summary(db)
    finally:
        db.close()


@router.get("/daily-brief")
async def get_daily_brief(current_user: SupabaseUser = Depends(get_current_user)):
    """
    Structured AI Daily Brief data for the frontend card.
    Returns low stock medicines, expiring medicines, pending reminders, and pending task count.
    All data comes from existing service functions — no new business logic.
    """
    import json as _json
    db = SessionLocal()
    try:
        low_stock = voice_service.get_low_stock(db) or []
        expiring = voice_service.get_expiring_medicines(db, days=30) or []
        pending_reminders = voice_service.get_pending_reminders(db) or []

        from app.models.staff_task import StaffTask
        pending_tasks_count = db.query(StaffTask).filter(StaffTask.status == "pending").count()

        brief_parts = []
        if low_stock:
            brief_parts.append(f"{len(low_stock)} medicine{'s' if len(low_stock) != 1 else ''} below reorder level")
        if expiring:
            brief_parts.append(f"{len(expiring)} medicine{'s' if len(expiring) != 1 else ''} expiring within 30 days")
        if pending_reminders:
            brief_parts.append(f"{len(pending_reminders)} active reminder{'s' if len(pending_reminders) != 1 else ''} pending")
        if pending_tasks_count > 0:
            brief_parts.append(f"{pending_tasks_count} staff task{'s' if pending_tasks_count != 1 else ''} open")

        summary_text = (
            "Good day. Here is your AI Daily Brief: " + ". ".join(brief_parts) + ". How would you like to proceed?"
            if brief_parts
            else "Good day. All inventory metrics look healthy. How can I assist you today?"
        )

        return {
            "low_stock": [
                {"id": m.id, "name": m.name, "strength": m.strength, "quantity": m.quantity, "reorder_threshold": m.reorder_threshold}
                for m in low_stock
            ],
            "expiring": [
                {"id": m.id, "name": m.name, "expiry_date": str(m.expiry_date) if m.expiry_date else None, "quantity": m.quantity, "batch_number": m.batch_number}
                for m in expiring
            ],
            "pending_reminders": [
                {"id": r.id, "title": r.title, "reminder_type": r.reminder_type, "reminder_time": r.reminder_time.isoformat() if r.reminder_time else None}
                for r in pending_reminders
            ],
            "pending_tasks_count": pending_tasks_count,
            "summary_text": summary_text,
        }
    finally:
        db.close()



@router.websocket("/notifications")
async def notifications_endpoint(websocket: WebSocket, token: str | None = None):
    """
    WebSocket endpoint for sending background real-time alerts to the browser dashboard.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    from app.voice.scheduler import active_notification_connections
    active_notification_connections.add(websocket)
    logger.info("Registered browser notifications WebSocket connection.")

    try:
        while True:
            # Keep connection alive, listen for any client messages (ping etc.)
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Browser notifications WebSocket disconnected.")
    finally:
        active_notification_connections.discard(websocket)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket, 
    token: str | None = None,
    greeting: str | None = None
):
    """
    WebSocket endpoint for bidirectional real-time audio and function calling.
    Authenticates token from query parameters. Supports optional custom greetings parameter.
    """
    if not token:
        logger.warning("Rejected WebSocket connection: missing auth token.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    if not payload:
        logger.warning("Rejected WebSocket connection: invalid or expired auth token.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Accept connection after successful authentication
    await websocket.accept()
    
    session_id = id(websocket)
    logger.info(f"Accepted authenticated voice WebSocket connection. Session ID: {session_id}")

    # Tool functions registered with Pipecat

    async def get_low_stock(params: FunctionCallParams):
        """Get list of medicines that are currently low on stock (where quantity is below or equal to reorder threshold)."""
        logger.info(f"Voice Tool called [Session {session_id}]: get_low_stock")
        db = SessionLocal()
        try:
            items = run_with_retry(voice_service.get_low_stock, db) or []
            result = [
                {
                    "id": i.id,
                    "name": i.name,
                    "strength": i.strength,
                    "quantity": i.quantity,
                    "reorder_threshold": i.reorder_threshold
                }
                for i in items
            ]
            await params.result_callback({"status": "success", "medicines": result})
        except Exception as e:
            logger.error(f"Error in get_low_stock voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def get_expiring_medicines(params: FunctionCallParams):
        """Get list of medicines that are expiring within the next 30 days."""
        logger.info(f"Voice Tool called [Session {session_id}]: get_expiring_medicines")
        db = SessionLocal()
        try:
            items = run_with_retry(voice_service.get_expiring_medicines, db, days=30) or []
            result = [
                {
                    "id": i.id,
                    "name": i.name,
                    "batch_number": i.batch_number,
                    "expiry_date": str(i.expiry_date) if i.expiry_date else None,
                    "quantity": i.quantity
                }
                for i in items
            ]
            await params.result_callback({"status": "success", "medicines": result})
        except Exception as e:
            logger.error(f"Error in get_expiring_medicines voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def get_inventory_summary(params: FunctionCallParams):
        """Get general summary of inventory statistics including total items, total value, low stock count, and expiring count."""
        logger.info(f"Voice Tool called [Session {session_id}]: get_inventory_summary")
        db = SessionLocal()
        try:
            summary = run_with_retry(voice_service.get_inventory_summary, db)
            await params.result_callback({"status": "success", "summary": summary})
        except Exception as e:
            logger.error(f"Error in get_inventory_summary voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def record_owner_decision(params: FunctionCallParams, alert_id: str, decision: str, decided_by: str, channel: str):
        """Record owner decision regarding a specific inventory alert.

        Args:
            alert_id: The ID of the alert or notification.
            decision: Description of the decision made (e.g. 'reorder', 'wait', 'transfer').
            decided_by: Name or username of the owner/manager.
            channel: Channel where decision was made (e.g. 'voice', 'web').
        """
        logger.info(f"Voice Tool called [Session {session_id}]: record_owner_decision — alert_id={alert_id}, decision={decision}")
        db = SessionLocal()
        try:
            log = run_with_retry(voice_service.record_owner_decision, db, alert_id, decision, decided_by, channel)
            await params.result_callback({"status": "success", "id": log.id if log else None})
        except Exception as e:
            logger.error(f"Error in record_owner_decision voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def dispatch_task(params: FunctionCallParams, assigned_to: str, message: str, related_medicine_id: int | None = None):
        """Dispatch a new operational task to a staff member.

        Args:
            assigned_to: Name or role of the staff member assigned.
            message: Task description or instructions.
            related_medicine_id: Optional database medicine ID associated with the task.
        """
        logger.info(f"Voice Tool called [Session {session_id}]: dispatch_task — assigned_to={assigned_to}, message={message}")
        db = SessionLocal()
        try:
            task = run_with_retry(voice_service.dispatch_task, db, assigned_to, message, related_medicine_id)
            await params.result_callback({"status": "success", "id": task.id if task else None})
        except Exception as e:
            logger.error(f"Error in dispatch_task voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def create_reminder(
        params: FunctionCallParams, 
        title: str, 
        reminder_time: str, 
        medicine_id: int,
        reminder_type: str,
        repeat_interval: str | None = None
    ):
        """Create a new persistent inventory reminder for a medicine.

        Args:
            title: Description or title of the reminder.
            reminder_time: Target date/time in ISO-8601 format (e.g. '2026-08-02T10:00:00Z').
            medicine_id: Database medicine ID associated with the reminder.
            reminder_type: Type of reminder schedule: 'daily', 'weekly', 'custom', 'until_resolved'.
            repeat_interval: Optional interval value: 'every_hour', 'every_day' or cron string.
        """
        logger.info(f"Voice Tool called [Session {session_id}]: create_reminder — title={title}, reminder_time={reminder_time}, medicine_id={medicine_id}, type={reminder_type}")
        db = SessionLocal()
        try:
            reminder = run_with_retry(
                voice_service.create_inventory_reminder, 
                db, 
                medicine_id, 
                reminder_type, 
                reminder_time, 
                repeat_interval,
                None, # pharmacy_id
                None, # stop_condition
                title
            )
            await params.result_callback({"status": "success", "id": reminder.id if reminder else None})
        except Exception as e:
            logger.error(f"Error in create_reminder voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def cancel_reminder(params: FunctionCallParams, reminder_id: int):
        """Cancel (mark inactive/resolved) an existing reminder by its database ID.

        Args:
            reminder_id: Database ID of the reminder to cancel.
        """
        logger.info(f"Voice Tool called [Session {session_id}]: cancel_reminder — reminder_id={reminder_id}")
        db = SessionLocal()
        try:
            success = run_with_retry(voice_service.cancel_reminder, db, reminder_id)
            await params.result_callback({"status": "success" if success else "failed"})
        except Exception as e:
            logger.error(f"Error in cancel_reminder voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    async def get_pending_reminders(params: FunctionCallParams):
        """Retrieve all active pending reminders."""
        logger.info(f"Voice Tool called [Session {session_id}]: get_pending_reminders")
        db = SessionLocal()
        try:
            reminders = run_with_retry(voice_service.get_pending_reminders, db) or []
            result = [
                {
                    "id": r.id,
                    "title": r.title,
                    "reminder_time": str(r.reminder_time),
                    "medicine_id": r.medicine_id,
                    "reminder_type": r.reminder_type,
                    "repeat_interval": r.repeat_interval,
                    "active": r.active
                }
                for r in reminders
            ]
            await params.result_callback({"status": "success", "reminders": result})
        except Exception as e:
            logger.error(f"Error in get_pending_reminders voice tool: {e}", exc_info=True)
            await params.result_callback({"status": "error", "message": str(e)})
        finally:
            db.close()

    model_name = settings.VISION_MODEL
    if not model_name.startswith("models/"):
        model_name = f"models/{model_name}"

    SYSTEM_INSTRUCTION = (
        "You are the MediVision AI voice operations assistant. Your role is to help pharmacy owners and manager staff "
        "manage stock levels, decisions, tasks, and reminders through a professional, natural voice interface.\n"
        "Your voice output will be read to the user, so please keep your responses extremely concise (1-2 sentences at most). "
        "Do not list extensive markdown tables or use special characters.\n\n"
        "CRITICAL LAWS:\n"
        "1. NEVER invent, guess, estimate, or hallucinate any inventory statistics, numbers, quantities, batch details, or expiry dates. "
        "You MUST call the appropriate database tools (e.g. get_low_stock, get_expiring_medicines) first to retrieve real facts before speaking any numerical values.\n"
        "2. If the user asks about multiple medicines (e.g., 'Do we have Paracetamol and Ibuprofen?'), you MUST query the database tools "
        "for each of them. Never guess details for one if the other is found.\n"
        "3. If a tool returns no data or confirms the medicine doesn't exist, state clearly that it is not in the database. Do not assume placeholder counts.\n"
        "4. You can parse natural language triggers for reminders (e.g.:\n"
        "   - 'Remind me tomorrow at 9 AM' -> call create_reminder with reminder_type='daily' or 'custom', setting date/time tomorrow at 09:00 UTC.\n"
        "   - 'Remind me every morning' -> call create_reminder with reminder_type='daily', setting time to 09:00 UTC.\n"
        "   - 'Keep reminding me until I reorder' -> call create_reminder with reminder_type='until_resolved', repeat_interval='every_hour'.\n"
        "   - 'Remind me every Monday' -> call create_reminder with reminder_type='weekly', setting time to next Monday at 09:00 UTC.\n"
        "   - 'Stop reminding me' / 'Cancel my reminder' -> call cancel_reminder with appropriate database reminder ID).\n"
        "5. Respond naturally and helpfully to order checks: if user replies 'Yes' or 'Tell Ramesh to order it', call dispatch_task(assigned_to='Ramesh', message='Order [Medicine]')."
    )

    # Initialize Pipecat WebSocket Transport
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=ProtobufFrameSerializer(),
        ),
    )

    # Instantiate Gemini Live LLM Service
    llm = GeminiLiveLLMService(
        api_key=settings.VISION_API_KEY,
        settings=GeminiLiveLLMService.Settings(
            model=model_name,
            voice="Puck",
            system_instruction=SYSTEM_INSTRUCTION,
        ),
        tools=[
            get_low_stock,
            get_expiring_medicines,
            get_inventory_summary,
            record_owner_decision,
            dispatch_task,
            create_reminder,
            cancel_reminder,
            get_pending_reminders
        ]
    )

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        realtime_service_mode=True,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    # Pipeline setup
    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
            transport.output(),
            assistant_aggregator,
        ]
    )

    # Worker setup
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    # Attach event handlers
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Pipecat Client connected for session {session_id}")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Pipecat Client disconnected for session {session_id}")
        from app.voice.scheduler import active_voice_sessions
        active_voice_sessions.pop(session_id, None)
        await worker.cancel()

    @worker.rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        logger.info(f"Pipecat client ready. Registering active session: {session_id}")
        from app.voice.scheduler import active_voice_sessions
        active_voice_sessions[session_id] = {"worker": worker, "context": context}

        if greeting:
            logger.info(f"Seeding custom vocal greeting parameter: '{greeting}'")
            context.add_message(
                {"role": "developer", "content": f"Interject immediately and say exactly: '{greeting}'."}
            )
        else:
            # Build AI Daily Brief from live inventory data
            brief_db = SessionLocal()
            try:
                summary: dict[str, Any] = run_with_retry(voice_service.get_inventory_summary, brief_db) or {}
                pending_reminders: list[Any] = run_with_retry(voice_service.get_pending_reminders, brief_db) or []
                pending_tasks_count = brief_db.query(__import__('app.models.staff_task', fromlist=['StaffTask']).StaffTask).filter_by(status="pending").count()

                brief_parts = []
                if summary.get("low_stock_count", 0) > 0:
                    brief_parts.append(f"{summary['low_stock_count']} medicines are below reorder level")
                if summary.get("expiring_count", 0) > 0:
                    brief_parts.append(f"{summary['expiring_count']} medicines expiring within 30 days")
                if len(pending_reminders) > 0:
                    brief_parts.append(f"{len(pending_reminders)} active reminders pending")
                if pending_tasks_count > 0:
                    brief_parts.append(f"{pending_tasks_count} staff tasks still open")

                if brief_parts:
                    brief_text = "Good day. Here is your AI Daily Brief: " + ". ".join(brief_parts) + ". How would you like to proceed?"
                else:
                    brief_text = "Good day. All inventory metrics look healthy. How can I assist you today?"

                context.add_message({"role": "developer", "content": brief_text})
                logger.info(f"AI Daily Brief seeded for session {session_id}: {brief_text[:120]}...")
            except Exception as e:
                logger.warning(f"Failed to build Daily Brief for session {session_id}: {e}")
                context.add_message(
                    {"role": "developer", "content": "Introduce yourself to the pharmacy manager and ask how you can assist them today."}
                )
            finally:
                brief_db.close()

        await worker.queue_frames([LLMRunFrame()])


    # Run the bot worker
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)

    try:
        await runner.run()
    except WebSocketDisconnect:
        logger.info(f"WebSocket session {session_id} disconnected normally.")
    except Exception as e:
        logger.error(f"Error in Pipecat session {session_id}: {e}", exc_info=True)
    finally:
        from app.voice.scheduler import active_voice_sessions
        active_voice_sessions.pop(session_id, None)

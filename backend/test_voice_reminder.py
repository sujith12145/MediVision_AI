"""
Integration tests for the Persistent AI Reminder Engine.
Runs under an asyncio event loop to correctly test async scheduling.
"""

import datetime
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.reminder import Reminder
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.models.staff_task import StaffTask
from app.dependencies import get_current_user, SupabaseUser
from app.voice.scheduler import (
    scheduler,
    add_reminder_job,
    remove_reminder_job,
    active_voice_sessions,
    run_reminder_job,
    active_notification_connections
)
from app.services import voice_service
from app.services.voice_service import check_medicine_status

client = TestClient(app)


class MockContext:
    def __init__(self):
        self.messages = []
    def add_message(self, msg):
        self.messages.append(msg)


class MockWorker:
    def __init__(self):
        self.frames = []
    async def queue_frames(self, frames):
        self.frames.extend(frames)


async def run_tests_async():
    print("=" * 80)
    print("RUNNING PERSISTENT AI REMINDER ENGINE INTEGRATION TESTS")
    print("=" * 80)

    # Bypass authentication
    test_user_email = "admin@medivision.local"
    app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
        id="3b7441ec-ca09-4e8d-8809-8eeea51836a3",
        email=test_user_email
    )

    mock_ws_id = 9999
    db = SessionLocal()
    try:
        # Cleanup pre-existing test data
        db.query(Reminder).filter(Reminder.title.like("TEST_MED_%")).delete()
        db.query(StaffTask).filter(StaffTask.message.like("%TEST_MED_%")).delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-REM-TEST").delete()
        db.commit()

        # Seed mock medicine
        print("[SEED] Seeding mock medicine below threshold...")
        med = Medicine(
            name="TEST_MED_PARACETAMOL",
            strength="650mg",
            manufacturer="Test Labs",
            batch_number="BATCH-REM-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=15.0,
            purchase_price=10.0,
            quantity=5, # below threshold!
            reorder_threshold=10,
            storage_location="Shelf REM"
        )
        db.add(med)
        db.commit()
        db.refresh(med)
        med_id = med.id
        print(f"[SEED] Seeded medicine ID: {med_id}")

        # Ensure scheduler is running inside this event loop
        if not scheduler.running:
            scheduler.start()
            print("[INFO] Started APScheduler for testing.")

        # 1. Test creating persistent reminder with new schema columns
        print("\n[TEST 1] Testing persistent reminder creation and duplicate prevention...")
        reminder_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
        
        rem1 = voice_service.create_inventory_reminder(
            db=db,
            medicine_id=med_id,
            reminder_type="until_resolved",
            reminder_time_val=reminder_time,
            repeat_interval="every_hour",
            pharmacy_id="TEST-PHARM-1",
            title="TEST_MED_REMINDER_1"
        )
        assert rem1 is not None
        assert rem1.id is not None
        assert rem1.pharmacy_id == "TEST-PHARM-1"
        assert rem1.medicine_id == med_id
        assert rem1.reminder_type == "until_resolved"
        assert rem1.repeat_interval == "every_hour"
        assert rem1.active is True
        
        # Test duplicate prevention (should return same reminder and not create a new one)
        rem_dup = voice_service.create_inventory_reminder(
            db=db,
            medicine_id=med_id,
            reminder_type="daily",
            reminder_time_val=reminder_time,
            repeat_interval="daily",
            pharmacy_id="TEST-PHARM-1",
            title="TEST_MED_REMINDER_DUP"
        )
        assert rem_dup is not None
        assert rem_dup.id == rem1.id
        print("[PASS] Schema fields successfully saved and duplicate reminders blocked.")

        # 2. Test Decision Engine: Low Stock status evaluation
        print("\n[TEST 2] Testing Decision Engine state verification...")
        is_unresolved, reason = check_medicine_status(db, med_id)
        assert is_unresolved is True
        assert "below the reorder level" in reason
        print(f"[PASS] Decision Engine correctly detected Low Stock warning: '{reason}'")

        # 3. Test Decision Engine: Auto-resolution when reorder task is created
        print("\n[TEST 3] Testing Decision Engine auto-resolution when reordered...")
        task = voice_service.dispatch_task(
            db=db,
            assigned_to="Ramesh",
            message="Please order TEST_MED_PARACETAMOL stock replenishment",
            related_medicine_id=med_id
        )
        assert task.id is not None
        
        # Check status again (should report resolved/reordered)
        is_unresolved_after, reason_after = check_medicine_status(db, med_id)
        assert is_unresolved_after is False
        assert reason_after == "reordered"
        print(f"[PASS] Decision Engine auto-detected reorder resolution: '{reason_after}'")

        # 4. Test scheduler auto-completion run
        print("\n[TEST 4] Testing scheduler auto-resolution execution...")
        # Since it is resolved, running the job should set active = False and write to audit log
        assert rem1 is not None
        await run_reminder_job(rem1.id, rem1.title or "")
        
        db.expire_all()
        updated_rem = db.query(Reminder).filter(Reminder.id == rem1.id).first()
        assert updated_rem.active is False
        assert updated_rem.resolved_at is not None
        
        # Check audit log
        audit = db.query(AuditLog).filter(
            AuditLog.action == "reminder_auto_resolved",
            AuditLog.new_value.like(f"%medicine ID {med_id}%")
        ).first()
        assert audit is not None
        print(f"[PASS] Scheduler auto-stopped the resolved reminder and wrote AuditLog: '{audit.new_value}'")

        # Cleanup
        db.query(Reminder).filter(Reminder.title.like("TEST_MED_%")).delete()
        db.query(StaffTask).filter(StaffTask.message.like("%TEST_MED_%")).delete()
        db.query(AuditLog).filter(AuditLog.new_value.like(f"%medicine ID {med_id}%")).delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-REM-TEST").delete()
        db.commit()
        print("\n[CLEANUP] Cleaned up all generated test data.")
        print("=" * 80)
        print("ALL PERSISTENT AI REMINDER ENGINE INTEGRATION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        db.query(Reminder).filter(Reminder.title.like("TEST_MED_%")).delete()
        db.query(StaffTask).filter(StaffTask.message.like("%TEST_MED_%")).delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-REM-TEST").delete()
        db.commit()
        raise e
    finally:
        db.close()


def run_tests():
    asyncio.run(run_tests_async())


if __name__ == "__main__":
    run_tests()

"""
Integration tests for the already-expired stock warnings and gates at intake confirmation.
"""

import datetime
import sys
import pathlib
from fastapi.testclient import TestClient

# Ensure backend root is in system path
sys.path.insert(0, str(pathlib.Path(__file__).parent.resolve()))

from app.main import app
from app.database import SessionLocal
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.models.extraction_record import ExtractionRecord
from app.dependencies import get_current_user, SupabaseUser

client = TestClient(app)


def run_tests():
    print("=" * 80)
    print("RUNNING EXPIRED STOCK INTAKE INTEGRATION TESTS")
    print("=" * 80)

    # Bypass authentication/Supabase dependencies
    test_user_email = "admin@medivision.local"
    app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
        id="3b7441ec-ca09-4e8d-8809-8eeea51836a3",
        email=test_user_email
    )

    db = SessionLocal()
    try:
        # Cleanup pre-existing test data
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-EXPIRED-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/expired_test.png").delete()
        db.commit()

        # Create extraction records to confirm
        record1 = ExtractionRecord(
            image_path="medicine-images/expired_test.png",
            status="awaiting_confirmation",
            raw_ai_response='{"medicine_name": "Paracetamol"}'
        )
        db.add(record1)
        db.commit()
        db.refresh(record1)

        # Case 1: Past Expiry, intake_status not set (Should fail with 400 Bad Request)
        print("[TEST 1] Expiry date in the past, intake_status not set (Should fail)...")
        past_expiry_date = (datetime.date.today() - datetime.timedelta(days=10)).isoformat()
        
        payload1 = {
            "medicine_name": "Expired Test Med 1",
            "strength": "500mg",
            "manufacturer": "Cipla",
            "batch_number": "BATCH-EXPIRED-TEST",
            "expiry_date": past_expiry_date,
            "mrp": 50.0,
            "purchase_price": 30.0,
            "quantity": 10,
            "storage_location": "Rack Expired 1"
        }
        
        resp = client.post(f"/api/intake/confirm/{record1.id}", json=payload1)
        assert resp.status_code == 400, f"Expected 400 but got {resp.status_code}: {resp.text}"
        assert "Adding expired stock requires explicit confirmation" in resp.json()["detail"]
        print("[PASS] Intake blocked successfully for unconfirmed expired stock.")

        # Case 2: Past Expiry, intake_status incorrect (Should fail with 400 Bad Request)
        print("\n[TEST 2] Expiry date in the past, intake_status incorrect (Should fail)...")
        payload1["intake_status"] = "something_else"
        resp = client.post(f"/api/intake/confirm/{record1.id}", json=payload1)
        assert resp.status_code == 400, f"Expected 400 but got {resp.status_code}: {resp.text}"
        assert "Adding expired stock requires explicit confirmation" in resp.json()["detail"]
        print("[PASS] Intake blocked successfully for incorrectly confirmed expired stock.")

        # Case 3: Past Expiry, intake_status = "expired_on_arrival" (Should succeed, tag row, and log)
        print("\n[TEST 3] Expiry date in the past, intake_status = 'expired_on_arrival' (Should succeed)...")
        payload1["intake_status"] = "expired_on_arrival"
        resp = client.post(f"/api/intake/confirm/{record1.id}", json=payload1)
        assert resp.status_code == 201, f"Expected 201 but got {resp.status_code}: {resp.text}"
        
        medicine_data = resp.json()
        medicine_id = medicine_data["id"]
        assert medicine_data["intake_status"] == "expired_on_arrival"
        
        # Verify db field
        db.expire_all()
        med_row = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        assert med_row is not None
        assert med_row.intake_status == "expired_on_arrival"
        print("[PASS] Medicine saved successfully with 'expired_on_arrival' tag.")
        
        # Verify database has the audit log entry
        audit_row = db.query(AuditLog).filter(
            AuditLog.medicine_id == medicine_id,
            AuditLog.action == "expired_stock_added"
        ).first()
        assert audit_row is not None
        assert "expired stock knowingly added at intake" in audit_row.new_value
        assert f"expiry_date={past_expiry_date}" in audit_row.new_value
        assert f"confirmed_by={test_user_email}" in audit_row.new_value
        print("[PASS] Specific audit log entry created successfully.")

        # Cleanup
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-EXPIRED-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/expired_test.png").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")
        print("=" * 80)
        print("ALL EXPIRED STOCK INTAKE INTEGRATION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-EXPIRED-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/expired_test.png").delete()
        db.commit()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()

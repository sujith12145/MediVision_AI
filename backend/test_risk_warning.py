"""
Integration tests for the purchase-risk warning.
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
    print("RUNNING PURCHASE RISK WARNING INTEGRATION TESTS")
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
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-RISK-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/risk_test.png").delete()
        db.commit()

        # Create extraction records to confirm
        record1 = ExtractionRecord(
            image_path="medicine-images/risk_test.png",
            status="awaiting_confirmation",
            raw_ai_response='{"medicine_name": "Paracetamol"}'
        )
        db.add(record1)
        db.commit()
        db.refresh(record1)

        # Case 1: Expiry <= 30 days and Quantity > 20 (Positive Trigger)
        print("[TEST 1] Expiry within 10 days, Quantity = 25 (Should trigger warning and log)...")
        near_expiry_date = (datetime.date.today() + datetime.timedelta(days=10)).isoformat()
        
        payload1 = {
            "medicine_name": "Risk Warning Med 1",
            "strength": "500mg",
            "manufacturer": "Cipla",
            "batch_number": "BATCH-RISK-TEST",
            "expiry_date": near_expiry_date,
            "mrp": 50.0,
            "purchase_price": 30.0,
            "quantity": 25,
            "storage_location": "Rack Risk 1"
        }
        
        resp = client.post(f"/api/intake/confirm/{record1.id}", json=payload1)
        assert resp.status_code == 201, resp.text
        medicine_id = resp.json()["id"]
        
        # Verify database has the audit log entry
        audit_row = db.query(AuditLog).filter(
            AuditLog.medicine_id == medicine_id,
            AuditLog.action == "risk_warning_acknowledged"
        ).first()
        assert audit_row is not None
        assert audit_row.new_value == "near-expiry bulk stock warning shown and acknowledged"
        print("[PASS] Audit log created successfully for near-expiry bulk stock.")

        # Cleanup for next case
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-RISK-TEST").delete()
        db.commit()

        # Case 2: Expiry <= 30 days and Quantity <= 20 (Negative Trigger)
        print("\n[TEST 2] Expiry within 10 days, Quantity = 15 (Should NOT trigger warning or log)...")
        record2 = ExtractionRecord(
            image_path="medicine-images/risk_test.png",
            status="awaiting_confirmation",
            raw_ai_response='{"medicine_name": "Paracetamol"}'
        )
        db.add(record2)
        db.commit()
        db.refresh(record2)
        
        payload2 = {
            "medicine_name": "Risk Warning Med 2",
            "strength": "500mg",
            "manufacturer": "Cipla",
            "batch_number": "BATCH-RISK-TEST",
            "expiry_date": near_expiry_date,
            "mrp": 50.0,
            "purchase_price": 30.0,
            "quantity": 15,
            "storage_location": "Rack Risk 2"
        }
        
        resp2 = client.post(f"/api/intake/confirm/{record2.id}", json=payload2)
        assert resp2.status_code == 201, resp2.text
        medicine_id2 = resp2.json()["id"]
        
        audit_row2 = db.query(AuditLog).filter(
            AuditLog.medicine_id == medicine_id2,
            AuditLog.action == "risk_warning_acknowledged"
        ).first()
        assert audit_row2 is None, f"Expected no risk warning log, but found: {audit_row2}"
        print("[PASS] No audit log created for small quantity near-expiry stock.")

        # Cleanup for next case
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-RISK-TEST").delete()
        db.commit()

        # Case 3: Expiry > 30 days and Quantity > 20 (Negative Trigger)
        print("\n[TEST 3] Expiry in 100 days, Quantity = 25 (Should NOT trigger warning or log)...")
        record3 = ExtractionRecord(
            image_path="medicine-images/risk_test.png",
            status="awaiting_confirmation",
            raw_ai_response='{"medicine_name": "Paracetamol"}'
        )
        db.add(record3)
        db.commit()
        db.refresh(record3)
        
        far_expiry_date = (datetime.date.today() + datetime.timedelta(days=100)).isoformat()
        payload3 = {
            "medicine_name": "Risk Warning Med 3",
            "strength": "500mg",
            "manufacturer": "Cipla",
            "batch_number": "BATCH-RISK-TEST",
            "expiry_date": far_expiry_date,
            "mrp": 50.0,
            "purchase_price": 30.0,
            "quantity": 25,
            "storage_location": "Rack Risk 3"
        }
        
        resp3 = client.post(f"/api/intake/confirm/{record3.id}", json=payload3)
        assert resp3.status_code == 201, resp3.text
        medicine_id3 = resp3.json()["id"]
        
        audit_row3 = db.query(AuditLog).filter(
            AuditLog.medicine_id == medicine_id3,
            AuditLog.action == "risk_warning_acknowledged"
        ).first()
        assert audit_row3 is None, f"Expected no risk warning log, but found: {audit_row3}"
        print("[PASS] No audit log created for far-expiry bulk stock.")

        # Cleanup
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-RISK-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/risk_test.png").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")
        print("=" * 80)
        print("ALL PURCHASE RISK WARNING INTEGRATION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-RISK-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/risk_test.png").delete()
        db.commit()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()

import sys
import pathlib
from pathlib import Path
from dotenv import load_dotenv

env_path = Path("d:/shi solo project/MediVision AI/backend/.env")
load_dotenv(dotenv_path=env_path)

sys.path.insert(0, str(pathlib.Path(__file__).parent.resolve()))

import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.medicine import Medicine
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.audit_log import AuditLog
from app.models.extraction_record import ExtractionRecord
from app.dependencies import get_current_user, SupabaseUser

client = TestClient(app)

def test_rbac_rules():
    print("=" * 80)
    print("RUNNING ROLE-BASED ACCESS CONTROL (RBAC) API AND AUDIT TESTS")
    print("=" * 80)

    db = SessionLocal()
    try:
        # Cleanup any leftover test records first from previous failed runs
        db.query(SaleItem).filter(SaleItem.medicine_id.in_(
            db.query(Medicine.id).filter(Medicine.batch_number == "BATCH-RBAC-TEST")
        )).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.medicine_id.in_(
            db.query(Medicine.id).filter(Medicine.batch_number == "BATCH-RBAC-TEST")
        )).delete(synchronize_session=False)
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-RBAC-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/rbac_test.png").delete()
        db.commit()

        # Seed a dummy medicine and extraction record for test reference
        med = Medicine(
            name="Aspirin RBAC Test",
            strength="100mg",
            manufacturer="Bayer",
            batch_number="BATCH-RBAC-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=50.0,
            quantity=10,
            reorder_threshold=3,
            storage_location="Shelf A",
            purchase_price=25.0
        )
        db.add(med)
        db.flush()

        record = ExtractionRecord(
            image_path="medicine-images/rbac_test.png",
            status="awaiting_confirmation",
            raw_ai_response='{"medicine_name": "Aspirin RBAC Test", "mrp": 50.0}'
        )
        db.add(record)
        db.commit()
        db.refresh(med)
        db.refresh(record)

        med_id = med.id
        record_id = record.id

        # ----------------------------------------------------------------------
        # 1. TEST ROLE: Staff
        # ----------------------------------------------------------------------
        print("\n[TEST 1] Testing role: staff...")
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="staff-uuid-12345",
            email="staff@medivision.local",
            role="staff"
        )

        # Staff can record sales (returns 201 or 400 bad request, but not 403)
        sales_payload = {
            "items": [
                {"medicine_id": med_id, "quantity_sold": 1, "sale_price": 50.0}
            ]
        }
        resp = client.post("/api/sales", json=sales_payload)
        assert resp.status_code == 201, f"Staff should be able to perform sales, got {resp.status_code}: {resp.text}"
        print("  [PASS] Staff allowed to record sale.")

        # Verify audit log records email and role
        db.commit()
        db.refresh(med)
        latest_audit = db.query(AuditLog).filter(
            AuditLog.medicine_id == med_id,
            AuditLog.action == "sale"
        ).order_by(AuditLog.timestamp.desc()).first()
        assert latest_audit is not None
        assert latest_audit.changed_by == "staff@medivision.local (staff)", f"Expected changed_by staff role format, got: {latest_audit.changed_by}"
        print("  [PASS] Staff sale audit log records email and role.")

        # Staff cannot confirm stock intake (403 Forbidden)
        confirm_payload = {
            "medicine_name": "Aspirin RBAC Test",
            "strength": "100mg",
            "manufacturer": "Bayer",
            "batch_number": "BATCH-RBAC-TEST",
            "expiry_date": "2026-12-31",
            "mrp": 50.0,
            "purchase_price": 25.0,
            "quantity": 10
        }
        resp = client.post(f"/api/intake/confirm/{record_id}", json=confirm_payload)
        assert resp.status_code == 403, f"Staff should be blocked from confirming intake, got {resp.status_code}"
        print("  [PASS] Staff blocked from confirming intake.")

        # Staff cannot access Monthly Business Overview (403 Forbidden)
        resp = client.get("/api/finance")
        assert resp.status_code == 403
        resp = client.get(f"/api/finance/overview/{datetime.date.today().strftime('%Y-%m')}")
        assert resp.status_code == 403
        print("  [PASS] Staff blocked from finance overview GET.")

        # Staff cannot edit Monthly Business Overview (403 Forbidden)
        staff_finance_payload = {
            "month": "2026-07",
            "rent": 1000.0,
            "electricity_and_bills": 200.0,
            "staff_salaries": 2000.0,
            "other_expenses": 300.0,
            "other_revenue": 50.0
        }
        resp = client.post("/api/finance", json=staff_finance_payload)
        assert resp.status_code == 403
        print("  [PASS] Staff blocked from finance overview POST.")

        # Staff cannot view audit history logs (403 Forbidden)
        resp = client.get(f"/api/inventory/{med_id}/history")
        assert resp.status_code == 403
        print("  [PASS] Staff blocked from audit history logs.")


        # ----------------------------------------------------------------------
        # 2. TEST ROLE: Pharmacist
        # ----------------------------------------------------------------------
        print("\n[TEST 2] Testing role: pharmacist...")
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="pharmacist-uuid-12345",
            email="pharmacist@medivision.local",
            role="pharmacist"
        )

        # Pharmacist can confirm stock intake (returns 201)
        resp = client.post(f"/api/intake/confirm/{record_id}", json=confirm_payload)
        assert resp.status_code == 201, f"Pharmacist should be allowed to confirm intake, got {resp.status_code}: {resp.text}"
        print("  [PASS] Pharmacist allowed to confirm stock intake.")

        # Verify audit log records pharmacist email and role
        db.commit()  # End current transaction to see changes committed by API client session
        latest_audit = db.query(AuditLog).filter(
            AuditLog.medicine_id == med_id,
            AuditLog.action == "quantity_updated"
        ).order_by(AuditLog.timestamp.desc()).first()
        if latest_audit is None:
            # Print all audit logs for debugging
            all_audits = db.query(AuditLog).all()
            print("--- Current Audit Logs in DB ---")
            for a in all_audits:
                print(f"ID={a.id} med_id={a.medicine_id} action={a.action} changed_by={a.changed_by}")
            print("---------------------------------")
        assert latest_audit is not None
        assert latest_audit.changed_by == "pharmacist@medivision.local (pharmacist)", f"Expected changed_by pharmacist role format, got: {latest_audit.changed_by}"
        print("  [PASS] Pharmacist confirm audit log records email and role.")

        # Pharmacist can view Monthly Business Overview (returns 200)
        resp = client.get("/api/finance")
        assert resp.status_code == 200, f"Pharmacist should be allowed to view monthly finance records, got {resp.status_code}: {resp.text}"
        print("  [PASS] Pharmacist allowed to view finance history.")

        # Pharmacist cannot save/edit Monthly Business Overview (403 Forbidden)
        finance_payload = {
            "month": "2026-07",
            "rent": 1000.0,
            "electricity_and_bills": 200.0,
            "staff_salaries": 2000.0,
            "other_expenses": 300.0,
            "other_revenue": 50.0
        }
        resp = client.post("/api/finance", json=finance_payload)
        assert resp.status_code == 403, f"Pharmacist should be blocked from editing finance, got {resp.status_code}"
        print("  [PASS] Pharmacist blocked from editing Monthly Business Overview.")

        # Pharmacist cannot view audit logs (403 Forbidden)
        resp = client.get(f"/api/inventory/{med_id}/history")
        assert resp.status_code == 403
        print("  [PASS] Pharmacist blocked from audit history logs.")


        # ----------------------------------------------------------------------
        # 3. TEST ROLE: Admin
        # ----------------------------------------------------------------------
        print("\n[TEST 3] Testing role: admin...")
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="admin-uuid-12345",
            email="admin@medivision.local",
            role="admin"
        )

        # Admin can save/edit Monthly Business Overview (returns 201)
        resp = client.post("/api/finance", json=finance_payload)
        assert resp.status_code == 201, f"Admin should be allowed to edit finance, got {resp.status_code}: {resp.text}"
        print("  [PASS] Admin allowed to edit Monthly Business Overview.")

        # Admin can view audit logs (returns 200)
        resp = client.get(f"/api/inventory/{med_id}/history")
        assert resp.status_code == 200, f"Admin should be allowed to view audit logs, got {resp.status_code}: {resp.text}"
        print("  [PASS] Admin allowed to view audit logs.")


        # Cleanup test records
        db.query(SaleItem).filter(SaleItem.medicine_id == med_id).delete()
        db.query(Sale).filter(Sale.sold_by.like("%staff@medivision.local%")).delete()
        db.query(AuditLog).filter(AuditLog.medicine_id == med_id).delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.id == record_id).delete()
        db.query(Medicine).filter(Medicine.id == med_id).delete()
        db.commit()
        print("\n[CLEANUP] Cleanup of test records successful.")

        print("=" * 80)
        print("ALL RBAC AND AUDIT PERMISSION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        print(f"\n[FAIL] RBAC Test failed: {e}")
        raise e
    finally:
        db.close()
        app.dependency_overrides.clear()

if __name__ == "__main__":
    test_rbac_rules()

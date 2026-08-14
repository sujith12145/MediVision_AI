import json
import pathlib
import sys
import datetime
from fastapi.testclient import TestClient

# Ensure backend root is in system path (helpful for command-line runs)
sys.path.insert(0, str(pathlib.Path(__file__).parent.resolve()))

from app.main import app
from app.database import SessionLocal
from app.models.extraction_record import ExtractionRecord
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.dependencies import get_current_user, SupabaseUser

client = TestClient(app)

# Use one of the real test images located in the artifact directory
ARTIFACT_DIR = pathlib.Path(r"C:\Users\Sujith\.gemini\antigravity-ide\brain\fbc8a070-7af3-4ec6-9d68-3ba80793daf4")
IMAGE_PATH = ARTIFACT_DIR / "test_medicine_paracetamol_1783430574317.png"

def run_e2e_test():
    print("=" * 70)
    print("STARTING SAVE + TRACEABILITY END-TO-END VALIDATION TEST")
    print("=" * 70)

    if not IMAGE_PATH.exists():
        print(f"[ERROR] Test image not found at {IMAGE_PATH}")
        sys.exit(1)

    # 1. Override Auth Dependency to run locally without Supabase password prompt
    test_user_email = "admin@medivision.local"
    app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
        id="3b7441ec-ca09-4e8d-8809-8eeea51836a3",
        email=test_user_email
    )
    print(f"Mocked auth context as user: {test_user_email}")

    # 2. Upload the real medicine photo
    print(f"Uploading image: {IMAGE_PATH.name}...")
    with open(IMAGE_PATH, "rb") as img:
        upload_resp = client.post(
            "/api/intake/upload",
            files={"file": (IMAGE_PATH.name, img, "image/png")}
        )
    
    if upload_resp.status_code not in (200, 201):
        print(f"[ERROR] Upload failed (HTTP {upload_resp.status_code}): {upload_resp.text}")
        sys.exit(1)

    upload_data = upload_resp.json()
    record_id = upload_data["extraction_record_id"]
    ai_status = upload_data["status"]
    ai_name = upload_data["medicine_name"]
    ai_mrp = upload_data["mrp"]
    ai_batch = upload_data["batch_number"]
    
    print(f"[OK] Image uploaded successfully. Created Extraction Record #{record_id}")
    print(f"     Status      : {ai_status}")
    print(f"     AI Extracted Name  : {ai_name}")
    print(f"     AI Extracted Batch : {ai_batch}")
    print(f"     AI Extracted MRP   : {ai_mrp}")

    # 3. Simulate human corrections
    # We will correct the medicine name and MRP
    corrected_name = f"{ai_name} (Premium Verified)" if ai_name else "Paracetamol IP 500mg (Cipla)"
    corrected_mrp = (ai_mrp + 5.00) if ai_mrp is not None else 35.00
    
    # Validate if expiry_date is in YYYY-MM-DD format
    expiry = upload_data.get("expiry_date")
    is_valid_expiry = False
    if expiry:
        try:
            datetime.date.fromisoformat(expiry)
            is_valid_expiry = True
        except ValueError:
            pass

    confirm_payload = {
        "medicine_name": corrected_name,
        "strength": upload_data.get("strength") or "500mg",
        "manufacturer": upload_data.get("manufacturer") or "Cipla Ltd",
        "batch_number": ai_batch or "BATCH-E2E-99",
        "expiry_date": expiry if is_valid_expiry else "2026-12-31",
        "mrp": corrected_mrp,
        "purchase_price": 20.0,
        "quantity": 12,
        "storage_location": "Rack A-3"
    }

    print("\nSending confirm payload with human corrections:")
    print(f"     Corrected Name : {corrected_name}")
    print(f"     Corrected MRP  : {corrected_mrp}")
    print(f"     Quantity       : 12")

    confirm_resp = client.post(
        f"/api/intake/confirm/{record_id}",
        json=confirm_payload
    )

    if confirm_resp.status_code != 201:
        print(f"[ERROR] Confirmation failed (HTTP {confirm_resp.status_code}): {confirm_resp.text}")
        sys.exit(1)

    confirm_data = confirm_resp.json()
    medicine_id = confirm_data["id"]
    print(f"[OK] Medicine confirmed and saved. Medicine ID: {medicine_id}")

    # 4. Connect to database to verify the changes and audit logs directly
    db = SessionLocal()
    try:
        # A. Verify Medicine row
        med_row = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        assert med_row is not None, "Medicine row was not created"
        assert med_row.name == corrected_name, f"Expected name {corrected_name}, got {med_row.name}"
        assert float(med_row.mrp) == float(corrected_mrp), f"Expected MRP {corrected_mrp}, got {med_row.mrp}"
        assert med_row.quantity == 12, f"Expected quantity 12, got {med_row.quantity}"
        assert med_row.batch_number == confirm_payload["batch_number"], "Batch number mismatch"
        print("[DB VERIFICATION] Medicine row created successfully and values match.")

        # B. Verify ExtractionRecord update
        record_row = db.query(ExtractionRecord).filter(ExtractionRecord.id == record_id).first()
        assert record_row.status == "done", f"Expected record status 'done', got {record_row.status}"
        assert record_row.medicine_id == medicine_id, "ExtractionRecord medicine_id was not linked"
        assert record_row.confirmed_by == f"{test_user_email} (admin)", "confirmed_by not written"
        assert record_row.confirmed_at is not None, "confirmed_at not written"
        print("[DB VERIFICATION] ExtractionRecord successfully updated.")

        # C. Verify AuditLog entries
        audit_rows = db.query(AuditLog).filter(
            AuditLog.medicine_id == medicine_id,
            AuditLog.action == "ai_corrected"
        ).all()
        
        print(f"\n[DB VERIFICATION] Found {len(audit_rows)} 'ai_corrected' audit log entries:")
        corrected_fields = []
        for audit in audit_rows:
            print(f"     Audit Entry #{audit.id} | Action: {audit.action} | Old: {audit.old_value} | New: {audit.new_value}")
            if audit.old_value.startswith("medicine_name:"):
                corrected_fields.append("medicine_name")
                assert audit.new_value == f"medicine_name: {corrected_name}"
            elif audit.old_value.startswith("mrp:"):
                corrected_fields.append("mrp")
                assert audit.new_value == f"mrp: {corrected_mrp}"

        assert "medicine_name" in corrected_fields, "medicine_name correction was not logged"
        assert "mrp" in corrected_fields, "mrp correction was not logged"
        print("[DB VERIFICATION] Traceability audit log correctly records individual corrected fields.")

        # 5. Verify Stock Top-Up Logic
        print("\nTesting stock top-up logic (confirming same name + batch)...")
        topup_payload = confirm_payload.copy()
        topup_payload["quantity"] = 8
        topup_payload["storage_location"] = "Rack A-4 (Moved)"

        record2 = ExtractionRecord(
            image_path="medicine-images/topup.png",
            status="awaiting_confirmation",
            raw_ai_response=json.dumps({
                "medicine_name": corrected_name,
                "strength": confirm_payload["strength"],
                "manufacturer": confirm_payload["manufacturer"],
                "batch_number": confirm_payload["batch_number"],
                "expiry_date": confirm_payload["expiry_date"],
                "mrp": corrected_mrp
            })
        )
        db.add(record2)
        db.commit()
        db.refresh(record2)
        
        topup_resp = client.post(
            f"/api/intake/confirm/{record2.id}",
            json=topup_payload
        )
        assert topup_resp.status_code == 201, f"Top-up failed: {topup_resp.text}"
        topup_data = topup_resp.json()
        
        assert topup_data["id"] == medicine_id, f"Expected same medicine ID {medicine_id}, but got {topup_data['id']}"
        
        db.refresh(med_row)
        assert med_row.quantity == 20, f"Expected total quantity to top-up to 20 (12 + 8), but got {med_row.quantity}"
        assert med_row.storage_location == "Rack A-4 (Moved)", "Storage location was not updated on top-up"
        print("[DB VERIFICATION] Stock top-up logic successfully updated quantity to 20 (12 + 8).")
        
        topup_audit = db.query(AuditLog).filter(
            AuditLog.medicine_id == medicine_id,
            AuditLog.action == "quantity_updated"
        ).first()
        assert topup_audit is not None, "Quantity update audit log not written"
        assert topup_audit.old_value == "12"
        assert topup_audit.new_value == "20"
        print("[DB VERIFICATION] Stock top-up quantity audit log entry validated.")

        print("\n" + "=" * 70)
        print("ALL E2E VALIDATION TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()
        app.dependency_overrides.clear()

if __name__ == "__main__":
    run_e2e_test()

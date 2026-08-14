"""
Integration tests for QR Code Usability & Reliability Improvements.
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
from app.dependencies import get_current_user, SupabaseUser
from app.services.qr_service import generate_unique_qr_code_id, generate_qr_svg_base64

client = TestClient(app)


def run_tests():
    print("=" * 80)
    print("RUNNING QR CODE USABILITY & RELIABILITY IMPROVEMENTS TESTS")
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
        db.query(Medicine).filter(Medicine.batch_number.in_(["BATCH-IMPR-1", "BATCH-IMPR-2", "BATCH-IMPR-LOC"])).delete()
        db.commit()

        # 1. Verify Batch Confusion (Two batches of Paracetamol 500mg)
        print("[TEST 1] Creating two batches of 'Paracetamol 500mg'...")
        qr1 = generate_unique_qr_code_id(db, "BATCH-IMPR-1")
        img1 = generate_qr_svg_base64(qr1)
        med1 = Medicine(
            name="Paracetamol 500mg",
            strength="500mg",
            manufacturer="GlaxoSmithKline",
            batch_number="BATCH-IMPR-1",
            expiry_date=datetime.date(2026, 12, 31),
            mrp=15.0,
            purchase_price=10.0,
            quantity=100,
            reorder_threshold=20,
            storage_location="Shelf A-1",
            qr_code_id=qr1,
            qr_code_image=img1
        )
        
        qr2 = generate_unique_qr_code_id(db, "BATCH-IMPR-2")
        img2 = generate_qr_svg_base64(qr2)
        med2 = Medicine(
            name="Paracetamol 500mg",
            strength="500mg",
            manufacturer="GlaxoSmithKline",
            batch_number="BATCH-IMPR-2",
            expiry_date=datetime.date(2027, 3, 31),
            mrp=15.0,
            purchase_price=10.0,
            quantity=150,
            reorder_threshold=20,
            storage_location="Shelf A-2",
            qr_code_id=qr2,
            qr_code_image=img2
        )
        db.add(med1)
        db.add(med2)
        db.commit()
        db.refresh(med1)
        db.refresh(med2)

        # Assert unique IDs are not sequential numbers
        assert qr1 != qr2
        assert not qr1.isdigit() and not qr2.isdigit()
        assert qr1.startswith("BATCH-IMPR-1-")
        assert qr2.startswith("BATCH-IMPR-2-")
        print(f"[PASS] Distinct guess-resistant IDs: '{qr1}' vs '{qr2}'")

        # Lookup Batch 1
        resp = client.get(f"/api/medicines/lookup/{qr1}")
        assert resp.status_code == 200
        data1 = resp.json()
        assert data1["batch_number"] == "BATCH-IMPR-1"
        assert data1["expiry_date"] == "2026-12-31"
        assert data1["storage_location"] == "Shelf A-1"
        print("[PASS] Looking up Batch 1 code returned only Batch 1.")

        # Lookup Batch 2
        resp = client.get(f"/api/medicines/lookup/{qr2}")
        assert resp.status_code == 200
        data2 = resp.json()
        assert data2["batch_number"] == "BATCH-IMPR-2"
        assert data2["expiry_date"] == "2027-03-31"
        assert data2["storage_location"] == "Shelf A-2"
        print("[PASS] Looking up Batch 2 code returned only Batch 2.")


        # 2. Verify Fallback Search by Name / Batch
        print("\n[TEST 2] Verifying search fallback (/api/medicines/search)...")
        # Search by name "Paracetamol"
        resp = client.get("/api/medicines/search?q=Paracetamol")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 2
        names = [r["name"] for r in results]
        batches = [r["batch_number"] for r in results]
        assert "Paracetamol 500mg" in names
        assert "BATCH-IMPR-1" in batches
        assert "BATCH-IMPR-2" in batches
        print("[PASS] Search by name 'Paracetamol' returns both batches.")

        # Search by batch "BATCH-IMPR-1"
        resp = client.get("/api/medicines/search?q=BATCH-IMPR-1")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["batch_number"] == "BATCH-IMPR-1"
        print("[PASS] Search by batch number returns the exact matching batch.")


        # 3. Verify Storage Location Updates (Live read, QR code ID unchanged)
        print("\n[TEST 3] Verifying storage location updates...")
        qr_loc = generate_unique_qr_code_id(db, "BATCH-IMPR-LOC")
        img_loc = generate_qr_svg_base64(qr_loc)
        med_loc = Medicine(
            name="Location Test Med",
            strength="100mg",
            manufacturer="Pfizer",
            batch_number="BATCH-IMPR-LOC",
            expiry_date=datetime.date(2026, 12, 31),
            mrp=100.0,
            purchase_price=80.0,
            quantity=50,
            reorder_threshold=5,
            storage_location="Shelf A-3",
            qr_code_id=qr_loc,
            qr_code_image=img_loc
        )
        db.add(med_loc)
        db.commit()
        db.refresh(med_loc)

        # Update storage location
        db.expire_all()
        med_to_update = db.query(Medicine).filter(Medicine.id == med_loc.id).first()
        med_to_update.storage_location = "Shelf Z-99 (Moved)"
        db.commit()
        db.refresh(med_to_update)

        # Confirm ID and image are unchanged
        assert med_to_update.qr_code_id == qr_loc
        assert med_to_update.qr_code_image == img_loc
        print("[PASS] Storage location update did not touch qr_code_id or qr_code_image.")

        # Lookup and confirm live read returns the updated location
        resp = client.get(f"/api/medicines/lookup/{qr_loc}")
        assert resp.status_code == 200
        data_loc = resp.json()
        assert data_loc["storage_location"] == "Shelf Z-99 (Moved)"
        print("[PASS] Lookup returned the latest live storage location.")


        # Cleanup test data
        db.query(Medicine).filter(Medicine.batch_number.in_(["BATCH-IMPR-1", "BATCH-IMPR-2", "BATCH-IMPR-LOC"])).delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")
        print("=" * 80)
        print("ALL QR CODE USABILITY & RELIABILITY IMPROVEMENTS TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        db.query(Medicine).filter(Medicine.batch_number.in_(["BATCH-IMPR-1", "BATCH-IMPR-2", "BATCH-IMPR-LOC"])).delete()
        db.commit()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()

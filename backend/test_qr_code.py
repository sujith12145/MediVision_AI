"""
Integration tests for QR Code generation and scanning lookup.
"""

import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.medicine import Medicine
from app.dependencies import get_current_user, SupabaseUser
from app.services.qr_service import generate_unique_qr_code_id, generate_qr_svg_base64

client = TestClient(app)


def run_tests():
    print("=" * 80)
    print("RUNNING QR CODE SCANNING & LOOKUP INTEGRATION TESTS")
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
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-QR-TEST").delete()
        db.commit()

        # 1. Test QR generation helper functions
        print("[TEST 1] Testing QR generation services...")
        qr_id = generate_unique_qr_code_id(db, "BATCH-QR-TEST")
        assert qr_id.startswith("BATCH-QR-TEST-")
        
        qr_image = generate_qr_svg_base64(qr_id)
        assert qr_image.startswith("data:image/svg+xml;base64,")
        print("[PASS] QR code ID and SVG image generated successfully.")

        # 2. Test saving a new medicine generates QR code
        print("\n[TEST 2] Testing confirm_intake auto-generates QR code...")
        med = Medicine(
            name="QR Code Test Med",
            strength="10mg",
            manufacturer="Test Lab",
            batch_number="BATCH-QR-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=12.50,
            purchase_price=8.0,
            quantity=50,
            reorder_threshold=10,
            storage_location="Shelf QR",
            qr_code_id=None,
            qr_code_image=None
        )
        db.add(med)
        db.commit()
        db.refresh(med)
        med_id = med.id
        print(f"[SEED] Seeded test medicine '{med.name}' with ID {med_id} and NULL QR code fields.")

        # Trigger startup event logic manually
        from app.main import populate_missing_qr_codes
        populate_missing_qr_codes()

        # Retrieve the medicine and verify it now has QR code info
        db.expire_all()
        updated_med = db.query(Medicine).filter(Medicine.id == med_id).first()
        assert updated_med.qr_code_id is not None
        assert updated_med.qr_code_image is not None
        assert updated_med.qr_code_id.startswith("BATCH-QR-TEST-")
        print(f"[PASS] Startup self-healing populated QR Code ID: {updated_med.qr_code_id}")

        # 3. Test Lookup API endpoint
        print(f"\n[TEST 3] GET /api/medicines/lookup/{updated_med.qr_code_id}...")
        resp = client.get(f"/api/medicines/lookup/{updated_med.qr_code_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == med_id
        assert data["qr_code_id"] == updated_med.qr_code_id
        assert data["qr_code_image"] == updated_med.qr_code_image
        assert data["name"] == "QR Code Test Med"
        print("[PASS] lookup endpoint returned correct medicine data.")

        # 4. Test Lookup API endpoint with non-existent QR ID
        print("\n[TEST 4] GET /api/medicines/lookup/NON_EXISTENT_QR_ID...")
        resp = client.get("/api/medicines/lookup/NON_EXISTENT_QR_ID")
        assert resp.status_code == 404, resp.text
        print("[PASS] lookup endpoint correctly returned 404 for invalid QR ID.")

        # Cleanup test data
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-QR-TEST").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")
        print("=" * 80)
        print("ALL QR CODE & LOOKUP INTEGRATION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-QR-TEST").delete()
        db.commit()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()

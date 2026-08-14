import sys
import pathlib
import threading
from pathlib import Path
from dotenv import load_dotenv

env_path = Path("d:/shi solo project/MediVision AI/backend/.env")
load_dotenv(dotenv_path=env_path)

sys.path.insert(0, str(pathlib.Path(__file__).parent.resolve()))

import datetime
from fastapi.testclient import TestClient
from app.main import app  # type: ignore
from app.database import SessionLocal, engine  # type: ignore
from app.models.medicine import Medicine  # type: ignore
from app.models.sale import Sale  # type: ignore
from app.models.sale_item import SaleItem  # type: ignore
from app.models.audit_log import AuditLog  # type: ignore
from app.dependencies import get_current_user, SupabaseUser  # type: ignore

client = TestClient(app)

def run_concurrency_test():
    print("=" * 80)
    print("RUNNING SALES CONCURRENCY SAFETY TEST ON:", engine.url)
    print("=" * 80)

    # 1. Override Auth Dependency
    test_user_email = "admin@medivision.local"
    app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
        id="3b7441ec-ca09-4e8d-8809-8eeea51836a3",
        email=test_user_email
    )

    db = SessionLocal()
    try:
        # Cleanup
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(AuditLog).filter(AuditLog.action == "sale").delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-CONC-TEST").delete()
        db.commit()

        # Seed medicine
        # Qty: 10, MRP: 20.0
        test_med = Medicine(
            name="Aspirin Concurrency Test",
            strength="100mg",
            manufacturer="Bayer",
            batch_number="BATCH-CONC-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=20.0,
            quantity=10,
            reorder_threshold=2,
            storage_location="Shelf C"
        )
        db.add(test_med)
        db.commit()
        db.refresh(test_med)
        med_id = test_med.id
        print(f"[SEED] Seeded medicine. ID={med_id}, Quantity=10")

        results = []
        errors = []

        # Target function for threads
        def send_sale_request():
            payload = {
                "items": [
                    {
                        "medicine_id": med_id,
                        "quantity_sold": 6,
                        "sale_price": 20.0
                    }
                ]
            }
            try:
                # Use shared TestClient (which is thread safe)
                resp = client.post("/api/sales", json=payload)
                results.append(resp)
            except Exception as e:
                errors.append(e)

        # Spawn two threads
        t1 = threading.Thread(target=send_sale_request)
        t2 = threading.Thread(target=send_sale_request)

        # Start them near-simultaneously
        t1.start()
        t2.start()

        # Wait for both to finish
        t1.join()
        t2.join()

        print(f"\n[THREADS COMPLETED] Received {len(results)} responses, {len(errors)} network errors.")
        
        status_codes = [r.status_code for r in results]
        print(f"Status Codes: {status_codes}")
        
        # Verify exactly one succeeds and one fails with 400
        success_count = status_codes.count(201)
        fail_count = status_codes.count(400)
        
        print(f"Success Count: {success_count}")
        print(f"Fail Count   : {fail_count}")

        db.refresh(test_med)
        final_qty = test_med.quantity
        print(f"Final Quantity in DB: {final_qty}")

        # Exactly one must succeed and decrement the stock by 6 (leaving 4)
        assert success_count == 1, f"Expected exactly 1 successful sale, got {success_count}"
        assert final_qty == 4, f"Expected final stock to be 4, got {final_qty}"
        
        # Find the failed response and verify it has the "insufficient stock" detail
        failed_resps = [r for r in results if r.status_code == 400]
        assert len(failed_resps) == 1, "Expected exactly 1 failed response with status 400"
        assert "insufficient stock" in failed_resps[0].json()["detail"]
        print("[PASS] Concurrency control verified: exactly one sale succeeded and the other was rejected with 'insufficient stock'.")

        # Cleanup
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(AuditLog).filter(AuditLog.action == "sale").delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-CONC-TEST").delete()
        db.commit()
        print("[CLEANUP] Cleanup successful.")

        print("=" * 80)
        print("CONCURRENCY SAFETY TEST PASSED!")
        print("=" * 80)

    finally:
        db.close()
        app.dependency_overrides.clear()

if __name__ == "__main__":
    run_concurrency_test()

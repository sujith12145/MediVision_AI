import sys
import pathlib
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

def run_tests():
    print("=" * 80)
    print("RUNNING MULTI-ITEM SALES INTEGRATION TESTS ON:", engine.url)
    print("=" * 80)

    # 1. Override Auth Dependency
    test_user_email = "admin@medivision.local"
    app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
        id="3b7441ec-ca09-4e8d-8809-8eeea51836a3",
        email=test_user_email
    )

    db = SessionLocal()
    try:
        # Cleanup existing test data
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(AuditLog).filter(AuditLog.action == "sale").delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-SALES-TEST").delete()
        db.commit()

        # Seed medicines for sales tests
        # Med A: Qty 10, MRP 50.0
        med_a = Medicine(
            name="Aspirin Sales Test",
            strength="100mg",
            manufacturer="Bayer",
            batch_number="BATCH-SALES-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=50.0,
            quantity=10,
            reorder_threshold=3,
            storage_location="Shelf A"
        )
        # Med B: Qty 5, MRP 100.0
        med_b = Medicine(
            name="Amoxicillin Sales Test",
            strength="500mg",
            manufacturer="Glaxo",
            batch_number="BATCH-SALES-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=100.0,
            quantity=5,
            reorder_threshold=2,
            storage_location="Shelf B"
        )
        db.add_all([med_a, med_b])
        db.commit()
        db.refresh(med_a)
        db.refresh(med_b)
        
        id_a = med_a.id
        id_b = med_b.id
        print(f"[SEED] Seeded medicines. Med A ID={id_a} (Qty=10), Med B ID={id_b} (Qty=5)")

        # Test Case 1: POST /api/sales (Successful Multi-Item Sale)
        print("\n[TEST 1] POST /api/sales (record a successful sale of 3 units of Med A and 2 units of Med B)...")
        payload = {
            "items": [
                {"medicine_id": id_a, "quantity_sold": 3, "sale_price": 50.0},
                {"medicine_id": id_b, "quantity_sold": 2, "sale_price": 100.0}
            ]
        }
        resp = client.post("/api/sales", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        
        # Verify master properties
        assert data["sold_by"] == f"{test_user_email} (admin)"
        assert data["total_amount"] == (3 * 50.0) + (2 * 100.0) # 350.0
        assert len(data["items"]) == 2
        
        # Verify item details
        item_a = next(item for item in data["items"] if item["medicine_id"] == id_a)
        item_b = next(item for item in data["items"] if item["medicine_id"] == id_b)
        assert item_a["quantity_sold"] == 3
        assert item_a["sale_price"] == 50.0
        assert item_a["line_total"] == 150.0
        assert item_b["quantity_sold"] == 2
        assert item_b["sale_price"] == 100.0
        assert item_b["line_total"] == 200.0
        print("[PASS] Successful multi-item sale processed and correct values returned.")

        # Verify DB updates
        print("\n[VERIFICATION 1] Checking DB states...")
        db.refresh(med_a)
        db.refresh(med_b)
        assert med_a.quantity == 7, f"Expected Med A quantity to be 7, got {med_a.quantity}"
        assert med_b.quantity == 3, f"Expected Med B quantity to be 3, got {med_b.quantity}"
        print("[PASS] Inventory stock decremented correctly.")

        # Check Sales rows
        sale_row = db.query(Sale).first()
        assert sale_row is not None
        assert float(sale_row.total_amount) == 350.0
        assert len(sale_row.items) == 2
        print("[PASS] Sale and SaleItems verified in database.")

        # Check AuditLogs
        audit_rows = db.query(AuditLog).filter(AuditLog.action == "sale").all()
        assert len(audit_rows) == 2, f"Expected 2 audit logs, got {len(audit_rows)}"
        audit_a = next(a for a in audit_rows if a.medicine_id == id_a)
        audit_b = next(a for a in audit_rows if a.medicine_id == id_b)
        assert audit_a.old_value == "10" and audit_a.new_value == "7"
        assert audit_b.old_value == "5" and audit_b.new_value == "3"
        print("[PASS] AuditLog entries verified in database.")

        # Test Case 2: POST /api/sales (Partial stock fail rolls back entire checkout)
        print("\n[TEST 2] POST /api/sales (partial stock failure rolls back)...")
        # Attempt to sell 2 units of Med A (stock is 7 - OK) and 4 units of Med B (stock is 3 - FAIL)
        payload_bad = {
            "items": [
                {"medicine_id": id_a, "quantity_sold": 2, "sale_price": 50.0},
                {"medicine_id": id_b, "quantity_sold": 4, "sale_price": 100.0}
            ]
        }
        resp = client.post("/api/sales", json=payload_bad)
        assert resp.status_code == 400, f"Expected 400 Bad Request, got {resp.status_code}"
        assert "insufficient stock" in resp.json()["detail"], f"Expected 'insufficient stock' error detail, got {resp.text}"

        # Verify database was rolled back completely (no change to Med A or Med B)
        db.refresh(med_a)
        db.refresh(med_b)
        assert med_a.quantity == 7, f"Med A quantity should remain 7, got {med_a.quantity}"
        assert med_b.quantity == 3, f"Med B quantity should remain 3, got {med_b.quantity}"
        
        # Verify no additional sale or sale items were written
        sales_count = db.query(Sale).count()
        assert sales_count == 1, f"Expected only 1 sale in DB, got {sales_count}"
        print("[PASS] Entire checkout transaction correctly rolled back upon partial stock failure.")

        # Test Case 3: POST /api/sales (Zero / Negative Quantity Validation)
        print("\n[TEST 3] POST /api/sales (zero/negative quantity validation)...")
        payload_neg = {
            "items": [
                {"medicine_id": id_a, "quantity_sold": 0, "sale_price": 50.0}
            ]
        }
        resp = client.post("/api/sales", json=payload_neg)
        assert resp.status_code in (400, 422)

        payload_neg2 = {
            "items": [
                {"medicine_id": id_a, "quantity_sold": -2, "sale_price": 50.0}
            ]
        }
        resp = client.post("/api/sales", json=payload_neg2)
        assert resp.status_code in (400, 422)
        print("[PASS] Blocked non-positive quantity sales successfully.")

        # Test Case 4: GET /api/sales (History & Date Filters)
        print("\n[TEST 4] GET /api/sales (verify history listing)...")
        resp = client.get("/api/sales")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 1
        assert len(history[0]["items"]) == 2
        
        # Verify filters
        today_str = datetime.date.today().isoformat()
        tomorrow_str = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        yesterday_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

        # filter including today
        resp = client.get(f"/api/sales?start_date={yesterday_str}&end_date={tomorrow_str}")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # filter excluding today
        resp = client.get(f"/api/sales?start_date={tomorrow_str}")
        assert resp.status_code == 200
        assert len(resp.json()) == 0
        print("[PASS] Sales history listing and date range filters verified.")

        # Test Case 5: POST /api/sales (Enforce MRP, ignore client-provided sale_price)
        print("\n[TEST 5] POST /api/sales (enforce MRP, ignore client-provided sale_price)...")
        # Try to sell Med A at sale_price 20.0 (MRP is 50.0)
        payload_mrp = {
            "items": [
                {"medicine_id": id_a, "quantity_sold": 1, "sale_price": 20.0}
            ]
        }
        resp = client.post("/api/sales", json=payload_mrp)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        # The sale_price in response should be 50.0 (MRP), NOT 20.0
        assert data["items"][0]["sale_price"] == 50.0
        assert data["items"][0]["line_total"] == 50.0
        assert data["total_amount"] == 50.0
        print("[PASS] Enforced MRP and successfully ignored client-provided price.")

        # Test Case 6: POST /api/sales (Include optional customer details)
        print("\n[TEST 6] POST /api/sales (record a sale with valid optional customer details)...")
        payload_customer = {
            "customer_name": "Alice Smith",
            "customer_phone": "+1 (555) 123-4567",
            "items": [
                {"medicine_id": id_a, "quantity_sold": 1, "sale_price": 50.0}
            ]
        }
        resp = client.post("/api/sales", json=payload_customer)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["customer_name"] == "Alice Smith"
        assert data["customer_phone"] == "+1 (555) 123-4567"
        
        # Verify in DB
        sale_db = db.query(Sale).filter(Sale.id == data["id"]).first()
        assert sale_db is not None
        assert sale_db.customer_name == "Alice Smith"
        assert sale_db.customer_phone == "+1 (555) 123-4567"
        print("[PASS] Successfully saved customer_name and customer_phone to DB.")

        # Test Case 7: POST /api/sales (Reject invalid customer phone formats & ensure sanitised error detail)
        print("\n[TEST 7] POST /api/sales (loose phone validation and log/error sanitisation check)...")
        bad_phone_val = "123-INVALID-456"
        payload_bad_phone = {
            "customer_name": "Bob",
            "customer_phone": bad_phone_val,
            "items": [
                {"medicine_id": id_a, "quantity_sold": 1, "sale_price": 50.0}
            ]
        }
        resp = client.post("/api/sales", json=payload_bad_phone)
        assert resp.status_code == 400
        error_detail = resp.json()["detail"]
        assert "invalid" in error_detail.lower()
        # Verify the sensitive user phone input is NOT leaked back in error detail message
        assert bad_phone_val not in error_detail
        print("[PASS] Successfully blocked bad phone number formats and verified zero leakage in error response.")

        # Test Case 8: POST /api/assistant/ask (Confirm AI Engine refuses customer/billing questions)
        print("\n[TEST 8] POST /api/assistant/ask (refuses customer name/phone queries)...")
        q_refuse = "What is the phone number of the customer who bought Aspirin?"
        resp = client.post("/api/assistant/ask", json={"question": q_refuse})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["answer"] == "I can only answer questions about your actual inventory data"
        assert len(data["raw_data"]) == 0
        print("[PASS] AI assistant query filter successfully blocked the query and returned correct fallback message.")

        # Cleanup
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(AuditLog).filter(AuditLog.action == "sale").delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-SALES-TEST").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")

        print("=" * 80)
        print("ALL MULTI-ITEM SALES INTEGRATION TESTS PASSED!")
        print("=" * 80)

    finally:
        db.close()
        app.dependency_overrides.clear()

if __name__ == "__main__":
    run_tests()

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
from app.models.monthly_finance import MonthlyFinance  # type: ignore
from app.models.sale import Sale  # type: ignore
from app.models.sale_item import SaleItem  # type: ignore
from app.dependencies import get_current_user, SupabaseUser  # type: ignore

client = TestClient(app)

def run_tests():
    print("=" * 80)
    print("RUNNING MONTHLY BUSINESS OVERVIEW INTEGRATION TESTS ON:", engine.url)
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
        db.query(MonthlyFinance).delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-FIN-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "admin@medivision.local").delete()
        db.commit()

        # Seed medicines to test the live Current Inventory Investment calculation
        # Med A: qty 10, mrp 15.0 -> 150.0 value
        med_a = Medicine(
            name="Aspirin Finance",
            strength="100mg",
            manufacturer="Bayer",
            batch_number="BATCH-FIN-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=15.0,
            purchase_price=15.0,
            quantity=10,
            reorder_threshold=5,
            storage_location="Shelf F"
        )
        # Med B: qty 5, mrp 30.0 -> 150.0 value
        # Total live investment = 300.00
        med_b = Medicine(
            name="Ibuprofen Finance",
            strength="200mg",
            manufacturer="Moderna",
            batch_number="BATCH-FIN-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=30.0,
            purchase_price=30.0,
            quantity=5,
            reorder_threshold=5,
            storage_location="Shelf F"
        )
        db.add_all([med_a, med_b])
        
        # Seed 3 real sales in 2026-07 (total amount = 100 + 200 + 300 = 600)
        sale_a = Sale(
            sold_by="admin@medivision.local",
            sold_at=datetime.datetime(2026, 7, 5, 12, 0, 0),
            total_amount=100.0
        )
        sale_b = Sale(
            sold_by="admin@medivision.local",
            sold_at=datetime.datetime(2026, 7, 15, 14, 30, 0),
            total_amount=200.0
        )
        sale_c = Sale(
            sold_by="admin@medivision.local",
            sold_at=datetime.datetime(2026, 7, 28, 9, 15, 0),
            total_amount=300.0
        )
        db.add_all([sale_a, sale_b, sale_c])
        db.commit()
        print("[SEED] Seeded test medicines and 3 sales ($600.00 total) for 2026-07.")
        
        # Calculate expected computed sales dynamically because other sales might exist in the database for 2026-07
        from sqlalchemy import func
        base_sales = db.query(func.sum(Sale.total_amount)).filter(
            Sale.sold_at >= datetime.datetime(2026, 7, 1, 0, 0, 0),
            Sale.sold_at <= datetime.datetime(2026, 7, 31, 23, 59, 59, 999999),
            Sale.sold_by != "admin@medivision.local"
        ).scalar()
        base_sales_val = float(base_sales) if base_sales is not None else 0.0
        expected_computed_sales = base_sales_val + 600.0

        # Test Case 1: POST /api/finance (save new)
        print("\n[TEST 1] POST /api/finance (save new record)...")
        payload = {
            "month": "2026-07",
            "rent": 1000.0,
            "electricity_and_bills": 200.0,
            "staff_salaries": 2000.0,
            "other_expenses": 300.0,
            "other_revenue": 500.0
        }
        resp = client.post("/api/finance", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["month"] == "2026-07"
        assert float(data["rent"]) == 1000.0
        assert float(data["other_revenue"]) == 500.0
        assert abs(float(data["computed_revenue"]) - expected_computed_sales) < 0.01
        assert abs(float(data["total_revenue"]) - (expected_computed_sales + 500.0)) < 0.01
        print("[PASS] New monthly record saved successfully with live calculations.")

        # Test Case 2: POST /api/finance (update existing)
        print("\n[TEST 2] POST /api/finance (update existing record)...")
        payload["other_revenue"] = 1000.0
        resp = client.post("/api/finance", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert float(data["other_revenue"]) == 1000.0
        assert abs(float(data["total_revenue"]) - (expected_computed_sales + 1000.0)) < 0.01
        print("[PASS] Existing monthly record updated successfully.")

        # Test Case 3: POST /api/finance (server-side validation: negative numbers)
        print("\n[TEST 3] POST /api/finance (validation: negative bills)...")
        bad_payload = payload.copy()
        bad_payload["electricity_and_bills"] = -50.0
        resp = client.post("/api/finance", json=bad_payload)
        assert resp.status_code == 422, f"Expected 422 validation error, got {resp.status_code}"
        print("[PASS] Blocked negative values successfully.")

        # Test Case 4: GET /api/finance/overview/{month} (compute metrics)
        print("\n[TEST 4] GET /api/finance/overview/2026-07 (verify math)...")
        resp = client.get("/api/finance/overview/2026-07")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        
        # Expected:
        # total_costs = 1000 + 200 + 2000 + 300 = 3500.0
        # current_inventory_investment = 300.0 (seeded above)
        # computed_revenue = expected_computed_sales (from seeded sales + existing sales)
        # other_revenue = 1000.0
        # total_revenue = expected_computed_sales + 1000.0
        # net_profit = (expected_computed_sales + 1000.0) - 3500.0
        expected_profit = (expected_computed_sales + 1000.0) - 3500.0
        
        assert data["month"] == "2026-07"
        assert data["total_costs"] == 3500.0
        assert data["current_inventory_investment"] >= 300.0
        assert abs(data["computed_revenue"] - expected_computed_sales) < 0.01
        assert data["other_revenue"] == 1000.0
        assert abs(data["total_revenue"] - (expected_computed_sales + 1000.0)) < 0.01
        assert abs(data["net_profit"] - expected_profit) < 0.01
        expected_roi = (expected_profit / data["current_inventory_investment"]) * 100.0
        assert abs(data["return_on_investment"] - expected_roi) < 0.1

        print("[PASS] Financial metrics and ROI computed correctly.")

        # Test Case 5: GET /api/finance (list all sorted)
        print("\n[TEST 5] GET /api/finance (listing sorted)...")
        # Save another month
        payload2 = payload.copy()
        payload2["month"] = "2026-06"
        resp = client.post("/api/finance", json=payload2)
        assert resp.status_code == 201

        resp = client.get("/api/finance")
        assert resp.status_code == 200
        records = resp.json()
        assert len(records) == 2
        assert records[0]["month"] == "2026-07"
        assert records[1]["month"] == "2026-06"
        print("[PASS] Records list returned correctly sorted (newest month first).")

        # Test Case 6: Unique medicines sold in month
        print("\n[TEST 6] GET /api/finance/gst-report/medicines/2026-07...")
        sale_item_a = SaleItem(
            sale_id=sale_a.id,
            medicine_id=med_a.id,
            quantity_sold=2,
            sale_price=15.0,
            line_total=30.0
        )
        db.add(sale_item_a)
        db.commit()
        
        resp = client.get("/api/finance/gst-report/medicines/2026-07")
        assert resp.status_code == 200
        data_meds = resp.json()
        assert len(data_meds) >= 1
        med_names = [m["name"] for m in data_meds]
        assert "Aspirin Finance" in med_names
        print("[PASS] Unique medicines sold in month retrieved successfully.")

        # Test Case 7: POST /api/finance/gst-report (PDF)
        print("\n[TEST 7] POST /api/finance/gst-report (PDF format)...")
        gst_payload = {
            "month": "2026-07",
            "medicines_config": {
                str(med_a.id): {
                    "hsn_code": "HSN123",
                    "gst_rate": 12.0
                }
            },
            "format": "pdf"
        }
        resp = client.post("/api/finance/gst-report", json=gst_payload)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert len(resp.content) > 0
        print("[PASS] GST PDF report generated successfully.")

        # Test Case 8: POST /api/finance/gst-report (Excel)
        print("\n[TEST 8] POST /api/finance/gst-report (Excel format)...")
        gst_payload["format"] = "excel"
        resp = client.post("/api/finance/gst-report", json=gst_payload)
        assert resp.status_code == 200
        assert "spreadsheet" in resp.headers["content-type"]
        assert len(resp.content) > 0
        print("[PASS] GST Excel report generated successfully.")

        # Test Case 9: GET /api/finance/transactions/export
        print("\n[TEST 9] GET /api/finance/transactions/export...")
        from app.models.extraction_record import ExtractionRecord
        from app.models.audit_log import AuditLog
        import json
        
        confirm_time = datetime.datetime.now(datetime.timezone.utc)
        ext_rec = ExtractionRecord(
            image_path="test_inflow.png",
            status="done",
            medicine_id=med_a.id,
            confirmed_by="admin@medivision.local (admin)",
            confirmed_at=confirm_time,
            final_values=json.dumps({
                "medicine_name": "Aspirin Finance",
                "batch_number": "BATCH-FIN-TEST",
                "purchase_price": 12.50
            })
        )
        db.add(ext_rec)
        db.flush()
        
        audit = AuditLog(
            medicine_id=med_a.id,
            action="created",
            changed_by="admin@medivision.local (admin)",
            new_value=json.dumps({
                "name": "Aspirin Finance",
                "batch_number": "BATCH-FIN-TEST",
                "quantity": 10
            }),
            timestamp=confirm_time
        )
        db.add(audit)
        db.commit()

        resp = client.get(f"/api/finance/transactions/export?month=2026-07")
        assert resp.status_code == 200
        assert "spreadsheet" in resp.headers["content-type"]
        assert len(resp.content) > 0
        print("[PASS] Transactions Excel ledger exported successfully.")

        # Cleanup
        db.query(SaleItem).delete()
        db.query(ExtractionRecord).delete()
        db.query(AuditLog).delete()
        db.query(MonthlyFinance).delete()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-FIN-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "admin@medivision.local").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")


        print("=" * 80)
        print("ALL MONTHLY BUSINESS OVERVIEW INTEGRATION TESTS PASSED!")
        print("=" * 80)

    finally:
        db.close()
        app.dependency_overrides.clear()

if __name__ == "__main__":
    run_tests()

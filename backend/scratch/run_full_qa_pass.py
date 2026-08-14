import sys
import pathlib
import json
import datetime
from pathlib import Path
from dotenv import load_dotenv

env_path = Path("d:/shi solo project/MediVision AI/backend/.env")
load_dotenv(dotenv_path=env_path)

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent.resolve()))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.medicine import Medicine
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.audit_log import AuditLog
from app.models.extraction_record import ExtractionRecord
from app.models.monthly_finance import MonthlyFinance
from app.dependencies import get_current_user, SupabaseUser

client = TestClient(app)

results = {}

def report(name, passed, detail=""):
    results[name] = {"passed": passed, "detail": detail}
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}")
    if detail:
        print(f"      Detail: {detail}")

def check_no_hardcoded_user():
    print("\n--- Auditing Codebase for Hardcoded User References ---")
    root_dir = pathlib.Path("d:/shi solo project/MediVision AI/backend")
    files_to_check = list(root_dir.glob("app/**/*.py")) + list(root_dir.glob("*.py"))
    
    found_issues = []
    old_usernames = ["demo@medivision", "user@example", "test@example"]
    
    for f in files_to_check:
        if f.name == "run_full_qa_pass.py" or "test_" in f.name:
            continue
        try:
            content = f.read_text(encoding="utf-8")
            for username in old_usernames:
                if username in content:
                    found_issues.append(f"{f.relative_to(root_dir)}: contains '{username}'")
        except Exception as e:
            pass
            
    if found_issues:
        report("No Hardcoded User References", False, "; ".join(found_issues))
    else:
        report("No Hardcoded User References", True, "No references to old demo users found in active app code.")

def check_rbac_endpoints():
    print("\n--- Auditing RBAC Route Gates ---")
    # Clean setup
    db = SessionLocal()
    try:
        # Clear any BATCH-QA-TEST entries
        db.query(SaleItem).filter(SaleItem.medicine_id.in_(
            db.query(Medicine.id).filter(Medicine.batch_number == "BATCH-QA-TEST")
        )).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.medicine_id.in_(
            db.query(Medicine.id).filter(Medicine.batch_number == "BATCH-QA-TEST")
        )).delete(synchronize_session=False)
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-QA-TEST").delete()
        db.query(ExtractionRecord).filter(ExtractionRecord.image_path == "medicine-images/qa_test.png").delete()
        db.commit()

        # Seed test medicine
        med = Medicine(
            name="QA Test Medicine",
            strength="500mg",
            manufacturer="QA Labs",
            batch_number="BATCH-QA-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=10), # Near expiry!
            mrp=100.0,
            purchase_price=60.0,
            quantity=50,
            reorder_threshold=10
        )
        db.add(med)
        
        record = ExtractionRecord(
            image_path="medicine-images/qa_test.png",
            status="awaiting_confirmation",
            raw_ai_response='{"medicine_name": "QA Test Medicine", "mrp": 100.0}'
        )
        db.add(record)
        db.commit()
        db.refresh(med)
        db.refresh(record)

        med_id = med.id
        record_id = record.id

        # confirm payload used for both staff (block) and pharmacist (allow) tests
        confirm_payload = {
            "medicine_name": "QA Test Medicine",
            "strength": "500mg",
            "manufacturer": "QA Labs",
            "batch_number": "BATCH-QA-TEST",
            "expiry_date": (datetime.date.today() + datetime.timedelta(days=10)).isoformat(),
            "mrp": 100.0,
            "purchase_price": 60.0,
            "quantity": 25 # Expiring < 30 days & Qty > 20 -> Trigger Near Expiry Warning!
        }

        # 1. STAFF TESTS
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="staff-qa", email="staff@medivision.local", role="staff"
        )
        
        # confirm intake block check
        resp = client.post(f"/api/intake/confirm/{record_id}", json=confirm_payload)
        staff_confirm_block = (resp.status_code == 403)

        # finance GET block check
        resp = client.get("/api/finance")
        staff_finance_get_block = (resp.status_code == 403)

        # finance POST block check
        resp = client.post("/api/finance", json={"month": "2026-07", "rent": 100})
        staff_finance_post_block = (resp.status_code == 403)

        # history GET block check
        resp = client.get(f"/api/inventory/{med_id}/history")
        staff_history_block = (resp.status_code == 403)

        report("Staff Endpoint Blocks", staff_confirm_block and staff_finance_get_block and staff_finance_post_block and staff_history_block,
               f"Confirm={staff_confirm_block}, FinGET={staff_finance_get_block}, FinPOST={staff_finance_post_block}, Hist={staff_history_block}")

        # 2. PHARMACIST TESTS
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="pharmacist-qa", email="pharmacist@medivision.local", role="pharmacist"
        )
        
        # confirm intake allowed
        resp = client.post(f"/api/intake/confirm/{record_id}", json=confirm_payload)
        ph_confirm_allowed = (resp.status_code == 201)
        
        # finance GET allowed
        resp = client.get("/api/finance")
        ph_finance_get_allowed = (resp.status_code == 200)

        # finance POST blocked
        resp = client.post("/api/finance", json={"month": "2026-07", "rent": 100})
        ph_finance_post_block = (resp.status_code == 403)

        # history GET blocked
        resp = client.get(f"/api/inventory/{med_id}/history")
        ph_history_block = (resp.status_code == 403)

        report("Pharmacist Endpoint Rules", ph_confirm_allowed and ph_finance_get_allowed and ph_finance_post_block and ph_history_block,
               f"Confirm={ph_confirm_allowed}, FinGET={ph_finance_get_allowed}, FinPOST={ph_finance_post_block}, Hist={ph_history_block}")

        # 3. AUDIT TRAIL LOGGING INTEGRITY
        db.commit()
        latest_audit = db.query(AuditLog).filter(
            AuditLog.medicine_id == med_id,
            AuditLog.action == "quantity_updated"
        ).order_by(AuditLog.timestamp.desc()).first()
        
        audit_trail_ok = False
        if latest_audit:
            audit_trail_ok = (latest_audit.changed_by == "pharmacist@medivision.local (pharmacist)")
            detail_msg = f"changed_by: '{latest_audit.changed_by}'"
        else:
            detail_msg = "Audit log row was not generated on pharmacist confirmation."
        report("Audit Trail Format Integrity", audit_trail_ok, detail_msg)

        # 4. NEAR EXPIRY LOGGING
        near_expiry_log = db.query(AuditLog).filter(
            AuditLog.medicine_id == med_id,
            AuditLog.action == "risk_warning_acknowledged"
        ).first()
        near_expiry_ok = (near_expiry_log is not None) and (near_expiry_log.changed_by == "pharmacist@medivision.local (pharmacist)")
        report("Near-Expiry Warning Logging", near_expiry_ok, f"Found={near_expiry_log is not None}")

        # Clean setup for finance and billing
        db.query(SaleItem).filter(SaleItem.medicine_id == med_id).delete()
        db.query(Sale).filter(Sale.sold_by.like("%staff@medivision.local%")).delete()
        db.query(AuditLog).filter(AuditLog.medicine_id == med_id).delete()
        db.query(Medicine).filter(Medicine.id == med_id).delete()
        db.commit()

    except Exception as e:
        db.rollback()
        report("RBAC Endpoint Audit", False, f"Exception: {e}")
    finally:
        db.close()
        app.dependency_overrides.clear()

def check_billing_inventory_interaction():
    print("\n--- Auditing Billing + Inventory + Reorder Interaction ---")
    db = SessionLocal()
    try:
        # Seed medicine just above threshold
        med = Medicine(
            name="Checkout QA Med",
            strength="250mg",
            manufacturer="QA Corp",
            batch_number="BATCH-CHECKOUT-QA",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=80.0,
            purchase_price=50.0,
            quantity=12,
            reorder_threshold=10
        )
        db.add(med)
        db.commit()
        db.refresh(med)
        med_id = med.id

        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="staff-qa", email="staff@medivision.local", role="staff"
        )

        # 1. Perform sale of 3 units -> drops quantity to 9 (below reorder_threshold of 10)
        sales_payload = {
            "items": [
                {"medicine_id": med_id, "quantity_sold": 3, "sale_price": 80.0}
            ]
        }
        resp = client.post("/api/sales", json=sales_payload)
        assert resp.status_code == 201

        # Query reorder recommendations
        resp = client.get("/api/inventory/reorder-suggestions")
        suggestions = resp.json()
        med_in_suggestions = any(s["medicine_id"] == med_id for s in suggestions)
        
        # 2. Check urgency predictions
        resp = client.get("/api/inventory/smart-reorder-predictions")
        predictions = resp.json()
        pred_med = next((p for p in predictions if p["medicine_id"] == med_id), None)
        
        urgency_bucket_ok = False
        if pred_med:
            # check if stock number is updated to 9
            urgency_bucket_ok = (pred_med["quantity"] == 9)
            bucket_msg = f"Status: {pred_med['status']}, Stock: {pred_med['quantity']}"
        else:
            bucket_msg = "Medicine not found in smart predictions."

        report("Reorder Suggestions Immediate Sync", med_in_suggestions, f"Found={med_in_suggestions}")
        report("Smart Reorder Urgency Live Sync", urgency_bucket_ok, bucket_msg)

        # Clean up
        db.query(SaleItem).filter(SaleItem.medicine_id == med_id).delete()
        db.query(Sale).filter(Sale.sold_by.like("%staff@medivision.local%")).delete()
        db.query(AuditLog).filter(AuditLog.medicine_id == med_id).delete()
        db.query(Medicine).filter(Medicine.id == med_id).delete()
        db.commit()

    except Exception as e:
        db.rollback()
        report("Billing Inventory Sync Audit", False, f"Exception: {e}")
    finally:
        db.close()
        app.dependency_overrides.clear()

def check_concurrent_locking():
    print("\n--- Auditing Concurrent Locking Safety ---")
    import threading
    import time
    
    db = SessionLocal()
    med_id = None
    try:
        med = Medicine(
            name="Concurrent QA Med",
            strength="500mg",
            manufacturer="Lock Labs",
            batch_number="BATCH-CONCURRENT-QA",
            expiry_date=datetime.date.today() + datetime.timedelta(days=200),
            mrp=100.0,
            purchase_price=60.0,
            quantity=1, # Only 1 unit in stock!
            reorder_threshold=0
        )
        db.add(med)
        db.commit()
        db.refresh(med)
        med_id = med.id
    finally:
        db.close()

    # We will spawn two concurrent checkout threads attempting to buy the 1 unit simultaneously
    responses = []
    
    def sell():
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="staff-qa", email="staff@medivision.local", role="staff"
        )
        try:
            resp = client.post("/api/sales", json={
                "items": [{"medicine_id": med_id, "quantity_sold": 1, "sale_price": 100.0}]
            })
            responses.append(resp.status_code)
        except Exception as e:
            responses.append(500)
        finally:
            app.dependency_overrides.clear()

    t1 = threading.Thread(target=sell)
    t2 = threading.Thread(target=sell)
    
    t1.start()
    t2.start()
    
    t1.join()
    t2.join()

    # Only one should succeed (201), the other must be rejected due to insufficient stock (400)
    success_count = responses.count(201)
    fail_count = responses.count(400)
    
    locking_passed = (success_count == 1 and fail_count == 1)
    report("Concurrent Checkout Double-Spend Protection", locking_passed, f"Success={success_count}, Fail={fail_count}")

    # Clean up
    db = SessionLocal()
    try:
        db.query(SaleItem).filter(SaleItem.medicine_id == med_id).delete()
        db.query(Sale).filter(Sale.sold_by.like("%staff@medivision.local%")).delete()
        db.query(AuditLog).filter(AuditLog.medicine_id == med_id).delete()
        db.query(Medicine).filter(Medicine.id == med_id).delete()
        db.commit()
    finally:
        db.close()

def check_monthly_business_overview():
    print("\n--- Auditing Monthly Business Overview Metrics ---")
    db = SessionLocal()
    try:
        # Clear existing monthly finance records for 2026-07 to make tests pure
        db.query(MonthlyFinance).filter(MonthlyFinance.month == "2026-07").delete()
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.commit()

        # Seed medicines with known purchase prices and MRPs
        med1 = Medicine(name="Med Finance QA 1", quantity=10, purchase_price=40.0, mrp=60.0, batch_number="B-FIN-1", expiry_date=datetime.date.today())
        med2 = Medicine(name="Med Finance QA 2", quantity=5, purchase_price=80.0, mrp=120.0, batch_number="B-FIN-2", expiry_date=datetime.date.today())
        db.add_all([med1, med2])
        db.commit()
        db.refresh(med1)
        db.refresh(med2)

        # Total Current Inventory Investment:
        # 10 * 40.0 + 5 * 80.0 = 400.0 + 400.0 = 800.0 (based on purchase_price)
        # If it used MRP: 10 * 60 + 5 * 120 = 600 + 600 = 1200.0.

        # Record a sale for the current month (2026-07)
        app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
            id="admin-qa", email="admin@medivision.local", role="admin"
        )

        sale_payload = {
            "items": [
                {"medicine_id": med1.id, "quantity_sold": 2, "sale_price": 60.0}, # Sale amount = 2 * 60 = 120.0
                {"medicine_id": med2.id, "quantity_sold": 1, "sale_price": 120.0} # Sale amount = 1 * 120 = 120.0
            ]
        }
        # Total sale amount = 240.0
        resp = client.post("/api/sales", json=sale_payload)
        assert resp.status_code == 201

        # Check Monthly Business Overview live calculations
        # Month string: 2026-07
        month_str = "2026-07"
        resp = client.get(f"/api/finance/overview/{month_str}")
        assert resp.status_code == 200
        overview = resp.json()

        # A. Live inventory investment check (must use purchase_price)
        from sqlalchemy import func
        db_inv_val = db.query(func.sum(Medicine.quantity * Medicine.purchase_price)).filter(Medicine.quantity > 0).scalar() or 0.0
        inv_invest = overview["current_inventory_investment"]
        inv_invest_ok = (float(inv_invest) == float(db_inv_val))

        # B. Revenue check
        # computed_revenue must match sale amount (240.0)
        revenue_ok = (float(overview["computed_revenue"]) == 240.0)

        report("Current Inventory Investment uses Purchase Price", inv_invest_ok, f"Expected {db_inv_val}, Got {inv_invest}")
        report("Monthly Computed Revenue Matches Sales Sum", revenue_ok, f"Expected 240.0, Got {overview['computed_revenue']}")

        # C. Save monthly expenditures
        finance_payload = {
            "month": "2026-07",
            "rent": 100.0,
            "electricity_and_bills": 20.0,
            "staff_salaries": 50.0,
            "other_expenses": 10.0,
            "other_revenue": 10.0
        }
        resp = client.post("/api/finance", json=finance_payload)
        assert resp.status_code == 201
        
        # Verify Math on Overview
        # Costs = Rent (100) + Elec (20) + Salaries (50) + OtherExp (10) = 180.0
        # Total Revenue = computed_revenue (240.0) + other_revenue (10.0) = 250.0.
        # Net Profit = Total Revenue (250.0) - Total Cost (180.0) = 70.0.
        resp = client.get(f"/api/finance/overview/{month_str}")
        overview_post = resp.json()
        
        net_profit_ok = (float(overview_post["net_profit"]) == 70.0)

        report("Overview Net Profit Math Correct", net_profit_ok, f"Expected 70.0, Got {overview_post['net_profit']}")

        # Clean up
        db.query(SaleItem).delete()
        db.query(Sale).delete()
        db.query(MonthlyFinance).delete()
        db.query(Medicine).delete()
        db.commit()

    except Exception as e:
        db.rollback()
        report("Monthly Finance Overview Audit", False, f"Exception: {e}")
    finally:
        db.close()
        app.dependency_overrides.clear()

def check_general_reliability():
    print("\n--- Auditing General Reliability and Security ---")
    
    # 1. Check if error responses leak DB details or local folder paths
    # We will query with a non-existent route or make validation fail
    resp = client.post("/api/finance", json={"month": "invalid-month-format"})
    error_data = resp.text
    
    path_leak = ("d:\\shi" in error_data or "SuJith" in error_data or "antigravity" in error_data)
    credentials_leak = ("postgres" in error_data and "aws-1" in error_data and "pooler" in error_data)
    
    leak_check_ok = not path_leak and not credentials_leak
    report("No Stack Traces or Internal Path Leaks in Error Payload", leak_check_ok,
           f"PathLeak={path_leak}, CredsLeak={credentials_leak}")

if __name__ == "__main__":
    check_no_hardcoded_user()
    check_rbac_endpoints()
    check_billing_inventory_interaction()
    check_concurrent_locking()
    check_monthly_business_overview()
    check_general_reliability()

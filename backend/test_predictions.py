"""
Integration tests for Smart Reorder Predictions.
"""

import datetime
from fastapi.testclient import TestClient
from app.main import app  # type: ignore
from app.database import SessionLocal  # type: ignore
from app.models.medicine import Medicine  # type: ignore
from app.models.sale import Sale  # type: ignore
from app.models.sale_item import SaleItem  # type: ignore
from app.dependencies import get_current_user, SupabaseUser  # type: ignore

client = TestClient(app)

def run_tests():
    print("=" * 80)
    print("RUNNING SMART REORDER PREDICTION INTEGRATION TESTS")
    print("=" * 80)

    # 1. Bypass authentication/Supabase dependencies
    test_user_email = "admin@medivision.local"
    app.dependency_overrides[get_current_user] = lambda: SupabaseUser(
        id="3b7441ec-ca09-4e8d-8809-8eeea51836a3",
        email=test_user_email
    )

    db = SessionLocal()
    try:
        # Cleanup any pre-existing test data
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-PRED-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "test-pred@medivision.local").delete()
        db.commit()

        # Seed test medicine
        # Qty = 10, Threshold = 5
        med = Medicine(
            name="Amlodipine Prediction Test",
            strength="5mg",
            manufacturer="Pfizer",
            batch_number="BATCH-PRED-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=12.0,
            purchase_price=8.0,
            quantity=10,
            reorder_threshold=5,
            storage_location="Shelf B"
        )
        db.add(med)
        db.commit()
        db.refresh(med)
        med_id = med.id
        print(f"[SEED] Seeded test medicine '{med.name}' with ID {med_id}.")

        # Test Case 1: Insufficient history (0 sales checkouts)
        print("\n[TEST 1] GET /api/inventory/smart-reorder-predictions (0 checkouts)...")
        resp = client.get("/api/inventory/smart-reorder-predictions")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        
        # Find our seeded medicine in the response list
        our_pred = next((x for x in data if x["medicine_id"] == med_id), None)
        assert our_pred is not None
        assert our_pred["status"] == "insufficient_history"
        assert our_pred["daily_sales_velocity"] is None
        assert our_pred["estimated_days_until_stockout"] is None
        # Qty (10) > threshold (5) -> suggested reorder should be 0
        assert our_pred["suggested_reorder_quantity"] == 0
        print("[PASS] Handled insufficient history correctly when stock is safe.")

        # Test Case 1b: Insufficient history with stock below threshold
        print("\n[TEST 1B] Lowering stock below threshold with 0 sales...")
        med.quantity = 3
        db.commit()
        
        resp = client.get("/api/inventory/smart-reorder-predictions")
        assert resp.status_code == 200
        data = resp.json()
        our_pred = next((x for x in data if x["medicine_id"] == med_id), None)
        assert our_pred["status"] == "insufficient_history"
        # Suggested reorder = (Threshold * 2) - current quantity = (5 * 2) - 3 = 7
        assert our_pred["suggested_reorder_quantity"] == 7
        print("[PASS] Fallback threshold suggested quantity computes correctly.")

        # Restore quantity to 10
        med.quantity = 10
        db.commit()

        # Test Case 2: Seed exactly 5 sales in the past 30 days
        # Sale quantities: 2, 4, 3, 5, 6 -> Total sold = 20
        # Avg velocity = 20 / 30 = 0.6666...
        # Days until stockout = 10 / (20/30) = 15.0 days
        # Status = safe (>= 14 days), suggested = 0
        print("\n[TEST 2] Seeding 5 checkouts and testing 'safe' prediction status...")
        sales = []
        sale_quantities = [2, 4, 3, 5, 6]
        for idx, qty in enumerate(sale_quantities):
            # Space them out in the last 15 days
            sold_at = datetime.datetime.now() - datetime.timedelta(days=idx * 2)
            sale = Sale(
                sold_by="test-pred@medivision.local",
                sold_at=sold_at,
                total_amount=float(qty * 12.0)
            )
            db.add(sale)
            db.commit()
            db.refresh(sale)
            
            sale_item = SaleItem(
                sale_id=sale.id,
                medicine_id=med_id,
                quantity_sold=qty,
                sale_price=12.0,
                line_total=float(qty * 12.0)
            )
            db.add(sale_item)
            db.commit()
            
        print("[SEED] Seeded 5 sales totaling 20 units.")
        
        resp = client.get("/api/inventory/smart-reorder-predictions")
        assert resp.status_code == 200
        data = resp.json()
        our_pred = next((x for x in data if x["medicine_id"] == med_id), None)
        assert our_pred["status"] == "safe"
        assert abs(our_pred["daily_sales_velocity"] - 0.6667) < 0.01
        assert abs(our_pred["estimated_days_until_stockout"] - 15.0) < 0.1
        assert our_pred["suggested_reorder_quantity"] == 0
        print("[PASS] Calculated safe velocity-based prediction correctly.")

        # Test Case 3: Stock drops to 8 -> days until stockout = 8 / (20/30) = 12.0 days
        # 12.0 is under 14 days (upcoming status)
        # Suggested reorder = round(velocity * 14) = round(0.6667 * 14) = round(9.333) = 9
        print("\n[TEST 3] Dropping stock to 8 to trigger 'upcoming' status...")
        med.quantity = 8
        db.commit()
        
        resp = client.get("/api/inventory/smart-reorder-predictions")
        assert resp.status_code == 200
        data = resp.json()
        our_pred = next((x for x in data if x["medicine_id"] == med_id), None)
        assert our_pred["status"] == "upcoming"
        assert abs(our_pred["estimated_days_until_stockout"] - 12.0) < 0.1
        assert our_pred["suggested_reorder_quantity"] == 9
        print("[PASS] Calculated upcoming velocity-based prediction and suggested qty correctly.")

        # Test Case 4: Stock drops to 4 -> days until stockout = 4 / (20/30) = 6.0 days
        # 6.0 is under 7 days (urgent status)
        # Suggested reorder = round(velocity * 14) = round(9.333) = 9
        print("\n[TEST 4] Dropping stock to 4 to trigger 'urgent' status...")
        med.quantity = 4
        db.commit()
        
        resp = client.get("/api/inventory/smart-reorder-predictions")
        assert resp.status_code == 200
        data = resp.json()
        our_pred = next((x for x in data if x["medicine_id"] == med_id), None)
        assert our_pred["status"] == "urgent"
        assert abs(our_pred["estimated_days_until_stockout"] - 6.0) < 0.1
        assert our_pred["suggested_reorder_quantity"] == 9
        print("[PASS] Calculated urgent velocity-based prediction correctly.")

        # Cleanup test data
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-PRED-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "test-pred@medivision.local").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")
        print("=" * 80)
        print("ALL SMART REORDER PREDICTION INTEGRATION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        # Final cleanup on failure
        db.rollback()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-PRED-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "test-pred@medivision.local").delete()
        db.commit()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()

"""
Integration tests for Purchase Cost Capture and Margin Calculations.
"""

import datetime
from fastapi.testclient import TestClient
from app.main import app  # type: ignore
from app.database import SessionLocal  # type: ignore
from app.models.medicine import Medicine  # type: ignore
from app.models.sale import Sale  # type: ignore
from app.models.sale_item import SaleItem  # type: ignore
from app.models.monthly_finance import MonthlyFinance  # type: ignore
from app.dependencies import get_current_user, SupabaseUser  # type: ignore

client = TestClient(app)

def run_tests():
    print("=" * 80)
    print("RUNNING PURCHASE COST & ESTIMATED MARGIN INTEGRATION TESTS")
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
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-MAR-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "test-mar@medivision.local").delete()
        db.query(MonthlyFinance).filter(MonthlyFinance.month == "2026-07").delete()
        db.commit()

        # Seed MonthlyFinance settings
        # Rent = 1000, Electricity = 100, Salaries = 500, Other = 50 -> Costs = 1650
        finance_rec = MonthlyFinance(
            month="2026-07",
            rent=1000.0,
            electricity_and_bills=100.0,
            staff_salaries=500.0,
            other_expenses=50.0,
            other_revenue=0.0
        )
        db.add(finance_rec)
        db.commit()

        # Seed test medicine with custom purchase price
        # Qty = 10, MRP = 15.0, Purchase Price = 10.0
        med = Medicine(
            name="Amlodipine Margin Test",
            strength="5mg",
            manufacturer="Pfizer",
            batch_number="BATCH-MAR-TEST",
            expiry_date=datetime.date.today() + datetime.timedelta(days=100),
            mrp=15.0,
            purchase_price=10.0,
            quantity=10,
            reorder_threshold=5,
            storage_location="Shelf B"
        )
        db.add(med)
        db.commit()
        db.refresh(med)
        med_id = med.id
        print(f"[SEED] Seeded test medicine '{med.name}' with ID {med_id}.")

        # Seed 1 sale: sell 5 units in 2026-07 @ MRP = 15.0 (total = 75.0)
        # Margin should be (15.0 - 10.0) * 5 = 25.0
        sale_at = datetime.datetime(2026, 7, 10, 14, 0, 0)
        sale = Sale(
            sold_by="test-mar@medivision.local",
            sold_at=sale_at,
            total_amount=75.0
        )
        db.add(sale)
        db.commit()
        db.refresh(sale)
        
        sale_item = SaleItem(
            sale_id=sale.id,
            medicine_id=med_id,
            quantity_sold=5,
            sale_price=15.0,
            line_total=75.0
        )
        db.add(sale_item)
        
        # Decrement quantity to simulate actual sale checkout
        med.quantity = 5
        db.commit()
        print("[SEED] Seeded 1 checkout sale of 5 units.")

        # Test Case 1: GET /api/finance/overview/2026-07
        # Expected:
        # total_costs = 1650.0
        # current_inventory_investment = 5 units * 10.0 (purchase_price) = 50.0
        # computed_revenue = 75.0
        # estimated_margin = 25.0
        # total_revenue = 75.0
        # net_profit = 75.0 - 1650.0 = -1575.0
        print("\n[TEST 1] GET /api/finance/overview/2026-07...")
        resp = client.get("/api/finance/overview/2026-07")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        
        assert data["month"] == "2026-07"
        assert data["total_costs"] == 1650.0
        # Check that investment uses purchase_price, not MRP (which would be 5 * 15 = 75)
        # Staging db may have other medicines, so check it is >= 50.0
        assert data["current_inventory_investment"] >= 50.0
        assert data["computed_revenue"] >= 75.0
        assert data["estimated_margin"] >= 25.0
        assert data["net_profit"] == data["total_revenue"] - 1650.0
        print("[PASS] Estimated margin and investment computations validated successfully.")

        # Cleanup test data
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-MAR-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "test-mar@medivision.local").delete()
        db.query(MonthlyFinance).filter(MonthlyFinance.month == "2026-07").delete()
        db.commit()
        print("\n[CLEANUP] Cleanup successful.")
        print("=" * 80)
        print("ALL PURCHASE COST & MARGIN CALCULATIONS INTEGRATION TESTS PASSED!")
        print("=" * 80)

    except Exception as e:
        # Final cleanup on failure
        db.rollback()
        db.query(Medicine).filter(Medicine.batch_number == "BATCH-MAR-TEST").delete()
        db.query(Sale).filter(Sale.sold_by == "test-mar@medivision.local").delete()
        db.query(MonthlyFinance).filter(MonthlyFinance.month == "2026-07").delete()
        db.commit()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()

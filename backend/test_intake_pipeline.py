"""
test_intake_pipeline.py
=======================
End-to-end test of the upload → extraction pipeline.

Usage
-----
From the backend/ directory with the server running on :8000:

    .venv\\Scripts\\python test_intake_pipeline.py

The script:
  1. Logs in as the demo user to get a JWT
  2. Uploads each of the 4 test images via POST /api/intake/upload
  3. Prints the extracted fields and confidence scores for each
  4. Reports a field-by-field comparison between expected and extracted values

Requirements
------------
- Server must be running: uvicorn app.main:app --reload
- Demo user must exist: python seed_demo_user.py
- VISION_API_KEY must be set in .env
"""

import json
import sys
import httpx

BASE = "http://localhost:8000"

# ── Credentials (adjust if you changed them) ──────────────────────────────
DEMO_USER = "admin@medivision.local"
DEMO_PASS = sys.argv[1] if len(sys.argv) > 1 else input("Demo user password: ")

# ── Test images and expected ground-truth values ───────────────────────────
import pathlib

ARTIFACT_DIR = pathlib.Path(
    r"C:\Users\Sujith\.gemini\antigravity-ide\brain\fbc8a070-7af3-4ec6-9d68-3ba80793daf4"
)

TEST_CASES = [
    {
        "label": "Paracetamol 500mg (Cipla)",
        "image": ARTIFACT_DIR / "test_medicine_paracetamol_1783430574317.png",
        "expected": {
            "medicine_name": "PARACETAMOL IP 500mg TABLETS",
            "strength": "500mg",
            "manufacturer": "Cipla Ltd",
            "batch_number": "B240315",
            "expiry_date": "2026-02-28",
            "mrp": 28.50,
            "quantity_hint": 100,
        },
    },
    {
        "label": "Amoxicillin 500mg (Sun Pharma)",
        "image": ARTIFACT_DIR / "test_medicine_amoxicillin_1783430595872.png",
        "expected": {
            "medicine_name": "AMOXICILLIN CAPSULES IP 500mg",
            "strength": "500mg",
            "manufacturer": "Sun Pharmaceutical Industries Ltd",
            "batch_number": "AX230891",
            "expiry_date": "2025-08-31",
            "mrp": 95.00,
            "quantity_hint": 10,
        },
    },
    {
        "label": "Omeprazole 20mg (Abbott)",
        "image": ARTIFACT_DIR / "test_medicine_omeprazole_1783430607335.png",
        "expected": {
            "medicine_name": "OMEPRAZOLE CAPSULES IP 20mg",
            "strength": "20mg",
            "manufacturer": "Abbott Healthcare Pvt Ltd",
            "batch_number": "OM241102",
            "expiry_date": "2026-10-31",
            "mrp": 62.50,
            "quantity_hint": 14,
        },
    },
    {
        "label": "Cetirizine 10mg (Mankind)",
        "image": ARTIFACT_DIR / "test_medicine_cetirizine_1783430617804.png",
        "expected": {
            "medicine_name": "CETIRIZINE HYDROCHLORIDE TABLETS IP 10mg",
            "strength": "10mg",
            "manufacturer": "Mankind Pharma Ltd",
            "batch_number": "CT240567",
            "expiry_date": "2026-05-31",
            "mrp": 35.00,
            "quantity_hint": 10,
        },
    },
]

COMPARE_FIELDS = [
    "medicine_name", "strength", "manufacturer",
    "batch_number", "expiry_date", "mrp", "quantity_hint",
]


def login(client: httpx.Client) -> str:
    resp = client.post(
        f"{BASE}/api/auth/login",
        data={"username": DEMO_USER, "password": DEMO_PASS},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    print(f"Logged in as '{DEMO_USER}' OK\n{'='*60}")
    return token


def upload_and_extract(client: httpx.Client, token: str, case: dict) -> dict | None:
    image_path = case["image"]
    if not image_path.exists():
        print(f"  [SKIP] Image not found: {image_path}")
        return None

    with open(image_path, "rb") as f:
        resp = client.post(
            f"{BASE}/api/intake/upload",
            files={"file": (image_path.name, f, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60.0,  # Gemini can be slow
        )

    if resp.status_code not in (200, 201):
        print(f"  [ERROR] HTTP {resp.status_code}: {resp.text[:300]}")
        return None

    return resp.json()


def compare(label: str, expected: dict, actual: dict) -> list[str]:
    issues = []
    for field in COMPARE_FIELDS:
        exp = expected.get(field)
        got = actual.get(field)
        if exp is None:
            continue
        if got is None:
            issues.append(f"  MISSING  {field}: expected {exp!r}, got null")
        elif isinstance(exp, str) and exp.lower() not in str(got).lower():
            issues.append(f"  MISMATCH {field}: expected {exp!r}, got {got!r}")
        elif isinstance(exp, (int, float)) and got is not None:
            if abs(float(got) - float(exp)) > 1.0:
                issues.append(f"  MISMATCH {field}: expected {exp}, got {got}")
    return issues


def main():
    all_issues: dict[str, list[str]] = {}

    with httpx.Client() as client:
        token = login(client)

        for case in TEST_CASES:
            print(f"\n[TEST] {case['label']}")
            print(f"       Image: {case['image'].name}")

            data = upload_and_extract(client, token, case)
            if data is None:
                all_issues[case["label"]] = ["[Could not get response]"]
                continue

            print(f"  Status : {data.get('status')}")
            print(f"  Record : #{data.get('extraction_record_id')}")
            print(f"  Notes  : {data.get('notes')}")
            print()

            for field in COMPARE_FIELDS:
                val  = data.get(field)
                conf = (data.get("confidence") or {}).get(field, "—")
                print(f"  {field:20s}: {str(val):40s} (conf: {conf})")

            issues = compare(case["label"], case["expected"], data)
            if issues:
                print(f"\n  [!] {len(issues)} field(s) need attention:")
                for i in issues:
                    print(i)
                all_issues[case["label"]] = issues
            else:
                print("\n  [OK] All compared fields matched.")

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    if not all_issues:
        print("All 4 test cases passed with no field mismatches.")
    else:
        for label, issues in all_issues.items():
            print(f"\n{label}:")
            for i in issues:
                print(i)


if __name__ == "__main__":
    main()

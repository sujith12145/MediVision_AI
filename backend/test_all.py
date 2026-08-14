"""
test_all.py — Runs all integration test scripts in the backend folder.
"""
import subprocess
import sys
import os

TEST_FILES = [
    "test_voice_reminder.py",
    "test_predictions.py",
    "test_rbac_permissions.py",
    "test_sales.py",
    "test_finance.py",
    "test_qr_code.py",
    "test_qr_code_improvements.py",
    "test_risk_warning.py",
    "test_expired_warning.py",
    "test_margin.py",
    "test_intake_pipeline.py",
    "test_concurrency.py",
]

def main():
    python_bin = sys.executable
    print(f"Using Python binary: {python_bin}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Found {len(TEST_FILES)} test scripts to run.")

    failed = []
    for test in TEST_FILES:
        print(f"\nRunning {test}...")
        try:
            cmd = [python_bin, test]
            if test == "test_intake_pipeline.py":
                cmd.append("MediVision123!")
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(res.stdout)
        except subprocess.CalledProcessError as err:
            print(f"FAIL: {test}")
            print(err.stdout)
            print(err.stderr)
            failed.append(test)

    print("\n" + "=" * 50)
    if failed:
        print(f"TEST RUN FINISHED: {len(failed)} FAILED TESTS:")
        for f in failed:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("ALL BACKEND TEST SCRIPTS PASSED SUCCESSFULLY!")
        print("=" * 50)

if __name__ == "__main__":
    main()

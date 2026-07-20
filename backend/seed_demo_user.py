"""
seed_demo_user.py - Create the demo users in Supabase Auth & Local DB.

Creates the following users:
- admin@medivision.local (role: admin)
- pharmacist@medivision.local (role: pharmacist)
- staff@medivision.local (role: staff)

Run after setting up your Supabase project & database migrations:
    .venv\\Scripts\\python seed_demo_user.py
"""

import getpass
import sys

# Ensure backend/ is importable
sys.path.insert(0, ".")

from app.config import settings
from app.database import SessionLocal
from app.models.user import User
import bcrypt

DEMO_USERS = [
    {
        "email": "admin@medivision.local",
        "role": "admin",
        "name": "MediVision Admin"
    },
    {
        "email": "pharmacist@medivision.local",
        "role": "pharmacist",
        "name": "MediVision Pharmacist"
    },
    {
        "email": "staff@medivision.local",
        "role": "staff",
        "name": "MediVision Staff"
    }
]


def main() -> None:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        print(
            "[ERROR] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env\n"
            "        Get them from: Supabase Dashboard -> Project Settings -> API"
        )
        sys.exit(1)

    from supabase import create_client

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    import os
    print("--- MEDIVISION AI ROLE SEEDER ---")
    password = os.environ.get("SEED_PASSWORD")
    if password:
        print("[INFO] Using password from environment variable SEED_PASSWORD")
    else:
        try:
            password = getpass.getpass("Enter password for seeded users (press Enter to use default 'MediVision123!'): ")
        except Exception:
            password = ""
        if not password:
            password = "MediVision123!"
            print("[INFO] Using default password: MediVision123!")
        else:
            confirm = getpass.getpass("Confirm password: ")
            if password != confirm:
                print("[ERROR] Passwords do not match.")
                sys.exit(1)

    # Hash the password for local DB storage
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    for user_info in DEMO_USERS:
        email = user_info["email"]
        role = user_info["role"]
        display_name = user_info["name"]

        print(f"\nProcessing user: {email} (role: {role})")

        # 1. Seed in Supabase Auth
        supabase_user_id = None
        try:
            existing = client.auth.admin.list_users()
            matching_users = [u for u in existing if u.email == email]
            
            if matching_users:
                print(f"  [Supabase] User '{email}' already exists - deleting to recreate cleanly.")
                supabase_user = matching_users[0]
                client.auth.admin.delete_user(supabase_user.id)
                print("  [Supabase] Old user deleted.")

            print(f"  [Supabase] Creating user '{email}'...")
            response = client.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "display_name": display_name,
                    "role": role
                },
            })
            supabase_user_id = response.user.id
            print(f"  [Supabase] User created with ID: {supabase_user_id}")
        except Exception as exc:
            print(f"  [Supabase ERROR] Failed to seed Auth: {exc}")

        # 2. Seed in Local Database users table
        db = SessionLocal()
        try:
            existing_local = db.query(User).filter(User.username == email).first()
            if existing_local:
                existing_local.hashed_password = hashed_password
                existing_local.role = role
                existing_local.is_active = True
                print(f"  [Local DB] Updated user '{email}' in 'users' table.")
            else:
                new_local = User(
                    username=email,
                    hashed_password=hashed_password,
                    role=role,
                    is_active=True
                )
                db.add(new_local)
                print(f"  [Local DB] Created user '{email}' in 'users' table.")
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"  [Local DB ERROR] Failed to seed users table: {exc}")
        finally:
            db.close()

    print("\n[OK] Seeding complete!")
    print("Credentials:")
    for user_info in DEMO_USERS:
        print(f"  - Username: {user_info['email']}  |  Password: {password}  |  Role: {user_info['role']}")


if __name__ == "__main__":
    main()

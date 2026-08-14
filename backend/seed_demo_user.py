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
import os
import sys

# Ensure backend/ is importable
sys.path.insert(0, ".")

import bcrypt
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, SessionLocal
from app.models.user import User

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


def _get_db_session():
    """Returns a DB session with fallback to local SQLite if Postgres is unreachable."""
    try:
        db = SessionLocal()
        db.query(User).first()
        return db
    except Exception as exc:
        print(f"  [DB NOTICE] Primary DB connection unavailable ({exc}). Using local SQLite fallback (medivision_dev.db)...")
        sqlite_engine = create_engine("sqlite:///./medivision_dev.db", connect_args={"check_same_thread": False})
        
        # Ensure role column exists in SQLite
        with sqlite_engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'staff'"))
                conn.commit()
            except Exception:
                pass  # column already exists or table not created yet

        Base.metadata.create_all(bind=sqlite_engine)
        SqliteSession = sessionmaker(autocommit=False, autoflush=False, bind=sqlite_engine)
        return SqliteSession()


def main() -> None:
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

    # 1. Try Supabase Auth Seeding if credentials present
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        try:
            from supabase import create_client
            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
            print("[Supabase] Seeding Supabase Auth...")
            existing = client.auth.admin.list_users()
            for user_info in DEMO_USERS:
                email = user_info["email"]
                role = user_info["role"]
                display_name = user_info["name"]
                matching = [u for u in existing if u.email == email]
                if matching:
                    client.auth.admin.delete_user(matching[0].id)
                client.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"display_name": display_name, "role": role},
                })
                print(f"  [Supabase] Seeded user '{email}'")
        except Exception as exc:
            print(f"  [Supabase NOTICE] Supabase Auth seeding skipped ({exc})")

    # 2. Seed Local Database
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    db = _get_db_session()
    try:
        for user_info in DEMO_USERS:
            email = user_info["email"]
            role = user_info["role"]
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

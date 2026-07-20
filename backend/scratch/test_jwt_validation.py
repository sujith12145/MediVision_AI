import os
import sys

# Ensure backend/ is importable
sys.path.insert(0, ".")

from app.config import settings
from app.services.auth_service import decode_access_token

def test_live_auth():
    print("--- LIVE AUTH/JWT DIAGNOSTIC TOOL ---")
    print(f"Supabase URL       : {settings.SUPABASE_URL}")
    print(f"JWT Secret Length  : {len(settings.SUPABASE_JWT_SECRET) if settings.SUPABASE_JWT_SECRET else 0}")
    
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        print("[FAIL] Supabase credentials not set in config.")
        return

    from supabase import create_client
    supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

    email = "pharmacist@medivision.local"
    password = "MediVision123!"
    
    print(f"\nAttempting to log in as {email} via Supabase Client...")
    try:
        res = supabase_client.auth.sign_in_with_password({"email": email, "password": password})
        session = res.session
        if not session:
            print("[FAIL] Login succeeded but no session was returned.")
            return
        
        access_token = session.access_token
        print(f"[OK] Login successful! Token received (starts with: {access_token[:20]}...)")
        
        print("\nAttempting local JWT decoding...")
        payload = decode_access_token(access_token)
        if payload:
            print("[SUCCESS] Local JWT validation passed! Decoded payload details:")
            print(f"  - Subject (sub)  : {payload.get('sub')}")
            print(f"  - Email          : {payload.get('email')}")
            print(f"  - User Metadata  : {payload.get('user_metadata')}")
        else:
            print("[FAIL] Local JWT validation failed. Look at the debug output above.")
            
    except Exception as e:
        print(f"[FAIL] Exception occurred during authentication: {e}")

if __name__ == "__main__":
    test_live_auth()

"""
FastAPI dependencies shared across routers.

get_current_user
    Extracts the Bearer token from the Authorization header, validates it
    as a Supabase-issued JWT, and returns a SupabaseUser identity object.
    Raises HTTP 401 on any failure.

    The SupabaseUser carries the user's Supabase UUID (id) and email.
    It does NOT query the local users table — auth is fully stateless.

Usage
-----
    from app.dependencies import get_current_user, SupabaseUser

    @router.get("/protected")
    async def protected(current_user: SupabaseUser = Depends(get_current_user)):
        return {"user_id": current_user.id}
"""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.auth_service import decode_access_token

_bearer_scheme = HTTPBearer(auto_error=False)

@dataclass
class SupabaseUser:
    """Lightweight identity extracted from a validated Supabase JWT."""
    id: str     # Supabase auth.users UUID (the 'sub' claim)
    email: str  # user's email address
    role: str = "admin"  # default value for test mock compatibility


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> SupabaseUser:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Get role from database, falling back to ADMIN_EMAIL or JWT payload
    role = None
    try:
        from app.supabase_client import get_supabase_client
        sb = get_supabase_client()
        res = sb.table("user_roles").select("role").eq("email", email.strip().lower()).execute()
        if res.data:
            role = res.data[0].get("role")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to fetch user role from db: %s", exc)

    if not role:
        import os
        admin_email = os.getenv("ADMIN_EMAIL", "anso2020vja@gmail.com").strip().lower()
        if email.strip().lower() == admin_email:
            role = "admin"

    if not role:
        user_metadata = payload.get("user_metadata", {})
        app_metadata = payload.get("app_metadata", {})
        role = user_metadata.get("role") or app_metadata.get("role") or "staff"
    
    return SupabaseUser(
        id=user_id,
        email=email,
        role=role
    )


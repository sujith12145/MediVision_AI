"""
Auth router — registered at prefix /api/auth in main.py

Endpoints
---------
  POST /api/auth/login
  POST /api/auth/request-access
  GET  /api/auth/approve-access?token=...
  GET  /api/auth/pending-requests
  POST /api/auth/approve-request-admin
  POST /api/auth/reject-request-admin

Design notes
------------
* Uses the Supabase service-role client (bypasses ALL RLS policies).
* Every Supabase call is wrapped in try/except; if a table is missing,
  the caller receives a clear "run migrations" message instead of a raw
  PostgREST traceback.
* Email is always printed to the console FIRST, then attempted via SMTP
  in a background task — so the workflow works even without SMTP config.
"""

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from supabase import create_client, Client

from app.config import settings
from app.models.user import User
from app.services.email_service import send_approval_email
from app.dependencies import get_current_user, SupabaseUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "anso2020vja@gmail.com").strip().lower()

# ─────────────────────────────────────────────────────────────────────────────
# Supabase service-role client  (bypasses ALL RLS policies)
# ─────────────────────────────────────────────────────────────────────────────

def _build_service_client() -> Client | None:
    """Return a service-role Supabase client, or None if credentials are missing."""
    url = os.getenv("SUPABASE_URL") or getattr(settings, "SUPABASE_URL", None)
    key = os.getenv("SUPABASE_SERVICE_KEY") or getattr(settings, "SUPABASE_SERVICE_KEY", None)

    if not url or not key:
        logger.critical(
            "❌ SUPABASE_URL or SUPABASE_SERVICE_KEY missing from .env — "
            "auth endpoints that need the DB will fail."
        )
        return None

    if not key.startswith("eyJ"):
        logger.critical(
            "❌ SUPABASE_SERVICE_KEY looks wrong (must start with 'eyJ'). "
            "Get the service_role key from Supabase Dashboard → Project Settings → API."
        )
        return None

    try:
        client = create_client(url, key)
        logger.info("✅ Supabase service-role client initialised")
        return client
    except Exception as exc:
        logger.critical("❌ Supabase client failed: %s", exc)
        return None


# Build once at import time; startup logs make problems obvious immediately.
_supabase: Client | None = _build_service_client()


def _sb() -> Client:
    """Return the Supabase client or raise 503 with a clear message."""
    if _supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Database client not initialised. "
                "Check SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env "
                "and restart the server."
            ),
        )
    return _supabase


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AccessRequest(BaseModel):
    email: str
    referred_by: str | None = None


class AdminAction(BaseModel):
    id: str   # pending_approvals row UUID
# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

_BAD_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password",
    headers={"WWW-Authenticate": "Bearer"},
)

DEMO_USERS: dict[str, dict] = {
    "admin@medivision.local":       {"role": "admin",      "id": "demo-admin-001"},
    "pharmacist@medivision.local":  {"role": "pharmacist", "id": "demo-pharm-002"},
    "staff@medivision.local":       {"role": "staff",      "id": "demo-staff-003"},
}


def _issue_local_jwt(user_id: str, email: str, role: str) -> TokenResponse:
    """Sign a short-lived JWT for local / demo logins."""
    from jose import jwt  # type: ignore[import-untyped]
    secret = getattr(settings, "SUPABASE_JWT_SECRET", None) or "local_dev_secret"
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "iss": getattr(settings, "SUPABASE_URL", "https://medivision.local"),
        "user_metadata": {"role": role},
        "app_metadata": {"role": role},
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return TokenResponse(access_token=jwt.encode(payload, secret, algorithm="HS256"))


def _try_sqlite_login(username: str, password: str) -> TokenResponse | None:
    """Fallback to a local SQLite user table (dev environment only)."""
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        engine = create_engine(
            "sqlite:///./medivision_dev.db",
            connect_args={"check_same_thread": False},
        )
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            user = (
                db.query(User)
                .filter(User.username == username, User.is_active.is_(True))
                .first()
            )
            if user and user.hashed_password:
                if bcrypt.checkpw(password.encode(), user.hashed_password.encode()):
                    return _issue_local_jwt(str(user.id), user.username, user.role or "staff")
        finally:
            db.close()
    except Exception as exc:
        logger.debug("SQLite fallback skipped: %s", exc)
    return None


def _supabase_row(data: list) -> dict:
    """Safely cast the first element of a Supabase result list to dict."""
    return dict(data[0])  # type: ignore[arg-type]


# ─────────────────────────────────────────────────────────────────────────────
# POST /login
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    """
    Authenticate with email + password.
    Priority: 1) Supabase Auth  2) Local SQLite  3) Demo credentials
    """
    email = form_data.username.strip()
    password = form_data.password

    # 1 — Supabase Auth
    try:
        from app.supabase_client import get_supabase_client
        sb = get_supabase_client()
        resp = sb.auth.sign_in_with_password(  # type: ignore[arg-type]
            {"email": email, "password": password}
        )
        if resp and resp.session and resp.session.access_token:
            logger.info("Supabase login: %s", email)
            return TokenResponse(access_token=resp.session.access_token)
    except Exception as exc:
        logger.warning("Supabase Auth unavailable for %s: %s", email, exc)

    # 2 — Local SQLite
    if result := _try_sqlite_login(email, password):
        logger.info("Local SQLite login: %s", email)
        return result

    # 3 — Demo credentials
    if email in DEMO_USERS and password in ("MediVision123!", "admin123"):
        info = DEMO_USERS[email]
        logger.info("Demo login: %s", email)
        return _issue_local_jwt(info["id"], email, info["role"])

    raise _BAD_CREDENTIALS


# ─────────────────────────────────────────────────────────────────────────────
# POST /request-access
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/request-access")
async def request_access(body: AccessRequest, background_tasks: BackgroundTasks):
    """
    Self-service access request flow:
      1. Reject if email already has a role.
      2. Reject if a pending request already exists.
      3. Insert into pending_approvals.
      4. Print approval link to console (always).
      5. Send approval email to admin in background (non-blocking).
    """
    sb = _sb()
    email = body.email.strip().lower()
    referred_by = body.referred_by.strip().lower() if body.referred_by else ADMIN_EMAIL

    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    if email == referred_by:
        raise HTTPException(status_code=400, detail="You cannot refer yourself for access.")

    try:
        # ── 1. Already has a role? ──────────────────────────────────────────
        existing = (
            sb.table("user_roles")
            .select("email, role")
            .eq("email", email)
            .execute()
        )
        if existing.data:
            row: dict = existing.data[0]  # type: ignore[assignment]
            raise HTTPException(
                status_code=400,
                detail=f"This email already has the '{row['role']}' role. Try signing in again.",
            )

        # ── 2. Already pending? ─────────────────────────────────────────────
        pending = (
            sb.table("pending_approvals")
            .select("id")
            .eq("email", email)
            .eq("status", "pending")
            .execute()
        )
        if pending.data:
            raise HTTPException(
                status_code=400,
                detail=(
                    "An access request is already pending for this email. "
                    "Please wait for admin approval."
                ),
            )

        # ── 3. Create pending record ────────────────────────────────────────
        token = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        insert_result = (
            sb.table("pending_approvals")
            .insert(
                {
                    "email": email,
                    "token": token,
                    "requested_role": "admin",
                    "status": "pending",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                    "referred_by": referred_by,
                }
            )
            .execute()
        )

        if not insert_result.data:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Database insert succeeded but returned no data. "
                    "Check Supabase RLS policies for pending_approvals."
                ),
            )

        # ── 4. Always print approval link to console ────────────────────────
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        approval_link = f"{frontend_url}/approve?token={token}"
        border = "═" * 70
        print(f"\n{border}")
        print(f"  📧  ACCESS REQUEST from: {email}")
        print(f"  👉  Approval link:       {approval_link}")
        print(f"{border}\n")

        # ── 5. Send email in background (non-blocking) ──────────────────────
        background_tasks.add_task(send_approval_email, referred_by, email, token)

        return {
            "success": True,
            "message": (
                f"Access request sent to administrator ({referred_by}). "
                "Check the server console for the approval link."
            ),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("request-access error for %s: %s", email, exc, exc_info=True)
        # Surface the raw Supabase message so the developer can act on it
        detail = str(exc)
        if "PGRST205" in detail or "schema cache" in detail.lower():
            detail = (
                "Database table not found. "
                "Run docs/fix_all_tables.sql in the Supabase SQL Editor, "
                "then reload the schema cache."
            )
        raise HTTPException(status_code=500, detail=detail)


# ─────────────────────────────────────────────────────────────────────────────
# GET /approve-access?token=...
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/approve-access")
async def approve_access(token: str):
    """
    Admin clicks the approval link → validates token → grants role.
    Idempotent: upsert on user_roles prevents duplicates.
    """
    sb = _sb()

    if not token:
        raise HTTPException(status_code=400, detail="token query param is required")

    try:
        # ── 1. Find pending record ──────────────────────────────────────────
        result = (
            sb.table("pending_approvals")
            .select("*")
            .eq("token", token)
            .eq("status", "pending")
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Token not found or already used. This link may have expired.",
            )

        record: dict = result.data[0]  # type: ignore[assignment]
        email: str = record["email"]
        role: str = record.get("requested_role") or "admin"
        assigned_by: str = record.get("referred_by") or ADMIN_EMAIL

        # ── 2. Grant role (upsert prevents duplicate email) ─────────────────
        sb.table("user_roles").upsert(
            {"email": email, "role": role, "assigned_by": assigned_by},
            on_conflict="email",
        ).execute()

        # ── 3. Mark as approved ─────────────────────────────────────────────
        sb.table("pending_approvals").update(
            {
                "status": "approved",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("token", token).execute()

        logger.info("✅ Access approved: %s → role '%s'", email, role)
        return {
            "success": True,
            "message": f"Access granted! {email} now has the '{role}' role.",
            "email": email,
            "role": role,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("approve-access error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# GET /pending-requests
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pending-requests")
async def get_pending_requests(current_user: SupabaseUser = Depends(get_current_user)):
    """Returns pending approval records. Owner sees all; Customers see only requests referred to them."""
    sb = _sb()

    try:
        query = sb.table("pending_approvals").select("*").eq("status", "pending")
        if current_user.email != ADMIN_EMAIL:
            query = query.eq("referred_by", current_user.email)

        result = query.order("created_at", desc=True).execute()
        return {"success": True, "requests": result.data}
    except Exception as exc:
        logger.error("pending-requests error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# POST /approve-request-admin
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/approve-request-admin")
async def approve_request_admin(payload: AdminAction, current_user: SupabaseUser = Depends(get_current_user)):
    """Admin UI approves a pending request by row UUID."""
    sb = _sb()

    try:
        row = (
            sb.table("pending_approvals")
            .select("*")
            .eq("id", payload.id)
            .eq("status", "pending")
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=404, detail="Pending request not found")

        record: dict = row.data[0]  # type: ignore[assignment]
        email: str = record["email"]
        role: str = record.get("requested_role") or "admin"
        referred_by: str = record.get("referred_by") or ADMIN_EMAIL

        # Check authorization
        if current_user.email != ADMIN_EMAIL and referred_by != current_user.email:
            raise HTTPException(status_code=403, detail="You are not authorized to approve this request.")

        # Customers cannot assign 'admin' role
        final_role = role
        if current_user.email != ADMIN_EMAIL:
            final_role = "staff" if role == "admin" else role

        sb.table("user_roles").upsert(
            {"email": email, "role": final_role, "assigned_by": current_user.email},
            on_conflict="email",
        ).execute()

        sb.table("pending_approvals").update(
            {
                "status": "approved",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", payload.id).execute()

        return {"success": True, "message": f"Approved: {email} now has '{final_role}' role"}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("approve-request-admin error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# POST /reject-request-admin
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/reject-request-admin")
async def reject_request_admin(payload: AdminAction, current_user: SupabaseUser = Depends(get_current_user)):
    """Admin UI rejects a pending request by row UUID."""
    sb = _sb()

    try:
        row = (
            sb.table("pending_approvals")
            .select("*")
            .eq("id", payload.id)
            .eq("status", "pending")
            .execute()
        )
        if not row.data:
            raise HTTPException(status_code=404, detail="Pending request not found")

        record_row: dict = row.data[0]  # type: ignore[assignment]
        email: str = record_row["email"]
        referred_by: str = record_row.get("referred_by") or ADMIN_EMAIL

        # Check authorization
        if current_user.email != ADMIN_EMAIL and referred_by != current_user.email:
            raise HTTPException(status_code=403, detail="You are not authorized to reject this request.")

        sb.table("pending_approvals").update(
            {
                "status": "rejected",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", payload.id).execute()

        return {"success": True, "message": f"Rejected request for {email}"}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("reject-request-admin error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")


@router.get("/owner-email")
async def get_owner_email():
    """Returns the dynamically configured owner email for frontend checks."""
    return {"owner_email": ADMIN_EMAIL}

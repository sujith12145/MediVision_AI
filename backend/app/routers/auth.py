"""
Auth router — POST /api/auth/login

Proxies the login request to Supabase Auth and returns the Supabase-issued
JWT in the same {access_token, token_type} shape as before.

This endpoint exists so:
  - The frontend keeps the same API call (no frontend route changes)
  - CLI tools / test scripts continue to work unchanged

The frontend can also call Supabase Auth directly via the JS SDK —
both approaches return compatible JWTs validated by the same SUPABASE_JWT_SECRET.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_BAD_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password",
    headers={"WWW-Authenticate": "Bearer"},
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Obtain a Supabase JWT access token",
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> TokenResponse:
    """
    Authenticate with email (username field) + password.
    Proxies to Supabase Auth and returns the Supabase JWT.

    The 'username' field is treated as the email address in Supabase Auth.
    Demo user email: admin@medivision.local
    """
    from app.supabase_client import get_supabase_client

    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_in_with_password(
            {"email": form_data.username, "password": form_data.password}
        )
        if not response.session:
            raise _BAD_CREDENTIALS

        return TokenResponse(access_token=response.session.access_token)

    except HTTPException:
        raise
    except Exception as exc:
        # Supabase raises AuthApiError on bad credentials — map all to 401
        logger.warning("Supabase login failed for %r: %s", form_data.username, exc)
        raise _BAD_CREDENTIALS

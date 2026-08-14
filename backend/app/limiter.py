"""
limiter.py — singleton slowapi Limiter for the entire application.

Key function: uses the authenticated username (from the Bearer JWT) as the
rate-limit bucket, so limits are per user rather than per IP.
Falls back to the client IP if no valid token is present (e.g. unauthenticated
requests hit an endpoint that is somehow misconfigured).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.services.auth_service import decode_access_token


def _user_or_ip_key(request: Request) -> str:
    """
    Return a string that uniquely identifies the rate-limit bucket:
      - Authenticated request → "user:<username>"
      - Unauthenticated request → "ip:<client_ip>"
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        username = decode_access_token(token)
        if username:
            return f"user:{username}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_user_or_ip_key)

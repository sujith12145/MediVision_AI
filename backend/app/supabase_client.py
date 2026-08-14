"""
supabase_client.py — Supabase Python client singleton.

Uses the SERVICE_ROLE key for server-side operations:
  - Supabase Storage (upload/download images)
  - Supabase Auth Admin API (create/manage users)

IMPORTANT: The service_role key bypasses Row Level Security.
  - Never expose it to the browser.
  - Never log or return it in responses.

Usage
-----
    from app.supabase_client import get_supabase_client
    client = get_supabase_client()
    client.storage.from_("medicine-images").upload(...)
"""

from functools import lru_cache

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase_client():
    """
    Return the singleton Supabase client initialised with the service_role key.
    Raises RuntimeError if required credentials are missing.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env. "
            "Get them from: Supabase Dashboard → Project Settings → API."
        )

    from supabase import create_client  # lazy import keeps startup fast when Supabase is unused

    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

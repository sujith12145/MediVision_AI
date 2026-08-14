import logging
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.sql import text
from app.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    message: str
    version: str
    database: str
    supabase_storage: str


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health_check() -> HealthResponse:
    """Returns a simple liveness confirmation for the MediVision AI API."""
    db_status = "ok"
    try:
        from app.database import SessionLocal
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        logger.error("Health check DB connection failed: %s", e)
        db_status = f"failed - {e}"

    supabase_status = "ok"
    try:
        client = get_supabase_client()
        client.storage.list_buckets()
    except Exception as e:
        logger.error("Health check Supabase Storage failed: %s", e)
        supabase_status = f"failed - {e}"

    status = "ok" if db_status == "ok" and supabase_status == "ok" else "error"

    return HealthResponse(
        status=status,
        message="Hello MediVision",
        version="0.1.0",
        database=db_status,
        supabase_storage=supabase_status,
    )

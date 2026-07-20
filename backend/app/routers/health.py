"""
Health-check router — /api/health
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    message: str
    version: str


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health_check() -> HealthResponse:
    """Returns a simple liveness confirmation for the MediVision AI API."""
    return HealthResponse(
        status="ok",
        message="Hello MediVision",
        version="0.1.0",
    )

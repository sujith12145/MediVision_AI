"""
MediVision AI — FastAPI Application Entry Point
"""

# Load environment variables early, before importing packages that might check them on import (e.g. NLTK)
import dotenv
dotenv.load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.limiter import limiter
from app.routers import health
from app.routers import auth
from app.routers import intake
from app.routers import medicines
from app.routers import inventory
from app.routers import assistant
from app.routers import finance
from app.routers import sales
from app.routers import stock
from app.voice.router import router as voice_router


import logging
from contextlib import asynccontextmanager
from app.database import SessionLocal
from app.models.medicine import Medicine
from app.services.qr_service import generate_unique_qr_code_id, generate_qr_svg_base64

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.voice.scheduler import scheduler, load_all_pending_reminders
        scheduler.start()
        load_all_pending_reminders()
        logger.info("Successfully initialized voice reminder scheduler.")
    except Exception as e:
        logger.error("Failed to start voice reminder scheduler: %s", e, exc_info=True)

    logger.info("Checking for medicines lacking QR codes...")
    db = SessionLocal()
    try:
        medicines_without_qr = db.query(Medicine).filter(Medicine.qr_code_id.is_(None)).all()
        if medicines_without_qr:
            logger.info("Found %d medicines without QR codes. Generating...", len(medicines_without_qr))
            for med in medicines_without_qr:
                qr_id = generate_unique_qr_code_id(db, med.batch_number)
                qr_img = generate_qr_svg_base64(qr_id)
                med.qr_code_id = qr_id
                med.qr_code_image = qr_img
            db.commit()
            logger.info("Successfully generated QR codes for %d medicines.", len(medicines_without_qr))
        else:
            logger.info("All medicines have QR codes.")
    except Exception as e:
        logger.error("Failed to populate missing QR codes: %s", e, exc_info=True)
        db.rollback()
    finally:
        db.close()

    yield

    try:
        from app.voice.scheduler import scheduler
        scheduler.shutdown()
        logger.info("Successfully shut down voice reminder scheduler.")
    except Exception as e:
        logger.error("Failed to shut down voice reminder scheduler: %s", e, exc_info=True)


app = FastAPI(
    title="MediVision AI",
    description="AI-powered medical image analysis platform",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate limiter — attach state and exception handler
# ---------------------------------------------------------------------------
import typing
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, typing.cast(typing.Any, _rate_limit_exceeded_handler))

# ---------------------------------------------------------------------------
# CORS — adjust origins for production
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(intake.router, prefix="/api")
app.include_router(medicines.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(finance.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(stock.router, prefix="/api")
app.include_router(voice_router, prefix="/api")



# Lifespan events are managed via the lifespan handler registered on app initialization



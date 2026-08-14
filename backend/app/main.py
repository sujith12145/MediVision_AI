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
from app.routers import analytics
from app.routers import orders
from app.voice.router import router as voice_router


import logging
from contextlib import asynccontextmanager
from app.database import SessionLocal
from app.models.medicine import Medicine
from app.services.qr_service import generate_unique_qr_code_id, generate_qr_svg_base64

logger = logging.getLogger(__name__)

def run_db_patches():
    logger.info("Executing DB patches (referred_by column and RLS policies)...")
    db = SessionLocal()
    try:
        from sqlalchemy import text
        # 1. Add referred_by column if not exists
        db.execute(text("ALTER TABLE public.pending_approvals ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255);"))
        
        # 2. Run the RLS fix queries
        admin_email = os.getenv("ADMIN_EMAIL", "anso2020vja@gmail.com").strip().lower()
        sql_rls_patch = f"""
        -- Create is_admin() function with SECURITY DEFINER
        CREATE OR REPLACE FUNCTION public.is_admin()
        RETURNS boolean SECURITY DEFINER AS $$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE email = auth.email() AND role = 'admin'
          );
        END;
        $$ LANGUAGE plpgsql;

        -- Ensure Row Level Security is enabled
        ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

        -- Clean up existing policies
        DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
        DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
        DROP POLICY IF EXISTS "Anyone can request access" ON public.pending_approvals;
        DROP POLICY IF EXISTS "Admins can manage pending approvals" ON public.pending_approvals;
        DROP POLICY IF EXISTS "Owner select all roles" ON public.user_roles;
        DROP POLICY IF EXISTS "Customers select assigned roles" ON public.user_roles;
        DROP POLICY IF EXISTS "Owner manage all roles" ON public.user_roles;
        DROP POLICY IF EXISTS "Customers manage assigned roles" ON public.user_roles;
        DROP POLICY IF EXISTS "Owner manage pending approvals" ON public.pending_approvals;
        DROP POLICY IF EXISTS "Customers manage referred pending approvals" ON public.pending_approvals;

        -- Create policies for public.user_roles
        CREATE POLICY "Users can read own role" ON public.user_roles
          FOR SELECT USING (auth.email() = email);

        CREATE POLICY "Owner select all roles" ON public.user_roles
          FOR SELECT USING (auth.email() = '{admin_email}');

        CREATE POLICY "Customers select assigned roles" ON public.user_roles
          FOR SELECT USING (auth.email() = assigned_by);

        CREATE POLICY "Owner manage all roles" ON public.user_roles
          FOR ALL USING (auth.email() = '{admin_email}');

        CREATE POLICY "Customers manage assigned roles" ON public.user_roles
          FOR ALL USING (
            auth.email() = assigned_by AND role IN ('pharmacist', 'staff')
          );

        -- Create policies for public.pending_approvals
        CREATE POLICY "Anyone can request access" ON public.pending_approvals
          FOR INSERT WITH CHECK (true);

        CREATE POLICY "Owner manage pending approvals" ON public.pending_approvals
          FOR ALL USING (auth.email() = '{admin_email}');

        CREATE POLICY "Customers manage referred pending approvals" ON public.pending_approvals
          FOR ALL USING (auth.email() = referred_by);

        -- Ensure seed admin exists
        INSERT INTO public.user_roles (email, role, assigned_by)
        VALUES ('{admin_email}', 'admin', 'system_fix')
        ON CONFLICT (email) DO NOTHING;

        -- Force schema reload
        NOTIFY pgrst, 'reload schema';

        -- Enable Supabase Realtime for user_roles and pending_approvals
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_rel pr
            JOIN pg_class c ON pr.prrelid = c.oid
            JOIN pg_publication p ON pr.prpubid = p.oid
            WHERE c.relname = 'user_roles' AND p.pubname = 'supabase_realtime'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
          END IF;
          
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_rel pr
            JOIN pg_class c ON pr.prrelid = c.oid
            JOIN pg_publication p ON pr.prpubid = p.oid
            WHERE c.relname = 'pending_approvals' AND p.pubname = 'supabase_realtime'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_approvals;
          END IF;
        END $$;
        """
        db.execute(text(sql_rls_patch))
        db.commit()
        logger.info("✅ DB patches successfully applied!")
    except Exception as e:
        logger.error("Failed to run DB patches: %s", e, exc_info=True)
        db.rollback()
    finally:
        db.close()

def populate_missing_qr_codes():
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.voice.scheduler import scheduler, load_all_pending_reminders
        scheduler.start()
        load_all_pending_reminders()
        logger.info("Successfully initialized voice reminder scheduler.")
    except Exception as e:
        logger.error("Failed to start voice reminder scheduler: %s", e, exc_info=True)

    # Ensure database tables exist
    from app.database import Base, engine
    Base.metadata.create_all(bind=engine)

    run_db_patches()
    populate_missing_qr_codes()

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
import os
cors_origins_env = os.getenv("CORS_ORIGINS")
if cors_origins_env:
    origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
else:
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(intake.router, prefix="/api")
app.include_router(medicines.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(finance.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(stock.router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(orders.router, prefix="/api")



# Lifespan events are managed via the lifespan handler registered on app initialization



"""
Application-wide settings loaded from environment variables / .env file.

All Supabase credentials are read from environment — never hardcoded.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────
    # Set to your Supabase Transaction Pooler connection string
    # (Project Settings → Database → Connection string, port 6543)
    DATABASE_URL: str = "sqlite:///./medivision_dev.db"

    # ── Supabase ─────────────────────────────────────────────────────────
    # Project Settings → API
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""           # safe for client-side
    SUPABASE_SERVICE_KEY: str = ""        # server-side ONLY — never send to browser
    # Project Settings → API → JWT Settings → JWT Secret
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_STORAGE_BUCKET: str = "medicine-images"

    # ── Vision / AI API Keys ─────────────────────────────────────────────
    VISION_API_KEY: str = ""
    LLM_API_KEY: str = ""
    VISION_MODEL: str = "gemini-1.5-flash"

    # ── JWT (legacy — used as fallback only) ─────────────────────────────
    # Supabase JWTs are now validated via SUPABASE_JWT_SECRET.
    # JWT_SECRET is kept so existing .env files don't break.
    JWT_SECRET: str = "CHANGE_ME_IN_DOT_ENV"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ── File Storage ──────────────────────────────────────────────────────
    UPLOADS_DIR: str = "./uploads"        # fallback local path (unused when Supabase is set)
    MAX_UPLOAD_SIZE_MB: int = 5
    UPLOAD_RATE_LIMIT: str = "20/minute"

    # ── App ───────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    DEBUG: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

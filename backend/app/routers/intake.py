"""
Intake router — image ingestion and vision extraction.

Endpoints
---------
POST /api/intake/upload
    Accepts a medicine carton photo, validates it, uploads to Supabase Storage,
    immediately runs Gemini Vision extraction, and returns the parsed fields +
    confidence scores for frontend review.
    Status becomes 'awaiting_confirmation' on success, 'extraction_failed' if
    the AI call fails (image is still saved in Supabase Storage either way).

POST /api/intake/extract/{record_id}
    Re-triggers extraction on an existing record that is in state
    'pending' or 'extraction_failed'. Useful for manual retry without re-uploading.
"""

import json
import logging
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.limiter import limiter
from app.models.medicine import Medicine
from app.models.audit_log import AuditLog
from app.models.extraction_record import (
    ExtractionRecord,
    STATUS_PENDING,
    STATUS_PROCESSING,
    STATUS_AWAITING_CONFIRMATION,
    STATUS_EXTRACTION_FAILED,
    STATUS_DONE,
    STATUS_FAILED,
)
from app.services.vision_service import extract_medicine_fields

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intake", tags=["intake"])

# Named constants for purchase-risk warning thresholds
RISK_EXPIRY_DAYS_THRESHOLD = 30
RISK_QUANTITY_THRESHOLD = 20

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

_ALLOWED_MIME: set[str] = {"image/jpeg", "image/jpg", "image/png"}

_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
]

_CHUNK_SIZE = 64 * 1024  # 64 KB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _detect_extension(header: bytes) -> str | None:
    for magic, ext in _MAGIC:
        if header.startswith(magic):
            return ext
    return None


def _detect_mime(image_bytes: bytes) -> str:
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return "image/jpeg"


def _upload_to_storage(safe_filename: str, contents: bytes, mime_type: str) -> str:
    """
    Upload image bytes to Supabase Storage.
    Returns the storage path in the format "<bucket>/<filename>" for DB storage.
    Raises HTTPException on upload failure.
    """
    from app.supabase_client import get_supabase_client

    bucket = settings.SUPABASE_STORAGE_BUCKET
    try:
        client = get_supabase_client()
        client.storage.from_(bucket).upload(
            safe_filename,
            contents,
            file_options={"content-type": mime_type, "upsert": "false"},
        )
        return f"{bucket}/{safe_filename}"
    except RuntimeError as exc:
        # Supabase not configured
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Storage not available: {exc}",
        )
    except Exception as exc:
        logger.error("Supabase Storage upload failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store the uploaded image. Please try again.",
        )


def _run_extraction(record: ExtractionRecord, db: Session) -> dict:
    """
    Shared extraction logic for both upload and re-extract endpoints.
    Updates *record* in-place, commits, and returns the response dict.
    Never raises — failures are encoded in status=extraction_failed.
    """
    record.status = STATUS_PROCESSING
    db.commit()

    logger.info("Starting extraction for record_id=%d path=%s", record.id, record.image_path)
    result = extract_medicine_fields(record.image_path)

    # Always persist the raw response (even on failure — valuable for debugging)
    record.raw_ai_response = result.raw_response

    if result.status == STATUS_DONE:
        record.confidence_scores = json.dumps(result.confidence_scores or {})
        record.final_values = json.dumps(result.parsed_fields or {})
        record.status = STATUS_AWAITING_CONFIRMATION
        db.commit()
        logger.info("Extraction succeeded for record_id=%d", record.id)

        fields = result.parsed_fields or {}
        return dict(
            extraction_record_id=record.id,
            status=record.status,
            medicine_name=fields.get("medicine_name"),
            strength=fields.get("strength"),
            manufacturer=fields.get("manufacturer"),
            batch_number=fields.get("batch_number"),
            expiry_date=fields.get("expiry_date"),
            mrp=fields.get("mrp"),
            quantity_hint=fields.get("quantity_hint"),
            confidence=result.confidence_scores,
            notes=fields.get("notes"),
            error_message=None,
        )

    # Failure path
    record.status = STATUS_EXTRACTION_FAILED
    db.commit()
    logger.warning("Extraction failed for record_id=%d: %s", record.id, result.error_message)

    return dict(
        extraction_record_id=record.id,
        status=record.status,
        medicine_name=None,
        strength=None,
        manufacturer=None,
        batch_number=None,
        expiry_date=None,
        mrp=None,
        quantity_hint=None,
        confidence=None,
        notes=None,
        error_message=result.error_message,
    )


# ---------------------------------------------------------------------------
# Shared response model
# ---------------------------------------------------------------------------

class IntakeResponse(BaseModel):
    extraction_record_id: int
    status: str
    medicine_name: str | None = None
    strength: str | None = None
    manufacturer: str | None = None
    batch_number: str | None = None
    expiry_date: str | None = None
    mrp: float | None = None
    quantity_hint: float | None = None
    confidence: dict | None = None
    notes: str | None = None
    error_message: str | None = None


# ---------------------------------------------------------------------------
# Upload → Extract (single round-trip)
# ---------------------------------------------------------------------------

@router.post(
    "/upload",
    response_model=IntakeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a medicine carton image and extract fields",
    description=(
        "Accepts a single JPG or PNG image (≤ 5 MB). Validates, uploads to "
        "Supabase Storage, runs Gemini Vision extraction inline, and returns "
        "the parsed medicine fields with confidence scores. "
        "Rate limited to 20 uploads per minute per authenticated user."
    ),
)
@limiter.limit(settings.UPLOAD_RATE_LIMIT)
async def upload_image(
    request: Request,
    file: UploadFile = File(..., description="JPG or PNG medicine carton photo"),
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> IntakeResponse:

    # ── 1. MIME pre-check ─────────────────────────────────────────────────
    client_mime = (file.content_type or "").lower().split(";")[0].strip()
    if client_mime not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{client_mime}'. Only JPG and PNG are accepted.",
        )

    # ── 2. Stream + size cap ──────────────────────────────────────────────
    chunks: list[bytes] = []
    total_bytes = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > _MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit.",
            )
        chunks.append(chunk)

    if total_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded file is empty.",
        )

    contents = b"".join(chunks)

    # ── 3. Magic-byte validation ───────────────────────────────────────────
    detected_ext = _detect_extension(contents[:16])
    if detected_ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                "File content does not match a supported image format. "
                "Only JPG and PNG are accepted (checked by file signature)."
            ),
        )

    # ── 4. Upload to Supabase Storage ─────────────────────────────────────
    mime_type = _detect_mime(contents)
    safe_filename = f"{uuid.uuid4().hex}{detected_ext}"
    storage_path = _upload_to_storage(safe_filename, contents, mime_type)

    # ── 5. Create ExtractionRecord ─────────────────────────────────────────
    record = ExtractionRecord(image_path=storage_path, status=STATUS_PENDING)
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(
        "Image uploaded — record_id=%d storage=%s user=%s",
        record.id, storage_path, current_user.email,
    )

    # ── 6. Inline extraction ──────────────────────────────────────────────
    result_fields = _run_extraction(record, db)
    return IntakeResponse(**result_fields)


# ---------------------------------------------------------------------------
# Re-extract endpoint (manual retry without re-uploading)
# ---------------------------------------------------------------------------

@router.post(
    "/extract/{record_id}",
    response_model=IntakeResponse,
    summary="Re-run vision extraction on a saved image",
    description=(
        "Retries Gemini Vision extraction on a record in state "
        "'pending' or 'extraction_failed'. Avoids a re-upload."
    ),
)
def extract_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> IntakeResponse:
    record: ExtractionRecord | None = (
        db.query(ExtractionRecord).filter(ExtractionRecord.id == record_id).first()
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ExtractionRecord {record_id} not found.",
        )

    _re_extractable = {STATUS_PENDING, STATUS_EXTRACTION_FAILED}
    if record.status not in _re_extractable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Record {record_id} has status '{record.status}'. "
                f"Only records in {sorted(_re_extractable)} can be re-extracted."
            ),
        )

    result_fields = _run_extraction(record, db)
    return IntakeResponse(**result_fields)


# ---------------------------------------------------------------------------
# Confirm Intake & Inventory Save
# ---------------------------------------------------------------------------

class ConfirmIntakeRequest(BaseModel):
    # Security: all string fields capped to prevent oversized payloads being
    # written to the database. quantity must be >= 1 to prevent stock subtraction.
    medicine_name: str = Field(..., min_length=1, max_length=300)
    strength: str | None = Field(default=None, max_length=100)
    manufacturer: str | None = Field(default=None, max_length=300)
    batch_number: str | None = Field(default=None, max_length=100)
    expiry_date: str | None = Field(default=None, max_length=10)  # YYYY-MM-DD
    mrp: float | None = None
    purchase_price: float = Field(..., ge=0.0)
    quantity: int = Field(default=1, ge=1)  # must add at least 1 unit
    storage_location: str | None = Field(default=None, max_length=200)
    intake_status: str | None = Field(default=None, max_length=50)


class MedicineResponse(BaseModel):
    id: int
    name: str
    strength: str | None = None
    manufacturer: str | None = None
    batch_number: str | None = None
    expiry_date: date | None = None
    mrp: float | None = None
    purchase_price: float
    quantity: int
    reorder_threshold: int
    storage_location: str | None = None
    intake_status: str | None = None
    qr_code_id: str | None = None
    qr_code_image: str | None = None
    created_at: datetime
    updated_at: datetime


    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Duplicate-check endpoint
# ---------------------------------------------------------------------------

class DuplicateCheckResponse(BaseModel):
    exists: bool
    current_quantity: int | None = None
    medicine_id: int | None = None


@router.get(
    "/check-duplicate",
    response_model=DuplicateCheckResponse,
    summary="Check whether a batch already exists in inventory",
    description=(
        "Returns whether a medicine with the given name + batch_number already exists. "
        "Called before the confirmation save so the UI can warn the user."
    ),
)
def check_duplicate(
    medicine_name: str,
    batch_number: str | None = None,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> DuplicateCheckResponse:
    existing = (
        db.query(Medicine)
        .filter(
            Medicine.name == medicine_name.strip(),
            Medicine.batch_number == (batch_number.strip() if batch_number else None),
        )
        .first()
    )
    if existing:
        return DuplicateCheckResponse(
            exists=True,
            current_quantity=existing.quantity,
            medicine_id=existing.id,
        )
    return DuplicateCheckResponse(exists=False)


@router.post(
    "/confirm/{extraction_record_id}",
    response_model=MedicineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm AI extraction and save to inventory",
    description=(
        "Saves the finalised medicine to inventory (either creating new or updating existing), "
        "updates the extraction record to 'done', and creates audit log entries for "
        "each field corrected by the human."
    ),
)
def confirm_intake(
    extraction_record_id: int,
    request_data: ConfirmIntakeRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> MedicineResponse:
    if current_user.role not in ("admin", "pharmacist"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins and Pharmacists can confirm stock intake."
        )

    # 1. Fetch the extraction record
    record = (
        db.query(ExtractionRecord)
        .filter(ExtractionRecord.id == extraction_record_id)
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ExtractionRecord {extraction_record_id} not found.",
        )

    # 2. Parse original AI-extracted fields from raw_ai_response
    ai_fields = {}
    if record.raw_ai_response:
        import re
        raw_text = record.raw_ai_response.strip()
        if "```" in raw_text:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
            if match:
                raw_text = match.group(1).strip()
        try:
            ai_fields = json.loads(raw_text)
        except Exception:
            logger.warning("Could not parse raw_ai_response for record_id=%d, trying final_values fallback", record.id)
            if record.final_values:
                try:
                    ai_fields = json.loads(record.final_values)
                except Exception:
                    pass

    # 3. Parse expiry date into Date object if present
    parsed_expiry = None
    if request_data.expiry_date:
        try:
            parsed_expiry = date.fromisoformat(request_data.expiry_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expiry_date must be in YYYY-MM-DD format",
            )

    # Hard gate validation for already-expired stock
    if parsed_expiry and parsed_expiry < date.today():
        if request_data.intake_status != "expired_on_arrival":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Adding expired stock requires explicit confirmation status 'expired_on_arrival'."
            )

    # 4. Search for existing stock line using exact match on medicine_name + batch_number
    search_name = request_data.medicine_name.strip()
    search_batch = request_data.batch_number.strip() if request_data.batch_number else None

    medicine = (
        db.query(Medicine)
        .filter(
            Medicine.name == search_name,
            Medicine.batch_number == search_batch
        )
        .first()
    )

    from app.services.qr_service import generate_unique_qr_code_id, generate_qr_svg_base64

    is_new = medicine is None
    if not is_new:
        # Existing stock line: Update details and increment quantity (top-up)
        old_quantity = medicine.quantity
        medicine.strength = request_data.strength
        medicine.manufacturer = request_data.manufacturer
        medicine.expiry_date = parsed_expiry
        medicine.mrp = request_data.mrp
        medicine.purchase_price = request_data.purchase_price
        medicine.storage_location = request_data.storage_location
        medicine.intake_status = request_data.intake_status
        medicine.quantity += request_data.quantity
        
        # Self-healing if existing record lacks a QR code
        if not medicine.qr_code_id:
            medicine.qr_code_id = generate_unique_qr_code_id(db, medicine.batch_number)
            medicine.qr_code_image = generate_qr_svg_base64(medicine.qr_code_id)
            
        db.flush()

        # Log quantity top-up
        main_log = AuditLog(
            medicine_id=medicine.id,
            action="quantity_updated",
            changed_by=f"{current_user.email} ({current_user.role})",
            old_value=str(old_quantity),
            new_value=str(medicine.quantity),
        )
        db.add(main_log)
    else:
        # New stock line: Create new medicine entry and generate unique QR code
        qr_id = generate_unique_qr_code_id(db, search_batch)
        qr_img = generate_qr_svg_base64(qr_id)
        
        medicine = Medicine(
            name=search_name,
            strength=request_data.strength,
            manufacturer=request_data.manufacturer,
            batch_number=search_batch,
            expiry_date=parsed_expiry,
            mrp=request_data.mrp,
            purchase_price=request_data.purchase_price,
            quantity=request_data.quantity,
            storage_location=request_data.storage_location,
            intake_status=request_data.intake_status,
            qr_code_id=qr_id,
            qr_code_image=qr_img,
        )
        db.add(medicine)
        db.flush()  # Obtain medicine.id

        # Log creation
        main_log = AuditLog(
            medicine_id=medicine.id,
            action="created",
            changed_by=f"{current_user.email} ({current_user.role})",
            new_value=json.dumps({
                "name": medicine.name,
                "batch_number": medicine.batch_number,
                "quantity": medicine.quantity,
            }),
        )
        db.add(main_log)

    # 5. Update ExtractionRecord status, final_values, confirmed_by, and confirmed_at
    record.medicine_id = medicine.id
    record.status = STATUS_DONE
    record.confirmed_by = f"{current_user.email} ({current_user.role})"
    record.confirmed_at = datetime.now(timezone.utc)
    record.final_values = json.dumps({
        "medicine_name": request_data.medicine_name,
        "strength": request_data.strength,
        "manufacturer": request_data.manufacturer,
        "batch_number": request_data.batch_number,
        "expiry_date": request_data.expiry_date,
        "mrp": request_data.mrp,
        "purchase_price": request_data.purchase_price,
    })

    # 6. Diff each field to detect human changes vs raw_ai_response and write one audit_log per corrected field
    fields_to_compare = ["medicine_name", "strength", "manufacturer", "batch_number", "expiry_date", "mrp"]
    
    for f in fields_to_compare:
        ai_val = ai_fields.get(f)
        confirmed_val = getattr(request_data, f)

        # Normalize comparison
        is_same = False
        if f == "mrp":
            try:
                ai_mrp = float(ai_val) if ai_val is not None else None
            except (ValueError, TypeError):
                ai_mrp = None
            try:
                conf_mrp = float(confirmed_val) if confirmed_val is not None else None
            except (ValueError, TypeError):
                conf_mrp = None
            is_same = ai_mrp == conf_mrp
        elif f == "expiry_date":
            is_same = (ai_val or "").strip() == (confirmed_val or "").strip()
        else:
            is_same = str(ai_val or "").strip() == str(confirmed_val or "").strip()

        if not is_same:
            # Save separate audit log row with field prefix to preserve field identity
            audit_entry = AuditLog(
                medicine_id=medicine.id,
                action="ai_corrected",
                changed_by=f"{current_user.email} ({current_user.role})",
                old_value=f"{f}: {ai_val}" if ai_val is not None else f"{f}: ",
                new_value=f"{f}: {confirmed_val}" if confirmed_val is not None else f"{f}: ",
            )
            db.add(audit_entry)

    # 7. Check if near-expiry bulk stock warning conditions were met
    if parsed_expiry and request_data.quantity > RISK_QUANTITY_THRESHOLD:
        days_until = (parsed_expiry - date.today()).days
        if days_until <= RISK_EXPIRY_DAYS_THRESHOLD:
            risk_log = AuditLog(
                medicine_id=medicine.id,
                action="risk_warning_acknowledged",
                changed_by=f"{current_user.email} ({current_user.role})",
                old_value=None,
                new_value="near-expiry bulk stock warning shown and acknowledged",
            )
            db.add(risk_log)

    # 8. Check if already-expired stock was knowingly added
    if parsed_expiry and parsed_expiry < date.today() and request_data.intake_status == "expired_on_arrival":
        expired_log = AuditLog(
            medicine_id=medicine.id,
            action="expired_stock_added",
            changed_by=f"{current_user.email} ({current_user.role})",
            old_value=None,
            new_value=f"expired stock knowingly added at intake: expiry_date={request_data.expiry_date}, confirmed_by={current_user.email}",
        )
        db.add(expired_log)

    db.commit()
    db.refresh(medicine)

    return medicine

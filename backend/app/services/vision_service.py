"""
vision_service.py — Gemini Vision extraction service.

Public API
----------
extract_medicine_fields(image_path: str | Path) -> ExtractionResult

    Reads the image from disk, sends it to the Gemini Vision API with a
    structured prompt, parses the JSON response, and returns an
    ExtractionResult dataclass.

    On ANY failure (network error, API error, malformed JSON, unexpected
    schema) the function returns an ExtractionResult with
    status=STATUS_FAILED and stores the raw response for debugging instead
    of propagating an exception.

Design decisions
----------------
- The API key is read exclusively from settings (env var). It is never
  hard-coded or logged.
- The prompt instructs the model to return ONLY a JSON object — no prose,
  no markdown fences.  We still strip fences defensively in case the model
  ignores the instruction.
- We validate the parsed JSON against a Pydantic schema so callers get a
  typed result rather than a raw dict.
- The google-generativeai SDK is imported lazily inside the function so
  that importing this module does not fail if the SDK is missing (it would
  just fail at call-time with a clear ImportError).
"""

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models.extraction_record import STATUS_DONE, STATUS_FAILED

logger = logging.getLogger(__name__)

# ── Prompt ────────────────────────────────────────────────────────────────────
# Written once here so it stays in sync with the expected JSON schema.

_EXTRACTION_PROMPT = """\
You are an expert pharmacy label reader. Analyse the attached medicine carton image and extract the following information.

Return ONLY a valid JSON object — no prose, no markdown code fences, no explanation.
The JSON must have exactly these keys:

{
  "medicine_name":   "<string — full brand/generic name>",
  "strength":        "<string — e.g. 500mg, 10ml/5ml, or null if not found>",
  "manufacturer":    "<string — company name, or null if not found>",
  "batch_number":    "<string — lot/batch number, or null if not found>",
  "expiry_date":     "<string in YYYY-MM-DD format, or null if unreadable>",
  "mrp":             <number — Maximum Retail Price as a decimal, or null if not found>,
  "quantity_hint":   <number — units/tablets/ml in the pack, or null if not found>,
  "confidence": {
    "medicine_name":  <integer 0-100>,
    "expiry_date":    <integer 0-100>,
    "batch_number":   <integer 0-100>
  },
  "notes": "<string — any extraction issues, e.g. 'image blurred near expiry date'>"
}

Rules:
- Use null (JSON null, not the string "null") when a field cannot be determined.
- Dates must be YYYY-MM-DD (e.g. 2026-03-31). If only month/year visible, use the last day of that month.
- mrp and quantity_hint must be numbers, not strings.
- confidence values reflect how certain you are based on image clarity (0 = unreadable, 100 = crystal clear).
- Return nothing except the JSON object.
"""


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    """
    Outcome of one vision extraction attempt.

    Attributes
    ----------
    status          : 'done' or 'failed'
    raw_response    : The raw text the model returned (always saved for audit)
    parsed_fields   : The validated dict of extracted fields, or None on failure
    confidence_scores: Dict of per-field confidence ints, or None on failure
    error_message   : Human-readable failure reason, or None on success
    """
    status: str
    raw_response: str
    parsed_fields: Optional[dict] = field(default=None)
    confidence_scores: Optional[dict] = field(default=None)
    error_message: Optional[str] = field(default=None)


# ── Internal helpers ──────────────────────────────────────────────────────────

_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    """Remove markdown code fences if the model added them despite instructions."""
    match = _FENCE_RE.search(text)
    if match:
        return match.group(1).strip()
    return text.strip()


_REQUIRED_KEYS = {
    "medicine_name", "strength", "manufacturer", "batch_number",
    "expiry_date", "mrp", "quantity_hint", "confidence", "notes",
}
_CONFIDENCE_KEYS = {"medicine_name", "expiry_date", "batch_number"}


def _validate_structure(data: dict) -> str | None:
    """
    Return an error string if *data* is missing required keys or has wrong
    confidence structure, otherwise return None (= valid).
    """
    missing = _REQUIRED_KEYS - data.keys()
    if missing:
        return f"Missing keys in model response: {sorted(missing)}"

    conf = data.get("confidence")
    if not isinstance(conf, dict):
        return "confidence must be a JSON object"

    missing_conf = _CONFIDENCE_KEYS - conf.keys()
    if missing_conf:
        return f"Missing confidence keys: {sorted(missing_conf)}"

    for k in _CONFIDENCE_KEYS:
        v = conf.get(k)
        if v is not None and not isinstance(v, (int, float)):
            return f"confidence.{k} must be a number or null, got {type(v).__name__}"

    return None  # all good


# ── Public function ───────────────────────────────────────────────────────────

def extract_medicine_fields(image_path: str) -> ExtractionResult:
    """
    Call the Gemini Vision API to extract structured fields from a medicine
    carton image stored in Supabase Storage.

    Parameters
    ----------
    image_path : Storage path in the format "<bucket>/<object>" as stored in
                 extraction_records.image_path.
                 Example: "medicine-images/a3f1b2c.jpg"

    Returns
    -------
    ExtractionResult with status 'done' or 'failed'.
    Never raises an exception — failures are captured inside the result.
    """
    image_path = str(image_path)  # normalise Path objects

    # ── Guard: API key must be set ────────────────────────────────────────
    if not settings.VISION_API_KEY:
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response="",
            error_message=(
                "VISION_API_KEY is not configured. "
                "Set it in .env before running extractions."
            ),
        )

    # ── Download image bytes from Supabase Storage ────────────────────────
    # image_path format: "bucket-name/object-name.jpg"
    try:
        from app.supabase_client import get_supabase_client

        bucket, _, object_name = image_path.partition("/")
        if not bucket or not object_name:
            return ExtractionResult(
                status=STATUS_FAILED,
                raw_response="",
                error_message=(
                    f"Invalid storage path {image_path!r}. "
                    "Expected format: '<bucket>/<filename>'."
                ),
            )

        client = get_supabase_client()
        image_bytes: bytes = client.storage.from_(bucket).download(object_name)

    except RuntimeError as exc:
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response="",
            error_message=f"Supabase Storage not configured: {exc}",
        )
    except Exception as exc:
        logger.error("Failed to download image from Storage: %s", exc, exc_info=True)
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response="",
            error_message=f"Could not download image from Storage: {exc}",
        )

    # Detect MIME type from magic bytes
    mime_type = "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        mime_type = "image/png"

    # ── Call Gemini Vision API ────────────────────────────────────────────
    raw_text = ""
    try:
        import google.generativeai as genai  # lazy import

        genai.configure(api_key=settings.VISION_API_KEY)
        model = genai.GenerativeModel(model_name=settings.VISION_MODEL)

        image_part = {"mime_type": mime_type, "data": image_bytes}
        response = model.generate_content([_EXTRACTION_PROMPT, image_part])
        raw_text = response.text

    except ImportError:
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response="",
            error_message=(
                "google-generativeai package is not installed. "
                "Run: pip install google-generativeai"
            ),
        )
    except Exception as exc:  # network error, quota exceeded, etc.
        logger.error("Gemini API call failed: %s", exc, exc_info=True)
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response=str(exc),
            error_message=f"Vision API call failed: {type(exc).__name__}: {exc}",
        )

    # ── Parse JSON ────────────────────────────────────────────────────────
    cleaned = _strip_fences(raw_text)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("Model returned non-JSON: %s", raw_text[:500])
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response=raw_text,
            error_message=f"Model response was not valid JSON: {exc}",
        )

    if not isinstance(data, dict):
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response=raw_text,
            error_message=f"Expected a JSON object, got {type(data).__name__}",
        )

    # ── Validate structure ────────────────────────────────────────────────
    validation_error = _validate_structure(data)
    if validation_error:
        logger.warning("Model JSON failed schema check: %s", validation_error)
        return ExtractionResult(
            status=STATUS_FAILED,
            raw_response=raw_text,
            error_message=f"Response schema invalid: {validation_error}",
        )

    # ── Success ───────────────────────────────────────────────────────────
    confidence = data.get("confidence", {})

    # Build the parsed_fields dict (everything except the nested confidence block)
    parsed_fields = {k: v for k, v in data.items() if k != "confidence"}

    logger.info(
        "Extraction succeeded — medicine=%r expiry=%r",
        data.get("medicine_name"),
        data.get("expiry_date"),
    )

    return ExtractionResult(
        status=STATUS_DONE,
        raw_response=raw_text,
        parsed_fields=parsed_fields,
        confidence_scores=confidence,
    )

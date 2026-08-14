"""
QR Code generation service.
Generates unique readable QR code IDs and outputs Base64-encoded SVG QR Code data URIs.
"""

import base64
import io
import secrets
import qrcode
import qrcode.image.svg
from sqlalchemy.orm import Session
from app.models.medicine import Medicine


def generate_unique_qr_code_id(db: Session, batch_number: str | None) -> str:
    """
    Auto-generate a unique readable qr_code_id combining batch_number and a random hex suffix.
    Guarantees uniqueness in the database.
    """
    prefix = batch_number.strip() if batch_number else "MED"
    # Filter to only alphanumeric or dash/underscore
    prefix = "".join(c for c in prefix if c.isalnum() or c in ("-", "_"))
    if not prefix:
        prefix = "MED"
        
    for _ in range(10):  # Try 10 times to get unique ID
        suffix = secrets.token_hex(4).upper()  # 8 char hex suffix
        candidate = f"{prefix}-{suffix}"
        
        # Check database
        exists = db.query(Medicine).filter(Medicine.qr_code_id == candidate).first()
        if not exists:
            return candidate
            
    # Fallback if collision persists
    import uuid
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


def generate_qr_svg_base64(data: str) -> str:
    """
    Auto-generate a QR code SVG image encoding the given data.
    Returns it as a Base64-encoded SVG Data URI.
    """
    factory = qrcode.image.svg.SvgImage
    img = qrcode.make(data, image_factory=factory)
    stream = io.BytesIO()
    img.save(stream)
    svg_bytes = stream.getvalue()
    b64_svg = base64.b64encode(svg_bytes).decode("utf-8")
    return f"data:image/svg+xml;base64,{b64_svg}"

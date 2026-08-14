"""
AI Assistant router — Natural language queries with secure parameterized function calling.
"""

import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, SupabaseUser
from app.services import assistant_queries

router = APIRouter(prefix="/assistant", tags=["assistant"])


# ── LLM Tool Definitions ──────────────────────────────────────────────────────
# Dummy signatures matching our secure queries. These are registered as tools
# so that Gemini generates clean parameter schemas for function calling.

def get_medicines_expiring_within(days: int) -> str:
    """
    Get medicines expiring within a given number of days.
    
    Args:
        days: The number of days from today.
    """
    return ""


def get_medicines_below_stock_threshold() -> str:
    """
    Get medicines where quantity is below or equal to reorder_threshold.
    """
    return ""


def get_medicines_by_manufacturer(name: str) -> str:
    """
    Get medicines by manufacturer (fuzzy match, case-insensitive).
    
    Args:
        name: The manufacturer name (or partial match).
    """
    return ""


def get_inventory_value_above(amount: float) -> str:
    """
    Get medicines where the total inventory value (quantity * MRP) exceeds the threshold.
    
    Args:
        amount: The threshold amount.
    """
    return ""


def get_medicines_expiring_soonest(limit: int) -> str:
    """
    Get medicines expiring soonest (excluding items with no expiry date).
    
    Args:
        limit: The maximum number of medicines to return.
    """
    return ""


# System instruction forcing tool usage and restricting hallucinations
SYSTEM_INSTRUCTION = (
    "You are a pharmacy assistant. You must answer natural language questions strictly based on the results of the functions you call.\n"
    "If the user asks a question that does not map to any available function, or if no function is appropriate to answer the question, do NOT try to answer from your own knowledge. You must not invent or guess any data.\n"
    "If you cannot call a tool to answer the question, do not output an answer, or output exactly: 'I can only answer questions about your actual inventory data'.\n"
    "You do not have access to customer details, phone numbers, or billing/sales transaction records. If the user asks about customer names, phone numbers, sales logs, or billing information, decline to answer by returning: 'I can only answer questions about your actual inventory data'."
)


class AssistantAskRequest(BaseModel):
    # Security: cap at 500 chars — no legitimate inventory question needs more.
    # This prevents large payloads from being forwarded to the LLM unnecessarily.
    question: str = Field(..., min_length=1, max_length=500)


class AssistantAskResponse(BaseModel):
    answer: str
    raw_data: list[dict]


# Lazy configuration helper
_configured = False

def get_assistant_model():
    global _configured
    import google.generativeai as genai  # lazy import
    
    if not _configured:
        genai.configure(api_key=settings.VISION_API_KEY)
        _configured = True
        
    model_name = settings.VISION_MODEL
    # Dynamic safety gate fallback for deprecated/unsupported models
    if model_name == "gemini-1.5-flash":
        model_name = "gemini-2.5-flash"
        
    return genai.GenerativeModel(
        model_name=model_name,
        tools=[
            get_medicines_expiring_within,
            get_medicines_below_stock_threshold,
            get_medicines_by_manufacturer,
            get_inventory_value_above,
            get_medicines_expiring_soonest
        ],
        system_instruction=SYSTEM_INSTRUCTION
    )


@router.post(
    "/ask",
    response_model=AssistantAskResponse,
    summary="Ask the AI assistant about your inventory",
    description=(
        "Sends a natural-language question to the assistant. Offers a small, fixed set of safe query tools. "
        "Returns the natural-language answer along with the raw database records fetched."
    ),
)
def ask_assistant(
    request_data: AssistantAskRequest,
    db: Session = Depends(get_db),
    current_user: SupabaseUser = Depends(get_current_user),
) -> AssistantAskResponse:
    # 1. Guard against questions referencing customer names, phone numbers, or sales/billing details
    q_lower = request_data.question.lower()
    if any(word in q_lower for word in ["customer", "phone", "number", "billing", "sales history", "receipt", "invoice", "buyer", "sold to"]):
        return AssistantAskResponse(
            answer="I can only answer questions about your actual inventory data",
            raw_data=[]
        )

    # 2. Initialize generative assistant model
    try:
        model = get_assistant_model()

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not configure generative model client: {exc}"
        )

    # 2. Start chat session and send prompt
    chat = model.start_chat()
    try:
        response = chat.send_message(request_data.question.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assistant prompt dispatch failed: {exc}"
        )

    # Validate response structure
    if not response.candidates or not response.candidates[0].content.parts:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assistant returned an empty content payload."
        )

    part = response.candidates[0].content.parts[0]
    function_calls = part.function_call

    # 3. Handle Fallback (if model replied with text directly or called no functions)
    if not function_calls or not function_calls.name:
        return AssistantAskResponse(
            answer="I can only answer questions about your actual inventory data",
            raw_data=[]
        )

    func_name = function_calls.name
    func_args = dict(function_calls.args)

    # 4. Safely execute ORM query using parameterized helper functions
    raw_medicines = []
    try:
        if func_name == "get_medicines_expiring_within":
            days = int(func_args.get("days", 30))
            raw_medicines = assistant_queries.get_medicines_expiring_within(db, days)
        elif func_name == "get_medicines_below_stock_threshold":
            raw_medicines = assistant_queries.get_medicines_below_stock_threshold(db)
        elif func_name == "get_medicines_by_manufacturer":
            name = str(func_args.get("name", ""))
            raw_medicines = assistant_queries.get_medicines_by_manufacturer(db, name)
        elif func_name == "get_inventory_value_above":
            amount = float(func_args.get("amount", 0.0))
            raw_medicines = assistant_queries.get_inventory_value_above(db, amount)
        elif func_name == "get_medicines_expiring_soonest":
            limit = int(func_args.get("limit", 10))
            raw_medicines = assistant_queries.get_medicines_expiring_soonest(db, limit)
        else:
            # Unknown tool returned by model
            return AssistantAskResponse(
                answer="I can only answer questions about your actual inventory data",
                raw_data=[]
            )
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed function call parameters returned by assistant model: {exc}"
        )

    # 5. Serialize raw medicine records
    serialized_medicines = []
    for med in raw_medicines:
        serialized_medicines.append({
            "id": med.id,
            "name": med.name,
            "strength": med.strength,
            "manufacturer": med.manufacturer,
            "batch_number": med.batch_number,
            "expiry_date": str(med.expiry_date) if med.expiry_date else None,
            "mrp": float(med.mrp) if med.mrp is not None else None,
            "quantity": med.quantity,
            "reorder_threshold": med.reorder_threshold,
            "storage_location": med.storage_location
        })

    # 6. Send the raw database response back to Gemini to phrase natural language
    import google.generativeai as genai  # lazy import
    function_response_part = genai.protos.Part(
        function_response=genai.protos.FunctionResponse(
            name=func_name,
            response={"result": serialized_medicines}
        )
    )

    try:
        followup_response = chat.send_message(function_response_part)
        final_answer = followup_response.text or "Here are the matching inventory lines."
    except Exception as exc:
        # If final phrasing fails, return a fallback along with the raw database records
        final_answer = f"Retrieved matching inventory data. (Phrasing error: {exc})"

    return AssistantAskResponse(
        answer=final_answer.strip(),
        raw_data=serialized_medicines
    )

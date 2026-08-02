#!/usr/bin/env python3
"""
verify_voice_agent.py — End-to-end diagnostic for the MediVision AI voice agent.

Tests the full calling pipeline against a single hardcoded fake alert
("Dolo 650 — 3 days of stock remaining") without touching the Decision Engine.

Usage
-----
    # From the project root (MediVision AI/)
    python scripts/verify_voice_agent.py +919876543210

    # Or point at a different .env file
    python scripts/verify_voice_agent.py +919876543210 --env backend/.env

Required env vars (add to backend/.env)
---------------------------------------
    TWILIO_ACCOUNT_SID       Twilio Console → Account Info
    TWILIO_AUTH_TOKEN        Twilio Console → Account Info
    TWILIO_FROM_NUMBER       Twilio Console → Phone Numbers (e164 format, e.g. +12015550123)
    CLOUDFLARE_TUNNEL_URL    Your active cloudflared tunnel URL (e.g. https://xxxx.trycloudflare.com)
    VISION_API_KEY           Gemini API key (same key used by the backend)
    SUPABASE_URL             Project Settings → API → Project URL
    SUPABASE_SERVICE_KEY     Project Settings → API → service_role key (NOT the anon key)

Steps
-----
    1  Env var presence check
    2  Cloudflare Tunnel reachability  →  GET {TUNNEL}/api/health
    3  Local FastAPI endpoints          →  GET :8000/api/health  +  GET :8000/api/voice/health
    4  Place real outbound Twilio call  →  POST /api/voice/diagnostic-call
    5  Live tool-call log               →  polls decision_audit_log + staff_tasks in real time
    6  Post-call DB confirmation        →  rows created in last 2 min
    7  Final summary
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import requests

# ─────────────────────────────────────────────────────────────────────────────
# Dependency bootstrap — give clear errors before anything else
# ─────────────────────────────────────────────────────────────────────────────
_MISSING_DEPS: list[str] = []

try:
    from dotenv import load_dotenv as _load_dotenv
except ImportError:
    _MISSING_DEPS.append("python-dotenv")

try:
    from twilio.rest import Client as TwilioClient
    from twilio.base.exceptions import TwilioRestException
except ImportError:
    _MISSING_DEPS.append("twilio")

if _MISSING_DEPS:
    print("\n[SETUP] Missing required packages. Install them first:\n")
    print(f"    pip install {' '.join(_MISSING_DEPS)}\n")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Terminal colours — no third-party lib required
# ─────────────────────────────────────────────────────────────────────────────
_WIN = sys.platform == "win32"
_RESET  = "\033[0m"
_BOLD   = "\033[1m"
_GREEN  = "\033[92m"
_RED    = "\033[91m"
_YELLOW = "\033[93m"
_CYAN   = "\033[96m"
_DIM    = "\033[2m"

# Enable ANSI on Windows 10+
if _WIN:
    import ctypes
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        # If it fails, disable colours gracefully
        _RESET = _BOLD = _GREEN = _RED = _YELLOW = _CYAN = _DIM = ""


def _ok(step: int, label: str, detail: str = "") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    suffix = f"  {_DIM}{detail}{_RESET}" if detail else ""
    print(f"  {_DIM}[{ts}]{_RESET}  {_GREEN}{_BOLD}PASS{_RESET}  Step {step}: {label}{suffix}")


def _fail(step: int, label: str, reason: str, likely_cause: str = "") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"  {_DIM}[{ts}]{_RESET}  {_RED}{_BOLD}FAIL{_RESET}  Step {step}: {label}")
    print(f"         {_RED}Reason:{_RESET} {reason}")
    if likely_cause:
        print(f"         {_YELLOW}Most likely cause:{_RESET} {likely_cause}")


def _info(msg: str) -> None:
    print(f"  {_CYAN}→{_RESET} {msg}")


def _section(title: str) -> None:
    print(f"\n{_BOLD}{'─' * 68}{_RESET}")
    print(f"{_BOLD}  {title}{_RESET}")
    print(f"{_BOLD}{'─' * 68}{_RESET}")


# ─────────────────────────────────────────────────────────────────────────────
# Fake alert definition (hardcoded — does NOT hit Decision Engine)
# ─────────────────────────────────────────────────────────────────────────────
FAKE_ALERT: dict[str, Any] = {
    "id":          "DIAG-001",
    "medicine":    "Dolo 650",
    "description": "Only 3 days of stock remaining — approximately 180 tablets.",
    "severity":    "high",
    "stock_days":  3,
    "stock_units": 180,
    "suggested_reorder_qty": 500,
}

LOCAL_BASE  = "http://127.0.0.1:8000"
POLL_SECS   = 3          # seconds between Supabase polls during the call
CALL_TIMEOUT = 180       # seconds to wait for call to complete (3 min)
POST_CALL_WINDOW_MIN = 2 # minutes to look back in DB after call ends


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _supabase_get(
    table: str,
    supabase_url: str,
    service_key: str,
    gte_created_at: str,
) -> list[dict]:
    """Query a Supabase table for rows created at or after a given ISO timestamp."""
    url = f"{supabase_url}/rest/v1/{table}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
    }
    params = {
        "select": "*",
        "created_at": f"gte.{gte_created_at}",
        "order": "created_at.asc",
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=8)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []


def _twilio_call_status(account_sid: str, auth_token: str, call_sid: str) -> str:
    """Return the current Twilio call status string."""
    client = TwilioClient(account_sid, auth_token)
    try:
        return client.calls(call_sid).fetch().status
    except Exception:
        return "unknown"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Main diagnostic
# ─────────────────────────────────────────────────────────────────────────────

def run_diagnostic(phone_to: str, env_file: str) -> None:
    print(f"\n{_BOLD}{_CYAN}MediVision AI — Voice Agent Diagnostic{_RESET}")
    print(f"{_DIM}Target phone: {phone_to}{_RESET}")
    print(f"{_DIM}Fake alert  : {FAKE_ALERT['medicine']} — {FAKE_ALERT['stock_days']} days of stock{_RESET}")

    # ── Load .env ─────────────────────────────────────────────────────────────
    env_path = Path(env_file)
    if env_path.exists():
        _load_dotenv(dotenv_path=env_path, override=True)
        _info(f"Loaded env from {env_path.resolve()}")
    else:
        _info(f".env file not found at {env_path.resolve()} — reading from shell environment")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 1 — Env var presence check
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 1 — Required environment variables")

    REQUIRED_VARS = {
        "TWILIO_ACCOUNT_SID":   "Twilio Console → Account Info",
        "TWILIO_AUTH_TOKEN":    "Twilio Console → Account Info",
        "TWILIO_FROM_NUMBER":   "Twilio Console → Phone Numbers (e164 format)",
        "CLOUDFLARE_TUNNEL_URL":"Your active cloudflared tunnel public URL",
        "VISION_API_KEY":       "Google AI Studio → API Keys (Gemini key)",
        "SUPABASE_URL":         "Supabase Dashboard → Project Settings → API",
        "SUPABASE_SERVICE_KEY": "Supabase Dashboard → Project Settings → API → service_role",
    }

    env: dict[str, str] = {}
    missing: list[str] = []

    for var, hint in REQUIRED_VARS.items():
        val = os.environ.get(var, "").strip()
        if val:
            # Redact secrets in output
            display = val[:8] + "..." if len(val) > 12 else "***"
            _info(f"{var} = {display}")
            env[var] = val
        else:
            missing.append(var)
            print(f"  {_RED}✗  MISSING:{_RESET} {var}")
            print(f"     {_DIM}Where to find it: {hint}{_RESET}")

    if missing:
        _fail(
            1, "Env vars",
            f"Missing: {', '.join(missing)}",
            "Add the missing variables to backend/.env then re-run this script.",
        )
        sys.exit(1)

    _ok(1, "All required env vars present")

    tunnel_url = env["CLOUDFLARE_TUNNEL_URL"].rstrip("/")
    account_sid = env["TWILIO_ACCOUNT_SID"]
    auth_token  = env["TWILIO_AUTH_TOKEN"]
    from_number = env["TWILIO_FROM_NUMBER"]

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 2 — Cloudflare Tunnel reachability
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 2 — Cloudflare Tunnel reachability")
    _info(f"GET {tunnel_url}/api/health")

    try:
        resp = requests.get(f"{tunnel_url}/api/health", timeout=10)
        if resp.status_code == 200:
            body = resp.json()
            if body.get("status") == "ok":
                _ok(2, "Tunnel reachable", f"status={body.get('status')} version={body.get('version', 'n/a')}")
            else:
                _fail(
                    2, "Tunnel health check",
                    f"Unexpected response body: {body}",
                    "Tunnel down or stale URL — run `cloudflared tunnel run` and update CLOUDFLARE_TUNNEL_URL.",
                )
                sys.exit(1)
        else:
            _fail(
                2, "Tunnel health check",
                f"HTTP {resp.status_code} from tunnel",
                "Tunnel down or stale URL — run `cloudflared tunnel run` and update CLOUDFLARE_TUNNEL_URL.",
            )
            sys.exit(1)
    except requests.exceptions.ConnectionError as exc:
        _fail(
            2, "Tunnel health check",
            f"Connection refused / DNS failure: {exc}",
            "Tunnel down or stale URL — start cloudflared and paste the new URL into CLOUDFLARE_TUNNEL_URL.",
        )
        sys.exit(1)
    except requests.exceptions.Timeout:
        _fail(
            2, "Tunnel health check",
            "Request timed out after 10 s",
            "Tunnel down or stale URL — the tunnel URL may have rotated. Re-run cloudflared.",
        )
        sys.exit(1)

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 3 — Local FastAPI endpoint checks
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 3 — Local FastAPI voice endpoints")

    # 3a. Core health
    _info(f"GET {LOCAL_BASE}/api/health")
    try:
        r = requests.get(f"{LOCAL_BASE}/api/health", timeout=5)
        if r.status_code == 200 and r.json().get("status") == "ok":
            _ok(3, "/api/health", f"version={r.json().get('version', 'n/a')}")
        else:
            raise ValueError(f"HTTP {r.status_code}")
    except Exception as exc:
        _fail(
            3, "Local FastAPI /api/health",
            str(exc),
            "FastAPI server not running — open a terminal and run:\n"
            "     cd backend && uvicorn app.main:app --reload --port 8000",
        )
        sys.exit(1)

    # 3b. Voice-specific health
    _info(f"GET {LOCAL_BASE}/api/voice/health")
    try:
        r = requests.get(f"{LOCAL_BASE}/api/voice/health", timeout=5)
        if r.status_code == 200:
            _ok(3, "/api/voice/health", r.json().get("status", "ok"))
        elif r.status_code == 404:
            _fail(
                3, "/api/voice/health",
                "404 — voice router is not registered in main.py",
                "Missing webhook registration — add the voice router:\n"
                "     In app/main.py:  app.include_router(voice.router, prefix='/api')\n"
                "     Then restart uvicorn.",
            )
            sys.exit(1)
        else:
            _fail(3, "/api/voice/health", f"HTTP {r.status_code}", "Check uvicorn logs for exceptions in the voice router.")
            sys.exit(1)
    except requests.exceptions.ConnectionError:
        _fail(
            3, "/api/voice/health",
            "Connection refused",
            "FastAPI server not running — see step 3a fix above.",
        )
        sys.exit(1)

    # 3c. Diagnostic endpoint
    _info(f"GET {LOCAL_BASE}/api/voice/diagnostic-call  (checking endpoint exists)")
    try:
        # OPTIONS / HEAD to avoid side-effects — fall back to GET
        r = requests.options(f"{LOCAL_BASE}/api/voice/diagnostic-call", timeout=5)
        # FastAPI returns 200 on OPTIONS for existing routes
        if r.status_code not in (200, 405):
            raise ValueError(f"HTTP {r.status_code}")
        _ok(3, "/api/voice/diagnostic-call endpoint exists")
    except Exception as exc:
        _fail(
            3, "/api/voice/diagnostic-call",
            str(exc),
            "Missing webhook registration — add the diagnostic-call POST route to your voice router.\n"
            "     See the comment block at the bottom of this script for the minimal implementation.",
        )
        sys.exit(1)

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 4 — Place real outbound Twilio call
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 4 — Placing outbound Twilio call")
    _info(f"From: {from_number}  →  To: {phone_to}")
    _info(f"Fake alert payload: {json.dumps(FAKE_ALERT, indent=None)}")

    call_started_at = _iso_now()
    call_sid: str | None = None

    payload = {
        "phone_number": phone_to,
        "alerts": [FAKE_ALERT],
        "diagnostic": True,
    }

    try:
        r = requests.post(
            f"{LOCAL_BASE}/api/voice/diagnostic-call",
            json=payload,
            timeout=20,
        )
        if r.status_code in (200, 201, 202):
            body = r.json()
            call_sid = body.get("call_sid")
            _ok(4, "Call placed", f"call_sid={call_sid}")
        elif r.status_code == 422:
            _fail(4, "Diagnostic call endpoint", f"Validation error: {r.text}",
                  "Check the request payload schema expected by /api/voice/diagnostic-call.")
            sys.exit(1)
        else:
            detail = ""
            try:
                detail = r.json().get("detail", r.text[:300])
            except Exception:
                detail = r.text[:300]

            # Identify Twilio Geo Permissions failures surfaced from the server
            if "geo permission" in detail.lower() or "21215" in detail or "21310" in detail:
                _fail(
                    4, "Twilio call",
                    detail,
                    "Twilio Geo Permissions — log in to Twilio Console → Voice → Settings → "
                    "Geo Permissions and enable calls to the destination country.",
                )
            else:
                _fail(4, "Diagnostic call endpoint", f"HTTP {r.status_code}: {detail}",
                      "Check uvicorn logs. If Twilio errors appear, confirm TWILIO_FROM_NUMBER "
                      "is a purchased Twilio number, not a trial credit limted one.")
            sys.exit(1)

    except requests.exceptions.ConnectionError:
        _fail(4, "Diagnostic call", "FastAPI unreachable", "Server went down between step 3 and 4.")
        sys.exit(1)
    except requests.exceptions.Timeout:
        _fail(4, "Diagnostic call", "Server timed out placing the call",
              "The Twilio API call may be slow. Check uvicorn logs for the exception.")
        sys.exit(1)

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 5 — Live tool-call monitoring (poll Supabase in real time)
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 5 — Live tool-call log (polling every 3 s)")
    _info("Watching decision_audit_log and staff_tasks for new rows…")
    _info("Pick up the phone and follow the agent's prompts.\n")

    supabase_url  = env["SUPABASE_URL"].rstrip("/")
    service_key   = env["SUPABASE_SERVICE_KEY"]

    seen_audit_ids: set[str] = set()
    seen_task_ids:  set[str] = set()
    all_tool_calls: list[dict] = []  # for final summary

    deadline = time.time() + CALL_TIMEOUT
    call_connected = False
    call_final_status = "unknown"

    while time.time() < deadline:
        # ── Check call status ────────────────────────────────────────────────
        if call_sid:
            status = _twilio_call_status(account_sid, auth_token, call_sid)
            if status == "in-progress" and not call_connected:
                call_connected = True
                _info(f"  {_GREEN}Call connected{_RESET} (status=in-progress)")
            if status in ("completed", "failed", "busy", "no-answer", "canceled"):
                call_final_status = status
                _info(f"  Call ended — status={_BOLD}{status}{_RESET}")
                break

        # ── Poll decision_audit_log ──────────────────────────────────────────
        audit_rows = _supabase_get(
            "decision_audit_log", supabase_url, service_key, call_started_at
        )
        for row in audit_rows:
            rid = str(row.get("id", ""))
            if rid and rid not in seen_audit_ids:
                seen_audit_ids.add(rid)
                ts = row.get("created_at", "")[:19]
                decision  = row.get("decision", "?")
                alert_id  = row.get("alert_id", "?")
                decided_by= row.get("decided_by", "?")
                channel   = row.get("channel", "?")
                print(
                    f"  {_GREEN}▶ TOOL CALL:{_RESET} record_decision  "
                    f"{_DIM}[{ts}]{_RESET}\n"
                    f"    alert_id={alert_id}  decision={_BOLD}{decision}{_RESET}  "
                    f"decided_by={decided_by}  channel={channel}"
                )
                all_tool_calls.append({"tool": "record_decision", "row": row, "ts": ts})

        # ── Poll staff_tasks ─────────────────────────────────────────────────
        task_rows = _supabase_get(
            "staff_tasks", supabase_url, service_key, call_started_at
        )
        for row in task_rows:
            rid = str(row.get("id", ""))
            if rid and rid not in seen_task_ids:
                seen_task_ids.add(rid)
                ts           = row.get("created_at", "")[:19]
                assigned_to  = row.get("assigned_to", "?")
                message      = row.get("message", "?")
                medicine_id  = row.get("related_medicine_id", "?")
                task_status  = row.get("status", "?")
                print(
                    f"  {_GREEN}▶ TOOL CALL:{_RESET} dispatch_task    "
                    f"{_DIM}[{ts}]{_RESET}\n"
                    f"    assigned_to={assigned_to}  medicine_id={medicine_id}  "
                    f"status={task_status}\n"
                    f"    message={_DIM}{message[:80]}{_RESET}"
                )
                all_tool_calls.append({"tool": "dispatch_task", "row": row, "ts": ts})

        time.sleep(POLL_SECS)
    else:
        # Timed out waiting for call to complete
        _info(f"{_YELLOW}Warning:{_RESET} Monitoring timed out after {CALL_TIMEOUT}s. "
              "The call may still be active. Continuing to DB check.")
        call_final_status = "timeout"

    if all_tool_calls:
        _ok(5, f"{len(all_tool_calls)} tool call(s) observed live", "see rows above")
    else:
        _fail(
            5, "Tool-call monitoring",
            "No tool calls detected during the call",
            "Gemini tool-call reliability — the agent may have responded in plain text instead of "
            "calling a tool. Check uvicorn logs for 'function_call' JSON from Gemini. "
            "Also verify the VISION_API_KEY is valid and has Gemini 2.5 Flash access.",
        )
        # Don't exit — let step 6 check DB anyway in case there was a race

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 6 — Post-call DB confirmation
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 6 — Post-call database confirmation (last 2 min)")

    window_start = (
        datetime.now(timezone.utc) - timedelta(minutes=POST_CALL_WINDOW_MIN)
    ).isoformat()

    audit_final = _supabase_get("decision_audit_log", supabase_url, service_key, window_start)
    tasks_final = _supabase_get("staff_tasks",        supabase_url, service_key, window_start)

    db_writes_confirmed = bool(audit_final or tasks_final)

    if audit_final:
        print(f"\n  {_CYAN}decision_audit_log{_RESET} ({len(audit_final)} row(s)):")
        for row in audit_final:
            print(f"    {json.dumps(row, default=str, indent=None)}")

    if tasks_final:
        print(f"\n  {_CYAN}staff_tasks{_RESET} ({len(tasks_final)} row(s)):")
        for row in tasks_final:
            print(f"    {json.dumps(row, default=str, indent=None)}")

    if db_writes_confirmed:
        _ok(6, "Database writes confirmed", f"{len(audit_final)} audit row(s), {len(tasks_final)} task row(s)")
    else:
        _fail(
            6, "Database writes",
            "No rows found in decision_audit_log or staff_tasks in the last 2 minutes",
            "Supabase write permission — check that:\n"
            "  1. SUPABASE_SERVICE_KEY is the service_role key (not anon)\n"
            "  2. The tables exist (run the migration script if not)\n"
            "  3. RLS policies allow INSERT with the service_role (or RLS is disabled for these tables)\n"
            "  4. The call actually reached the tool-calling stage (see step 5 output)",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 7 — Final summary
    # ─────────────────────────────────────────────────────────────────────────
    _section("Step 7 — Final Summary")

    call_connected_str   = f"{_GREEN}YES{_RESET}" if call_connected else f"{_RED}NO{_RESET}  (status={call_final_status})"
    db_confirmed_str     = f"{_GREEN}YES{_RESET}" if db_writes_confirmed else f"{_RED}NO{_RESET}"
    tool_call_list_str   = (
        ", ".join(f"{t['tool']}@{t['ts']}" for t in all_tool_calls)
        if all_tool_calls else f"{_RED}none{_RESET}"
    )

    print(f"""
  {'─'*60}
  Call connected       : {call_connected_str}
  Call final status    : {_BOLD}{call_final_status}{_RESET}
  Call SID             : {call_sid or 'n/a'}

  Tool calls observed  : {tool_call_list_str}
  Total tool calls     : {len(all_tool_calls)}

  DB writes confirmed  : {db_confirmed_str}
    decision_audit_log : {len(audit_final)} row(s)
    staff_tasks        : {len(tasks_final)} row(s)
  {'─'*60}
""")

    all_passed = call_connected and bool(all_tool_calls) and db_writes_confirmed
    if all_passed:
        print(f"  {_GREEN}{_BOLD}✓  ALL CHECKS PASSED — voice agent pipeline is fully operational.{_RESET}\n")
    else:
        print(f"  {_YELLOW}{_BOLD}⚠  SOME CHECKS FAILED — see individual step output above.{_RESET}\n")
        if not call_connected:
            print(f"  {_YELLOW}Tip:{_RESET} Call did not connect. Most common causes:")
            print(f"       • Twilio Geo Permissions — enable destination country in Twilio Console")
            print(f"       • Stale tunnel URL — CLOUDFLARE_TUNNEL_URL must match live tunnel")
            print(f"       • The phone number didn't answer — try again with a different number")
        if not all_tool_calls:
            print(f"\n  {_YELLOW}Tip:{_RESET} No tool calls fired. Most common causes:")
            print(f"       • Gemini tool-call reliability — confirm function_call JSON appears in uvicorn logs")
            print(f"       • System prompt guardrail may have been too strict — check prompts.py")
        if not db_writes_confirmed:
            print(f"\n  {_YELLOW}Tip:{_RESET} DB writes missing. Most common causes:")
            print(f"       • Supabase write permission — use service_role key, check RLS")
            print(f"       • Tables not created — run the migration script first")


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="End-to-end diagnostic for the MediVision AI voice agent pipeline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/verify_voice_agent.py +919876543210
  python scripts/verify_voice_agent.py +919876543210 --env backend/.env

Required env vars (add to backend/.env):
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
  CLOUDFLARE_TUNNEL_URL, VISION_API_KEY,
  SUPABASE_URL, SUPABASE_SERVICE_KEY
""",
    )
    parser.add_argument(
        "phone",
        metavar="PHONE_NUMBER",
        help="Destination phone number in e164 format, e.g. +919876543210",
    )
    parser.add_argument(
        "--env",
        default="backend/.env",
        metavar="PATH",
        help="Path to .env file (default: backend/.env)",
    )
    return parser.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# APPENDIX — Minimal server-side endpoint needed for Step 3c / Step 4
# ─────────────────────────────────────────────────────────────────────────────
#
# Add this to backend/app/routers/voice.py:
#
#   from fastapi import APIRouter
#   from pydantic import BaseModel
#   from typing import Any
#
#   router = APIRouter(prefix="/voice", tags=["voice"])
#
#   @router.get("/health")
#   async def voice_health():
#       return {"status": "ok", "module": "voice_agent"}
#
#   class DiagnosticCallRequest(BaseModel):
#       phone_number: str
#       alerts: list[dict[str, Any]]
#       diagnostic: bool = True
#
#   @router.post("/diagnostic-call", status_code=202)
#   async def diagnostic_call(req: DiagnosticCallRequest):
#       """Places an outbound Twilio call using provided alerts (no Decision Engine)."""
#       from app.pharmacy.channels.voice import VoiceChannel
#       from app.pharmacy.engine import Alert, AlertSeverity
#       import asyncio
#
#       alerts = [
#           Alert(
#               id=a.get("id", "DIAG"),
#               medicine=a.get("medicine", "Unknown"),
#               description=a.get("description", ""),
#               severity=AlertSeverity(a.get("severity", "high")),
#           )
#           for a in req.alerts
#       ]
#
#       channel = VoiceChannel(phone_number=req.phone_number)
#       result  = await asyncio.to_thread(channel.send, alerts)
#
#       return {"call_sid": result.call_sid, "status": result.status}
#
# Then register it in app/main.py:
#   from app.routers import voice
#   app.include_router(voice.router, prefix="/api")
#
# ─────────────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    args = _parse_args()

    # Basic e164 sanity check
    if not args.phone.startswith("+") or not args.phone[1:].isdigit():
        print(f"\n{_RED}Error:{_RESET} Phone number must be in e164 format, e.g. +919876543210\n")
        sys.exit(1)

    run_diagnostic(phone_to=args.phone, env_file=args.env)

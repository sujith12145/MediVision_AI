# System Architecture & Design Decisions

MediVision AI follows a structured multi-tier architecture, establishing clear boundaries between presentation, business logic, storage, and external AI agents.

## Architectural Layers

```
┌────────────────────────────────────────────────────────┐
│             Presentation Layer (React SPA)             │
│        (Vite, Tailwind, Pipecat Client, Audio)         │
└───────────┬───────────────────────────────▲────────────┘
            │ REST (HTTP)                   │ WebSockets (Real-time)
┌───────────▼───────────────────────────────┴────────────┐
│              Application Layer (FastAPI)               │
│      (Routers, ORM, APScheduler, Voice Pipeline)       │
└───────────┬──────────────┬──────────────┬──────────────┘
            │ SQL          │ SDKs         │ WebSockets (Audio/RTVI)
┌───────────▼──┐   ┌───────▼──────┐   ┌───▼──────────────┐
│ Data Layer   │   │ AI Layer     │   │ Telephony/Audio  │
│ (Supabase)   │   │ (Gemini API) │   │ (Pipecat/Twilio) │
└──────────────┘   └──────────────┘   └──────────────────┘
```

### 1. Presentation Layer (Frontend)
- **Vite & React**: Renders the modular Single Page Application (SPA).
- **Pipecat Client JS**: Connects directly to the backend's WebRTC/WebSockets audio endpoint using the RTVI protocol, allowing real-time, low-latency mic capture and audio playback.
- **WebSocket Consumer**: Subscribes to the real-time notification socket (`/api/voice/notifications`) to display toast alerts when reminders trigger or stock level issues resolve.

### 2. Application Layer (Backend)
- **FastAPI**: Serves RESTful API requests and handles WebSocket connections.
- **SQLAlchemy ORM**: Interfaces with PostgreSQL database using models.
- **APScheduler**: Manages the persistent scheduler queue. When jobs trigger, they query the DB, calculate velocity, and push data to active browser connections or inject speech commands.

### 3. Data Layer (Supabase)
- **PostgreSQL Database**: Stores transactional data including inventory, sales logs, audit traces, reminders, and staff tasks.
- **Supabase Auth**: Authenticates users and issues JWT access tokens verified by backend route dependencies.
- **Supabase Storage**: A private storage bucket containing uploaded carton photos.

### 4. AI Layer (Gemini)
- **Gemini 2.5 Flash (Vision)**: Accepts carton photos from Supabase Storage and returns a structured JSON payload representing extracted text fields.
- **Gemini Live (Voice)**: Runs via the bidirectional WebSocket pipeline using the standard RTVI protocol. It answers queries, receives voice commands, and invokes registered Python tool functions.

---

## Key Design Decisions & Division of Labor

### 1. The LLM Never Does Math
A core guideline in MediVision AI is that **the AI agent is barred from performing mathematical, statistical, or calendar-based calculations.**
- **Reasoning**: Large Language Models (LLMs) are probabilistic text completion models. They are notoriously unreliable at arithmetic (e.g. division for stock velocity), and they do not have a robust concept of the current date, timezones, or elapsed intervals.
- **Implementation**: 
  - The voice assistant prompt explicitly forbids hallucinating or calculating stock quantities, batch details, or expiry dates. 
  - Instead, the agent invokes backend tool functions (e.g., `get_low_stock()`, `get_inventory_summary()`, `get_pending_reminders()`).
  - Mathematical metrics, such as daily sales velocity and days-to-stockout, are computed in Python in the SQLAlchemy layer (`app/voice/scheduler.py` and `app/services/voice_service.py`), leveraging actual transaction records. The LLM only receives and verbalizes the resulting numbers.

### 2. Database Auditing & Correction History
To ensure trace audits (necessary for legal compliance in drug dispensing):
- Directly updating values does not occur silently. 
- During human-in-the-loop validation, the backend diffs the finalized human edits against the original raw AI response. Any corrected field creates a dedicated `AuditLog` row with the action `ai_corrected`, detailing the exact field changed, the old AI value, and the new confirmed value.

### 3. WebSockets Routing and Telephony Channel Interface
- The real-time Pipecat pipeline uses standard WebRTC WebSockets directly in the browser via Vite proxy settings.
- Twilio integration sits behind a channel interface (`voice_call_records` and `broadcast_notification` handlers), abstracting the transport layer. This prevents WebRTC connection drops from corrupting the core transaction states.

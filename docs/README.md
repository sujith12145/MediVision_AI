# MediVision AI Documentation Overview

MediVision AI is an intelligent, production-ready pharmacy inventory and operations platform. It automates manual entry, tracks stock levels, forecasts inventory needs, generates business reports, and enables voice-based AI operations management.

## Problem Statement
Pharmacy stock management is traditionally a manual, error-prone, and time-intensive process. Writing batch numbers, manufacturing dates, and ex-shelf coordinates by hand results in:
- High operational overhead and labor costs.
- Costly stock write-offs due to expired medicines.
- Critical stockouts that disrupt customer/patient care.
- Dispensing errors from mismatched dosage strength and batch data.

MediVision AI solves these challenges by combining visual OCR Carton Analysis, human-in-the-loop validation, rule-based and predictive stock velocity reordering, rack-level location tracking, and an interactive voice assistant to proactively manage daily operations.

## Technology Stack

### Frontend Layer
- **Vite & React (v19)**: Single Page Application framework.
- **Tailwind CSS (v4)**: Modern utility-first styling with customized glassmorphism design tokens.
- **Pipecat Client JS**: Real-time WebRTC/WebSockets client for bidirectional voice sessions.

### Backend Layer
- **FastAPI (v0.111)**: Python web framework for asynchronous API endpoints.
- **SQLAlchemy (v2.0)**: Modern ORM with custom validations and relationships.
- **APScheduler**: Persistent task scheduling and cron jobs for reminders.
- **Uvicorn**: High-performance ASGI server.

### Data & Cloud Services
- **Supabase**: Managed backend infrastructure providing:
  - **PostgreSQL**: Primary transactional database.
  - **Supabase Auth**: JWT-based identity provider.
  - **Supabase Storage**: private cloud storage for intake photos.

### AI Integration
- **Google Gemini API**:
  - **Gemini 2.5 Flash / Vision**: For structured parameters extraction from photos.
  - **Gemini Live (Voice)**: Bidirectional, low-latency audio processing for the voice operations center.
- **Pipecat Framework**: Real-time AI agent framework connecting user microphones to Gemini Live and Twilio.

---

## Folder Structure
```
MediVision AI/
├── backend/
│   ├── app/
│   │   ├── models/       # SQLAlchemy ORM schemas
│   │   ├── routers/      # FastAPI endpoint routes
│   │   ├── services/     # SQL queries & vision/AI orchestrators
│   │   └── voice/        # Pipecat Websocket pipelines and scheduler
│   └── alembic/          # Database migrations
└── frontend/
    └── src/
        ├── components/   # UI panels, layouts & modals
        ├── contexts/     # State providers (Workspace, theme)
        └── services/     # REST client and api layer
```

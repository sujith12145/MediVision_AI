# Local Setup Guide

Follow these steps to set up a local development environment for MediVision AI.

---

## Prerequisites
Ensure you have the following installed on your system:
- **Python 3.11** or **Python 3.12**
- **Node.js 18+** (with npm)
- **Git**
- A code editor (e.g. VS Code)

---

## 1. Supabase Cloud Configuration

### A. Create Project & Database
1. Go to the [Supabase Dashboard](https://supabase.com) and create a new project.
2. Under **Project Settings** → **Database**, find the connection string. Choose the URI format (e.g., `postgresql://postgres.ref:password@host:6543/postgres`) and save it. This will be your `DATABASE_URL`.

### B. Enable API Keys
1. Under **Project Settings** → **API**, copy:
   - The `anon` public key (saved as `SUPABASE_ANON_KEY`).
   - The `service_role` private key (saved as `SUPABASE_SERVICE_KEY`).
   - The JWT Secret (saved as `SUPABASE_JWT_SECRET`).

### C. Create Storage Bucket
1. Navigate to **Storage** in the Supabase sidebar.
2. Create a new **Private** bucket named `medicine-images` (or matching your `SUPABASE_STORAGE_BUCKET` variable).
3. Ensure that authenticated users have read and write permissions in the bucket policies.

---

## 2. External API Keys

### A. Google Gemini API Key
1. Go to the [Google AI Studio Console](https://aistudio.google.com/).
2. Create an API key and copy the value. Save this as `VISION_API_KEY`.
3. Set your preferred model, e.g. `VISION_MODEL=gemini-2.5-flash`.

### B. Twilio Telephony Configuration (Optional Module 4)
- Twilio credentials are used to route VoIP signals.
- For local browser testing, the voice engine runs entirely over WebSockets via Pipecat and does not require standard Twilio SIP registration unless outbound phone dialing is enabled.

---

## 3. Local Environment Files

### A. Backend Environment Setup
1. Copy the example environment file:
   ```bash
   cd backend
   cp .env.example .env
   ```
2. Open the newly created `backend/.env` file and populate the variables with your Supabase and Gemini credentials:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-public-key
   SUPABASE_SERVICE_KEY=your-service-role-key
   SUPABASE_JWT_SECRET=your-jwt-secret
   SUPABASE_STORAGE_BUCKET=medicine-images
   DATABASE_URL=postgresql://postgres.your-project-id:password@host:6543/postgres
   VISION_API_KEY=AIzaSy...
   VISION_MODEL=gemini-2.5-flash
   ```

### B. Frontend Environment Setup
1. Copy the example environment file:
   ```bash
   cd ../frontend
   cp .env.example .env.local
   ```
2. Open `frontend/.env.local` and add the Supabase URL and public anon key:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

---

## 4. Run the Application

### Step A: Initialize Backend Database
1. Open a terminal in the `backend/` folder.
2. Create and activate a virtual environment:
   ```bash
   # Windows:
   python -m venv .venv
   .venv\Scripts\activate

   # macOS/Linux:
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run Alembic migrations to build tables:
   ```bash
   alembic upgrade head
   ```
5. Seed the default admin user:
   ```bash
   python seed_demo_user.py
   # Seeds username: admin@medivision.local
   # Seeds password: Password123
   ```

### Step B: Start FastAPI Server
Run uvicorn inside the activated virtual environment:
```bash
uvicorn app.main:app --reload
# Starts the server at http://localhost:8000
```

### Step C: Start React Frontend
1. Open a new terminal in the `frontend/` folder.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   # Starts the UI at http://localhost:3000
   ```

---

## 5. Verify Setup

### A. Test Stock Intake
1. Log in to the UI with `admin@medivision.local` / `Password123`.
2. Go to the **Stock Intake** tab.
3. Drag-and-drop a sample medicine carton image.
4. Verify that OCR fills out the fields and the verified item is added to the inventory upon confirmation.

### B. Test Voice Operations
1. Go to the **AI Operations Center** tab.
2. Verify that the **AI Daily Brief** card loads.
3. Click **Start Session** on the Voice Session tab.
4. Allow microphone access in your browser.
5. Speak queries like *"What medicines are running low?"* and verify that the assistant answers.

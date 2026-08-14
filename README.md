# MediVision AI

MediVision AI is a premium, AI-powered pharmacy inventory and scan operations platform designed to streamline medicine intake, billing, and stock management. By leveraging Gemini 2.5 Flash Vision, the system automates the extraction of key parameters (such as name, strength, manufacturer, MRP, expiry, and batch number) directly from photos of medicine cartons, eliminating manual data entry mistakes. Integrated with real-time financial tracking, predictive stock alerts, and a schema-aware natural language assistant, it provides a comprehensive end-to-end management suite for modern pharmacies.

---

## Core Features (Built)

The system is designed around a clean, modular architecture implementing the **Input → Process → Persist → Actionable Output** pattern across its three core modules:

### 1. Smart Stock Intake
* **Input**: A high-resolution photograph of a medicine carton uploaded or drag-dropped onto the dashboard.
* **Process**: The image is analyzed by the backend's Gemini Vision Extraction pipeline to extract text fields. The pharmacist reviews these extracted fields on an interactive confirmation screen, corrects any discrepancies, and enters the mandatory **Purchase Price (per unit)**.
* **Persist**: The verified record is validated (enforcing positive values for purchase price and required fields) and persisted to the Supabase PostgreSQL database. If the item already exists, it intelligently handles increments and alerts on duplicate batches.
* **Actionable Output**: A clean, audited stock intake transaction is logged, and stock levels are instantly updated on the live inventory view.

### 2. Inventory Intelligence Dashboard
* **Input**: Current medicine quantities, reorder thresholds, and transaction history.
* **Process**: Calculates the daily sales velocity over the last 30 days and determines when a medicine will go out of stock, falling back to rule-based logic for low-volume items.
* **Persist**: Dynamically queries active stock metrics (`quantity > 0`) using SQLAlchemy to compute current inventory investment (`sum(quantity * purchase_price)`).
* **Actionable Output**: A dual-column responsive panel displaying the upload zone side-by-side with a scrollable **Reorder Recommendations** panel, alerting pharmacists of urgent shortages and recommending precise order quantities (+QTY).

### 3. AI Business Query Engine
* **Input**: Free-text natural language queries from managers (e.g., *"What is our most expensive stock?"* or *"Show me expired products"*).
* **Process**: The assistant chat service interprets the intent using LLM-driven query translation, mapping queries directly to the relational database structure.
* **Persist**: Retrieves structured data from the medicine tables.
* **Actionable Output**: Renders interactive response text and structured tables directly in the chat panel, allowing managers to make data-driven purchasing decisions.

---

## Human-in-the-Loop Design

In a real-world pharmacy environment, data correctness is a matter of patient safety, legal compliance, and financial accuracy. While AI-based extraction using vision models is fast, stylised typography on medicine cartons or unexpected camera glare can introduce minor transcription errors.

MediVision AI addresses this by implementing a strict **Human-in-the-Loop** confirmation flow:
1. **Highlighting and Editing**: Once Gemini extracts the properties, the system highlights them in an editable form. The pharmacist can immediately correct any OCR slip-ups.
2. **Mandatory Input**: High-risk financial fields like **Purchase Price (per unit)** cannot be extracted reliably from carton packaging alone and must be manually entered by the pharmacist to ensure accurate bookkeeping.
3. **Validation Gates**: The pharmacist must explicitly review and confirm the expiry date, batch number, and strength before enabling the **Save** button.

This design guarantees database integrity while keeping the intake workflow up to **10x faster** than typing records from scratch.

---

## Setup Instructions

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **A Supabase project** (with database, auth, and private storage bucket enabled)
- **A Google Gemini API key**

### Environment Variables

1. **Backend Environment**:
   Create a [backend/.env](file:///d:/shi%20solo%20project/MediVision%20AI/backend/.env) file by copying the template [backend/.env.example](file:///d:/shi%20solo%20project/MediVision%20AI/.env.example):
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOi...
   SUPABASE_SERVICE_KEY=eyJhbGciOi...          # service_role key, keep private
   SUPABASE_JWT_SECRET=your-jwt-secret
   SUPABASE_STORAGE_BUCKET=medicine-images
   DATABASE_URL=postgresql://postgres.ref:password@host:6543/postgres
   VISION_API_KEY=AIzaSy...
   VISION_MODEL=gemini-2.5-flash
   ```

2. **Frontend Environment**:
   Create a `frontend/.env.local` file by copying the template [frontend/.env.example](file:///d:/shi%20solo%20project/MediVision%20AI/frontend/.env.example):
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

### Local Installation & Running the Application

1. **Database Migrations & Seed**:
   ```bash
   cd backend
   python -m venv .venv
   # Activate virtualenv:
   # Windows: .venv\Scripts\activate
   # macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   alembic upgrade head
   python seed_demo_user.py  # Pre-seeds admin@medivision.local credentials
   ```

2. **Run Backend Development Server**:
   ```bash
   uvicorn app.main:app --reload
   # Runs at http://localhost:8000
   ```

3. **Run Frontend Development Server**:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   # Runs at http://localhost:3000
   ```

---

## Future Work (Roadmap)

The following features represent future phases of the platform and are **not currently built**:

* 🚫 **Barcode & QR Scanning**: Integration with physical barcode scanner APIs or device cameras to parse standard GS1 barcodes and cross-reference them with the drug index.
* 🚫 **Supplier Portal**: A wholesale ordering dashboard that automatically sends the scrollable reorder suggestions as draft purchase orders to registered distributors.
* 🚫 **Multi-Branch Synchronization**: Centralized state management for pharmacies with multiple retail outlets to share stock, dispatch transfers, and analyze company-wide asset values.
* 🚫 **POS Cashier Terminal & Billing**: Integrated retail POS register flow with support for printing paper receipts and scanning customer prescriptions.
* 🚫 **Demand Forecasting**: Machine learning models analyzing historical multi-year sales data to forecast seasonal disease trends and pre-emptively order vaccines/medications.
* 🚫 **Automated SMS/Email Alerts**: Direct integration with Twilio/SendGrid to dispatch SMS or email alerts to the manager when critical medicines fall below thresholds or are within 30 days of expiry.

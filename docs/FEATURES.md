# Platform Features & Limitations

---

## 1. Smart Stock Intake

### What It Does
Automates the process of entering newly received medicine cartons into the inventory by uploading an image of the box, extracting core metadata fields, and queuing them for review.

### Why It Exists
Manual entry of alphanumeric medicine data (batch numbers, strengths, expiry dates) is slow and highly prone to typing mistakes. Mistyping an expiry date or strength can lead to serious patient safety and compliance risks.

### How It Works End-to-End
1. The user uploads a photo via the UI.
2. The image is uploaded to Supabase Storage and a pending `ExtractionRecord` is created in the database.
3. The image path is sent to Gemini 2.5 Flash Vision. It returns a structured JSON payload containing: `medicine_name`, `strength`, `manufacturer`, `batch_number`, `expiry_date`, and `mrp`.
4. The backend stores the raw response and updates the status to `awaiting_confirmation`.
5. The UI shows the extracted fields with confidence indicators for review.

### Current Limitations
- **Image Quality**: Glare, low lighting, or oblique angles can lead to OCR extraction failures.
- **Stylized Typography**: Highly stylized or calligraphic logo fonts on cartons are sometimes misidentified by the vision model.
- **Languages**: OCR is currently tuned for English carton texts and may fail on other scripts.

---

## 2. Human-in-the-Loop Verification

### What It Does
Ensures that all AI-extracted carton metadata is reviewed, edited, and approved by a human pharmacist before entering the database. It also requires the pharmacist to manually input key financial fields.

### Why It Exists
AI models can hallucinate or fail. Mandatory validation steps ensure database integrity. Critical billing metrics like **Unit Purchase Price** do not appear on outer cartons and must be explicitly entered.

### How It Works End-to-End
1. The UI renders the parsed values in editable input textboxes.
2. Form fields with confidence scores below 80% are highlighted with a warning badge to call the human's attention.
3. The pharmacist inputs the unit purchase price and corrects any mis-transcribed fields.
4. Saving triggers a POST request to `/api/intake/confirm/{id}`.
5. The backend validates formatting (e.g. valid date, positive prices) and saves the stock record.
6. The system compares the human-saved data against the raw AI response, writing detailed audit log entries for any corrected fields (labeled `ai_corrected`).

### Current Limitations
- **Manual Input**: If the user skips checking, there is no physical carton verification barcoding to hard-lock accuracy; the system relies entirely on the pharmacist's manual review.

---

## 3. Storage Location Assignment

### What It Does
Assigns incoming inventory to specific physical pharmacy coordinates (Rack, Row, Column) based on type (refrigerator, shelf) and available capacity.

### Why It Exists
Ensures that medicines can be retrieved quickly by staff and stored in appropriate conditions (e.g., cold storage for vaccines).

### How It Works End-to-End
1. During confirm intake, the backend calls `resolve_location()`.
2. It looks for active slots where the same medicine batch is already stored to suggest a top-up.
3. If no pre-existing slot exists, it searches for empty slots matching the medicine type (e.g. cold-storage vs shelf) with remaining capacity.
4. If a slot is auto-assigned, it updates `medicine_locations` directly.
5. If multiple slots have space, it returns candidates to the frontend for human confirmation via the `/api/stock/confirm-location` endpoint.

### Current Limitations
- **Basic Capacity Checking**: Capacity is measured as a simple unit count (e.g., max 20 cartons) and does not take into account physical carton dimensions, weights, or shelving configurations.
- **No Path Optimization**: Does not optimize navigation path coordinates for pickers.

---

## 4. Reorder Intelligence

### What It Does
Monitors stock levels, calculates sales velocity, alerts the user of pending shortages, and predicts exact days-to-stockout.

### Why It Exists
Prevents stockouts of high-demand items while avoiding over-purchasing and tying up working capital.

### How It Works End-to-End
1. **Sales Velocity**: Calculated as: `Total Qty Sold in Last 30 Days / 30`.
2. **Stockout Forecast**: Calculated as: `Current Quantity / Sales Velocity`.
3. If the predicted stockout is `< 7 days` (Urgent) or `< 14 days` (Upcoming), it flags the item and suggests a velocity-based order quantity: `Velocity * 14`.
4. If the item has fewer than 5 transactions in the last 30 days, the engine falls back to standard rule-based reorder thresholds: `Suggested Order = (Threshold * 2) - Current Qty`.

### Current Limitations
- **No Seasonality**: Outflow velocity calculations assume a linear rate over 30 days and do not account for seasonal trends or sudden outbreaks.
- **Lead-time Insensitivity**: The logic assumes immediate replenishment and does not model vendor shipping delays.

---

## 5. AI Business Query Engine

### What It Does
Allows pharmacy managers to execute natural language queries against the inventory system.

### Why It Exists
Managers often need custom reports (e.g., *"What is our total expired stock value?"*) that are not pre-built in dashboard tabs.

### How It Works End-to-End
1. The user types a question in the query pane.
2. The request is routed to `/api/assistant/ask`.
3. Gemini processes the text. Based on system instructions, it translates the query into parameters and issues a tool function call (e.g., `get_medicines_expiring_soonest`).
4. The backend runs the corresponding SQLAlchemy query against PostgreSQL, retrieves the results, and returns them to Gemini.
5. Gemini verbalizes the database records into a natural language response.

### Current Limitations
- **Access Limits**: The prompt forbids accessing cashier logs, phone numbers, customer names, or direct billing histories for privacy and security.
- **Preset Tools**: The assistant can only query databases through pre-defined tool signatures and cannot run arbitrary SQL writes.

---

## 6. Voice Operations Center

### What It Does
Uses a real-time voice interface to deliver operations briefings, alert on low stock, handle persistent audio reminders, and record operational decisions.

### Why It Exists
Allows pharmacists to perform inventory tasks, review briefs, and dispatch tasks hand-free while working.

### How It Works End-to-End
1. The frontend connects to `/api/voice/ws` using Pipecat and the RTVI WebSocket protocol.
2. The backend initializes a Gemini Live session with registered tools (e.g. `create_reminder`, `dispatch_task`).
3. An `AsyncIOScheduler` runs checks. If issues exist, it pushes a real-time event via WebSocket.
4. The voice assistant verbalizes the alert and waits for owner confirmation.
5. If approved, the agent invokes `dispatch_task()`, which writes a task to the DB and logs the decision.
6. The frontend renders real-time tool execution logs, transcriptions, and interactive approval cards.

### Current Limitations
- **Latency**: Voice pipelines require low-latency networks; laggy connections disrupt the interaction flow.
- **No Background TTS Call Spooling**: Voice output requires an active, connected browser WebSocket; the backend cannot make asynchronous VoIP calls to standard phones without a public SIP server configuration.

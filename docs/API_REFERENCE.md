# FastAPI API Reference

All backend API routes are prefixed by `/api` (configured in `main.py`). Requests require a bearer token in the `Authorization` header (`Bearer <Supabase_JWT>`) unless specified otherwise.

---

## 1. Stock Intake Module (`/api/intake`)

### POST `/intake/upload`
- **Description**: Upload a medicine carton carton photo to Supabase storage and run Gemini Vision OCR extraction.
- **Auth**: Required (Admin or Pharmacist).
- **Request (Multipart Form)**:
  - `file`: Image file (JPG/PNG, max 5MB).
- **Response (`IntakeResponse`)**:
  ```json
  {
    "extraction_record_id": 42,
    "status": "awaiting_confirmation",
    "medicine_name": "Paracetamol",
    "strength": "500 mg",
    "manufacturer": "Cipla",
    "batch_number": "BAT-993",
    "expiry_date": "2026-12-31",
    "mrp": 15.50,
    "quantity_hint": 10.0,
    "confidence": {
      "medicine_name": 0.95,
      "mrp": 0.91
    },
    "notes": null,
    "error_message": null
  }
  ```

### POST `/intake/confirm/{extraction_record_id}`
- **Description**: Confirms the human-verified fields, updates the extraction record status to `done`, creates/increments the medicine inventory, and resolves storage slot assignment.
- **Auth**: Required (Admin or Pharmacist).
- **Request (`ConfirmIntakeRequest`)**:
  ```json
  {
    "medicine_name": "Paracetamol",
    "strength": "500 mg",
    "manufacturer": "Cipla",
    "batch_number": "BAT-993",
    "expiry_date": "2026-12-31",
    "mrp": 15.50,
    "purchase_price": 8.20,
    "quantity": 10,
    "storage_location": "Rack A, Row 1, Column 1",
    "intake_status": "valid"
  }
  ```
- **Response (`MedicineResponse`)**:
  ```json
  {
    "id": 12,
    "name": "Paracetamol",
    "strength": "500 mg",
    "quantity": 10,
    "reorder_threshold": 10,
    "qr_code_id": "QR-MED-12",
    "qr_code_image": "data:image/svg+xml;base64,...",
    "location_assignment": {
      "location_id": 1,
      "rack_name": "Rack A",
      "row": 1,
      "column": 1
    }
  }
  ```

### GET `/intake/check-duplicate`
- **Description**: Check if a medicine name + batch number already exists in inventory before confirming.
- **Query Params**:
  - `medicine_name` (string)
  - `batch_number` (string, optional)
- **Response**:
  ```json
  {
    "exists": true,
    "current_quantity": 12,
    "medicine_id": 10
  }
  ```

---

## 2. Inventory Module (`/api/inventory` & `/api/medicines`)

### GET `/inventory`
- **Description**: Returns paginated, filtered inventory items ordered by soonest expiring first.
- **Query Params**:
  - `limit` (int, default: 10)
  - `offset` (int, default: 0)
  - `search` (string, optional)
  - `manufacturer` (string, optional)
  - `expiry_status` (string: `'expired' | 'near_expiry' | 'valid'`)
- **Response**:
  ```json
  {
    "items": [
      {
        "id": 12,
        "name": "Paracetamol",
        "quantity": 10,
        "expiry_date": "2026-12-31"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
  ```

### GET `/inventory/expiry-summary`
- **Description**: Returns summary counts of medicines in red (<=30 days), amber (31-90 days), and green (>90 days/null) expiry status bands.
- **Response**:
  ```json
  {
    "red": 2,
    "amber": 5,
    "green": 24
  }
  ```

### GET `/inventory/{medicine_id}/history`
- **Description**: Returns the audit history for a specific medicine record.
- **Auth**: Admin only.
- **Response**:
  ```json
  [
    {
      "id": 102,
      "medicine_id": 12,
      "action": "ai_corrected",
      "changed_by": "admin@medivision.local (admin)",
      "old_value": "mrp: 15.0",
      "new_value": "mrp: 15.5",
      "timestamp": "2026-08-02T05:00:00Z"
    }
  ]
  ```

---

## 3. Location Module (`/api/stock`)

### POST `/stock/confirm-location`
- **Description**: Confirm storage slot assignment.
- **Request (`ConfirmLocationRequest`)**:
  ```json
  {
    "medicine_id": 12,
    "location_id": 1,
    "quantity": 10
  }
  ```
- **Response**:
  ```json
  {
    "medicine_id": 12,
    "location_id": 1,
    "quantity": 10,
    "assigned_by": "human",
    "label": "Rack A, Row 1, Column 1",
    "message": "Successfully assigned 10 units to Rack A, Row 1, Column 1."
  }
  ```

### GET `/stock/locations`
- **Description**: List all active storage slots with current occupancy.
- **Response**:
  ```json
  {
    "locations": [
      {
        "id": 1,
        "rack_name": "Rack A",
        "row": 1,
        "column": 1,
        "capacity": 20,
        "current_occupancy": 10,
        "available": 10,
        "storage_type": "shelf",
        "is_active": true,
        "label": "Rack A, Row 1, Column 1"
      }
    ],
    "total": 1
  }
  ```

---

## 4. Reorder Intelligence Module (`/api/inventory`)

### GET `/inventory/reorder-suggestions`
- **Description**: Returns medicines below threshold with simple rule-based ordering recommendations.
- **Response**:
  ```json
  [
    {
      "medicine_id": 12,
      "name": "Paracetamol",
      "quantity": 2,
      "reorder_threshold": 10,
      "suggested_reorder_quantity": 18
    }
  ]
  ```

### GET `/inventory/smart-reorder-predictions`
- **Description**: Computes sales velocity over the last 30 days and predicts stockouts.
- **Response**:
  ```json
  [
    {
      "medicine_id": 12,
      "name": "Paracetamol",
      "quantity": 2,
      "reorder_threshold": 10,
      "daily_sales_velocity": 1.5,
      "estimated_days_until_stockout": 1.33,
      "suggested_reorder_quantity": 21,
      "status": "urgent"
    }
  ]
  ```

---

## 5. POS Cashier Billing Module (`/api/sales` & `/api/finance`)

### POST `/sales`
- **Description**: Checkout a cashier sales order. Validates stock levels, decrements quantities, and logs transaction details.
- **Request**:
  ```json
  {
    "customer_name": "John Doe",
    "customer_phone": "9876543210",
    "items": [
      {
        "medicine_id": 12,
        "quantity_sold": 2,
        "sale_price": 15.50
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "id": 4,
    "sold_at": "2026-08-02T05:40:00Z",
    "sold_by": "admin@medivision.local",
    "customer_name": "John Doe",
    "customer_phone": "9876543210",
    "total_amount": 31.0,
    "items": [
      {
        "id": 10,
        "medicine_name": "Paracetamol",
        "quantity_sold": 2,
        "sale_price": 15.50,
        "line_total": 31.0
      }
    ]
  }
  ```

### POST `/finance/gst-report`
- **Description**: Generates an Excel format GST tax report sheet.
- **Request**:
  ```json
  {
    "start_date": "2026-07-01",
    "end_date": "2026-07-31"
  }
  ```
- **Response**: Binary Excel file content (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

---

## 6. Voice Operations Center (`/api/voice`)

### GET `/voice/daily-brief`
- **Description**: Returns aggregated data for low stock, expiring medicines, pending tasks, and active reminders.
- **Response**:
  ```json
  {
    "low_stock": [
      {
        "id": 12,
        "name": "Paracetamol",
        "strength": "500 mg",
        "quantity": 2,
        "reorder_threshold": 10
      }
    ],
    "expiring": [],
    "pending_reminders": [
      {
        "id": 3,
        "title": "Low stock alert: Paracetamol",
        "reminder_type": "until_resolved",
        "reminder_time": "2026-08-02T06:00:00Z"
      }
    ],
    "pending_tasks_count": 1,
    "summary_text": "Good day. Here is your AI Daily Brief: 1 medicine below reorder level. 1 active reminder pending. 1 staff task open. How would you like to proceed?"
  }
  ```

### GET `/voice/reminders`
- **Description**: Retrieve active persistent reminders.
- **Response**:
  ```json
  [
    {
      "id": 3,
      "title": "Low stock alert: Paracetamol",
      "medicine_id": 12,
      "reminder_type": "until_resolved",
      "reminder_time": "2026-08-02T06:00:00Z",
      "active": true
    }
  ]
  ```

### POST `/voice/reminders/{id}/snooze`
- **Description**: Snoozes the selected reminder by a parameterized duration.
- **Query Params**:
  - `minutes` (int, default: 30)
- **Response**:
  ```json
  {
    "message": "Snoozed reminder 3 by 30 minutes"
  }
  ```

### WS `/voice/ws`
- **Description**: WebSocket transport endpoint for real-time Pipecat audio stream and Gemini Live model interactions.
- **Auth**: Token passed as query parameter `?token=...`.

### WS `/voice/notifications`
- **Description**: WebSocket connection for real-time notification pushes (e.g. reminder alerts).
- **Auth**: Token passed as query parameter `?token=...`.

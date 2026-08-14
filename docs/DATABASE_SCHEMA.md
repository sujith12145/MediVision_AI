# Supabase Database Schema

MediVision AI uses a relational Postgres database (hosted on Supabase) to manage all transactions, inventory, and operations.

---

## 1. Table: `medicines`
- **Purpose**: Stores core drug inventory items, quantities, thresholds, expiry, prices, and QR credentials.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `name` | `VARCHAR(255)` | Not Null, Index | Name of the medicine/drug |
  | `strength` | `VARCHAR(100)` | Nullable | Dosage strength (e.g. "500 mg") |
  | `manufacturer` | `VARCHAR(255)` | Nullable | Manufacturing brand name |
  | `batch_number` | `VARCHAR(100)` | Nullable | Batch or lot number |
  | `expiry_date` | `DATE` | Nullable, Index | Expiry date |
  | `mrp` | `NUMERIC(10, 2)` | Nullable | Maximum Retail Price |
  | `purchase_price`| `NUMERIC(10, 2)` | Not Null, Default 0.0 | Unit purchase price (non-negative) |
  | `quantity` | `INTEGER` | Not Null, Default 0 | Current in-stock quantity |
  | `reorder_threshold`| `INTEGER`| Not Null, Default 10 | Limit below which order alerts fire |
  | `storage_location`| `VARCHAR(255)`| Nullable | Text representation of position |
  | `intake_status` | `VARCHAR(50)` | Nullable | Status flag (e.g. "expired_on_arrival") |
  | `qr_code_id` | `VARCHAR(100)` | Unique, Index | Unique identifier for QR barcode |
  | `qr_code_image` | `VARCHAR` | Nullable | Base64 SVG representation of QR |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Row creation timestamp |
  | `updated_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Last modification timestamp |

---

## 2. Table: `extraction_records`
- **Purpose**: Tracks carton photo upload history, raw OCR AI responses, confidence metrics, and human verification confirmation.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `medicine_id` | `INTEGER` | FK → `medicines.id` (SET NULL) | Linked medicine inventory row |
  | `image_path` | `VARCHAR(512)` | Not Null | Storage bucket reference path |
  | `status` | `VARCHAR(50)` | Not Null, default "pending" | Status: pending, done, failed, etc. |
  | `raw_ai_response`| `TEXT` | Nullable | Raw JSON response string from Gemini |
  | `confidence_scores`| `TEXT` | Nullable | JSON string of confidence metrics |
  | `final_values` | `TEXT` | Nullable | JSON string of human-reviewed values |
  | `confirmed_by` | `VARCHAR(255)` | Nullable | Identifies the confirming user |
  | `confirmed_at` | `TIMESTAMPTZ` | Nullable | Review timestamp |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Record creation timestamp |

---

## 3. Table: `storage_locations`
- **Purpose**: Represents physical slots inside the pharmacy shelves/racks identified by rack, row, column, capacity.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `rack_name` | `VARCHAR(50)` | Not Null | Rack identifier (e.g. "Rack A") |
  | `row` | `INTEGER` | Not Null | 1-indexed row position |
  | `column` | `INTEGER` | Not Null | 1-indexed column position |
  | `capacity` | `INTEGER` | Not Null, Default 20 | Maximum unit capacity of slot |
  | `storage_type` | `VARCHAR(50)` | Not Null, default "shelf" | Shelf, refrigerator, controlled, etc. |
  | `is_active` | `BOOLEAN` | Not Null, Default True | Soft-delete flag |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Location creation timestamp |
  - *Unique Constraint*: `uq_rack_row_col` (rack_name, row, column)

---

## 4. Table: `medicine_locations`
- **Purpose**: Junction table mapping medicines to storage slots, storing the exact quantity in each slot.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `medicine_id` | `INTEGER` | FK → `medicines.id` (CASCADE) | Linked medicine |
  | `location_id` | `INTEGER` | FK → `storage_locations.id` (CASCADE) | Physical slot |
  | `quantity` | `INTEGER` | Not Null, Default 0 | Quantity stored in this slot |
  | `assigned_by` | `VARCHAR(20)` | Not Null, default "system" | Who made assignment (system/human) |
  | `assigned_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Assignment timestamp |
  - *Unique Constraint*: `uq_medicine_location` (medicine_id, location_id)

---

## 5. Table: `audit_log`
- **Purpose**: Tamper-evident ledger logging every change made to medicine inventory, corrected fields, and cashier sales.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `medicine_id` | `INTEGER` | FK → `medicines.id` (SET NULL) | Affected medicine |
  | `action` | `VARCHAR(100)` | Not Null, Index | Action type: created, sale, corrected, etc. |
  | `changed_by` | `VARCHAR(255)` | Nullable | Identity string of actor |
  | `old_value` | `TEXT` | Nullable | JSON snapshot before change |
  | `new_value` | `TEXT` | Nullable | JSON snapshot after change |
  | `timestamp` | `TIMESTAMPTZ` | Not Null, default `now()` | Log event timestamp |

---

## 6. Table: `decision_audit_log`
- **Purpose**: Logs decisions approved by the manager during voice calls or chat sessions.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `alert_id` | `VARCHAR(100)` | Nullable | Source alert reference |
  | `decision` | `TEXT` | Not Null | Approved action description |
  | `decided_by` | `VARCHAR(255)` | Nullable | Owner/manager identifier |
  | `channel` | `VARCHAR(100)` | Nullable | Interaction channel: voice, web, etc. |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Log creation timestamp |

---

## 7. Table: `reminders`
- **Purpose**: Persistent background reminder items linked to specific medicines and types (daily, weekly, custom, until_resolved).
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `pharmacy_id` | `VARCHAR(100)` | Nullable | Pharmacy context group |
  | `medicine_id` | `INTEGER` | FK → `medicines.id` (SET NULL) | Linked medicine |
  | `reminder_type` | `VARCHAR(50)` | Not Null | daily, weekly, custom, until_resolved |
  | `reminder_time` | `TIMESTAMPTZ` | Not Null | Next schedule time |
  | `repeat_interval`| `VARCHAR(100)`| Nullable | Cron expression or simple duration string |
  | `active` | `BOOLEAN` | Not Null, Default True | Status check |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Creation timestamp |
  | `last_reminded_at`| `TIMESTAMPTZ`| Nullable | Last time alert fired |
  | `resolved_at` | `TIMESTAMPTZ` | Nullable | Resolution timestamp |
  | `stop_condition`| `VARCHAR(255)` | Nullable | Condition mapping for resolution check |
  | `title` | `VARCHAR(255)` | Nullable | Short reminder label |

---

## 8. Table: `sales`
- **Purpose**: Registers checkout transactions with total amount, date, cashier, and customer contact data.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `sold_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Transaction date |
  | `sold_by` | `VARCHAR(255)` | Nullable | Cashier email |
  | `customer_name` | `VARCHAR(255)` | Nullable | Customer name |
  | `customer_phone`| `VARCHAR(50)` | Nullable | Customer phone number |
  | `total_amount` | `NUMERIC(10, 2)`| Not Null | Grand total amount paid |

---

## 9. Table: `sale_items`
- **Purpose**: Lines itemizing checkout transactions mapping sales to specific medicines and sold prices.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `sale_id` | `INTEGER` | FK → `sales.id` (CASCADE) | Linked sale transaction |
  | `medicine_id` | `INTEGER` | FK → `medicines.id` (SET NULL) | Sold medicine item |
  | `quantity_sold` | `INTEGER` | Not Null | Outflow quantity count |
  | `sale_price` | `NUMERIC(10, 2)`| Not Null | Unit price paid (MRP) |
  | `line_total` | `NUMERIC(10, 2)`| Not Null | Quantity * sale_price |

---

## 10. Table: `staff_tasks`
- **Purpose**: Tasks assigned to specific staff members with details and status.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `assigned_to` | `VARCHAR(255)` | Nullable | Target staff member name |
  | `message` | `TEXT` | Not Null | Task requirements text |
  | `related_medicine_id`| `INTEGER`| FK → `medicines.id` (SET NULL) | Associated medicine ID |
  | `status` | `VARCHAR(50)` | Not Null, default "pending" | pending, completed |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Task creation timestamp |

---

## 11. Table: `monthly_finance`
- **Purpose**: Stores monthly operational cost configurations (rent, salaries, etc.) and recorded revenue.
- **Columns**:
  | Column Name | Type | Constraints | Description |
  |---|---|---|---|
  | `id` | `INTEGER` | Primary Key, Auto-increment | Unique identifier |
  | `month` | `VARCHAR(7)` | Not Null, Unique, Index | Format: YYYY-MM (e.g. "2026-07") |
  | `rent` | `NUMERIC(10, 2)`| Not Null, Default 0.0 | Monthly rent cost |
  | `electricity_and_bills`| `NUMERIC(10, 2)`| Not Null, Default 0.0 | Utilities cost |
  | `staff_salaries`| `NUMERIC(10, 2)`| Not Null, Default 0.0 | Salaries expense |
  | `other_expenses`| `NUMERIC(10, 2)`| Not Null, Default 0.0 | Miscellaneous costs |
  | `total_revenue` | `NUMERIC(10, 2)`| Not Null, Default 0.0 | Sum of sales transactions |
  | `other_revenue` | `NUMERIC(10, 2)`| Not Null, Default 0.0 | Miscellaneous revenue |
  | `created_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Record creation timestamp |
  | `updated_at` | `TIMESTAMPTZ` | Not Null, default `now()` | Last modification timestamp |

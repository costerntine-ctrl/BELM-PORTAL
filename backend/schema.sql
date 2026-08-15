-- BELM Portal - PostgreSQL schema for Render.
-- Safe to run repeatedly. Existing business records are preserved.

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  permissions JSONB NOT NULL,
  allowed_pages JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tin_number VARCHAR(50),
  vrn VARCHAR(50),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  address VARCHAR(500),
  portal_link VARCHAR(36) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  recovery_code_hash VARCHAR(255) NULL,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  recovery_code_hash VARCHAR(255) NULL,
  phone VARCHAR(50),
  is_active SMALLINT NOT NULL DEFAULT 1,
  role_id VARCHAR(36) NOT NULL REFERENCES roles(id),
  assigned_customer_id VARCHAR(36) NULL REFERENCES customers(id),
  is_customer_managed SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

-- Additional roles beyond the primary role_id above. A user's effective
-- permissions are the union of their primary role and every extra role here.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  entity_id VARCHAR(36),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_users (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  recovery_code_hash VARCHAR(255) NULL,
  phone VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS is_active SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS permissions TEXT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS recovery_code_hash VARCHAR(255);
-- Caps how many portal users (assistants) a customer can add for
-- themselves before they must contact BELM Admin for more. NULL means
-- "use the system default" (see DEFAULT_CUSTOMER_USER_LIMIT in helpers.php).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_limit INTEGER NULL;
-- Customer Self-Service / Independent Operations mode. When ON, the
-- customer runs day-to-day maintenance with their own Admins, Technicians
-- and Operators. BELM is involved only when the customer explicitly uses a
-- BELM support action (technical support, spare request, proforma, etc.).
-- The mode does NOT block BELM from responding when support is requested.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_machinery_admin SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code_hash VARCHAR(255);
-- Distinguishes a Technician created by a customer's Self-Service admin from
-- a BELM Technician temporarily assigned to that customer for support.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_customer_managed SMALLINT NOT NULL DEFAULT 0;
-- Backfill technicians created by the customer-portal flow used in recent
-- releases. Those accounts were created with no recovery_code_hash; BELM Admin
-- created technicians receive a recovery code. Restrict the heuristic to
-- customers already in Self-Service mode to avoid touching normal BELM staff.
UPDATE users u
SET is_customer_managed = 1
FROM roles r, customers c
WHERE u.role_id = r.id
  AND r.name = 'Technician'
  AND u.assigned_customer_id = c.id
  AND c.is_machinery_admin = 1
  AND u.recovery_code_hash IS NULL
  AND u.is_customer_managed = 0;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS recovery_code_hash VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_customer_users_customer ON customer_users(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_users_email ON customer_users(LOWER(email));

CREATE TABLE IF NOT EXISTS machines (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  machine_type VARCHAR(100) NOT NULL,
  model VARCHAR(255) NOT NULL,
  serial_number VARCHAR(100) NULL UNIQUE,
  reg_number VARCHAR(100),
  fleet_number VARCHAR(100),
  brand VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  last_checked_at TIMESTAMPTZ NULL,
  service_kit VARCHAR(10) DEFAULT 'OK',
  service_interval_hours INTEGER NULL,
  last_service_hours DOUBLE PRECISION DEFAULT 0,
  service_history JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS fleet_number VARCHAR(100);
-- Real-time activity status — separate from the checklist-derived
-- GREEN/YELLOW/RED safety condition. Selected by BELM Admin, Engineer or
-- Technician to tell the customer what is actively happening with their
-- machine right now (e.g. mid-service, grounded, being checked).
ALTER TABLE machines ADD COLUMN IF NOT EXISTS operational_status VARCHAR(30) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE machines ADD COLUMN IF NOT EXISTS operational_status_note VARCHAR(255) NULL;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS operational_status_updated_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS checklist_templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  machine_type VARCHAR(100) NOT NULL,
  service_type VARCHAR(150) NOT NULL DEFAULT 'General Service',
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(150) NOT NULL DEFAULT 'General Service';

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id VARCHAR(36) PRIMARY KEY,
  template_id VARCHAR(36) NOT NULL REFERENCES checklist_templates(id),
  label VARCHAR(255) NOT NULL,
  input_type VARCHAR(20) NOT NULL,
  safety_level VARCHAR(10) NULL,
  options JSONB NULL,
  option_safety JSONB NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_required SMALLINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS checklist_template_parts (
  id VARCHAR(36) PRIMARY KEY,
  template_id VARCHAR(36) NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  spare_name VARCHAR(255) NOT NULL,
  part_number VARCHAR(100) NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_reports (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id),
  template_id VARCHAR(36) NOT NULL REFERENCES checklist_templates(id),
  filled_by VARCHAR(255) NOT NULL,
  hour_meter_reading DOUBLE PRECISION NOT NULL,
  overall_status VARCHAR(10) NOT NULL DEFAULT 'GREEN',
  pdf_url VARCHAR(500) NULL,
  sent_to_customer_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NULL
);
ALTER TABLE checklist_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;
-- A built-in "Display photo" field on every checklist submission — same
-- standing as Hour Meter and Service Day (not a configurable per-template
-- item), always captured, always shown at the top of the report.
ALTER TABLE checklist_reports ADD COLUMN IF NOT EXISTS display_photo_url TEXT NULL;

CREATE TABLE IF NOT EXISTS checklist_answers (
  id VARCHAR(36) PRIMARY KEY,
  report_id VARCHAR(36) NOT NULL REFERENCES checklist_reports(id),
  template_item_id VARCHAR(36) NULL,
  label VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  photo_url VARCHAR(500) NULL,
  safety_level VARCHAR(10) NULL
);
-- Free-text note the Technician/Admin adds when a Yes/No answer is flagged
-- (YELLOW/RED) — kept separate from `value` because `value` is strictly
-- matched against the item's allowed options (Yes/No) during validation.
ALTER TABLE checklist_answers ADD COLUMN IF NOT EXISTS note TEXT NULL;

-- photo_url originally allowed only 500 characters, but a compressed
-- checklist photo is stored as a full data:image/...;base64,... URL which
-- can run to several hundred KB of text. Anything over 500 chars caused a
-- silent PostgreSQL "value too long" error (surfaced to the admin as a
-- generic "Server error"). Widen it to TEXT so photo check-ups can save.
ALTER TABLE checklist_answers ALTER COLUMN photo_url TYPE TEXT;

CREATE TABLE IF NOT EXISTS service_requests (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NULL REFERENCES machines(id) ON DELETE CASCADE,
  template_id VARCHAR(36) NULL REFERENCES checklist_templates(id),
  service_type VARCHAR(150) NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
  assigned_to_id VARCHAR(36) NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS template_id VARCHAR(36) NULL REFERENCES checklist_templates(id);
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(150) NULL;
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS origin VARCHAR(30) NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS completed_by_id VARCHAR(36) NULL REFERENCES users(id);
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS cancelled_by_id VARCHAR(36) NULL REFERENCES users(id);
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS customer_confirmed SMALLINT NOT NULL DEFAULT 1;
-- Lets Admin "hide" a completed/cancelled request from the daily working
-- list without deleting anything — it stays fully intact for the daily
-- report / audit history, just no longer clutters the main list.
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ NULL;
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS hidden_by_id VARCHAR(36) NULL REFERENCES users(id);
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS assigned_by_id VARCHAR(36) NULL REFERENCES users(id);
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL;
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS started_by_id VARCHAR(36) NULL REFERENCES users(id);

-- Full audit trail for one service request's lifecycle — every status
-- change and every (re)assignment, who did it, and when. This is what
-- powers "Opened -> Assigned -> In Progress -> Completed/Cancelled by ..."
-- on the request's History panel, independent of the single-day
-- daily-report view.
CREATE TABLE IF NOT EXISTS service_request_history (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL REFERENCES service_requests(id),
  event_type VARCHAR(20) NOT NULL,
  from_value VARCHAR(100) NULL,
  to_value VARCHAR(100) NULL,
  actor_id VARCHAR(36) NULL REFERENCES users(id),
  actor_name VARCHAR(255) NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_service_request_history_request ON service_request_history(request_id, created_at);

CREATE TABLE IF NOT EXISTS service_request_parts (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  spare_name VARCHAR(255) NOT NULL,
  part_number VARCHAR(100) NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE service_request_parts
  ADD COLUMN IF NOT EXISTS manufacturer_part_number VARCHAR(100) NULL;

-- Silent inventory match: when a customer types a spare part reference or
-- description, the backend tries to match it against BELM's own Spare
-- Parts Inventory (never shown to the customer) so Admin/Engineer and
-- whoever prepares the Proforma can immediately see which inventory item
-- (if any) it corresponds to.
ALTER TABLE service_request_parts
  ADD COLUMN IF NOT EXISTS matched_spare_part_id VARCHAR(36) NULL REFERENCES spare_parts(id);

CREATE TABLE IF NOT EXISTS service_notes (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL REFERENCES service_requests(id),
  author VARCHAR(255) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spare_parts (
  id VARCHAR(36) PRIMARY KEY,
  part_number VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  stock_qty INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER NOT NULL DEFAULT 5,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100) NULL;
-- Which machine brand/type this spare part is typically used on — helps
-- staff quickly recognize "this filter is for a SANY reachstacker" etc.
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS machine_brand VARCHAR(100) NULL;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS machine_type VARCHAR(100) NULL;
-- Physical measurements (mm) — which ones matter depends on category
-- (bearing: inner/outer diameter + height; filter/air cleaner: length +
-- diameter; valve: diameter + thread size). All optional/nullable since
-- not every part needs every measurement.
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS height_mm NUMERIC(10,2) NULL;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS length_mm NUMERIC(10,2) NULL;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS outer_diameter_mm NUMERIC(10,2) NULL;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS inner_diameter_mm NUMERIC(10,2) NULL;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS thread_size VARCHAR(50) NULL;

-- Cross-reference / "equivalent" spare parts — different brands/part
-- numbers that do the same job (e.g. Fleetguard LF670 = another brand's
-- equivalent filter). Stored as one row per direction so a lookup from
-- either part instantly finds the other; both directions are inserted
-- together whenever a link is created so it's always symmetric.
CREATE TABLE IF NOT EXISTS spare_part_equivalents (
  id VARCHAR(36) PRIMARY KEY,
  spare_part_id VARCHAR(36) NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  equivalent_part_id VARCHAR(36) NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(spare_part_id, equivalent_part_id)
);

CREATE TABLE IF NOT EXISTS spare_part_requests (
  id VARCHAR(36) PRIMARY KEY,
  spare_part_id VARCHAR(36) NULL REFERENCES spare_parts(id),
  request_id VARCHAR(36) NULL REFERENCES service_requests(id),
  machine_id VARCHAR(36) NULL REFERENCES machines(id),
  requested_by_id VARCHAR(36) NULL REFERENCES users(id),
  requested_by_name VARCHAR(255) NULL,
  description TEXT NULL,
  machine_type VARCHAR(100) NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ NULL
);

ALTER TABLE spare_part_requests ALTER COLUMN spare_part_id DROP NOT NULL;
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100) NULL;
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS machine_id VARCHAR(36) NULL REFERENCES machines(id);
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS requested_by_id VARCHAR(36) NULL REFERENCES users(id);
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS requested_by_name VARCHAR(255) NULL;
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS machine_type VARCHAR(100) NULL;
ALTER TABLE spare_part_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_spare_part_requests_status ON spare_part_requests(status);
CREATE INDEX IF NOT EXISTS idx_spare_part_requests_machine ON spare_part_requests(machine_id);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id VARCHAR(36) PRIMARY KEY,
  bank_name VARCHAR(120) NOT NULL,
  account_name VARCHAR(180) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_active_number
  ON bank_accounts (LOWER(bank_name), LOWER(account_number))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NULL REFERENCES machines(id) ON DELETE CASCADE,
  invoice_no VARCHAR(50) NOT NULL UNIQUE,
  subtotal NUMERIC(12,2) NOT NULL,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
  due_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(36) PRIMARY KEY,
  invoice_id VARCHAR(36) NOT NULL REFERENCES invoices(id),
  description VARCHAR(500) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL
);
-- Links an invoice line to the actual Spare Parts Inventory row it sold
-- (when it is one), so BELM's real profit can subtract the purchase cost
-- of goods sold, not just count the sale price as pure profit.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS spare_part_id VARCHAR(36) NULL REFERENCES spare_parts(id);

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  invoice_id VARCHAR(36) NOT NULL REFERENCES invoices(id),
  bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id),
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(50),
  reference VARCHAR(100),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id);
CREATE INDEX IF NOT EXISTS idx_payments_bank_account ON payments(bank_account_id);

CREATE TABLE IF NOT EXISTS notification_logs (
  id VARCHAR(36) PRIMARY KEY,
  channel VARCHAR(20) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  id VARCHAR(36) PRIMARY KEY,
  "key" VARCHAR(100) NOT NULL UNIQUE,
  "value" JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id),
  date DATE NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  description VARCHAR(500) NOT NULL,
  quantity DOUBLE PRECISION NULL,
  unit VARCHAR(20) NULL,
  unit_price NUMERIC(12,2) NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  logged_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS part_number VARCHAR(100);
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS receipt_photo_data TEXT;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS receipt_photo_mime VARCHAR(50);
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS receipt_photo_name VARCHAR(255);

CREATE TABLE IF NOT EXISTS admin_announcements (
  id VARCHAR(36) PRIMARY KEY,
  message VARCHAR(1000) NOT NULL,
  created_by VARCHAR(36) NULL REFERENCES users(id),
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_expenses (
  id VARCHAR(36) PRIMARY KEY,
  bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id),
  date DATE NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  description VARCHAR(500) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  recorded_by VARCHAR(255),
  receipt_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);
-- The company's own receipt/proof-of-purchase for this expense — separate
-- from any customer-uploaded receipt, kept entirely on BELM's own side.
ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS receipt_photo_data TEXT NULL;
ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS receipt_photo_mime VARCHAR(50) NULL;
ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS receipt_photo_name VARCHAR(255) NULL;

ALTER TABLE company_expenses
  ADD COLUMN IF NOT EXISTS bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id);
CREATE INDEX IF NOT EXISTS idx_company_expenses_bank_account
  ON company_expenses(bank_account_id);

CREATE TABLE IF NOT EXISTS bank_withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  bank_account_id VARCHAR(36) NOT NULL REFERENCES bank_accounts(id),
  date DATE NOT NULL,
  cheque_number VARCHAR(120),
  description VARCHAR(500) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  withdrawn_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE bank_withdrawals
  ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_bank_withdrawals_account
  ON bank_withdrawals(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_withdrawals_date
  ON bank_withdrawals(date);

CREATE TABLE IF NOT EXISTS proforma_invoices (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  invoice_no VARCHAR(50) NOT NULL UNIQUE,
  date DATE NOT NULL,
  vat_mode VARCHAR(10) NOT NULL DEFAULT 'VAT',
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

-- Per-document customization so a Proforma can carry its own discount
-- type/rate, an optional printed notice, and its own trading-term text
-- without touching Company Settings (which only supplies the defaults
-- pre-filled on a new document). All additive/backward compatible —
-- existing proforma rows keep working unchanged (discount_type defaults
-- to the same FIXED-amount behaviour they already had).
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NOT NULL DEFAULT 'FIXED';
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 18;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS notice TEXT NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(500) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(255) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS quote_validity VARCHAR(255) NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notice TEXT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(500) NULL;

-- Server-side, gap-free (per type) document numbering. Existing rows
-- already have unique invoice_no values in the older PRO-<timestamp>-<rand>
-- format — that data is untouched. New documents prefer the clean
-- PI-0001 / RCPT-0001 style; belm_next_document_number() falls back to the
-- legacy format only if a sequence somehow isn't available.
CREATE SEQUENCE IF NOT EXISTS proforma_number_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1;

-- ---------------------------------------------------------------------
-- RECEIPTS — official payment receipts, optionally linked to an invoice
-- so "Create Receipt" from an invoice can prefill customer/invoice/amount
-- and show Invoice Total / Previous Payments / Amount Paid / Balance.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id VARCHAR(36) PRIMARY KEY,
  receipt_no VARCHAR(50) NOT NULL UNIQUE,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  invoice_id VARCHAR(36) NULL REFERENCES invoices(id),
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH',
  payment_reference VARCHAR(100) NULL,
  bank_account_id VARCHAR(36) NULL REFERENCES bank_accounts(id),
  received_by VARCHAR(36) NULL REFERENCES users(id),
  notes VARCHAR(500) NULL,
  paid_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_receipts_customer ON receipts(customer_id);

CREATE TABLE IF NOT EXISTS proforma_invoice_items (
  id VARCHAR(36) PRIMARY KEY,
  proforma_id VARCHAR(36) NOT NULL REFERENCES proforma_invoices(id),
  section VARCHAR(100) NULL,
  part_number VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit VARCHAR(20) NOT NULL DEFAULT 'PC',
  unit_price NUMERIC(12,2) NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  specialty VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(500),
  location VARCHAR(255),
  notes TEXT,
  verified SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS verified SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS trash_entries (
  id VARCHAR(36) PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  deleted_by VARCHAR(36) NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE trash_entries ADD COLUMN IF NOT EXISTS reason VARCHAR(500) NULL;

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(LOWER(email));

-- Tracks failed login/PIN attempts so they can be rate-limited. A generic
-- table (not per-feature) so the same guard protects staff login, customer
-- login, and the Edit/Delete PIN checks without duplicating logic.
CREATE TABLE IF NOT EXISTS security_rate_limits (
  id VARCHAR(36) PRIMARY KEY,
  scope VARCHAR(40) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_lookup ON security_rate_limits(scope, identifier, created_at);

-- A roster of the people who physically operate a machine day-to-day.
-- Managed by the customer's own Machine Admin (or the primary owner),
-- distinct from portal login "assistants".
CREATE TABLE IF NOT EXISTS customer_activity_logs (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  actor_name VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_operators (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id),
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  name VARCHAR(255) NOT NULL,
  contact VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- A short PIN so the operator can log into their own simple shift screen
-- (container count + problem/OK + sign out) — set by the customer's
-- owner/Machine Admin when adding the operator to the roster.
ALTER TABLE machine_operators ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255) NULL;

-- One row per operator work shift: sign-in, running container count
-- (incremented one at a time as the operator finishes each container),
-- and the sign-out report (a problem description, or OK if none).
CREATE TABLE IF NOT EXISTS machine_operator_shifts (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL REFERENCES machine_operators(id),
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id),
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  signed_in_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signed_out_at TIMESTAMPTZ NULL,
  container_count INTEGER NOT NULL DEFAULT 0,
  has_problem SMALLINT NULL,
  problem_description VARCHAR(1000) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_operator ON machine_operator_shifts(operator_id, status);

-- A short problem report an operator can write, visible to the customer's
-- own Machine Admin and to BELM's engineer/technician staff.
CREATE TABLE IF NOT EXISTS operator_reports (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id),
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  operator_id VARCHAR(36) NULL REFERENCES machine_operators(id),
  operator_name VARCHAR(255) NOT NULL,
  operator_contact VARCHAR(100) NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by_id VARCHAR(36) NULL REFERENCES users(id)
);

-- In Self-Service mode an operator report can remain internal to the
-- customer's own team. Set notify_belm=1 only when BELM support was
-- explicitly requested. Existing records default to 1 for compatibility.
ALTER TABLE operator_reports ADD COLUMN IF NOT EXISTS notify_belm SMALLINT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS petty_cash_topups (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id),
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  amount NUMERIC(12,2) NOT NULL,
  note VARCHAR(255) NULL,
  added_by VARCHAR(36) NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_saved_emails (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  label VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  assigned_to_id VARCHAR(36) NOT NULL REFERENCES users(id),
  customer_id VARCHAR(36) NULL REFERENCES customers(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  work_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  check_in TIMESTAMPTZ NULL,
  check_out TIMESTAMPTZ NULL,
  notes VARCHAR(500) NULL,
  recorded_by VARCHAR(36) NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, work_date)
);

CREATE TABLE IF NOT EXISTS customer_applications (
  id VARCHAR(36) PRIMARY KEY,
  reference_no VARCHAR(30) NOT NULL UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address VARCHAR(500) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  tin_number VARCHAR(50) NOT NULL,
  vrn VARCHAR(50) NOT NULL,
  machine_type VARCHAR(100) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(255) NOT NULL,
  reg_number VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by VARCHAR(36) NULL REFERENCES users(id),
  customer_id VARCHAR(36) NULL REFERENCES customers(id),
  machine_id VARCHAR(36) NULL REFERENCES machines(id)
);

CREATE TABLE IF NOT EXISTS user_applications (
  id VARCHAR(36) PRIMARY KEY,
  reference_no VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  requested_role VARCHAR(100) NOT NULL,
  reason TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by VARCHAR(36) NULL REFERENCES users(id),
  user_id VARCHAR(36) NULL REFERENCES users(id),
  assigned_role_id VARCHAR(36) NULL REFERENCES roles(id),
  assigned_customer_id VARCHAR(36) NULL REFERENCES customers(id)
);

-- Existing Render databases created by the previous portal version required a
-- serial number. Applications only collect the registration number, so this
-- safe migration makes serial number optional for newly approved machines.
ALTER TABLE machines ALTER COLUMN serial_number DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_machine_customer ON machines(customer_id);
CREATE INDEX IF NOT EXISTS idx_report_machine ON checklist_reports(machine_id);
CREATE INDEX IF NOT EXISTS idx_report_filledby ON checklist_reports(filled_by);
CREATE INDEX IF NOT EXISTS idx_sr_customer ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_usagelog_machine ON usage_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_usagelog_customer_date ON usage_logs(customer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_template_part_template ON checklist_template_parts(template_id, "order");
CREATE INDEX IF NOT EXISTS idx_service_request_part_request ON service_request_parts(request_id);
CREATE INDEX IF NOT EXISTS idx_task_assignedto ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(work_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(user_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_trash_deletedat ON trash_entries(deleted_at);
CREATE INDEX IF NOT EXISTS idx_application_status ON customer_applications(status, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_pending_email
  ON customer_applications(LOWER(email))
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_user_application_status
  ON user_applications(status, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_application_pending_email
  ON user_applications(LOWER(email))
  WHERE status = 'PENDING';

CREATE OR REPLACE FUNCTION belm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION belm_set_updated_at();

DROP TRIGGER IF EXISTS machines_set_updated_at ON machines;
CREATE TRIGGER machines_set_updated_at
BEFORE UPDATE ON machines
FOR EACH ROW EXECUTE FUNCTION belm_set_updated_at();

DROP TRIGGER IF EXISTS service_requests_set_updated_at ON service_requests;
CREATE TRIGGER service_requests_set_updated_at
BEFORE UPDATE ON service_requests
FOR EACH ROW EXECUTE FUNCTION belm_set_updated_at();

DROP TRIGGER IF EXISTS attendance_records_set_updated_at ON attendance_records;
CREATE TRIGGER attendance_records_set_updated_at
BEFORE UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION belm_set_updated_at();

INSERT INTO roles (id, name, permissions, allowed_pages)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'Super Admin',
    '{"customers":["view","edit","delete"],"checklists":["view","edit","delete"],"serviceRequests":["view","edit","delete"],"spareParts":["view","edit","delete"],"billing":["view","edit","delete"],"users":["view","edit","delete"],"reports":["view","edit","delete"],"settings":["view","edit","delete"]}'::jsonb,
    '["customers","overview","roles","service-requests","spare-parts","billing","bank-manager","reports","settings","checklist-templates","suppliers","activity-log"]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'Technician',
    '{"customers":["view"],"checklist-templates":["view","edit"],"service-requests":["view","edit"],"spare-parts":["view"]}'::jsonb,
    '["customers","checklist-templates","service-requests","spare-parts"]'::jsonb
  )
ON CONFLICT (name) DO NOTHING;

-- Fix already-deployed databases where the Technician role's allowed_pages
-- was seeded as an empty array (or with mismatched camelCase keys like
-- serviceRequests/spareParts) instead of the page keys require_page_access()
-- actually checks (checklist-templates/service-requests/spare-parts).
-- Without this, existing Technician accounts silently lose access to their
-- own pages.
UPDATE roles
SET allowed_pages = '["customers","checklist-templates","service-requests","spare-parts"]'::jsonb
WHERE name = 'Technician'
  AND allowed_pages::text NOT LIKE '%checklist-templates%';

-- Keep the built-in Administrator role usable when this schema is applied to
-- a database created by an older BELM release. Other custom roles and their
-- permissions remain untouched.
UPDATE roles
SET deleted_at = NULL
WHERE name = 'Super Admin';

-- Migrate the seeded Super Admin's login email from the old default to the
-- company's real inbox, on databases that already have this exact row from
-- an earlier deploy. Only touches it if the email is still the old default
-- (so it never overwrites an email the Administrator has since changed).
UPDATE users
SET email = 'info@belmgeneral.co.tz'
WHERE id = '00000000-0000-4000-8000-000000000003'
  AND email = 'admin@belmgeneraltech.co.tz';

INSERT INTO users (id, name, email, password_hash, role_id)
SELECT
  '00000000-0000-4000-8000-000000000003',
  'BELM Admin',
  'info@belmgeneral.co.tz',
  '$2y$10$uXo8bDdT3YV7BlM7V4oOR.ybSIUrBtG0x/bwydGsmf98C0IBBWtme',
  id
FROM roles
WHERE name = 'Super Admin'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = 1,
  role_id = EXCLUDED.role_id,
  deleted_at = NULL,
  -- Preserve a password the Administrator has already changed. Only repair a
  -- clearly invalid/empty legacy hash with the documented temporary password.
  password_hash = CASE
    WHEN users.password_hash LIKE '$2%' OR users.password_hash LIKE '$argon2%'
      THEN users.password_hash
    ELSE EXCLUDED.password_hash
  END;

-- ---- Controller Pin Out reference library ---------------------------------
-- Documents the pinout of a machine's controller (ECU, joystick controller,
-- valve controller, etc.) — one record per controller, with any number of
-- labelled reference photos and a list of what each pin does. Purely a
-- reference library for BELM's own engineering work, not tied to any
-- specific customer/machine record.
CREATE TABLE IF NOT EXISTS controller_pinouts (
  id VARCHAR(36) PRIMARY KEY,
  machine_brand VARCHAR(150) NOT NULL,
  controller_number VARCHAR(150) NOT NULL,
  controller_brand VARCHAR(150) NOT NULL,
  system VARCHAR(150) NULL,
  notes TEXT NULL,
  created_by_id VARCHAR(36) NULL REFERENCES users(id),
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_controller_pinouts_search ON controller_pinouts(machine_brand, controller_number, controller_brand);

-- Any number of labelled photos per controller — e.g. "Connector A —
-- Right side", "Top view", "Wiring diagram" — since one controller often
-- needs several angles/diagrams to fully document.
CREATE TABLE IF NOT EXISTS controller_pinout_photos (
  id VARCHAR(36) PRIMARY KEY,
  pinout_id VARCHAR(36) NOT NULL REFERENCES controller_pinouts(id) ON DELETE CASCADE,
  label VARCHAR(150) NULL,
  photo_data TEXT NOT NULL,
  photo_mime VARCHAR(50) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_controller_pinout_photos_pinout ON controller_pinout_photos(pinout_id);

-- Pin-by-pin function list — pin number/name plus what it does
-- (e.g. "Pin 3 — CAN-H", "Pin 7 — +12V ignition switched").
CREATE TABLE IF NOT EXISTS controller_pinout_pins (
  id VARCHAR(36) PRIMARY KEY,
  pinout_id VARCHAR(36) NOT NULL REFERENCES controller_pinouts(id) ON DELETE CASCADE,
  pin_label VARCHAR(100) NOT NULL,
  pin_function VARCHAR(500) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_controller_pinout_pins_pinout ON controller_pinout_pins(pinout_id);

INSERT INTO system_settings (id, "key", "value")
VALUES (
  '00000000-0000-4000-8000-000000000004',
  'adminDeletePin',
  '"1234"'::jsonb
)
ON CONFLICT ("key") DO NOTHING;

-- V192: synchronized BELM <-> Customer communication and Proforma delivery.
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS machine_id VARCHAR(36) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS source_spare_request_id VARCHAR(36) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS sent_by_id VARCHAR(36) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS customer_response VARCHAR(20) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS customer_response_message VARCHAR(1000) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS customer_responded_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_proforma_customer_delivery ON proforma_invoices(customer_id, delivery_status, sent_at);
CREATE INDEX IF NOT EXISTS idx_proforma_machine ON proforma_invoices(machine_id);
CREATE INDEX IF NOT EXISTS idx_proforma_source_spare_request ON proforma_invoices(source_spare_request_id);

CREATE TABLE IF NOT EXISTS customer_communications (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NULL REFERENCES machines(id) ON DELETE CASCADE,
  related_type VARCHAR(40) NULL,
  related_id VARCHAR(36) NULL,
  direction VARCHAR(30) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'PORTAL',
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SENT',
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_communications_customer ON customer_communications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_communications_machine ON customer_communications(machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_communications_related ON customer_communications(related_type, related_id);

-- V197 Customer Store Ledger -------------------------------------------------
-- Customer-owned inventory is deliberately separate from BELM Spare Parts.
-- It supports Store Keeper style stock balances and an auditable trail of
-- material issued to each machine without exposing BELM stock/pricing.
CREATE TABLE IF NOT EXISTS customer_store_items (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  part_number VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'PC',
  qty_on_hand NUMERIC(14,2) NOT NULL DEFAULT 0,
  average_unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, part_number)
);
CREATE INDEX IF NOT EXISTS idx_customer_store_items_customer
  ON customer_store_items(customer_id, part_number);

CREATE TABLE IF NOT EXISTS customer_store_movements (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_item_id VARCHAR(36) NOT NULL REFERENCES customer_store_items(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NULL REFERENCES machines(id) ON DELETE SET NULL,
  movement_type VARCHAR(20) NOT NULL,
  quantity NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  actor_name VARCHAR(255) NOT NULL,
  received_by VARCHAR(255) NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_store_movements_customer
  ON customer_store_movements(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_store_movements_machine
  ON customer_store_movements(machine_id, created_at DESC);

ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS store_item_id VARCHAR(36) NULL REFERENCES customer_store_items(id) ON DELETE SET NULL;
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS stock_source VARCHAR(30) NOT NULL DEFAULT 'DIRECT_PURCHASE';
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS store_balance_after NUMERIC(14,2) NULL;
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS issued_by VARCHAR(255) NULL;
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS received_by VARCHAR(255) NULL;
CREATE INDEX IF NOT EXISTS idx_usage_logs_store_item ON usage_logs(store_item_id);

-- V198: one personal display-theme preference per authenticated account.
-- It deliberately uses a polymorphic account key because BELM staff,
-- customer owners, customer assistants and machine operators live in
-- different account tables.
CREATE TABLE IF NOT EXISTS user_preferences (
  account_type VARCHAR(32) NOT NULL,
  account_id VARCHAR(36) NOT NULL,
  display_theme VARCHAR(10) NOT NULL DEFAULT 'light',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_type, account_id)
);

-- =====================================================================
-- V201 MACHINE OWNER SERVICE NOTIFICATIONS
-- One deduplicated notification per service milestone/state. Email is sent
-- automatically to the registered customer/machine owner. WhatsApp can be
-- delivered automatically when BELM_WHATSAPP_API_URL is configured; otherwise
-- the attempt is retained as PENDING_PROVIDER for audit/follow-up.
CREATE TABLE IF NOT EXISTS machine_service_owner_notifications (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  due_hour INTEGER NOT NULL,
  service_interval_hours INTEGER NOT NULL,
  notification_kind VARCHAR(20) NOT NULL,
  owner_email VARCHAR(255),
  owner_phone VARCHAR(50),
  email_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  whatsapp_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  email_sent_at TIMESTAMPTZ NULL,
  whatsapp_sent_at TIMESTAMPTZ NULL,
  last_attempt_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(machine_id, due_hour, notification_kind)
);
CREATE INDEX IF NOT EXISTS idx_machine_service_owner_notifications_machine
  ON machine_service_owner_notifications(machine_id, due_hour);

-- V200 PREVENTIVE SERVICE PREPARATION
-- Machine-specific service kits + due-hour alerts + inventory snapshots.
-- Alerts prepare a DRAFT Proforma only; they never issue/decrement stock and
-- never send the draft to the customer until BELM reviews it manually.
-- =====================================================================
CREATE TABLE IF NOT EXISTS machine_service_parts (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  service_interval_hours INTEGER NOT NULL,
  spare_part_id VARCHAR(36) NULL REFERENCES spare_parts(id) ON DELETE SET NULL,
  spare_name VARCHAR(255) NOT NULL,
  part_number VARCHAR(100) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit VARCHAR(20) NOT NULL DEFAULT 'PC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(machine_id, service_interval_hours, part_number)
);
CREATE INDEX IF NOT EXISTS idx_machine_service_parts_machine_interval
  ON machine_service_parts(machine_id, service_interval_hours);

CREATE TABLE IF NOT EXISTS service_due_alerts (
  id VARCHAR(36) PRIMARY KEY,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  due_hour INTEGER NOT NULL,
  service_interval_hours INTEGER NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  current_hours NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'REVIEW',
  inventory_status VARCHAR(30) NOT NULL DEFAULT 'NOT_CHECKED',
  draft_proforma_id VARCHAR(36) NULL REFERENCES proforma_invoices(id) ON DELETE SET NULL,
  notified_at TIMESTAMPTZ NULL,
  reviewed_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(machine_id, due_hour)
);
CREATE INDEX IF NOT EXISTS idx_service_due_alerts_status ON service_due_alerts(status, created_at);

CREATE TABLE IF NOT EXISTS service_due_alert_items (
  id VARCHAR(36) PRIMARY KEY,
  service_alert_id VARCHAR(36) NOT NULL REFERENCES service_due_alerts(id) ON DELETE CASCADE,
  spare_part_id VARCHAR(36) NULL REFERENCES spare_parts(id) ON DELETE SET NULL,
  part_number VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity_required NUMERIC(12,2) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'PC',
  stock_qty_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  availability VARCHAR(30) NOT NULL DEFAULT 'NOT_IN_INVENTORY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_service_due_alert_items_alert ON service_due_alert_items(service_alert_id);

ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS source_service_due_alert_id VARCHAR(36) NULL;
ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS auto_prepared SMALLINT NOT NULL DEFAULT 0;
-- Service fluids can be quoted in decimal units (e.g. 18.5 L), so Draft PI
-- quantities must not be restricted to whole pieces only.
ALTER TABLE proforma_invoice_items ALTER COLUMN qty TYPE NUMERIC(12,2) USING qty::numeric;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS service_schedule_baseline_hours DOUBLE PRECISION NULL;

-- V202 - live breakdown workflow, spare approval and digital job cards.
CREATE SEQUENCE IF NOT EXISTS breakdown_job_card_seq START 1;

CREATE TABLE IF NOT EXISTS breakdown_cases (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  source_id VARCHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  current_stage VARCHAR(40) NOT NULL DEFAULT 'WORKSHOP_REVIEW',
  current_department VARCHAR(60) NOT NULL DEFAULT 'Workshop',
  blocker_reason VARCHAR(500) NULL,
  stage_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ NULL,
  created_by_name VARCHAR(255) NULL,
  UNIQUE(source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_breakdown_cases_customer ON breakdown_cases(customer_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_breakdown_cases_machine ON breakdown_cases(machine_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS breakdown_case_events (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES breakdown_cases(id) ON DELETE CASCADE,
  stage VARCHAR(40) NOT NULL,
  department VARCHAR(60) NOT NULL,
  action VARCHAR(120) NOT NULL,
  note VARCHAR(1000) NULL,
  actor_type VARCHAR(30) NULL,
  actor_id VARCHAR(36) NULL,
  actor_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_breakdown_case_events_case ON breakdown_case_events(case_id, created_at ASC);

CREATE TABLE IF NOT EXISTS breakdown_spare_requests (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES breakdown_cases(id) ON DELETE CASCADE,
  job_card_id VARCHAR(36) NULL,
  spare_name VARCHAR(255) NOT NULL,
  part_number VARCHAR(120) NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
  reason VARCHAR(500) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'WAITING_BOSS_APPROVAL',
  requested_by_name VARCHAR(255) NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_name VARCHAR(255) NULL,
  approved_at TIMESTAMPTZ NULL,
  approval_note VARCHAR(500) NULL,
  fulfilled_by_name VARCHAR(255) NULL,
  fulfilled_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_breakdown_spares_case ON breakdown_spare_requests(case_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS digital_job_cards (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES breakdown_cases(id) ON DELETE CASCADE,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  job_card_no VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  fault_description TEXT NOT NULL,
  technician_id VARCHAR(36) NULL REFERENCES users(id),
  technician_name VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  diagnosis TEXT NULL,
  work_done TEXT NULL,
  test_result TEXT NULL,
  completion_note TEXT NULL,
  repeat_issue SMALLINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  generated_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_job_cards_customer ON digital_job_cards(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_cards_technician ON digital_job_cards(technician_id, status, created_at DESC);

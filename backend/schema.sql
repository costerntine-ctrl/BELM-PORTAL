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
ALTER TABLE customers ADD COLUMN IF NOT EXISTS recovery_code_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code_hash VARCHAR(255);
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS checklist_answers (
  id VARCHAR(36) PRIMARY KEY,
  report_id VARCHAR(36) NOT NULL REFERENCES checklist_reports(id),
  template_item_id VARCHAR(36) NULL,
  label VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  photo_url VARCHAR(500) NULL,
  safety_level VARCHAR(10) NULL
);

CREATE TABLE IF NOT EXISTS service_requests (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  machine_id VARCHAR(36) NULL REFERENCES machines(id),
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
  ADD COLUMN IF NOT EXISTS customer_confirmed SMALLINT NOT NULL DEFAULT 1;

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
  customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
  machine_id VARCHAR(36) NULL REFERENCES machines(id),
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
    '{"customers":["view"],"checklists":["view","edit"],"serviceRequests":["view","edit"],"spareParts":["view"]}'::jsonb,
    '[]'::jsonb
  )
ON CONFLICT (name) DO NOTHING;

-- Keep the built-in Administrator role usable when this schema is applied to
-- a database created by an older BELM release. Other custom roles and their
-- permissions remain untouched.
UPDATE roles
SET deleted_at = NULL
WHERE name = 'Super Admin';

INSERT INTO users (id, name, email, password_hash, role_id)
SELECT
  '00000000-0000-4000-8000-000000000003',
  'BELM Admin',
  'admin@belmgeneraltech.co.tz',
  '$2y$10$uXo8bDdT3YV7BlM7V4oOR.ybSIUrBtG0x/bwydGsmf98C0IBBWtme',
  id
FROM roles
WHERE name = 'Super Admin'
ON CONFLICT (email) DO UPDATE SET
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

INSERT INTO system_settings (id, "key", "value")
VALUES (
  '00000000-0000-4000-8000-000000000004',
  'adminDeletePin',
  '"1234"'::jsonb
)
ON CONFLICT ("key") DO NOTHING;

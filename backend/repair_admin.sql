-- PostgreSQL/Render: reset or recreate the first Super Admin only.
-- Existing customers, machines, reports, invoices and other business data
-- are not deleted.

INSERT INTO roles (id, name, permissions, allowed_pages, deleted_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Super Admin',
  '{"customers":["view","edit","delete"],"checklists":["view","edit","delete"],"serviceRequests":["view","edit","delete"],"spareParts":["view","edit","delete"],"billing":["view","edit","delete"],"users":["view","edit","delete"],"reports":["view","edit","delete"],"settings":["view","edit","delete"]}'::jsonb,
  '["customers","overview","roles","service-requests","spare-parts","billing","reports","settings","checklist-templates","suppliers","activity-log"]'::jsonb,
  NULL
)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  allowed_pages = EXCLUDED.allowed_pages,
  deleted_at = NULL;

INSERT INTO users (id, name, email, password_hash, is_active, role_id, deleted_at)
SELECT
  '00000000-0000-4000-8000-000000000003',
  'BELM Admin',
  'admin@belmgeneraltech.co.tz',
  '$2y$10$uXo8bDdT3YV7BlM7V4oOR.ybSIUrBtG0x/bwydGsmf98C0IBBWtme',
  1,
  id,
  NULL
FROM roles
WHERE name = 'Super Admin'
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  is_active = 1,
  role_id = EXCLUDED.role_id,
  deleted_at = NULL;

INSERT INTO system_settings (id, "key", "value", updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000004',
  'adminDeletePin',
  '"1234"'::jsonb,
  NOW()
)
ON CONFLICT ("key") DO NOTHING;

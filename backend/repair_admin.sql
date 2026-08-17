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
  'info@belmgeneral.co.tz',
  '$2y$12$mLP95q9gTllhw8LFyLjavuv/f8/qY8kfEGmAy.l9dKCNs084SvFNS',
  1,
  id,
  NULL
FROM roles
WHERE name = 'Super Admin'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  is_active = 1,
  role_id = EXCLUDED.role_id,
  deleted_at = NULL;

-- V302: repair_admin.sql deliberately does not set a known password or PIN.
-- After running this repair, use the normal secure bootstrap/reset flow to set credentials.

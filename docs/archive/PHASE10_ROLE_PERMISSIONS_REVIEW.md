# Phase 10 — BELM and Customer role permissions review
Date: 2026-10-24

## Implemented (source change)
- `backend/api/role_communications.php`: Customer messages now resolve the CURRENT account and assistant's role through `require_customer_auth()`. Revoked/deactivated assistants can no longer rely on a valid old token to keep their old role in Role Communication.
- Unknown customer role names fail closed instead of silently behaving like a known recipient role.

## Previously present in Phase 9 (verified by source inspection)
- `bank_manager.php` calls `require_super_admin`, so Bank Controller remains BELM-only and restricted to Super Admin at the backend.
- `tasks.php` prevents BELM task assignment to `is_customer_managed` accounts; technician's own tasks are scoped by identity.
- `job_card_workflow_v814.php` restricts technician access to their assigned Job Card and customer access to customer ID.

## Still requires verification or improvement
- Cross-module permission matrix (every action and endpoint): audit ongoing; not equivalent to full integration testing.
- Customer-managed Technician opened through staff token needs a separate, deliberate Role Communication policy; this patch does not change that path.
- Check invoice, payment, and Bank Controller permissions and financial correctness together.
- Validate customer and BELM work assignments, messages, notifications, overdue reminders, and workflow approval via role-specific requests against an isolated test database.
- Confirm each role's precise entitlement from the live database, which has NOT been queried or changed here.

## Checks performed
- PHP syntax: `php -l backend/api/role_communications.php` — PASS.
- `node --test tests/report-role-access.test.js tests/reports-route.test.js` — 2/2 PASS. These tests cover reports, NOT the changed communication authorization code.

## Deployment safety
- GitHub main, Render and production database were not changed.
- Never merge directly to main without a review and a test deployment, because Render auto deploys the main branch.

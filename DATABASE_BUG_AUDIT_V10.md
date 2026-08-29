# BELM Database & Bug Audit V10

## Fixed
- Readiness now verifies `customer_department_settings` and `customer_sales_documents`.
- Readiness verifies `customers.coordinator_features`, department access columns, and customer sales document identity columns.
- Deployment protection snapshot now includes `customer_sales_documents` so private customer Invoice/Proforma records are explicitly guarded against row loss during schema evolution.
- Migration release marker updated to `coordinator-db-sync-audit-v10`.

## Verified
- Coordinator department settings use unique `(customer_id, department_key)` plus UPSERT.
- Missing department rows default to ENABLED for existing customers.
- Department removal changes access only and does not delete workflow records.
- `schema.sql` contains no DROP TABLE, TRUNCATE, or DELETE FROM statements.
- Destructive reset endpoint requires authenticated Super Admin + delete confirmation; full production reset is disabled by default.
- PHP and JavaScript syntax checks pass across the repository.

## Important operational note
Runtime database execution against the live Render PostgreSQL database was not performed in this offline package audit. `/api/readiness` is strengthened so the deployed service will expose missing Coordinator schema immediately instead of reporting a false-ready state.

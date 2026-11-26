# Phase 45 — Recorded installations and labour

A new customer-scoped POST endpoint at `customer portal /machines/{machineId}/repair-confirmations` (same routing convention as other `machines` subresources) records confirmed part installation against an actual `customer_store_movements` ISSUE and a valid `digital_job_cards` record for that same machine/customer. Requires customer write and machine-management privileges. The API locks the store issue and caps the cumulative installed quantity at the original issued quantity.

Payload: `jobCardId`, `storeIssueId`, `quantityInstalled`, `laborHours`, `hourlyRate`, optional `note`. Hours/rate and prices are entered/recorded costs; not verified payroll or supplier invoices. Each confirmation includes unit-cost snapshot, actor and timestamp. The GET machine `maintenance-history` timeline now includes `REPAIR_CONFIRMED` items and a `confirmedCostSummary` separate from raw store issues.

**Deployment prerequisite:** Apply the schema change for `customer_repair_confirmations` to a separate staging PostgreSQL before testing. This phase adds backend schema and API only; customer-facing entry form has not been wired, and real browser / database tests were not run. Never treat store-issued parts as installed unless separately confirmed.

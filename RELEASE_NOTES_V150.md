# BELM Operations Platform V150 — Managed Contracts & Customer Workshops

This release turns the portal into a shared operations platform for BELM and contract customers.

## Delivered
- Long-term customer service/maintenance contracts with start/end dates, SLA response hours, renewal visibility and coverage flags.
- Customer sites/workshops and workshop staff registry.
- Customer-owned internal work orders for breakdown repair, preventive maintenance, inspection and restoration.
- Escalation from a customer internal work order into a BELM service request while preserving the originating work-order link and context.
- BELM Contracts & Workshops control center at `/contracts-workshops/`.
- Customer Workshop Control workspace at `/customer-workshop/`.
- Customer portal shortcut into Workshop Control.
- Contract/workshop APIs and persistent database schema.
- Contract summary cards: active contracts, covered machines, renewals due and SLA-at-risk jobs.

## Operating model
Customer workshop resolves what it can internally. Difficult or contract-covered work is escalated to BELM. BELM sees the customer, machine, job type, priority and original workshop description instead of starting a new disconnected case.

## Database
Deployment runs the existing idempotent `backend/schema.sql`; new V150 tables use `CREATE TABLE IF NOT EXISTS` and indexes, so existing data is retained.

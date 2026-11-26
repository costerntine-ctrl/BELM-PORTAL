# Phase 48 — Repair report

Read-only customer-scoped GET `/api/customer-portal/machines/{machineId}/repair-report?jobCardId={id}`. FINAL requires completed job, recorded completed time, customer signature, and no pending review records. Only APPROVED confirmation costs enter report totals. Rejected and pending evidence remains listed with status. Browser print uses visible report. No production deployment or database changes.

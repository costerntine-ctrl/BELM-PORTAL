# Phase 22 — expense overlap and per-job contribution report

- `GET /api/bank-manager?action=expense-overlap-review`: Super Admin read-only possible overlap review (Finance vs Procurement), without auto-deduplication.
- `GET /api/bank-manager?action=job-customer-margin`: Super Admin read-only invoice-linked job contribution estimate, customer aggregates and unlinked invoices.
- No data mutations, no schema migration, no Render deployment.
- Job-level numbers are **not net profit**: work/labor and overheads are not allocated, COGS uses current spare cost, and invoice links may be incomplete.
- Do not delete apparent duplicates without reviewing invoice/receipt references. Database testing remains outstanding.

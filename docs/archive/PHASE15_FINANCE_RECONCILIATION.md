# Phase 15 — BELM invoice, payment and VAT reconciliation

## Implemented (read-only reporting)
- Shared `backend/api/finance_reconciliation_helper.php` used by Bank Controller and VAT summary.
- Proformas are quotes, not sales, receivables, or bank receipts.
- Invoice totals and customer receivables come from active non-cancelled invoices.
- Payments are summed exclusively from `payments`; receipts are evidence, not added to totals a second time.
- Output VAT is read from actual `invoices.tax`, not inferred at 18% for all invoices.
- VAT portion of invoice receipts is calculated separately and labeled, NOT treated as legal TRA VAT due.
- Provisional margin uses invoice revenue excluding tax less recorded costs; withdrawals do not change profit.
- Existing API fields are kept for dashboard compatibility, with clarifying metadata.

## Not completed / must test before production
- Full accounting reconciliation of payments, refunds, credits, and write-offs; payment idempotency.
- Input VAT, TRA settlements, withholding tax, VAT tax point and tax exemptions under Tanzanian rules.
- Stock historical purchase cost vs current price, duplication between expense feeds, and indirect costs.
- PostgreSQL integration tests and end-to-end dashboard label review.
- No Render deploy, database migration or production write performed.

# Phase 16 — Finance integrity checks (read-only)

Added `GET /api/bank-manager?action=finance-audit` for authenticated BELM Super Admin only. The endpoint counts unlinked payments, overpaid invoices, negative payment entries and implausible invoice tax amounts. It never edits invoice/payment/receipt records.

Counts are warnings for manual review, not evidence of fraud or official VAT due. Do not treat calculated profit as audited profit. Pending: PostgreSQL integration tests, tax settlement and input VAT ledger, credit notes/refunds, historical stock valuation, double-counted expenses and authenticated UI wiring. No production changes.

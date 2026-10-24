# Phase 18 — Provisional VAT tracking (not TRA tax filing)

This release adds `belm_vat_ledger`, `/api/belm-vat-ledger` (Super Admin only) and a provisional dashboard card.

## Record VAT evidence
POST `/api/belm-vat-ledger` with `type` (`INPUT_VAT`, `TRA_PAYMENT`, `ADJUSTMENT`), `taxMonth` (`YYYY-MM`), `entryDate` (`YYYY-MM-DD`), `amount` (positive TZS), `reference` (unique for each entry type), `description`, and `direction` (`INCREASE` or `DECREASE`) when type is `ADJUSTMENT`.

GET `/api/belm-vat-ledger` returns month-by-month estimates. No UI entry form yet; authorized API clients can record supporting documents. This is an additive schema change in `backend/schema.sql`; it requires a successful migration before endpoint use.

## Accounting cautions
- Invoice creation month is a proxy, not necessarily Tanzania VAT tax point. A qualified accountant must verify actual tax-point, tax-period classification, tax credits, compliance, carryforwards and submission evidence.
- TRA_PAYMENT records provide reconciliation evidence only. They DO NOT debit a bank account or create a company expense. Record bank settlement independently and reconcile references to avoid duplicate cash movements.
- INPUT_VAT is entered based on documentary evidence; eligibility is NOT determined by the application.
- Opening VAT liabilities and credits from before the recorded period are not imported automatically. Reconcile opening balance before interpreting totals.
- The existing output VAT card remains distinct from estimated balance. No claim of verified statutory liability or profit is made.
- Do not deploy to existing production without backup, migration rehearsal and role-based integration tests.

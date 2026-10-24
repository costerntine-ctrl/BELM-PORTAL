# Phase 21 — Provisional operating result reconciliation

## Changes
- Both Bank Controller and VAT Summary now call `belm_provisional_margin_bridge()` from `backend/api/finance_reconciliation_helper.php`.
- Invoice sales excluding recorded output VAT less recorded Finance, Procurement, Workshop petty-cash expenses, and invoiced spare costs produce a **provisional operating result**.
- Withdrawals and receipts are not separately deducted in that result.
- APIs expose expense breakdown, signed provisional operating result, `reconciliationRequired`, and warnings.
- `belmProfit` and `loss` stay available for legacy frontend compatibility; both are **provisional**, not audited net profit.

## Outstanding risks — must be reconciled before official use
1. A purchase or expense may appear in company_expenses and procurement/petty cash tables: duplicate deductions are possible.
2. Spare COGS uses current spare_parts.purchase_price, not the historical cost on transaction date.
3. Expenses must be reviewed for payroll, operating expenses, capital expenditure, VAT, period, credit notes, and income tax.
4. Database migrations and actual-record tests have not been performed.
5. Historic dashboard labels should be reviewed for claims of net profit.

## Validation
`php -l` passes for the three edited PHP files. No database or Render changes.

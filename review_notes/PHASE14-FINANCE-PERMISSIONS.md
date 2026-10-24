# Phase 14: financial calculation review

## Corrected
- bank_manager.php and bank_vat_summary.php no longer subtract *all bank withdrawals* as if they were operating expenses in the cash-based result. Withdrawals still reduce bank-account balances.

## Accounting caveats (not fixed here)
- Both endpoints currently calculate different VAT proxies (all non-cancelled invoice subtotals versus amounts paid on taxable invoices). Neither alone is confirmed TRA VAT liability after input VAT, credits, adjustments and remittances.
- The field named `belmProfit` is a provisional cash-receipt-based result, NOT validated accrual-based net profit. Revenue and cost recognition, stock purchase vs COGS, double-counted cost streams, and open receivables need a full ledger reconciliation.
- Bank Controller endpoint requires Super Admin; billing and receipts use billing-page permission. Review write permissions against the intended role matrix with a test database.
- No live database queries, email delivery tests, or Render deployment were performed.

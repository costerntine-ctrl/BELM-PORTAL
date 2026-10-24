# Phase 17: Finance dashboard terminology safety

- Invoice output VAT displayed as **not final TRA net VAT payable**. The existing DB has not been reconciled for input VAT, tax credits or TRA payments.
- Cost of goods sold stays a cost, while current inventory value is a separate asset card.
- Invoice-based margin and loss explicitly labeled **provisional**. This figure is not audited net profit and may omit expenses or double count costs pending ledger reconciliation.
- No new financial transaction, database schema change, or TRA tax calculation has been introduced.
- Future work: model input VAT credits, returns and TRA payments with audit trail and period reconciliation; avoid fabricating liability from invoice output VAT.
- Tests: node tests/finance-dashboard-tax-labels.test.js plus existing regression tests.

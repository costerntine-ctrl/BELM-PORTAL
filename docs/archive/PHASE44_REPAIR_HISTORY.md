# Phase 44 — Repair history data integrity

- Customer-owned Store ISSUE movements now appear on machine history, scoped by customer ID and machine ID; values are issued inventory ledger values in TZS, **not** repair invoices, actual installed parts, or profit.
- Completed Job Cards show whether customer acknowledgement was recorded, with signature timestamp. A completed status alone is not represented as a signature.
- Requested parts remain separate; no inferred installation events or estimated labor costs.
- No migrations or production writes. Static checks and syntax checks do not replace PostgreSQL/browser tests.

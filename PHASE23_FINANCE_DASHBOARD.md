# Phase 23 — Financial Review dashboard

Read-only Super Admin view calls existing finance-audit, expense-overlap-review and job-customer-margin APIs. Shows exception counts, customer contribution estimates, linked Job Card invoice rows, unlinked invoice count and possible expense overlaps. No automatic deletion or financial mutation. Limits: API report caps latest 1,000 invoices and duplicate candidate query caps 100. Requires database-backed role testing before deployment.

# Phase 37 — Technician Reassignment Integrity

## Fixed
- BELM engineering dispatch now clears `received_at` and `started_at` only when the assignee changes.
- Re-confirming the same technician preserves acknowledgement and time stamps.
- This aligns BELM reassignment with Customer reassignment and ensures the next technician must acknowledge the card.

## Checks
- PHP lint and targeted static regression test.

## Outstanding
- No live PostgreSQL or browser integration tests have been run.
- Full notification delivery and authorization across every role remain to be tested in staging.
- Do not deploy this zip to production before database-backed staging checks and migration review.

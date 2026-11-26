# Phase 33 — Technician Job Card Acknowledgement

- Technician must explicitly receive Job Card before opening diagnosis or submitting reports.
- Received time is stored server-side in `digital_job_cards.received_at`.
- Atomic update prevents duplicate event entries when the technician double-clicks.
- On reassignment to a different technician, receipt and start timestamps are cleared to require new acknowledgement.
- Job Card list shows received time. Manager-facing API list includes receivedAt.
- Existing open/in-progress legacy cards without received_at need a reconciliation/backfill policy before rollout; no automatic backfill was performed.
- Deployment requires DB schema migration. Browser/PostgreSQL integration tests still required.

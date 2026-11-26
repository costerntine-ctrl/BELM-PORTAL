# Phase 35 — Technician / Workshop Manager synchronization

Both dashboards use `receivedAt` from `job_card_workflow_v814.php` as the authoritative acknowledgement timestamp. Manager sees awaiting/received status and pending reason. Technician sees receipt status and cannot submit a new diagnosis until acknowledgement. Server-side controls continue to enforce access. No production deployment or database change in this phase.

Caution: integration on PostgreSQL and authenticated browser sessions remains untested.

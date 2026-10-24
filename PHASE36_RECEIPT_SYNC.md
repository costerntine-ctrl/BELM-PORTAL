# Phase 36 — Job Card acknowledgement synchronization

- `service_requests.php` and `customer_portal.php` now return `digital_job_cards.received_at`, not the creation/issue date, as acknowledgement time.
- `receivedByBelm` is true only if the Job Card has an actual technician acknowledgement timestamp.
- Customer and service-request manager screens distinguish a created Job Card awaiting technician acknowledgement from one actually acknowledged.
- No production database or service was altered.
- Static syntax and source contract tests were performed. Browser/PostgreSQL role-based integration testing is still required.

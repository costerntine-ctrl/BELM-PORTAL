# Phase 30 — Abnormal Check Up escalation

Added `POST /api/breakdown-workflow?action=case-from-checkup` with JSON `{ "checkupReportId": "..." }`. Only the owning Customer Admin/Workshop Manager can initiate this action for an abnormal (`YELLOW`/`RED`) checkup in customer-managed workshop mode. The original Check Up and its answers remain unchanged. A machine-level row lock serializes escalations, an existing open case is reused, and the standard idempotent Job Card helper supplies the Job Card. Events preserve the report ID for traceability. No Job Card is generated just because a technician submits a checkup.

Not yet done: frontend manager button and PostgreSQL/browser integration tests. Other abnormal checkups on the same machine are linked to the existing open case, which the manager must review rather than silently opening duplicates. BELM-managed customers must continue using the official BELM support flow.

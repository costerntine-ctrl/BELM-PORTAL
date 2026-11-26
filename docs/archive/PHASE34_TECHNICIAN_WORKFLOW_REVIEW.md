# Phase 34 — Technician Workflow Guards

Changes:
- Receiving an already completed/cancelled/non-active Job Card now responds with conflict instead of treating the old acknowledgement as success.
- Starting testing requires an explicitly received Job Card and an approved repair with status IN_PROGRESS.
- Existing server-duration check for successful testing remains in place.

Validation: PHP syntax checks for two modified files, and 23 source-level test cases passed. These do not replace HTTP, PostgreSQL, role-permission or browser integration tests.

Deployment: Not deployed. No Render, production database or GitHub main changes.

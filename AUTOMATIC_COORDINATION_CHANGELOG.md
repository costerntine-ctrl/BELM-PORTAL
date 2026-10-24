# BELM Automatic Coordination — initial implementation

The Job Card workflow now publishes best-effort, targeted portal communications automatically for report submission, report return, repair approval, spare approval, testing start, and final closure. The notice routes to the corresponding BELM or customer role for the source of the Job Card; customer notices are scoped to the customer ID.

This is **phase 1**, not a complete replacement of every coordinator function: assignment events from other endpoints, procurement updates, reminders/escalations, email/SMS delivery, and full per-role integration tests still require work. The legacy `System Coordinator` role is **not deleted** and existing users/permissions remain unchanged pending a safe audited migration. No migrations or data destruction are performed.

Do not deploy to production until a staging database is used to verify target role visibility, workflows, and notifications.

## Phase 8 — overdue Job Card manager reminders

Added `backend/scripts/send_overdue_job_reminders.php` as a CLI-only scheduled worker.
It finds overdue active Job Cards, sends one **in-portal** reminder per Job Card per calendar day to the Workshop Manager of the work-owning scope, and uses PostgreSQL transaction advisory locks plus existing-message checks to avoid duplicate delivery under concurrent runs. Customer-internal maintenance stays scoped to its customer; BELM service requests route to BELM.

**Important:** A code file alone does not schedule a job. To turn on automatic daily reminders, configure a once-daily scheduler that runs `php backend/scripts/send_overdue_job_reminders.php` with access to the BELM database (for example a secured Render Cron Job). Verify this in staging first. The existing production web service configuration is intentionally unchanged; no cron service has been created, no database has been modified, and no external email/SMS is sent. `--dry-run` previews reminders with database read access, but is not runnable without a staging database.

## Phase 9 — staging-ready scheduler instructions and time consistency

The daily reminder worker now takes its deduplication date from PostgreSQL `CURRENT_DATE` rather than the PHP process timezone, and locks the matching Job Card row before inserting a notice so concurrent closure cannot produce a stale reminder. Added `RENDER_OVERDUE_REMINDERS_SETUP.md` with a specific staging checklist and an optional 09:00 Tanzania schedule. **The cron has not been provisioned or activated.**

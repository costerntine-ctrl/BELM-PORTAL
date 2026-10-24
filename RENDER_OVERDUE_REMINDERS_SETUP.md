# BELM Portal — daily overdue reminders (Phase 9)

This worker is **not enabled in production** simply by including it in the repository.

## Safe activation checklist

1. Create a **separate staging PostgreSQL database** with synthetic Job Cards. Never point the staging cron at the production `DATABASE_URL`.
2. Build the same Dockerfile as the web service. Note that Docker copies `backend/` into `/var/www/html/api/`.
3. Run the worker manually against staging using:

   `php /var/www/html/api/scripts/send_overdue_job_reminders.php --dry-run`

4. Verify BELM-owned Service Requests notify BELM `workshop_manager`, and customer-owned internal Job Cards notify only that customer's `workshop_manager`. Verify no cross-customer visibility via the API.
5. Run once without `--dry-run`, then run it again on the same database date. The second run must report `sent: 0` and `alreadySentToday` for existing notices. Verify completed/cancelled jobs are skipped.
6. When approved for production, configure a Render **Cron Job** (not a web-startup background loop) using the same source and Docker build, set the command to:

   `php /var/www/html/api/scripts/send_overdue_job_reminders.php`

   Schedule `0 6 * * *` (06:00 UTC / 09:00 Tanzania time) if the Render scheduler uses UTC. Verify the scheduler timezone in its UI before activating. Supply the database connection securely through Render's environment configuration and use least-privilege access if feasible.
7. Review cron logs and role_communications after the first run; alert on nonzero exit statuses. Do not publish credentials in GitHub.

This worker creates **in-portal communications** only, not email, SMS or WhatsApp. It uses the database's `CURRENT_DATE` for consistent deduplication. A PostgreSQL transactional advisory lock and per-job row lock guard against concurrent runs and close-vs-reminder races. Full behavioral tests require a staging DB.

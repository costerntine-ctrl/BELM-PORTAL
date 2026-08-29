#!/bin/sh
set -eu

APP_PORT="${PORT:-10000}"
sed -ri "s/Listen 80/Listen ${APP_PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \\*:80>/<VirtualHost *:${APP_PORT}>/" /etc/apache2/sites-available/000-default.conf

# V354 fast-wake availability guard: bind the web service immediately. Database
# migration remains decoupled from Apache startup and starts after a short delay
# so a cold Render instance can serve the login shell before competing for DB/CPU.
# migrate.php remains transactional and rolls itself back on any data-safety violation.
run_safe_migration() {
    attempt=1
    while :; do
        set +e
        php /var/www/html/api/scripts/migrate.php
        code=$?
        set -e

        if [ "$code" -eq 0 ]; then
            php /var/www/html/api/scripts/migrate_checklist_master.php || echo "BELM checklist master migration deferred; web service remains online." >&2
            echo "BELM background database check completed successfully."
            return 0
        fi

        if [ "$code" -eq 78 ]; then
            echo "BELM database data-safety guard blocked migration; web service remains online and business data was not changed." >&2
            return 0
        fi

        if [ "$attempt" -ge 5 ]; then
            echo "BELM database migration is still unavailable after 5 attempts; web service remains online. Check /api/readiness and Render database logs." >&2
            return 0
        fi

        echo "Waiting for PostgreSQL in background (attempt ${attempt}/5)..." >&2
        attempt=$((attempt + 1))
        sleep 3
    done
}

(
    sleep "${BELM_MIGRATION_START_DELAY:-6}"
    run_safe_migration
) &
exec apache2-foreground

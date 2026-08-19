#!/bin/sh
set -eu

APP_PORT="${PORT:-10000}"
sed -ri "s/Listen 80/Listen ${APP_PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \\*:80>/<VirtualHost *:${APP_PORT}>/" /etc/apache2/sites-available/000-default.conf

# V353 availability guard: bind the public web service immediately. Database
# migration is intentionally decoupled from Apache startup so a guarded/slow DB
# check can never make the entire BELM portal unreachable. migrate.php remains
# transactional and rolls itself back on any data-safety violation.
run_safe_migration() {
    attempt=1
    while :; do
        set +e
        php /var/www/html/api/scripts/migrate.php
        code=$?
        set -e

        if [ "$code" -eq 0 ]; then
            echo "BELM background database check completed successfully."
            return 0
        fi

        if [ "$code" -eq 78 ]; then
            echo "BELM database data-safety guard blocked migration; web service remains online and business data was not changed." >&2
            return 0
        fi

        if [ "$attempt" -ge 5 ]; then
            echo "BELM database migration is still unavailable after 5 attempts; web service remains online. Check /api/health and Render database logs." >&2
            return 0
        fi

        echo "Waiting for PostgreSQL in background (attempt ${attempt}/5)..." >&2
        attempt=$((attempt + 1))
        sleep 3
    done
}

run_safe_migration &
exec apache2-foreground

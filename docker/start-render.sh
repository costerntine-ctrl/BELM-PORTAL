#!/bin/sh
set -eu

APP_PORT="${PORT:-10000}"
sed -ri "s/Listen 80/Listen ${APP_PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \\\*:80>/<VirtualHost *:${APP_PORT}>/" /etc/apache2/sites-available/000-default.conf

attempt=1
until php /var/www/html/api/scripts/migrate.php; do
    if [ "$attempt" -ge 20 ]; then
        echo "Database was not ready after 20 attempts." >&2
        exit 1
    fi
    echo "Waiting for PostgreSQL (attempt ${attempt}/20)..." >&2
    attempt=$((attempt + 1))
    sleep 3
done

exec apache2-foreground

#!/bin/sh
set -eu

APP_PORT="${PORT:-10000}"
case "$APP_PORT" in
    *[!0-9]*|'')
        echo "Invalid PORT value: $APP_PORT" >&2
        exit 1
        ;;
esac

sed -ri "s/Listen 80/Listen ${APP_PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \\*:80>/<VirtualHost *:${APP_PORT}>/" /etc/apache2/sites-available/000-default.conf

attempt=1
max_attempts=30
while :; do
    if php /var/www/html/api/scripts/migrate.php; then
        break
    else
        exit_code=$?
    fi

    if [ "$exit_code" -ne 75 ]; then
        echo "Database migration has a non-transient error. Deployment stopped; read the BELM migration line above." >&2
        exit "$exit_code"
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
        echo "PostgreSQL was still unavailable after ${max_attempts} attempts." >&2
        exit 1
    fi

    echo "Waiting for PostgreSQL (attempt ${attempt}/${max_attempts})..." >&2
    attempt=$((attempt + 1))
    sleep 3
done

exec apache2-foreground

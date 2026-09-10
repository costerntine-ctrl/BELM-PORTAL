FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libonig-dev qrencode git \
    && docker-php-ext-install pdo_pgsql mbstring \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/belm-apache.conf /etc/apache2/conf-available/belm.conf
RUN a2enconf belm
COPY docker/belm-php.ini /usr/local/etc/php/conf.d/belm-overrides.ini

# V715: materialize the customer-role workspace revision with git apply.
# The V715 payload is a git-format patch, so use the same apply engine as the
# verification workflow rather than GNU patch. Keep validation output visible
# in Render logs so any future syntax failure identifies the exact file.
COPY frontend/ /tmp/belm/frontend/
COPY backend/ /tmp/belm/backend/
COPY .v715-build/ /tmp/belm/.v715-build/
RUN set -eux; \
    cat /tmp/belm/.v715-build/core-*.b64 | base64 -d | gzip -d > /tmp/v715-core.patch; \
    cd /tmp/belm; \
    git apply --check /tmp/v715-core.patch; \
    git apply /tmp/v715-core.patch; \
    cat /tmp/belm/.v715-build/replace-actions.b64 | base64 -d > /tmp/belm/frontend/assets/js/belm-dashboard-actions-v713.js; \
    cat /tmp/belm/.v715-build/replace-sw.b64 | base64 -d > /tmp/belm/frontend/belm-sw.js; \
    cat /tmp/belm/.v715-build/live-*.b64 | base64 -d > /tmp/belm/frontend/dashboard-live-v710.js; \
    find /tmp/belm/backend /tmp/belm/frontend -type f -name '*.php' -exec php -l {} \; ; \
    mkdir -p /var/www/html /var/www/html/api; \
    cp -a /tmp/belm/frontend/. /var/www/html/; \
    cp -a /tmp/belm/backend/. /var/www/html/api/; \
    rm -rf /tmp/belm /tmp/v715-core.patch

COPY docker/start-render.sh /usr/local/bin/start-render.sh
RUN chown -R www-data:www-data /var/www/html

EXPOSE 10000

CMD ["sh", "/usr/local/bin/start-render.sh"]

FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libonig-dev qrencode patch \
    && docker-php-ext-install pdo_pgsql mbstring \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/belm-apache.conf /etc/apache2/conf-available/belm.conf
RUN a2enconf belm
COPY docker/belm-php.ini /usr/local/etc/php/conf.d/belm-overrides.ini

# V715: build the verified customer-role workspace revision on top of the
# repository source. This keeps one BELM master application while customers
# receive only the roles/modules BELM grants them.
COPY frontend/ /tmp/belm/frontend/
COPY backend/ /tmp/belm/backend/
COPY .v715-build/ /tmp/belm/.v715-build/
RUN set -eux; \
    cat /tmp/belm/.v715-build/core-*.b64 | base64 -d | gzip -d > /tmp/v715-core.patch; \
    cd /tmp/belm; \
    patch -p1 < /tmp/v715-core.patch; \
    cat /tmp/belm/.v715-build/replace-actions.b64 | base64 -d > /tmp/belm/frontend/assets/js/belm-dashboard-actions-v713.js; \
    cat /tmp/belm/.v715-build/replace-sw.b64 | base64 -d > /tmp/belm/frontend/belm-sw.js; \
    cat /tmp/belm/.v715-build/live-*.b64 | base64 -d > /tmp/belm/frontend/dashboard-live-v710.js; \
    find /tmp/belm/backend /tmp/belm/frontend -type f -name '*.php' -print0 | xargs -0 -n1 php -l >/tmp/v715-php-lint.log; \
    mkdir -p /var/www/html /var/www/html/api; \
    cp -a /tmp/belm/frontend/. /var/www/html/; \
    cp -a /tmp/belm/backend/. /var/www/html/api/; \
    rm -rf /tmp/belm /tmp/v715-core.patch /tmp/v715-php-lint.log

COPY docker/start-render.sh /usr/local/bin/start-render.sh
RUN chown -R www-data:www-data /var/www/html

EXPOSE 10000

CMD ["sh", "/usr/local/bin/start-render.sh"]

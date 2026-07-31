FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev libpq-dev \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql mbstring \
    && php -r 'if (!in_array("pgsql", PDO::getAvailableDrivers(), true)) { fwrite(STDERR, "pdo_pgsql build check failed\n"); exit(1); }' \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/belm-apache.conf /etc/apache2/conf-available/belm.conf
RUN a2enconf belm

COPY frontend/ /var/www/html/
COPY backend/ /var/www/html/api/
COPY docker/start-render.sh /usr/local/bin/start-render.sh

RUN chmod +x /usr/local/bin/start-render.sh \
    && chown -R www-data:www-data /var/www/html

EXPOSE 10000

CMD ["sh", "/usr/local/bin/start-render.sh"]

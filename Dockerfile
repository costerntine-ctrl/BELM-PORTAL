FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libonig-dev \
    && docker-php-ext-install pdo_pgsql mbstring \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/belm-apache.conf /etc/apache2/conf-available/belm.conf
RUN a2enconf belm

COPY frontend/ /var/www/html/
COPY backend/ /var/www/html/api/
COPY docker/start-render.sh /usr/local/bin/start-render.sh

RUN chown -R www-data:www-data /var/www/html

EXPOSE 10000

CMD ["sh", "/usr/local/bin/start-render.sh"]

FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libonig-dev qrencode \
    && docker-php-ext-install pdo_pgsql mbstring \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/belm-apache.conf /etc/apache2/conf-available/belm.conf
RUN a2enconf belm
COPY docker/belm-php.ini /usr/local/etc/php/conf.d/belm-overrides.ini

# Deploy the repository source directly. Do not rebuild source from staged
# base64 patch fragments during Render builds: those transport fragments are
# not part of the runtime application and a damaged fragment must never block
# production deployment.
COPY frontend/ /var/www/html/
COPY backend/ /var/www/html/api/

# Fail the image build only on a real PHP syntax error and print the exact file.
RUN find /var/www/html/api /var/www/html -type f -name '*.php' -exec php -l {} \;

COPY docker/start-render.sh /usr/local/bin/start-render.sh
RUN chown -R www-data:www-data /var/www/html

EXPOSE 10000

CMD ["sh", "/usr/local/bin/start-render.sh"]

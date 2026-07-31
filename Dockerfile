FROM php:8.3-apache

# Install system packages and PHP extensions
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev \
        libonig-dev \
        libzip-dev \
        zip \
        unzip \
        git \
        curl && \
    docker-php-ext-install \
        pdo \
        pdo_pgsql \
        mbstring && \
    a2enmod rewrite headers && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Working directory
WORKDIR /var/www/html

# Copy frontend
COPY frontend/ /var/www/html/

# Copy backend
COPY backend/ /var/www/html/api/

# Apache configuration
COPY docker/belm-apache.conf /etc/apache2/sites-available/000-default.conf

# Startup script
COPY docker/start-render.sh /usr/local/bin/start-render.sh
RUN chmod +x /usr/local/bin/start-render.sh

# Render uses port 10000
ENV PORT=10000
EXPOSE 10000

CMD ["/usr/local/bin/start-render.sh"]
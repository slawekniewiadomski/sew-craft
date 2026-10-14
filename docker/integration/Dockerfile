# Integration image: a self-contained Laravel API used by the Testcontainers
# harness in `integration/`. It installs production PHP dependencies, runs
# migrations against the linked Postgres container, then serves the API.
FROM php:8.4-cli-alpine

RUN apk add --no-cache \
        bash \
        git \
        unzip \
        libzip-dev \
        icu-dev \
        postgresql-dev \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_pgsql \
        pgsql \
        bcmath \
        pcntl \
        intl \
        zip \
        opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install \
        --no-dev \
        --no-interaction \
        --no-progress \
        --prefer-dist \
        --no-scripts \
        --no-autoloader

COPY . .

RUN composer dump-autoload --optimize --no-dev --no-interaction --no-scripts

ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr

EXPOSE 8000

CMD ["sh", "-c", "php artisan migrate --force && cd public && php -S 0.0.0.0:8000 ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"]

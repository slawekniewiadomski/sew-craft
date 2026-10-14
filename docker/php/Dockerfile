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

EXPOSE 8000

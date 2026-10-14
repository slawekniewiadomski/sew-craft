# ADR-0008: Backend stack — Laravel + PostgreSQL + Docker, PHP 8.4

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Need a productive backend with strong conventions, a relational store and
reproducible local dev on a machine without PHP installed.

## Decision

- **Laravel 13** on **PHP 8.4**, **PostgreSQL 16**.
- **Docker Compose** for backend dev (`app` + `db`, optional `node` profile).
- **Pest** for tests, **Pint** for formatting.
- Frontend/geometry run on the host with **Node 22** and npm workspaces.

PHP 8.4 (not 8.3) because the resolved Laravel 13 dependency graph requires
`>= 8.4.1`.

## Consequences

- PHP is only available through Docker locally, so backend commands run via
  `docker compose`.
- `php artisan serve` is avoided in the container (it strips env vars from its
  child process); the raw PHP built-in server is used instead.

## Alternatives considered

- MySQL: fine, but we prefer Postgres's JSON and future extension options.
- SQLite: simplest, but weaker concurrency and migration story for a growing app.

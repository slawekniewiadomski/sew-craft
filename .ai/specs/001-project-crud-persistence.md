# 001 — Project CRUD & persistence

Status: done
Depends on: —

## Goal

A user can create, list, view, update and delete projects; projects persist in
PostgreSQL.

## Context

Foundation for everything else. Read `docs/architecture/data-model.md` and
`docs/architecture/api.md`.

## Inputs

Laravel scaffold, Postgres via Docker, Pest.

## Deliverables

- `projects` migration + `Project` model + factory.
- `ProjectController` (index/store/show/update/destroy) + `ProjectResource`.
- Routes in `routes/api.php`.
- Pest feature tests.

## Acceptance criteria

- [x] `GET/POST/GET/PUT/DELETE /api/projects[/{id}]` behave per `api.md`.
- [x] Invalid payload returns `422` with `errors`.
- [x] Persists to Postgres (verified against the Docker stack).

## Out of scope

- Auth/ownership, patterns, search, soft deletes.

## Checks

```bash
docker compose exec app php artisan test
```

## Files

`app/Models/Project.php`, `app/Http/Controllers/Api/ProjectController.php`,
`app/Http/Resources/ProjectResource.php`, `routes/api.php`, `database/migrations/*`,
`tests/Feature/ProjectTest.php`.

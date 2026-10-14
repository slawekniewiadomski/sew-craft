# 009 — Command spec API

Status: partial (`GET /api/commands` + projects scaffold exist)
Depends on: 001, 004

## Goal

The API exposes the command spec and accepts command batches that mutate and
version a stored pattern, so UI and agents share one contract.

## Context

Read `docs/architecture/command-core.md` and `api.md`. This is what makes agent
control possible.

## Inputs

`config/geometry.php`, `Pattern`/`PatternVersion` models, command applier (004).

## Deliverables

- `GET /api/commands` returning `{ version, commands }` (done).
- `GET/PUT /api/projects/{id}/pattern`.
- `POST /api/projects/{id}/commands`: validate batch against spec, apply via a
  PHP command service, persist, append `pattern_version`, return the document.
- Idempotency: re-sending a command `id` is a no-op.
- Pest tests including idempotency and validation failures.

## Acceptance criteria

- [ ] Spec endpoint matches `docs/domain/command-spec.json`.
- [ ] Applying a batch advances the pattern version exactly once.
- [ ] Invalid/unknown commands return `422` and change nothing.
- [ ] Replaying the same batch is idempotent.

## Decision needed

Where to apply commands server-side. Options: duplicate `applyCommand` in PHP, or
run the geometry package via a Node sidecar. Record an ADR before implementing.

## Checks

```bash
docker compose exec app php artisan test
npm test && npm run lint
```

# API

Stateless JSON API under `/api`. No auth in v0.1 (single-user, self-hosted); the
surface is designed so Sanctum can be added without breaking clients. Bump the
`spec_version` for breaking contract changes.

Base URL: `http://localhost:8000/api` (`/api` is proxied by the Vite dev server).

## Endpoints

| Method    | Path                      | Purpose                              |
| --------- | ------------------------- | ------------------------------------ |
| GET       | `/commands`               | Machine-readable command spec        |
| GET       | `/projects`               | Paginated list of projects           |
| POST      | `/projects`               | Create a project                     |
| GET       | `/projects/{id}`          | Show a project                       |
| PUT/PATCH | `/projects/{id}`          | Update a project                     |
| DELETE    | `/projects/{id}`          | Delete a project                     |
| GET       | `/projects/{id}/pattern`  | Fetch the canonical pattern document |
| PUT       | `/projects/{id}/pattern`  | Replace the pattern document         |
| POST      | `/projects/{id}/commands` | Apply a batch of commands            |
| POST      | `/patterns/{id}/exports`  | Queue an export (svg/pdf/dxf)        |

Rows marked ⏳ are specified but not yet implemented.

## Conventions

- **Resources** are wrapped: `{ "data": ... }`; collections add `links`/`meta`
  (Laravel pagination).
- **Validation** errors return `422` with `{ "message", "errors": { field: [...] } }`.
- **Not found** returns `404`. **Success with no body** returns `204`.
- All requests send `Accept: application/json`.
- Timestamps are ISO-8601 UTC.

## Examples

```bash
curl -X POST http://localhost:8000/api/projects \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"name":"Summer dress","description":"A-line block"}'
```

```jsonc
// 201
{
  "data": {
    "id": 1,
    "name": "Summer dress",
    "description": "A-line block",
    "created_at": "...",
    "updated_at": "...",
  },
}
```

## Applying commands

```jsonc
POST /api/projects/1/commands
{
  "commands": [
    { "id": "01J...", "type": "add_point", "params": { "x": 0, "y": 0, "construction": true } }
  ]
}
```

The server validates each command against the command spec, applies them to the
stored document, persists a new `pattern_version`, and returns the updated
document. See `specs/009-command-spec-api.md` for the full contract.

## Versioning

The API lives under `/api` and evolves additively. The command/
document contract versions separately via `config('geometry.spec_version')`.

## Auth (later)

When added: Laravel Sanctum token/SPA auth, `user_id` on `projects`, scoped
queries. No endpoint shape should need to change — only middleware and ownership.

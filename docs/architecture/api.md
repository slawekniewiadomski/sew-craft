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
| POST      | `/projects/{id}/commands` | Apply a batch of commands ⏳         |
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

## Pattern documents

One pattern per project in v1. The document is stored as a **snapshot**, not
replayed from commands: the only command interpreter is the TypeScript geometry
package, so the server validates the envelope and stores the JSON. The editor
still applies every in-session mutation as a command; Save writes the result.

### `GET /api/projects/{id}/pattern`

`200` returns the working copy and the latest checkpoint:

```jsonc
{
  "data": {
    "id": 7, // pattern id; null until the first save
    "project_id": 1,
    "name": "Summer dress",
    "document": { "schema": "sewcraft.pattern/0.2", "units": "mm", "...": "..." },
    "version": 12, // latest checkpoint; 0 when none
    "saved_at": "2026-10-23T15:41:12Z", // null when never saved
  },
}
```

`document` is `null` (not a 404) when the project has no saved pattern, so a new
project is distinguishable from a missing one. A missing project is `404`.

### `PUT /api/projects/{id}/pattern`

```jsonc
{
  "document": { "schema": "sewcraft.pattern/0.2", "units": "mm", "...": "..." },
  "expected_version": 12, // null forces a create/overwrite
  "expected_schema": "sewcraft.pattern/0.1", // optional: archive the old copy first
  "origin": "autosave", // optional: "manual" (default) | "autosave"
}
```

Validation: `document` must be an object with a string `schema` and
`units === "mm"`, serialised at most 2 MB; `expected_version` is an integer ≥ 0
or null; `expected_schema` is a string; `origin` is `manual` or `autosave`.
Failures are `422` with `errors.document` / `errors.expected_version` /
`errors.expected_schema` / `errors.origin`.

Success `200`:

```jsonc
{ "data": { "id": 7, "version": 13, "saved_at": "2026-10-23T16:02:44Z", "created": false } }
```

`created` is `true` when the save created the pattern row. One changed save
appends exactly one checkpoint; an unchanged document appends nothing and
returns the current version. When `expected_schema` differs from the incoming
`document.schema`, the server first appends the existing working copy as a
checkpoint, so the pre-upgrade state survives the one-way migration.

`origin` is omitted by clients that only save explicitly and then means
`manual`. A checkpoint written with `origin: "autosave"` is transient history:
appending it prunes earlier autosave rows of the same pattern in the same
transaction. Manual rows (explicit saves and upgrade archives) are never pruned.
Version numbers stay `max(version) + 1`, so pruning leaves gaps — a version is a
token, not a count, and `(pattern_id, version)` stays unique.

Conflict `409` (the expected version no longer matches):

```jsonc
{
  "message": "The project was saved by someone else.",
  "current_version": 14,
  "saved_at": "2026-10-23T16:05:00Z",
}
```

A `404` on save means the project was deleted while the editor was open.

## Applying commands (deferred)

`POST /projects/{id}/commands` is specified but **not implemented**. The write
path in v0.1 is the document snapshot above (`PUT /projects/{id}/pattern`),
because the only command interpreter is the TypeScript geometry package and a
PHP port would be a second implementation of the solver. Clients apply commands
locally and save the resulting document; the server does not replay them.

The future contract, if the endpoint is revisited, is:

```jsonc
POST /api/projects/1/commands
{
  "commands": [
    { "id": "01J...", "type": "add_point", "params": { "x": 0, "y": 0, "construction": true } }
  ]
}
```

## Versioning

The API lives under `/api` and evolves additively. The command/
document contract versions separately via `config('geometry.spec_version')`.

## Auth (later)

When added: Laravel Sanctum token/SPA auth, `user_id` on `projects`, scoped
queries. No endpoint shape should need to change — only middleware and ownership.

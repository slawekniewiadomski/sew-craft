# Backward compatibility — SewCraft

What this project treats as a protected contract surface, and how a change to one
must be handled. `om-code-review` checks a diff against this file; implementation
skills warn when a change violates it.

The guiding rule from `docs/architecture/standards.md`: where a **contract doc**
defines a rule, that doc wins. The surfaces below are the ones other code, users,
or the geometry package depend on.

## Protected surfaces

### 1. HTTP API (`/api`)

- **Surface:** routes in `routes/api.php`; request/response shapes, field casing,
  error format, status codes, and pagination as documented in
  `docs/architecture/api.md`.
- **Breaking:** removing or renaming a route, a response field, or a query param;
  changing a status code or the `{message, errors}` error shape; switching JSON
  field casing away from snake_case; wrapping/unwrapping `{"data": ...}`
  differently.
- **Required path:** evolve additively. A breaking change bumps `spec_version` in
  `config/geometry.php`, is documented in `docs/architecture/api.md`, and is called
  out in the PR body. Keep the API stateless so auth can be added later.

### 2. Command spec

- **Surface:** `config/geometry.php` (exposed at `GET /api/commands`),
  `docs/domain/command-spec.md`, `docs/domain/command-spec.json`. Commands are the
  only mutation path, emitted by the UI, API, tests and agents alike.
- **Breaking:** renaming a command `type`, changing the envelope keys
  (`id`/`type`/`params`/`issuedAt`), renaming or retyping a param, or removing a
  command.
- **Required path:** update all three files in sync, bump `spec_version` for a
  breaking change, and document the migration. Adding a command is additive but
  still needs the three-way sync and a test.

### 3. `@sewcraft/geometry` public API

- **Surface:** everything re-exported from `packages/geometry/src/index.ts`
  (vector, types, document, solver, commands). The package is pure and
  framework-agnostic.
- **Breaking:** changing an exported function/type signature or its behavior,
  removing an export, or introducing a dependency on Vue/DOM/network/Laravel.
- **Required path:** bump the package `version`, update consumers in `frontend/`,
  and keep 100% unit coverage on the changed code. Behavior changes to geometry
  math (units, tolerance/epsilon, coordinate conventions) are contract changes —
  update `docs/architecture/geometry-core.md` and note the migration.

### 4. Database schema and migrations

- **Surface:** `database/migrations/` and the models/shapes they define
  (`projects`, `patterns`, `pattern_versions`, `exports`), documented in
  `docs/architecture/data-model.md`.
- **Breaking:** dropping/renaming a table or column, changing a type or nullability
  incompatibly, or adding a non-nullable column without a default. The SQLite test
  connection must keep working, so use `json`, not `jsonb`.
- **Required path:** a forward migration that is reversible (or ships an explicit
  rollback plan in the PR body), an up/down migration test, and an update to the
  data-model doc. These are `risk-high` changes.

## Not (yet) protected

- **No auth contract** — the app is single-user and the API is stateless by design
  (`docs/decisions/0006-single-user-no-auth.md`). This is a deliberate gap until a
  spec adds auth.
- **No published CLI or package** — `@sewcraft/geometry` is `private`; only
  in-repo consumers depend on it.
- **Export formats** (SVG now; PDF/DXF planned) are not yet a stable external
  contract; treat their serializers as internal until a spec freezes them.

## Handling a violation

A PR that breaks a protected surface without the required path above is a
**blocker** in review, quoting the surface and the missing doc/version/migration
step. The way out is to make the contract change explicit — update the
authoritative doc, bump the version, add the migration — not to quietly diverge.

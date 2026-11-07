# Backward compatibility — SewCraft

What this project treats as a protected contract surface, and how a change to one
must be handled. `om-code-review` checks a diff against this file; implementation
skills warn when a change violates it.

The guiding rule from `docs/architecture/standards.md`: where a **contract doc**
defines a rule, that doc wins. The surfaces below are the ones other code, users,
or the geometry package depend on.

## Development-stage exemptions

### 2026-11-07 — pattern schema 0.9 (seam matches and finished edges)

Additive to the model: `Assembly` gains optional `seams` and `finishedEdges`, the
command spec gains `add_seam_match`, `update_seam_match`, `remove_seam_match` and
`set_edge_finished` at 0.22.0, and `split_line` repairs a seam run in place. The
schema string moves to `sewcraft.pattern/0.9`. A 0.8 document loads here with both
arrays absent and no conversion. A build that only knows 0.8 refuses a 0.9
document through the unsupported-format path instead of half-reading it, so keep
the seams on rollback or unsew them deliberately; a 0.8 document with no seams is
unaffected. The sewability report is advisory and never blocks save, autosave,
versioning or export. Details: `.ai/specs/2026-11-07-seams-and-sewability.md` and
`docs/domain/command-spec.md` (Migration from spec 0.21.0).

### 2026-11-06 — pattern schema 0.8 (per-piece placement)

Additive to the model: `Piece` gains optional `placement`, the command spec gains
`place_piece`, and `create_piece` assigns one. The schema string moves to
`sewcraft.pattern/0.8`, and a 0.7 build refuses it through the existing
unsupported-format path even though it would read the geometry; keep the field
on rollback or accept the refusal. Entity coordinates are unchanged, so a 0.7
document loads here and is repacked (placements only) on its first save. The
sketch canvas adds a shared view; piece tabs, assemblies and per-piece export are
unchanged. Details:
`.ai/specs/briefs/2026-11-06-single-sketch-canvas.md` and
`docs/domain/command-spec.md` (Migration from spec 0.20.0).

### 2026-11-04 — project settings: one name

`GET /api/projects/{id}/pattern` no longer returns `name`, and the
`patterns.name` column is dropped. The project's `name` is the only name; the
copy on the pattern could drift after a rename and had no UI of its own. The
migration's `down()` recreates the column from the current project names, so
renames made after the migration cannot be recovered. The command spec is
unchanged. Details: `.ai/specs/2026-11-04-project-settings.md`.

### 2026-10-25 — pattern schema 0.4 (piece tabs and assemblies)

Schema `sewcraft.pattern/0.3` is **not read** by this build. Stored projects and
stored versions are refused with `UnsupportedPatternSchemaError` and the
unsupported-format dialog; they are never migrated, rewritten or overwritten. The
document gains `assemblies` and `tabs`, `Piece` gains `notes`/`fabric`/`color`
and a per-piece allowance override, and the export API becomes
`toSvgPiece(document, piece, options)` for one piece at a time. This is a
deliberate development-stage break, settled with the sole maintainer (D6): old
projects are expected to be recreated. Details:
`.ai/specs/2026-10-25-piece-tabs-and-assemblies.md` and
`docs/domain/command-spec.md` (Migration from spec 0.14.0).

### 2026-10-25 — pattern schema 0.3 (piece containers)

Schema `sewcraft.pattern/0.2` is **not read** by this build. Stored projects are
refused with `UnsupportedPatternSchemaError` and the unsupported-format dialog;
they are never migrated, rewritten or overwritten. Every entity and constraint
now names its `piece`, `role` replaces `construction`, text is a new entity kind,
and the legacy `seams` field and its commands retire. This is a deliberate
development-stage break while the document model is still moving: existing
projects must be recreated, and the protected surface returns once the format is
standardised. Details: `.ai/specs/2026-10-25-piece-containers-and-annotations.md`
(D10) and `docs/domain/command-spec.md` (Migration from spec 0.12.0).

### 2026-11-03 — per-corner allowance (command spec 0.17.0)

No schema bump and no migration: `sewcraft.pattern/0.4` pieces may now carry an
optional `cornerAllowances` array, and `set_piece_corner_allowance` writes it. The
field is additive, but an older build **keeps** it while ignoring it — the
document loads and saves unchanged, and its cut line, area and export render the
inherited width. The downgrade is therefore silent wrong geometry rather than data
loss; keep the array (and disable the UI) on rollback, or rewrite the corner
values deliberately. `tangentStep` defaults to `0`, so only piece cut loops change
join behaviour. Details: `.ai/specs/2026-11-03-per-corner-allowance.md`.

### 2026-10-27 — midpoint constraint (command spec 0.16.0)

No schema bump and no migration: `sewcraft.pattern/0.4` documents may now carry a
`midpoint` constraint, and `add_constraint` accepts it in both forms. An older
build that meets the type fails when reading the constraint rather than rendering
wrong geometry. Roll back by keeping the type and disabling the UI, or by
deliberately rewriting/removing stored midpoint records; do not silently drop the
type. Details: `.ai/specs/2026-10-27-midpoint-constraint.md`.

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

### 5. Stored pattern document schema

- **Surface:** `PatternDocument` as stored in `patterns.geometry` and
  `pattern_versions.geometry`, including its `schema` string and documented in
  `docs/architecture/data-model.md`.
- **Breaking:** changing the meaning of an existing field, or a migration that a
  stored document cannot survive. Schema bumps are expected (the model evolves);
  what matters is that stored documents keep loading.
- **Required path:** a load-time migration in `normalizeDocument`
  (`packages/geometry/src/migration.ts`) that is one-way and idempotent, a tested
  fixture of the previous schema, an update to the data-model doc, and a note here
  for anything more than an additive field.
- **Current state:** `sewcraft.pattern/0.2` adds `pieces` with per-edge
  allowances and the `derived_distance` cut dimension. A 0.1 document is migrated
  on load: closed seam chains become pieces (`kind: 'seam'`, `side` discarded) and
  seams on open chains stay in the deprecated `seams` field for the legacy dashed
  rendering. That field is read-only after load: it renders, but the editor offers
  no way to add, edit, flip or remove a legacy allowance (`add_seam_allowance`,
  `set_seam_allowance` and `remove_seam_allowance` stay valid commands with no UI
  surface), and it is removed in 0.3. A document already at 0.2 is returned
  unchanged.
- Since spec 0.12 the document may carry a `distance` whose `a`/`b` name a
  straight line. The anchor meaning is additive inside `sewcraft.pattern/0.2`
  (no field or migration changes), but a build that predates the feature accepts
  the document and then fails in the solver on the line id — a loud, unsupported
  downgrade, not silent wrong geometry. See
  `.ai/specs/2026-10-23-dimension-point-and-line-anchors.md`.
- Since spec 0.11 the document may carry an optional `defaults.allowance`
  preset copied onto new pieces (`set_default_allowance`). It is additive: a
  document without it resolves the built-in 10 mm seam on load, no existing field
  changes meaning, and no piece's allowances are rewritten. The schema string
  stays `sewcraft.pattern/0.2`.
- Since spec 0.12 a cut anchor's `at` may be `edge` as well as `start`/`end`
  (`add_derived_dimension` with a whole straight edge). It is additive to the
  command spec and leaves the pattern schema at `sewcraft.pattern/0.2`: `0.3` is
  reserved for removing the legacy `seams` field, so this feature must not
  consume it. **Downgrade trade-off:** an older build's `pieceCutVertex` ternary
  reads `at: 'edge'` as `end`, so it renders the wrong vertex and, because the
  document is still an editable 0.2 document, can edit and save that misread.
  The project accepts that risk to ship now; once the reserved 0.3 seam removal
  lands, a later schema can open the document read-only with an upgrade notice.
  Deleting a loop **point** leaves the piece and a cut dimension in place, so the
  dimension renders broken; deleting an anchored edge deletes its piece and
  removes the dimension with it.

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

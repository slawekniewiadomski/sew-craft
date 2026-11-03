# Engineering Standards

The single source of truth for naming, style and process conventions in SewCraft.
`AGENTS.md` and `.ai/skills/sewcraft-conventions/SKILL.md` summarise and link here;
they do not restate these rules.

## Precedence

Where a **contract doc** already defines a rule, that doc wins and this one only
points at it:

| Topic                              | Authoritative doc                    |
| ---------------------------------- | ------------------------------------ |
| Command envelope & lifecycle       | `docs/architecture/command-core.md`  |
| Command + param names & validation | `docs/domain/command-spec.md`        |
| API endpoints, responses, errors   | `docs/architecture/api.md`           |
| Tables, columns, `PatternDocument` | `docs/architecture/data-model.md`    |
| Units, entity semantics, epsilon   | `docs/architecture/geometry-core.md` |
| Vocabulary                         | `docs/domain/glossary.md`            |

This doc is the baseline for anything those do not cover.

## How to read the tags

- **Enforced** — a tool fails (`eslint`, `prettier`, `pint`, `tsc`, `vue-tsc`).
- **Reviewed** — checked in code/spec review; no tool yet.
- **Guidance** — a preference, not a gate.

---

## Naming

### General (Reviewed)

- Spell words out; avoid abbreviations except established geometry names (`x`,
  `y`, `p0`, `a`, `b`) and `id`. `docs/domain/glossary.md` is the authoritative
  vocabulary — prefer its words in code, UI copy and specs.
- Names describe the domain concept, not the mechanism.

### Commands (Enforced by schema + Reviewed)

- Command `type` is `verb_noun` in **snake_case**: `add_point`, `delete_entity`,
  `remove_constraint`. See `docs/domain/command-spec.md`.
- The envelope keys are fixed: `id`, `type`, `params`, `issuedAt`. The UI generates
  `id` as `prefix-sequence-session`, where the tag is unique to the page load: an
  entity id becomes a document id, so a bare counter would collide with the ids a
  reloaded document already stores.
- Param names are `snake_case`. Reference params name the **role**, not the type:
  `start`, `end`, `point`, `edge` — not `start_id`. Constraint tuple params keep
  the solver's names (`a`, `b`, `c`, `point`, `value`).
- Adding a command means updating all three in sync: `config/geometry.php`,
  `docs/domain/command-spec.md`, `docs/domain/command-spec.json`.

### TypeScript files & symbols (Reviewed)

- Files are **kebab-case**: `point-tool.ts`, `use-command-bus.ts`,
  `pattern-document.ts`.
- `.vue` files are **PascalCase** and match the component: `EditorView.vue`,
  `PointTool.vue`.
- Symbols: `camelCase` for functions/variables, `PascalCase` for types, classes
  and components. Module-level constant naming is not mandated — use local
  judgement (`SCREAMING_SNAKE_CASE` only for true fixed constants).
- Prefer named exports over default exports (SFCs are the exception).
- `type` for object shapes; reserve `interface` for declaration merging.

### Vue / frontend (Reviewed)

- Component filenames are PascalCase; single-word names are allowed
  (`vue/multi-word-component-names` is off).
- Composables are `use-*.ts` and export `useXxx` (`use-command-bus.ts` →
  `useCommandBus`).
- Pinia stores are `<name>.ts` and export `use<Name>Store`
  (`stores/editor.ts` → `useEditorStore`).
- Views live in `frontend/src/views/`, shared primitives in
  `frontend/src/components/`, shadcn-vue primitives in
  `frontend/src/components/ui/`.

### API (Reviewed; see `api.md`)

- Paths are plural, kebab-case nouns under `/api`: `/projects`,
  `/pattern-versions`. Sub-resources are plural too (`/projects/{id}/commands`,
  `/patterns/{id}/exports`); model actions as sub-resources, not verbs.
- JSON fields are **snake_case** everywhere — request, response and command
  payloads. There is no camelCase translation layer; frontend types mirror the
  wire shape.
- Query params are snake_case (`page`, `per_page`, `sort`).
- Single resources are wrapped in `{ "data": ... }`; collections add
  `links`/`meta` (Laravel pagination).
- Errors: `422` → `{ "message", "errors": { field: [...] } }`; `404` not found;
  `204` success with no body. Timestamps are ISO-8601 UTC.
- Evolve additively; bump `spec_version` only for breaking contract changes.

### Database (Reviewed)

Laravel-idiomatic, matching `docs/architecture/data-model.md`:

- Tables are plural `snake_case`: `projects`, `pattern_versions`. Pivot tables are
  singular and alphabetical (`pattern_tag`).
- Columns are `snake_case`. Booleans read as predicates (`is_*`/`has_*`).
- Foreign keys are `<singular>_id` (`project_id`), constrained to the referenced
  table with explicit `cascade`/`nullOnDelete`.
- Indexes use the generated names `<table>_<columns>_index` and
  `<table>_<columns>_unique`.
- Models are singular StudlyCase (`PatternVersion`), one per table.
- Migrations: `<timestamp>_create_<table>_table`,
  `<timestamp>_add_<column>_to_<table>_table`,
  `<timestamp>_<verb>_<noun>_table` for structural changes.
- Use `json`, not `jsonb`, while the SQLite test connection must stay unchanged.

---

## Frontend / Vue conventions (Reviewed)

- Directory layout under `frontend/src/`:

  | Path             | Holds                                    |
  | ---------------- | ---------------------------------------- |
  | `components/`    | shared components (PascalCase `.vue`)    |
  | `components/ui/` | shadcn-vue primitives, added via the CLI |
  | `views/`         | route-level components                   |
  | `composables/`   | `use-*.ts` composables                   |
  | `stores/`        | Pinia stores                             |
  | `lib/`           | framework-free helpers (e.g. `cn`)       |
  | `api/`           | typed API clients, one file per resource |
  | `router/`        | route definitions                        |

- SFCs use `<script setup lang="ts">`. Declare props with `defineProps<Type>()`
  and emits with `defineEmits<...>()`.
- Add new shadcn-vue primitives with
  `npx shadcn-vue@latest add <component>`; merge classes with `cn()`.
- Keep geometry math, solving and business rules out of components — they belong
  in `@sewcraft/geometry` or stores/composables.

### Sidebar UI contract (Reviewed)

Every editor sidebar surface uses one scale, one spacing rhythm and one set of
primitives, so a new panel has a pattern to follow instead of inventing classes.
The scale lives in `frontend/src/assets/main.css` as the `--text-2xs` token; the
primitives live in `frontend/src/components/sidebar/`.

| Role                | Classes                                                                                  | Where                                        |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| Panel header        | `text-2xs font-medium tracking-wide text-muted-foreground uppercase`                     | `EditorSidebar` panel title                  |
| Sub-section heading | `text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase`               | `SidebarSection` heading                     |
| Field label         | `text-2xs text-muted-foreground`                                                         | `SidebarField` `dt` and standalone `<label>` |
| Field value         | `text-[13px] font-medium tabular-nums text-foreground`                                   | `SidebarField` `dd` and read-only values     |
| Object title        | `text-[13px] font-semibold`                                                              | Inspector header, piece name                 |
| Metadata            | `font-mono text-2xs text-muted-foreground`                                               | ids, endpoints, source refs                  |
| Secondary sentence  | `text-2xs leading-snug text-muted-foreground`                                            | hints, empty-state text                      |
| Control             | `h-7` (28 px), `rounded-sm`, `text-xs`; `SidebarInput`, `SidebarSelect`, `SidebarButton` | every panel form control                     |

Spacing rhythm — one gutter and one rhythm everywhere, never a per-panel inset:

| Gap                       | Value                                     | Owner                                       |
| ------------------------- | ----------------------------------------- | ------------------------------------------- |
| Panel gutter (left/right) | 12 px `px-3`                              | `EditorSidebar` body, header, `SidebarStat` |
| Body padding (top/bottom) | 12 px `py-3`                              | `EditorSidebar` body                        |
| Between sections          | 12 px `mt-3` + one `border-t` `pt-3` rule | `SidebarSection`                            |
| Heading to section body   | 8 px `mb-2`                               | `SidebarSection` header row                 |
| Between field rows        | 8 px `space-y-2`                          | the panel's `<dl>`/list                     |
| Label to control          | 8 px `gap-2`                              | `SidebarField`                              |

Rules:

- `text-muted-foreground` is only ever a **label or metadata**, never the value
  being read.
- Numbers use `tabular-nums`; the unit is a separate `text-2xs` muted span, never
  part of the number.
- Nothing in the sidebar goes below 11 px (`text-2xs`).
- Ids trail the human label; they are never a row's only distinct token.
- Row actions are always-visible `SidebarAction` icon buttons (28 px) with a
  tooltip and an `aria-label` that match. No action is hover-only.
- `Pill` has one shape and three tones: neutral, accent, danger.
- Empty panels use `SidebarEmpty`, not a bare muted sentence.
- Workspace stats live in the `SidebarStat` status footer, not inside a panel body.
- Panels do not own their gutter: `EditorSidebar` pads the body, so no panel adds
  its own outer padding or a bordered card around its content.
- One heading per level. The panel header names the section; a `SidebarSection`
  heading names a group inside it and never repeats the panel title.
- Low-frequency content (per-edge allowances, derived measurements) sits in a
  `<details>` disclosure rather than expanding the panel by default.
- Sections are rail tabs with one panel visible at a time; the rail carries the
  counts and a chevron collapses the panel. Do not reintroduce stacked drawers.

---

## Testing conventions (Reviewed)

- Runners: **Vitest** for `frontend/` and `packages/geometry/`; **Pest** for the
  Laravel app.
- Vitest test files are colocated with the code as `*.test.ts`
  (`frontend/src/lib/utils.test.ts`).
- Pest tests live in `tests/Unit/` or `tests/Feature/` and use `it(...)` /
  `expect()`.
- Geometry and solver changes need unit tests covering edge cases (tolerance,
  degenerate input), not just the happy path.
- Frontend: test composables, stores and `lib/` logic. Component tests are
  optional; do not add snapshot tests unless the spec asks.
- **Coverage is a hard gate at 100%** (statements, branches, functions and lines)
  for `packages/geometry/src`, `frontend/src` (minus `main.ts` / `*.d.ts`) and
  backend `app/`. Run `npm run test:coverage` and the backend
  `--coverage --min=100` command. Every branch needs a test; do not lower a
  threshold. Prefer removing unreachable code over ignoring it — if a branch is
  genuinely impossible, use an explicit ignore comment with a justification
  (`/* v8 ignore ... */`, `@codeCoverageIgnore`).
- Integration tests live in [`integration/`](../../integration/README.md) and run
  against real containers (Testcontainers) via the Playwright suite. They are not
  part of unit coverage.

---

## Code style

### TypeScript (Enforced)

- Compile with `strict`; both workspaces also enable `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`;
  geometry adds `exactOptionalPropertyTypes` (do not assign `undefined` to
  optional properties explicitly).
- No `any`. Use `unknown` at boundaries and narrow.
- `import type` for type-only imports (`@typescript-eslint/consistent-type-imports`
  is an error).
- Prefer pure functions; keep `@sewcraft/geometry` free of Vue, DOM, network and
  Laravel, and export only via `src/index.ts`.
- `tsc`/`vue-tsc` is the source of truth for types; ESLint owns import/style
  rules, Prettier owns formatting.

### PHP (Enforced)

- PSR-12 via Pint; run `vendor/bin/pint` before reporting done.
- Controllers validate and delegate only; no business logic.

### Comments (Guidance, reviewed)

- Do not comment code that restates itself. Comment only non-obvious intent,
  invariants or why a non-obvious choice was made.
- No `TODO` without an owner/marker the team tracks.

---

## Documentation & spec conventions (Reviewed)

- **Specs** (`.ai/specs/NNN-title.md`) are the unit of work; use the template in
  `.ai/specs/README.md`. One spec per task. The legacy `specs/` directory is kept
  for human reference only — agents read and write `.ai/specs/`.
- **ADRs** live in `docs/decisions/NNNN-title.md` using the format in
  `docs/decisions/README.md`. Settled ADRs are not edited; supersede them with a
  new ADR.
- **Lessons** live in `docs/lessons/YYYY-MM-DD-title.md` using the sections in
  `docs/lessons/README.md`.
- When a **contract** changes (command schema, API, data model, geometry units),
  update its authoritative doc and the related files (e.g. the command 3-way
  sync).
- When a **convention** changes, edit **this file**. Do not duplicate it back
  into `AGENTS.md` or the skill.

---

## Enforcement summary

| Area                          | Tool / mechanism                            |
| ----------------------------- | ------------------------------------------- |
| TS types & strictness         | `tsc`, `vue-tsc` (`npm run typecheck`)      |
| TS imports, unused, Vue rules | ESLint (`npm run lint`)                     |
| Formatting (JS/TS/Vue/MD)     | Prettier (`npm run format`)                 |
| PHP style                     | Pint (`vendor/bin/pint`)                    |
| Commands schema               | `config/geometry.php` + `command-spec.json` |
| Naming / structure (reviewed) | Code review against these standards         |

## Changing these standards

Propose the change here (or in an ADR if it is an architectural decision), update
this file, and keep `AGENTS.md`/the skill as pointers only.

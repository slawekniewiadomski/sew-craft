# Architecture Overview

SewCraft is a three-part system: a **Laravel JSON API**, a **Vue SPA**, and a
**pure TypeScript geometry core**. They are deliberately decoupled so the
geometry can be tested, reused and eventually driven by agents without a browser.

```
┌──────────────────────────────────────────────┐
│  Browser (Vue 3 SPA, frontend/)               │
│                                               │
│  Editor UI ──emits──▶ Command bus ──▶ Store   │
│        ▲                   │             │    │
│        │              @sewcraft/geometry │    │
│        └── render ◀── PatternState ◀─────┘    │
│              (SVG)                            │
└───────────────┬───────────────────────────────┘
                │ HTTPS / JSON (/api/*)
┌───────────────▼───────────────────────────────┐
│  Laravel API (app/)                            │
│  Controllers → validate + delegate             │
│  PatternService / CommandService               │
│  Eloquent models → PostgreSQL                  │
└────────────────────────────────────────────────┘
```

## Responsibilities

| Component           | Owns                                                            | Must not                                |
| ------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `frontend/`         | UI, interactions, viewport, rendering, local editor state       | contain geometry math or business rules |
| `packages/geometry` | entities, constraint solving, units, later export serializers   | import Vue/DOM, do I/O                  |
| `app/` (Laravel)    | persistence, validation, auth (later), export job orchestration | contain geometry math                   |

## Data flow

1. The user interacts with the editor. The UI **does not mutate the pattern
   directly** — it emits a command.
2. The frontend command bus applies the command to the in-memory pattern state via
   `@sewcraft/geometry`, then re-runs the solver.
3. The resulting geometry is rendered as SVG.
4. Commands are persisted (batched) to the API, which stores the canonical pattern
   document and appends a version row.

The same command list can be replayed against a fresh state to rebuild a pattern,
which is what makes undo/redo, collaboration and agent control cheap.

## Why these choices

- **Command core** keeps every mutation serializable, testable and replayable.
  See `docs/decisions/0002-command-core.md`.
- **Framework-agnostic geometry** means the hard math is unit-testable and not
  trapped in a Vue component. See `docs/decisions/0003-geometry-package.md`.
- **Custom constraint solver** gives control over the DOF model and failure
  behaviour. See `docs/decisions/0004-constraint-solver.md`.
- **Separate SPA + API** keeps a future SaaS path open without rewriting the
  backend. See `docs/decisions/0001-spa-api-split.md`.

## Related docs

- `data-model.md` — persistence schema
- `geometry-core.md` — entity model and units
- `constraint-solver.md` — solver contract
- `command-core.md` — command envelope and lifecycle
- `api.md` — HTTP contract
- `export.md` — SVG/PDF/DXF strategy
- `standards.md` — naming, style, frontend and testing conventions

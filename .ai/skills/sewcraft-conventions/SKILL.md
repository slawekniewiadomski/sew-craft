---
name: sewcraft-conventions
description: How to implement a SewCraft spec in this monorepo — project conventions, the command-core rule, geometry-package purity, TypeScript/PHP style, the checks to run, and git/scope discipline. Use for any task in the sew-craft repository, especially implementing a spec from specs/.
---

# SewCraft implementation conventions

Read these before writing code, in order:

1. `AGENTS.md` — the operating guide (stack, layout, architecture rules).
2. The **one** target spec in `specs/` referenced by the task.
3. The architecture docs it links, e.g. `docs/architecture/geometry-core.md`,
   `constraint-solver.md`, `command-core.md`, `api.md`, `export.md`, and
   `docs/domain/command-spec.md`.

## Scope

- Implement **one spec per task**. Do not bundle unrelated changes.
- The acceptance criteria in the spec define done. Tick its checkboxes and update
  its `Status:` line when finished.
- Do **not** commit, push, or open PRs — cezar owns the branch and worktree.
- Update `docs/architecture/*` or `docs/domain/command-spec.md` only if the task
  changes a documented contract.

## Architecture rules (non-negotiable)

- **Commands are the only mutation path.** Every pattern change is a serializable
  command `{ id, type, params }`. UI, API, tests and agents all emit commands;
  nothing mutates the pattern document directly.
- **`@sewcraft/geometry` is pure and framework-agnostic.** No Vue, no DOM, no
  network, no Laravel. Keep it dependency-light and unit-tested; export only via
  `src/index.ts`.
- **No business logic in Laravel controllers.** Controllers validate + delegate.
- **Units are millimetres**, radians for angles, IEEE-754 floats. Display units
  are a frontend concern.

## Code style

- TypeScript: `strict`, `noUncheckedIndexedAccess`, **no `any`**; prefer pure
  functions and `import type`. `exactOptionalPropertyTypes` is on — do not assign
  `undefined` to optional properties explicitly.
- Vue: `<script setup lang="ts">`; formatting is owned by Prettier, not ESLint.
- PHP: PSR-12 via Pint; Pest tests use `it(...)` / `expect()`.
- Do **not** add comments that restate the code. Comment only non-obvious intent.

## Checks (the workflow runs these)

```bash
npm run typecheck    # tsc / vue-tsc for every workspace
npm test             # Vitest for every workspace
npm run lint          # ESLint for every workspace
npm run build         # frontend typecheck + production build
```

Run the geometry package directly while iterating:

```bash
npm test -w @sewcraft/geometry
npm run typecheck -w @sewcraft/geometry
```

## Docker / PHP

Do **not** run `docker compose` from a task worktree: the `app` service has a
fixed container name and binds a `./` mount, so it collides across worktrees. If a
spec requires backend tests, run the one-off form instead:

```bash
docker compose run --rm app php artisan test
```

Most specs (geometry, solver, command core, canvas, export) are frontend/geometry
only and need no Docker.

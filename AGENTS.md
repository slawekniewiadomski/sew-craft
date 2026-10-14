# AGENTS.md

Operating guide for AI agents (and humans) working in the SewCraft repository.
Read this before making changes. Companion docs live in `docs/` and `specs/`.

## What this is

SewCraft is a self-hosted web app for drafting 2D sewing patterns. Users create
projects containing patterns, edit them on a constrained 2D canvas, and export
them (SVG, later PDF and DXF). Inspired by [SolidCraft](https://bherbruck.github.io/solidcraft/):
a command-based core, a parametric sketch/constraint model, and an agent-friendly
interface.

Current state: **early scaffold**. The API, SPA shell, geometry package and
constraint solver exist and are tested; real editing features are specced in
`specs/` but mostly not built yet.

## Stack (locked decisions)

| Area               | Choice                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| Backend            | Laravel 13, PHP 8.4, PostgreSQL 16                                           |
| Frontend           | Vue 3 + Vite + TypeScript, Pinia, Vue Router, Tailwind v4, shadcn-vue        |
| Geometry / solver  | Custom, framework-agnostic TypeScript in `packages/geometry`                 |
| Geometry rendering | SVG (no canvas library)                                                      |
| Testing            | Pest (backend), Vitest (frontend + geometry)                                 |
| Lint/format        | Pint (PHP), ESLint + Prettier (JS/TS)                                        |
| Runtime            | Docker Compose (app + db), npm workspaces for JS                             |
| Auth               | None yet (single-user, self-hosted). API stays stateless so it can be added. |

Rationale is recorded in `docs/decisions/`.

## Repository layout

```
app/                      Laravel application (API only; no Blade SPA)
routes/api.php            REST API routes
config/geometry.php       Command spec exposed at GET /api/commands
database/migrations/      projects, patterns, pattern_versions, exports
frontend/                 Vue 3 SPA (@sewcraft/frontend)
packages/geometry/        @sewcraft/geometry — model, solver, (later) export
docs/architecture/        System design + contracts
docs/domain/              Glossary + command spec (+ JSON schema)
docs/decisions/           Architecture Decision Records (ADRs)
specs/                    Per-feature task specs — the unit of work for agents
ROADMAP.md                Phased plan from MVP to advanced features
```

## Environment

PHP is **not** installed on the host; run all PHP work through Docker. Node 22+
is used on the host for the frontend.

### Commands

```bash
# Full stack (Docker): API on :8000, Vite on :5173, db on :5432
docker compose up -d
docker compose exec app php artisan test      # Pest
docker compose exec app php artisan migrate
docker compose exec app vendor/bin/pint       # PHP format
docker compose down

# One-off command without the stack running
docker compose run --rm app php artisan test

# Frontend / geometry (host, optional — compose already runs Vite)
npm install                          # installs all workspaces
npm run dev                          # Vite dev server on :5173
npm test                             # Vitest for every workspace
npm run lint                         # ESLint for every workspace
npm run build                        # typecheck + production build
npm run format                       # Prettier
```

`docker compose up` starts the API, db **and** the Vite dev server. The host port
is `FRONTEND_PORT` (default `5173`); inside the network Vite proxies `/api` to
`http://app:8000`. When running Vite on the host it proxies to
`http://localhost:8000` (see `frontend/vite.config.ts`).

> Note: inside Docker the API must run via the raw PHP server (see `docker-compose.yml`)
> rather than `php artisan serve`, because `serve` strips non-whitelisted env vars
> from its child process and would fall back to `.env`'s host.

## Architecture rules

1. **Commands are the only mutation path.** Any change to a pattern is expressed
   as a serializable command (`{ id, type, params }`). The API, UI, tests and
   future agents all emit the same commands. See `docs/architecture/command-core.md`.
2. **`@sewcraft/geometry` is pure and framework-agnostic.** No Vue, no DOM, no
   network. It owns the geometry model, the constraint solver and (later) export
   serializers. Keep it dependency-light and unit-tested.
3. **No business logic in controllers.** Controllers validate + delegate. Domain
   logic lives in the geometry package or dedicated service classes.
4. **Units are millimetres**, floating point, throughout. Display units are a
   frontend concern.
5. **Components use `documented conventions`** — see `docs/architecture/*` before
   inventing new patterns. Update the relevant doc when a contract changes.
6. **shadcn-vue components** live under `frontend/src/components/ui`. Add new ones
   with `npx shadcn-vue@latest add <component>` and keep `cn()` for class merging.

## Code conventions

- TypeScript: `strict`, `noUncheckedIndexedAccess`, no `any`. Prefer pure
  functions and `type` imports (`import type`). The geometry package compiles with
  `tsc`; the frontend with `vue-tsc`.
- Vue: `<script setup lang="ts">`, single-word component names allowed. Formatting
  is owned by Prettier, not ESLint.
- PHP: PSR-12 via Pint. Pest tests use `it(...)`/`expect()`.
- Do **not** add comments that restate the code. Comment only non-obvious intent.
- Do **not** commit secrets, `.env`, `vendor/`, or `node_modules/`.

## Agent workflow

1. Pick **one** spec from `specs/`. Do not bundle unrelated features.
2. Read the spec's _Context_ and any linked architecture docs.
3. Implement, then run the checks the spec lists (at minimum `php artisan test`,
   `npm test`, `npm run lint`, `npm run typecheck`).
4. Update the relevant docs (`docs/architecture/*`, `docs/domain/command-spec.md`,
   `AGENTS.md`) if you changed a contract.
5. Report what changed and which commands passed. Do not commit unless asked.

### Definition of done

- [ ] Feature matches the spec's acceptance criteria.
- [ ] Pest and Vitest suites pass; new behavior has tests.
- [ ] `npm run lint` and typecheck pass.
- [ ] Command/API contracts documented if changed.

## Do / Don't

- **Do** keep geometry math in `packages/geometry` with tests.
- **Do** keep the API stateless and version-tolerant (`/api`), so auth and SaaS can
  be added later.
- **Do** prefer reusing mature OSS libraries for formats (DXF, PDF) over writing
  parsers from scratch — see `ROADMAP.md`.
- **Don't** introduce a second state store or bypass the command layer.
- **Don't** couple the geometry package to Laravel, Vue, or a specific renderer.
- **Don't** commit generated artifacts (`dist/`, `public/build/`).
- **Don't** add auth, CI, or deployment config until a spec asks for it.

# SewCraft

A self-hosted web app for drafting 2D sewing patterns. Create projects containing
patterns, edit them on a constrained 2D canvas, and export them (SVG, later PDF
and DXF). Inspired by [SolidCraft](https://bherbruck.github.io/solidcraft/): a
command-based core, a parametric sketch/constraint model, and an agent-friendly
interface.

> **State:** early scaffold. The API, SPA shell, geometry package and constraint
> solver exist and are tested; real editing features are specced in `specs/` but
> mostly not built yet.

## Stack

| Area              | Choice                                                                |
| ----------------- | --------------------------------------------------------------------- |
| Backend           | Laravel 13, PHP 8.4, PostgreSQL 16                                    |
| Frontend          | Vue 3 + Vite + TypeScript, Pinia, Vue Router, Tailwind v4, shadcn-vue |
| Geometry / solver | Custom, framework-agnostic TypeScript in `packages/geometry`          |
| Rendering         | SVG                                                                   |
| Tests             | Pest (backend), Vitest (frontend + geometry)                          |
| Runtime           | Docker Compose (app + db), npm workspaces                             |

## Getting started

```bash
# Starts everything: API (:8000), db (:5432) and the Vite dev server (:5173).
# Migrations run automatically on startup.
docker compose up -d
```

Open http://localhost:5173 (override the host port with `FRONTEND_PORT` in `.env`).

Prefer running the frontend on the host while developing? Stop the `node` service
and use `npm install && npm run dev`; Vite will proxy `/api` to `http://localhost:8000`.

### Common commands

```bash
# Tests
docker compose exec app php artisan test   # Pest
npm test                                   # Vitest (all workspaces)

# Quality
docker compose exec app vendor/bin/pint    # PHP format
npm run lint                               # ESLint
npm run typecheck                          # tsc / vue-tsc
npm run format                             # Prettier
npm run build                              # typecheck + build
```

## Repository layout

```
app/                      Laravel application (API only)
routes/api.php            REST API routes
config/geometry.php       Command spec at GET /api/commands
database/migrations/      projects, patterns, pattern_versions, exports
frontend/                 Vue 3 SPA (@sewcraft/frontend)
packages/geometry/        @sewcraft/geometry — model, solver, exports
docs/architecture/        System design + contracts
docs/domain/              Glossary + command spec
docs/decisions/           Architecture Decision Records
specs/                    Per-feature task specs
ROADMAP.md                Phased plan
```

## Documentation

- [AGENTS.md](./AGENTS.md) — how to work in this repo (start here).
- [docs/architecture/overview.md](./docs/architecture/overview.md) — system design.
- [docs/domain/command-spec.md](./docs/domain/command-spec.md) — command contract.
- [ROADMAP.md](./ROADMAP.md) — phases and specs.

## Principles

1. **Commands are the only mutation path** — UI, API, tests and agents all emit
   the same serializable commands.
2. **`@sewcraft/geometry` is pure** — no Vue, DOM, or network.
3. **Units are millimetres** throughout; display units are a frontend concern.

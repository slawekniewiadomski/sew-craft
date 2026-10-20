# AGENTS.md

Operating guide for AI agents (and humans) working in the SewCraft repository.
Read this before making changes. Companion docs live in `docs/` and `.ai/specs/`.

## What this is

SewCraft is a self-hosted web app for drafting 2D sewing patterns. Users create
projects containing patterns, edit them on a constrained 2D canvas, and export
them (SVG, later PDF and DXF). Inspired by [SolidCraft](https://bherbruck.github.io/solidcraft/):
a command-based core, a parametric sketch/constraint model, and an agent-friendly
interface.

Current state: **early scaffold**. The API, SPA shell, geometry package and
constraint solver exist and are tested; real editing features are specced in
`.ai/specs/` but mostly not built yet.

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
docs/architecture/        System design, contracts + engineering standards
docs/domain/              Glossary + command spec (+ JSON schema)
docs/decisions/           Architecture Decision Records (ADRs)
.ai/specs/                Per-feature task specs — source of truth for agents
specs/                    Legacy human-readable spec reference (do not add new specs)
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
npm run test:coverage                # Vitest + v8 coverage (100% gate)
npm run lint                         # ESLint for every workspace
npm run build                        # typecheck + production build
npm run format                       # Prettier
```

Backend coverage (runs against SQLite in-memory; the `--min=100` flag fails the
run if any metric drops below 100%):

```bash
docker compose run --rm --no-deps -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: \
  app sh -c "composer install --no-interaction && php artisan test --coverage --min=100"
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
5. **Follow documented conventions** — naming, style and structure are defined in
   `docs/architecture/standards.md`; read it before inventing new patterns. Update
   the relevant doc when a contract changes.
6. **shadcn-vue components** live under `frontend/src/components/ui`. Add new ones
   with `npx shadcn-vue@latest add <component>` and keep `cn()` for class merging.

## Code conventions

The full standards — naming (commands, TypeScript, Vue, API, database), frontend
structure, testing, and style — live in
[`docs/architecture/standards.md`](docs/architecture/standards.md). Read it before
writing code. In short: TypeScript is strict, no `any`, `import type`; Vue uses
`<script setup lang="ts">`; PHP is PSR-12 via Pint; comments explain non-obvious
intent only.

Do **not** commit secrets, `.env`, `vendor/`, or `node_modules/`.

## Testing & coverage

**Every new feature must ship with tests that keep coverage at 100%.** This is a
hard gate, not a target:

- **Scope:** all application code — `packages/geometry/src/**`, `frontend/src/**`
  (excluding `main.ts` and `*.d.ts`) and backend `app/**`.
- **Metrics:** statements, branches, functions and lines must all be **100%**.
- **Enforced:** CI fails if any metric drops below 100%. Locally, `npm run
test:coverage` (Vitest, v8) and the backend `--coverage --min=100` command above
  do the same.
- **Rules:** every new branch needs a test that exercises it. Unreachable
  defensive code must not be added; if it is genuinely impossible to hit, mark it
  with an explicit ignore comment (`/* v8 ignore ... */`, `@codeCoverageIgnore`)
  and a short justification — never lower a threshold to make a build pass.
- **Integration tests do not count toward unit coverage.** They live in
  [`integration/`](integration/README.md) and cover cross-stack behaviour through
  the real HTTP API and browser.

## Agent workflow

1. Pick **one** spec from `.ai/specs/`. Do not bundle unrelated features.
2. Read the spec's _Context_ and any linked architecture docs.
3. Implement, then run the checks the spec lists (at minimum `php artisan test`,
   `npm test`, `npm run test:coverage`, `npm run lint`, `npm run format:check`,
   `npm run typecheck`).
4. **Format before committing.** Always run `npm run format` (Prettier with
   `--write`) so `npm run format:check` — and the CI lint job — stays green.
   Never open a PR with unformatted files.
5. Update the relevant docs (`docs/architecture/*`, `docs/domain/command-spec.md`,
   `AGENTS.md`) if you changed a contract.
6. Report what changed and which commands passed. Do not commit unless asked.

### Issue-driven work

When the task comes from a GitHub issue, route it by label — the same way whether
you started it by hand or through the committed `feature-issue` cezar workflow
(`.ai/cezar/workflows/feature-issue.yaml`):

- **`feature`** — deliver it end to end on **one combined PR**: plan (author the
  spec), implement, verify, open the PR, review, fix, then leave a **ready,
  labeled** PR and stop. The spec and the implementation ship on the same branch;
  there is no separate spec-only PR. When the design needs review first, the
  combined PR may start as a **draft spec-only PR**; a human applies `spec-ready`,
  then implementation continues on the same branch. Use `om-auto-create-pr` (the
  workflow's engine) so the spec lands as the first commit.
- **`bug`** — take the bug chain: `om-verify-in-repo` → `om-root-cause` →
  `om-fix` → `om-open-pr` → `om-auto-review-pr`.

**Never merge.** Merging is the maintainer's step (`om-approve-merge-pr`); leave
the PR ready for a human to review and merge.

### Definition of done

- [ ] Feature matches the spec's acceptance criteria.
- [ ] Pest and Vitest suites pass; new behavior has tests.
- [ ] Coverage is **100%** for statements, branches, functions and lines across
      `packages/geometry/src`, `frontend/src` and backend `app/`.
- [ ] `npm run lint`, `npm run format:check` and typecheck pass.
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

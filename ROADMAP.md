# Roadmap

Phased plan from scaffold to a usable drafting tool. Each phase maps to specs in
`specs/`. Dates are intentionally omitted; phases are ordered by dependency.

## Phase 0 — Scaffold ✅

- [x] Laravel 13 + Postgres + Docker; Vue 3 SPA; npm workspaces.
- [x] `@sewcraft/geometry` with vector helpers and a working solver.
- [x] Project CRUD API; `GET /api/commands`.
- [x] Tooling: Pest, Vitest, Pint, ESLint/Prettier; green test suite.
- [x] Docs: architecture, domain, ADRs, specs.

## Phase 1 — Editing foundation

The MVP loop: create geometry, edit it parametrically, persist it.

- [ ] 002 Geometry core primitives (bounds, document helpers).
- [ ] 004 Command core & undo/redo.
- [ ] 005 Canvas editor interactions.
- [ ] 009 Command spec API (persist + version commands).

Milestone: draw a constrained rectangle, undo/redo, reload from the server.

## Phase 2 — Pattern features

- [ ] 006 Construction geometry.
- [ ] 007 Seam allowance.
- [x] Pieces (closed profiles) as a first-class entity, with per-edge allowances
      (`seam` / single / double), derived cut loops, fold lines and read-only cut
      dimensions. Fabric layout and nesting stay deferred to phase 5.
- [ ] 008 SVG export.

Milestone: draft a simple piece with construction lines and seam allowance, export
a true-to-scale SVG.

## Phase 3 — Output & interop

- [ ] 010 PDF tiled export (print at home).
- [ ] 011 DXF export (CAD/plotter).

Milestone: print a tiled pattern and open the DXF in a CAD tool.

## Phase 4 — Agent & automation

- [ ] Agent/MCP interface over the command API.
- [ ] Command recipes / reusable drafting operations.

Milestone: an external agent drafts geometry by emitting commands.

## Phase 5 — Growth (optional)

- [ ] 012 Measurements & sizing / grading.
- [ ] Multi-user + auth (Sanctum), sharing.
- [ ] Fabric layout / nesting.
- [ ] Importers (e.g. Seamly2D), projector mode.

## Guiding principles

- Commands are the only mutation path; the geometry package is pure.
- Reuse mature OSS for formats (PDF, DXF) instead of writing parsers.
- Ship vertical slices; keep the test suite green at every step.

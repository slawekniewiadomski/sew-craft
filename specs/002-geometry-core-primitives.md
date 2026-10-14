# 002 — Geometry core primitives

Status: partial (points + types exist; lines/curves helpers pending)
Depends on: —

## Goal

`@sewcraft/geometry` exposes a typed, tested model for points, lines and curves,
plus vector helpers, with no framework dependencies.

## Context

Read `docs/architecture/geometry-core.md`. This is the data foundation for the
solver, rendering and export.

## Inputs

`packages/geometry` scaffold (`vector.ts`, `types.ts`, `solver.ts`).

## Deliverables

- `PointEntity`, `LineEntity`, `CurveEntity` types and an `Entity` union.
- Vector helpers: add/sub/scale/dot/cross/magnitude/distance/normalize/equals.
- Document helpers:
  - `createEmptyDocument(): PatternDocument`
  - `getEntity(document, id)`
  - `entityPoints(document, entity)` (resolve referenced points)
  - `bounds(document): { min, max }` for viewport/export
- Vitest coverage for vector math and bounds.

## Acceptance criteria

- [ ] All helpers are pure and typed under `strict` + `noUncheckedIndexedAccess`.
- [ ] `bounds` handles empty documents and construction entities.
- [ ] `npm test -w @sewcraft/geometry` passes.

## Out of scope

- Pieces, darts, seam allowance, rendering.

## Checks

```bash
npm run typecheck -w @sewcraft/geometry
npm test -w @sewcraft/geometry
npm run lint -w @sewcraft/geometry
```

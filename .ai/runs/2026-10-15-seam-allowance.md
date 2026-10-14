# Execution plan — seam allowance (issue #8)

Goal: Give each cut edge a real seam allowance — a true geometric offset of the
edge (miter/round joins, self-intersection detection) — attachable and detachable
through the command core, with the command spec synced and 100% coverage.

Source doc: .ai/specs/007-seam-allowance.md

## Scope

- `@sewcraft/geometry`: new `offset.ts` (offset algorithm, self-intersection
  detection, edge flattening, seam-allowance paths) and seam helpers on the
  document.
- Command core: `add_seam_allowance` (per edge, default 10 mm) and
  `remove_seam_allowance`, with inverses and delete cascade.
- Contract sync: `config/geometry.php`, `docs/domain/command-spec.{json,md}`,
  `docs/architecture/geometry-core.md`, `packages/geometry/package.json`,
  `tests/Feature/CommandSpecTest.php`, spec 007.

## Non-goals

- Canvas rendering of allowances and SVG-export layers. Spec 008 (`toSvg` layers)
  is not built; the canvas was just merged, so a UI layer is a follow-up.
- Pieces (spec 006 as referenced) — allowance is modelled per edge.

## Implementation Plan

### Phase 1: Geometry offset core

- 1.1 `offsetPolyline` — signed polyline offset with miter joins (miter-limit
  bevel fallback) and round joins, open and closed.
- 1.2 `findSelfIntersections` — report non-adjacent crossings instead of
  silently emitting a folded path.
- 1.3 `edgePolyline`, `cubicPoint`, `curvePoints`, `seamAllowancePath(s)` and
  export the module from `index.ts`.

### Phase 2: Command and document core

- 2.1 `getSeam` / `seamForEdge` document helpers.
- 2.2 `add_seam_allowance` attaches to a line/curve edge with a default width of
  10 mm; idempotent, rejects duplicate edges, threads the inverse.
- 2.3 `remove_seam_allowance` detaches by seam id; inverse re-attaches with the
  stored edge and width.
- 2.4 `delete_entity` cascades to a seam attached to the deleted edge.

### Phase 3: Contract sync

- 3.1 Three-way spec sync (`config/geometry.php`,
  `docs/domain/command-spec.{json,md}`) and `spec_version` 0.1.0 → 0.2.0.
- 3.2 Bump `packages/geometry/package.json` to 0.2.0, update
  `docs/architecture/geometry-core.md`, tick spec 007 deliverables.

### Phase 4: Integration with updated develop

- 4.1 Re-apply the work onto the current `origin/develop` (now carrying the
  merged construction-geometry and canvas work) and resolve command-file
  conflicts.

### Phase 5: Verification and handoff

- 5.1 Geometry tests green at 100% statements/branches/functions/lines.
- 5.2 Backend `CommandSpecTest` green; full validation gate green.
- 5.3 PR opened with labels and the automated review pass.

## Risks

- `origin/develop` advanced while this work was in progress and touched the same
  command/spec files; the merge must keep construction-geometry commands intact.
- UI rendering and SVG export of allowances remain deferred until spec 008.
- The worktree needs a gitignored `.env` for backend tests.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Geometry offset core

- [ ] 1.1 `offsetPolyline` — signed polyline offset with miter joins (miter-limit bevel fallback) and round joins, open and closed.
- [ ] 1.2 `findSelfIntersections` — report non-adjacent crossings instead of silently emitting a folded path.
- [ ] 1.3 `edgePolyline`, `cubicPoint`, `curvePoints`, `seamAllowancePath(s)` and export the module from `index.ts`.

### Phase 2: Command and document core

- [ ] 2.1 `getSeam` / `seamForEdge` document helpers.
- [ ] 2.2 `add_seam_allowance` attaches to a line/curve edge with a default width of 10 mm; idempotent, rejects duplicate edges, threads the inverse.
- [ ] 2.3 `remove_seam_allowance` detaches by seam id; inverse re-attaches with the stored edge and width.
- [ ] 2.4 `delete_entity` cascades to a seam attached to the deleted edge.

### Phase 3: Contract sync

- [ ] 3.1 Three-way spec sync (`config/geometry.php`, `docs/domain/command-spec.{json,md}`) and `spec_version` 0.1.0 → 0.2.0.
- [ ] 3.2 Bump `packages/geometry/package.json` to 0.2.0, update `docs/architecture/geometry-core.md`, tick spec 007 deliverables.

### Phase 4: Integration with updated develop

- [ ] 4.1 Re-apply the work onto the current `origin/develop` (now carrying the merged construction-geometry and canvas work) and resolve command-file conflicts.

### Phase 5: Verification and handoff

- [ ] 5.1 Geometry tests green at 100% statements/branches/functions/lines.
- [ ] 5.2 Backend `CommandSpecTest` green; full validation gate green.
- [ ] 5.3 PR opened with labels and the automated review pass.

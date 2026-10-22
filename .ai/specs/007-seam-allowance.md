# 007 — Seam allowance

Status: superseded by
[2026-10-22-pieces-and-allowance.md](./2026-10-22-pieces-and-allowance.md).
The per-edge `Seam` is now the legacy path for edges outside a piece; a piece owns
its loop allowances (`seam` / `single` / `double`) and derives the cut loop and
fold lines. This file is kept for history.
Depends on: 006 (pieces), 008

## Goal

Each piece edge can carry a seam allowance width; the allowance is generated as a
true offset and shown/exported separately from the stitch line.

## Context

Read `docs/domain/glossary.md` (seam allowance) and `export.md`. Home sewists
expect seam allowance; professionals often want none.

## Inputs

Entity model, `add_seam_allowance` command, SVG renderer.

## Deliverables

- [x] Offset algorithm for lines and curves (miter/round joins at corners) in
      `@sewcraft/geometry`, with tests for convex/concave corners.
- [x] Per-edge width (default 10 mm), attachable/detachable.
- [x] Rendering as its own layer/style. (dashed offset layer on the canvas)
- [ ] Included in SVG export as a separate group. (needs 008)

## Acceptance criteria

- [x] Offset path is correct at corners and for small widths.
- [x] Self-intersections are detected and reported, not silently wrong.
- [x] Toggle allowance on/off in the UI.
- [ ] Toggle allowance on/off in the export. (export needs 008)

## Implementation notes

- `@sewcraft/geometry` `offset.ts`: `offsetPolyline` (signed offset, miter with
  `miterLimit` bevel fallback, round joins), `findSelfIntersections`,
  `edgePolyline`, `seamAllowancePath(s)`, `cubicPoint`, `curvePoints`.
- Command core: `add_seam_allowance` now attaches to a `line`/`curve` edge
  (`{ edge, width? }`, width defaults to 10 mm); `remove_seam_allowance` detaches
  it; `delete_entity` cascades to seams on the deleted edge. Command spec bumped
  to `0.2.0` (`piece` param removed — the v0.1 model had no `piece`).
- The document stores `seams: Seam[]` per edge; pieces are not modelled yet, so
  the allowance is per edge rather than per piece. When pieces land (spec 006), a
  `piece` param can be added back additively.
- Editor: `PatternCanvas.vue` renders `seamAllowancePaths(document)` as a dashed,
  pointer-transparent layer (self-intersecting offsets in the destructive style)
  with a `showSeamAllowance` presentation toggle; `EditorView.vue` exposes a
  per-edge width input (default 10 mm) plus attach/detach buttons that dispatch
  `add_seam_allowance` / `remove_seam_allowance` through the command bus.
- The 100% coverage gate is met for the new geometry and frontend code.

## Out of scope

- Facing/lining generation, notch placement.

## Checks

```bash
npm test -w @sewcraft/geometry && npm run lint
```

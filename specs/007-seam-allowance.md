# 007 — Seam allowance

Status: todo
Depends on: 006 (pieces needed for real allowance), 008

## Goal

Each piece edge can carry a seam allowance width; the allowance is generated as a
true offset and shown/exported separately from the stitch line.

## Context

Read `docs/domain/glossary.md` (seam allowance) and `export.md`. Home sewists
expect seam allowance; professionals often want none.

## Inputs

Entity model, `add_seam_allowance` command, SVG renderer.

## Deliverables

- Offset algorithm for lines and curves (miter/round joins at corners) in
  `@sewcraft/geometry`, with tests for convex/concave corners.
- Per-edge width (default 10 mm), attachable/detachable.
- Rendering as its own layer/style.
- Included in SVG export as a separate group.

## Acceptance criteria

- [ ] Offset path is correct at corners and for small widths.
- [ ] Self-intersections are detected and reported, not silently wrong.
- [ ] Toggle allowance on/off in UI and export.

## Out of scope

- Facing/lining generation, notch placement.

## Checks

```bash
npm test -w @sewcraft/geometry && npm run lint
```

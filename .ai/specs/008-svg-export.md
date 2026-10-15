# 008 — SVG export

Status: done
Depends on: 005

## Goal

Export the current pattern to a true-to-scale SVG in millimetres, with layers for
cut edges, seam allowance and construction.

## Context

Read `docs/architecture/export.md`. SVG is both the on-screen format and the first
export target.

## Inputs

`PatternDocument`, existing canvas rendering.

## Deliverables

- `toSvg(document, options): string` in `@sewcraft/geometry` (pure, no DOM).
- Layers: `cut` (always), `seam-allowance`, `construction` (optional, off by
  default).
- `width`/`height` in `mm`, `viewBox` in pattern coordinates, metadata comment
  with schema version.
- Download action in the UI; optional persisted `exports` row via the API.

## Acceptance criteria

- [x] Output opens in a browser and measures correctly at 100%.
- [x] Construction omitted by default; cut edges always present.
- [x] Structural tests (bounds, layer separation) pass.

## Out of scope

- PDF and DXF (see 010/011), tiling.

## Checks

```bash
npm test -w @sewcraft/geometry && npm run lint
```

# 006 — Construction geometry

Status: done
Depends on: 005

## Goal

Users can create reference-only points and lines that guide drafting but are never
cut or exported as pattern edges.

## Context

Read `docs/architecture/geometry-core.md`. Construction geometry is how patterns
are actually drafted before truing the final edges.

## Inputs

Entity model, command spec (`add_construction_line`, `construction` flag),
canvas (005).

## Deliverables

- Distinct rendering (dashed/muted) for construction entities.
- Toggle to show/hide construction geometry.
- Conversion actions: make construction ↔ cut edge.
- Commands + tests for creation and toggling.

## Acceptance criteria

- [x] Construction entities excluded from cut-edge/export sets.
- [x] Toggle does not alter geometry, only presentation.
- [x] Commands are reversible.

## Out of scope

- Automatic construction recipes (e.g. bisectors); manual only for now.

## Checks

```bash
npm test && npm run lint
```

# 011 — DXF export

Status: stub (specify before implementing)
Depends on: 008

## Goal

Export patterns to DXF for CAD tools and plotters/projectors.

## Context

Read `docs/architecture/export.md`. DXF is the professional interchange format.

## Decisions to make (write an ADR)

- Library: `@tarikjabiri/dxf` vs `dxf-writer`.
- Entity mapping: lines/curves → `LWPOLYLINE`/`SPLINE`.
- Layers: cut, seam allowance, construction, grainline, notches.
- Output units (`$INSUNITS` in ACI units, mm).

## Deliverables

- `toDxf(document, options): string` serializer with layer mapping.
- Layer + units documented; round-trip test through a DXF parser if adopted.

## Acceptance criteria

- [ ] Opens in at least one common CAD/pattern tool with correct scale.
- [ ] Layers present and named.
- [ ] Units declared as millimetres.

## Out of scope

- PLT/HPGL plotting, plotter-specific optimisation.

## Checks

```bash
npm test -w @sewcraft/geometry && npm run lint
```

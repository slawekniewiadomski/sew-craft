# 010 — PDF tiled export

Status: stub (specify before implementing)
Depends on: 008, 007

## Goal

Produce a printable PDF of a pattern, tiled across A4/Letter pages at 1:1 scale
with overlap and registration marks.

## Context

Read `docs/architecture/export.md`. Home sewists print and tape pages together.

## Decisions to make (write an ADR)

- Library: `pdf-lib` vs `svg-to-pdfkit` vs server-side PDF.
- Client-side vs queued server job (large patterns in a worker).
- Paper size, margins, overlap, and registration mark style.
- Cut line vs stitch line pages.

## Deliverables

- Tiler: split pattern bounds into pages with shared overlap.
- Overview page with grid, page index and a legend.
- Export job + `exports` row; download flow.

## Acceptance criteria

- [ ] A 1 m line measures 1 m when printed at 100%.
- [ ] Page seams align using registration marks.
- [ ] Page count and units asserted in tests.

## Out of scope

- Colour/cut charts, projector mode.

## Checks

```bash
docker compose exec app php artisan test
npm test
```

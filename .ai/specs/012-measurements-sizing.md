# 012 — Measurements & sizing

Status: stub (deliberately deferred; may be revisited)
Depends on: 004

## Goal

Optionally drive dimensions from named measurements and produce a graded range of
sizes from one pattern.

## Context

Read `docs/decisions/0004-constraint-solver.md` and `docs/domain/glossary.md`
(grading). v0.1 deliberately uses plain numeric dimensions. This spec captures the
later, optional path so the model leaves room for it.

## Decisions to make (write an ADR before any code)

- Named measurements vs formulas/expressions.
- Sizing tables (e.g. chest/waist/hip) and how they map to constraints.
- Grading strategy: rule-based point offsets vs re-solving from a size table.
- Storage: per-project measurement set + size variants.

## Deliverables (if pursued)

- `measurements` table + API; named values usable where a numeric `value` is used.
- Expression evaluation in `@sewcraft/geometry` (pure, deterministic).
- Grade command producing derived pattern versions per size.

## Acceptance criteria

- [ ] Editing a measurement updates every dependent dimension.
- [ ] Every constrained document still solves deterministically.
- [ ] Existing numeric documents remain valid (backwards compatible).

## Out of scope until then

- Any UI, storage or command changes for measurements.

## Checks

```bash
npm test && docker compose exec app php artisan test
```

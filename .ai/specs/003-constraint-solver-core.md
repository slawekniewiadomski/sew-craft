# 003 — Constraint solver core

Status: done (core set); extensions listed under "Out of scope"
Depends on: 002

## Goal

Given points and constraints, `solve()` returns coordinates satisfying all
constraints (within tolerance) while staying near the input, and reports whether
it converged.

## Context

Read `docs/architecture/constraint-solver.md`. This unblocks the editor's
parametric behaviour.

## Inputs

`packages/geometry/src/solver.ts` (Levenberg–Marquardt + numerical Jacobian).

## Deliverables

- Constraint types: `coincident`, `horizontal`, `vertical`, `point_on_line`,
  `distance`, `angle`, `equal`.
- `solve(points, constraints, options?)` returning `SolveResult`.
- Throws on unknown entity references; never mutates inputs.
- Vitest: one test per constraint, convergence, residual tolerance, error case.

## Acceptance criteria

- [x] All v0.1 constraints enforced (see tests).
- [x] `converged` reflects residual vs tolerance.
- [x] Non-converged systems return the best state instead of throwing.
- [x] `npm test -w @sewcraft/geometry` passes.

## Out of scope

- parallel, perpendicular, tangent, symmetry, radius, point-on-circle.
- DOF analysis / over-constrained diagnostics.
- Named measurements (see 012).

## Checks

```bash
npm test -w @sewcraft/geometry
npm run typecheck -w @sewcraft/geometry
```

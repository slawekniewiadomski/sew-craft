# ADR-0004: Custom TypeScript constraint solver

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Parametric patterns need geometric constraints. Options ranged from
measurement/formula-driving to a full CAD constraint solver. A robust GCS is a
large undertaking; we need one we control and can ship incrementally.

## Decision

Write a small constraint solver in `@sewcraft/geometry` using
Levenberg–Marquardt least-squares with a numerical Jacobian, starting from a small
core constraint set (coincident, horizontal, vertical, point-on-line, distance,
angle, equal).

## Consequences

- Full control over DOF/failure behaviour; no C++/WASM toolchain.
- We own robustness; large or ill-conditioned systems may need tuning later.
- Numerical Jacobian keeps additions cheap but costs some performance; fine for
  pattern-sized sketches.

## Alternatives considered

- **planegcs (FreeCAD) via WASM:** battle-tested but heavy integration and
  toolchain risk.
- **Reuse JSketcher / solve2d:** faster start, less tailored, uncertain maintenance.
- **Expressions/measurements first:** simpler, but explicitly not what we chose;
  may still arrive later for grading.

## Revisit when

Solver performance or robustness becomes a bottleneck, or the constraint set grows
large enough that numeric Jacobians are too slow.

# Constraint Solver

Located in `packages/geometry/src/solver.ts`. It turns a set of points plus
constraints into coordinates that satisfy every constraint while staying as close
as possible to the input.

## Approach

Levenberg–Marquardt least-squares over the constraint residuals, with a numerical
Jacobian (central finite differences). For the small systems a pattern produces
this is fast and robust, and it avoids hand-deriving Jacobians per constraint.

```
minimise  || r(x) ||²        r = stacked constraint residuals, x = point coords
step:     (JᵀJ + λI) Δ = −Jᵀr
accept    if ||r(x+Δ)|| < ||r(x)||, else increase λ
```

- Fixed points are removed from `x`; they still appear in residuals.
- Damping `λ` starts at `1e-3`, shrinks on success, grows on failure, and bails at
  `1e12` (returns whatever it has, `converged: false`).
- Because of the damping, under-constrained systems settle to the nearest solution
  rather than drifting — desirable for interactive editing.

## v0.1 constraint set

| Type            | Params                 | Residuals                                 |
| --------------- | ---------------------- | ----------------------------------------- |
| `coincident`    | `a`, `b`               | `ax−bx`, `ay−by` (2)                      |
| `horizontal`    | `a`, `b`               | `ay−by`                                   |
| `vertical`      | `a`, `b`               | `ax−bx`                                   |
| `point_on_line` | `point`, `a`, `b`      | signed distance from `point` to line `ab` |
| `distance`      | `a`, `b`, `value`      | `‖b−a‖ − value`                           |
| `angle`         | `a`, `b`, `c`, `value` | signed angle `∠abc − value`               |
| `equal`         | `a1,a2,b1,b2`          | `‖a2−a1‖ − ‖b2−b1‖`                       |

Further types (parallel, perpendicular, tangent, symmetry, radius, point-on-circle)
are deferred; see `specs/003-constraint-solver-core.md`.

## Degrees of freedom

A sketch is:

- **well-constrained** when residual count ≈ DOF and the solver converges to a
  unique solution,
- **under-constrained** when DOF remain; the solver still returns a solution but it
  may move under further edits,
- **over-constrained / inconsistent** when residuals cannot all reach zero; the
  solver returns `converged: false`.

The MVP surfaces `converged` to the UI; richer DOF analysis is a later task.

## Contract

```ts
interface SolveOptions {
  maxIterations?: number; // default 100
  tolerance?: number; // default 1e-9
  initialDamping?: number; // default 1e-3
}

interface SolveResult {
  converged: boolean;
  iterations: number;
  residualNorm: number;
  coordinates: Map<EntityId, Vec2>;
}

function solve(
  points: PointEntity[],
  constraints: Constraint[],
  options?: SolveOptions,
): SolveResult;
```

`solve` throws if a constraint references an unknown point id. It is a pure
function: inputs are not mutated.

## Failure UX

When `converged` is `false` the UI must keep the last good geometry and highlight
the offending constraints; it must never persist a non-converged document.

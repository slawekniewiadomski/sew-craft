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

| Type            | Params                             | Residuals                                   |
| --------------- | ---------------------------------- | ------------------------------------------- |
| `coincident`    | `a`, `b`                           | `ax−bx`, `ay−by` (2)                        |
| `horizontal`    | `a`, `b`                           | `ay−by`                                     |
| `vertical`      | `a`, `b`                           | `ax−bx`                                     |
| `point_on_line` | `point`, `a`, `b`                  | signed distance from `point` to line `ab`   |
| `distance`      | `a`, `b`, `value?`, `orientation?` | `aligned`: `‖b−a‖ − value`; `horizontal`: ` | bx−ax | − value`; `vertical`: ` | by−ay | − value` |
| `angle`         | `a`, `b`, `c`, `value`             | signed angle `∠abc − value`                 |
| `equal`         | `a1,a2,b1,b2`                      | `‖a2−a1‖ − ‖b2−b1‖`                         |

A `distance` constraint doubles as a linear dimension: its optional
`orientation` (`aligned` default, or `horizontal`/`vertical`) selects which span
the solver drives, and its optional `offset` is presentation only — it moves the
rendered dimension line away from the measured span without changing the
residual. An absent `value` makes the dimension **driven**: it measures the span
and contributes no residual, so a document containing only driven dimensions is
already converged. See `specs/014-linear-dimensions.md` and
`.ai/specs/2026-10-20-driven-and-set-dimensions.md`.

Each `a`/`b` anchor is a point **or a straight line**. `solve` takes an optional
fourth `entities` argument (`solveDocument` passes `document.entities`): a line
anchor reads its two endpoints from that list. Point → line drives
`|cross(dir, p − start) / ‖dir‖ − value|`, normalizing the anchor order; line →
line canonicalizes by entity id and drives the perpendicular from the first
midpoint to the second line. A line anchor is always aligned (its stored
`orientation` is ignored), and a line with a degenerate endpoint pair skips its
residual instead of producing `NaN`. A line anchor supplied without `entities`
is an unknown point, a missing endpoint is a clear error, and a curve/arc/circle
anchor is rejected up front. See
`.ai/specs/2026-10-23-dimension-point-and-line-anchors.md`.

A corner round re-points each trimmed line from the sharp corner to a derived
tangent, which is fixed. `solve` therefore takes an optional fifth
`supportAnchors` map (tangent point → sharp corner) and resolves a line
endpoint through it before reading the anchor; `solveDocument` builds that map
from `document.cornerRounds`. The tangent, the corner and the far endpoint stay
collinear, so the supporting line — and the measured perpendicular — is
unchanged, while the constraint keeps a movable point to act on.

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
  entities?: readonly Entity[],
  supportAnchors?: ReadonlyMap<EntityId, EntityId>,
): SolveResult;
```

`solve` throws if a constraint references an unknown point id. It is a pure
function: inputs are not mutated.

## Failure UX

When `converged` is `false` the UI must keep the last good geometry and highlight
the offending constraints; it must never persist a non-converged document.

# Geometry Core (`@sewcraft/geometry`)

Framework-agnostic TypeScript package owning the pattern model, the constraint
solver and (later) export serializers. No Vue, no DOM, no network, no Laravel.

## Units and precision

- All lengths are **millimetres**, stored as IEEE-754 doubles.
- Angles are **radians**, counter-clockwise positive.
- Solver tolerance defaults to `1e-9`; UI snapping is a frontend concern.
- Comparisons use an epsilon, never `===` on floats.

## Coordinate system

Right-handed 2D, `+x` right, `+y` **down** (screen convention) so SVG needs no
flip. Pattern drafting origin is per-piece; a global origin is not assumed.

## Entities

| Kind     | References               | Notes                                                         |
| -------- | ------------------------ | ------------------------------------------------------------- |
| `point`  | —                        | the only solver variable in v0.1                              |
| `line`   | two points               | straight segment / edge                                       |
| `curve`  | four points              | cubic Bézier (p0, p1, p2, p3)                                 |
| `circle` | a centre and a rim point | true circle; the radius is their distance and is never stored |

Every entity has an `id` (string) and a `construction: boolean`. Construction
geometry is drawn as a guide and is **never** part of a cut edge or export.

### Points

```ts
interface PointEntity {
  id: string;
  kind: 'point';
  x: number;
  y: number;
  construction: boolean;
  fixed: boolean; // excluded from the solver variable vector
}
```

`fixed` points act as anchors. At least one fixed point is needed for a
non-translating solution.

## Later entities (specced, not built)

- `piece` — a closed profile referencing an ordered list of edges. Seam
  allowance is already modelled per edge (see above); `piece` will group those
  edges. Not built yet.
- `dart` — first-class construction element.
- `grainline`, `notch`, `label` — annotations attached to pieces.

## Document

A `PatternDocument` is the versioned JSON container persisted in
`patterns.geometry` (see `data-model.md`). It carries the schema tag
(`PATTERN_SCHEMA`), `units: 'mm'`, and the `entities`, `constraints` and `seams`
arrays. Document helpers in `document.ts`:

- `createEmptyDocument()` — a valid empty document.
- `getEntity(document, id)` — entity by id, or `undefined`.
- `getConstraint(document, id)` — constraint by id, or `undefined`.
- `allPoints(document)` — every `point` entity, construction included.
- `cutEdges(document)` — every line/curve/circle that is part of the cut pattern
  (i.e. not construction geometry); the source for cut-edge layers and exports.
- `entityPoints(document, entity)` — the point entities an entity references, in
  order (a circle resolves to centre then rim); throws when a reference is
  missing or is not a point.
- `constraintEntityIds(constraint)` — the point ids a constraint references, in
  semantic order (shared by the solver and the command core).
- `bounds(document)` — axis-aligned `{ min, max }` over all points (construction
  included), widened by each circle's radius, or `null` for a point-less
  document.
- `getSeam(document, id)` / `seamForEdge(document, edge)` — look up a seam
  allowance by its own id or by the edge it is attached to.
- `cornerRounds(document)` — the optional corner-round features, defaulting to
  `[]` for documents written before the feature existed.
- `allPoints`, `cutEdges` and `bounds` include derived tangent and control points
  like any other point; the frontend filters them out of the drafting layer.

## Linear dimensions (`dimension.ts`)

A linear dimension is not an entity: it is the CAD rendering of a `distance`
constraint (see `constraint-solver.md`). A dimension has one of four states:

- **Set** — the constraint has a literal `value`; the solver drives the span.
- **Driven** — no `value` and no `reference`; it measures the sketch and adds no
  solver residual.
- **Referenced** — a `reference` names another distance constraint that resolves;
  its effective value is derived from that source.
- **Broken** — a `reference` is recorded but its source is missing, driven or
  otherwise unresolvable. The last known reading is shown, but no residual is
  added.

The pure helpers in `dimension.ts` compute state and rendering for the frontend:

- `dimensionGeometry(document, constraint)` — extension lines, dimension line,
  end chevrons and a rotated value label for a `distance` constraint, or `null`
  when its points are missing. Honors `orientation` and `offset`
  (`DEFAULT_DIMENSION_OFFSET` is `20` mm).
- `measureLinearDimension(document, a, b, orientation)` — the span the constraint
  would drive, or `null` when a point is missing.
- `dimensionState(document, constraint)` — one of `set`, `driven`, `referenced`
  or `broken`.
- `isDrivenDimension(constraint)` — true only when the constraint has neither a
  `value` nor a `reference`.
- `isReferencedDimension(document, constraint)` / `isBrokenDimension(document,
constraint)` — the resolved state without overloading "driven".
- `dimensionValue(document, constraint)` — the resolved effective value: the
  literal value, the source's resolved value, the live measurement for a driven
  dimension, or the last known reading for a broken one; `null` when nothing can
  be resolved.
- `referenceCandidates(document, constraint)` / `createsReferenceCycle(...)` —
  the eligible sources for a picker and the cycle guard used by commands.
- `inferDimensionOrientation(document, a, b, pointer)` — pick the axis from a
  pointer position while placing a dimension.
- `dimensionOffsetForPointer(document, a, b, orientation, pointer)` — the signed
  offset from the span to a pointer, used while dragging a dimension line.
- `findDistanceConstraint(document, a, b)` — the existing distance between two
  points (unordered), so the UI can reuse rather than duplicate it.
- `constraintOrientation(constraint)` / `constraintOffset(constraint)` — the
  effective presentation values, applying the defaults.

## Seam allowance (`offset.ts`)

A seam allowance is a per-edge offset stored on the document as
`Seam { id, edge, width, side? }`. `width` is millimetres; the default when a
command omits it is `10` (`DEFAULT_SEAM_ALLOWANCE`). `side` is `'left'` or
`'right'` relative to the edge's start→end direction; `seamSide(seam)` resolves
an omitted side to `'left'`, which is how documents written before sides existed
keep rendering. Only line and curve edges can carry one, and at most one seam per
edge; a circle has no direction for a closed offset, so `add_seam_allowance`
rejects one with "seam allowances need a line or curve edge".

The offset is produced by pure functions:

- `offsetPolyline(points, distance, options?)` — offset a polyline by a signed
  distance (positive = left of travel). `options.join` is `'miter'` (default,
  with a `miterLimit` bevel fallback) or `'round'`; `options.closed` joins the
  last vertex back to the first.
- `findSelfIntersections(path, options?)` — non-adjacent segment crossings of an
  offset path, reported (not hidden) so a folded allowance can be flagged.
- `edgePolyline(document, edge, segments?)` — flatten a line (two points) or
  cubic Bézier (sampled) edge to a polyline.
- `seamAllowancePath(document, seam, options?)` / `seamAllowancePaths(document, options?)`
  — the offset `path` plus its `side` and `selfIntersections`, or `null` for an
  edge that is missing or is a point. The offset distance is `+width` for a
  `left` seam and `-width` for a `right` seam; the width itself stays positive.
- `cubicPoint` / `curvePoints` — cubic Bézier evaluation and flattening.

The editor renders `seamAllowancePaths(document)` as a dashed, pointer-transparent
layer (self-intersecting offsets use the destructive style) and exposes a per-edge
width input (default 10 mm) plus a show/hide presentation toggle; neither changes
the document.

Seam allowance offsetting depends on the entity model only (edges), not on
`piece`. When pieces are modelled (see below), `piece` becomes a grouping for the
edges and their allowances.

## Corner rounds (`corner-round.ts`)

A **corner round** (fillet) replaces a sharp corner between two lines with a
tangent arc and trims both lines to their tangent points. It is a live
parametric feature, not a static bake: the document stores the sharp corner, both
line anchors and the radius, and the derived geometry is recomputed after every
solve.

```ts
interface CornerRoundEnd {
  line: EntityId; // the selected line, trimmed at the shared corner
  anchor: EntityId; // the original point at the line's opposite end
  tangent: EntityId; // the derived point where the line becomes the arc
}

interface CornerRound {
  id: EntityId;
  corner: EntityId; // the sharp corner, kept as a construction point
  ends: [CornerRoundEnd, CornerRoundEnd];
  radius: number; // millimetres
  arc: EntityId; // derived cubic Bézier (cut edge)
  controls: [EntityId, EntityId]; // derived Bézier control points
  cornerConstruction: boolean; // the corner's flag before the round
}
```

`PatternDocument.cornerRounds` is optional so documents written before the
feature load unchanged. A line may carry one round at each end; a sharp corner
may carry at most one. Derived ids are deterministic from the command id:
`<id>:a`, `<id>:b` (tangent points), `<id>:c1`, `<id>:c2` (controls) and
`<id>:arc`.

### Math

With `uA` and `uB` the unit directions from the sharp corner to the two
opposite anchors, `θ` the interior angle, and `r` the radius:

- Reject `θ` within 1° of 0° (spike) or 180° (straight).
- Tangent distance `t = r / tan(θ / 2)`; tangent points
  `T_A = corner + uA·t`, `T_B = corner + uB·t`.
- Control distance `k = (4/3)·tan((π − θ)/4)·r`; controls
  `P1 = T_A − uA·k`, `P2 = T_B − uB·k`.
- The arc is the cubic `T_A, P1, P2, T_B`. Its error against a true circle is
  below ~0.03 % of the radius, far under a sewing tolerance.

### Helpers

- `cornerRoundsForEntity(document, id)` — every feature that references a line,
  arc, tangent, control, sharp corner or anchor.
- `isCornerRoundDerived(document, id)` — true for an arc, tangent or control
  point; used by command validation and the canvas.
- `cornerRoundGeometry(document, corner, anchorA, anchorB, radius)` — the pure
  tangent/control math plus a validation error for a spike, a straight corner,
  a missing point or an invalid radius.
- `maxCornerRadius(document, round)` — the largest radius that still leaves
  `MIN_CORNER_ROUND` (0.001 mm) of every selected line, including any round at
  the opposite end of either line.
- `regenerateCornerRounds(document)` — recompute every feature's derived points,
  arc and line endpoints. Throws `CommandValidationError` when a feature can no
  longer be built, before mutating anything. Runs at the end of
  `solveDocument`.
- `normalizeCornerRounds(document)` — validate loaded features without moving
  geometry; a feature whose invariants no longer hold is dropped and its
  persisted entities stay as static geometry. Never throws. The frontend load
  path calls it once.

### Commands

`add_corner_round { first, second, radius }` validates two distinct lines that
share exactly one point, matching construction flags, no seam allowance, no
existing round at that corner, no third same-kind edge, and a radius that fits.
`set_corner_round_radius { id, radius }` applies the same fit rules and
regenerates; `remove_corner_round { id }` restores both lines and the sharp
corner's construction flag and deletes the derived entities. See
`docs/domain/command-spec.md` for payloads and inverses.

Seam allowances on rounded lines are rejected in v1: a straight offset would
stop at the tangent point and leave a gap around the arc.

## Public API

```ts
import {
  solve,
  distance,
  offsetPolyline,
  seamAllowancePaths,
  createEmptyDocument,
  getEntity,
  entityPoints,
  bounds,
  applyCommand,
  executeCommand,
  solveDocument,
  toSvg,
  dimensionGeometry,
  findDistanceConstraint,
  cornerRounds,
  cornerRoundGeometry,
  normalizeCornerRounds,
  type Command,
  type PointEntity,
  type Constraint,
} from '@sewcraft/geometry';

// Seam allowance: offset each seam edge and report any self-crossings.
const allowances = seamAllowancePaths(document, { join: 'miter' });

const result = solve(points, constraints);
result.converged; // boolean
result.coordinates; // Map<EntityId, Vec2>

// Commands are the only mutation path (see command-core.md).
const { document, inverse } = applyCommand(document, command);
const executed = executeCommand(document, command); // applies + solves, or throws

// Export is a pure serializer; see export.md.
const svg = toSvg(document, { construction: false });
```

Keep the public surface small and typed. New exports go through `src/index.ts`.

## Rendering

The geometry package does **not** render to screen. The frontend maps entities to
SVG (`path`, `line`, `polygon`) and controls styling, hit-testing and viewport.
Exports (SVG/PDF/DXF) are serializers that consume the same document; the SVG
serializer (`toSvg`, see `export.md`) is the first of these.

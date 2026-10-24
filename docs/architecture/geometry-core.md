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

| Kind     | References               | Notes                                                                                                                    |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `point`  | —                        | the only solver variable in v0.1                                                                                         |
| `line`   | two points               | straight segment / edge                                                                                                  |
| `curve`  | four points              | cubic Bézier (p0, p1, p2, p3)                                                                                            |
| `circle` | a centre and a rim point | true circle; the radius is their distance and is never stored                                                            |
| `arc`    | three points             | true circular arc: start, end, and a through point that fixes the bulge and sweep; centre, radius and angles are derived |

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

## Pieces

A `piece` is a closed profile owning an ordered list of cut line, curve and arc
edges plus one allowance per loop edge. It is not an entity: it stores no
geometry of its own and no loop points, only references.

```ts
interface Allowance {
  edge: EntityId;
  width: number; // millimetres, the finished allowance
  kind: 'seam' | 'single' | 'double';
}

interface Piece {
  id: EntityId;
  name?: string;
  edges: EntityId[]; // closed chain, in loop order
  allowances: Allowance[];
  quantity?: number; // defaults to 1
}
```

`kind` sets how much extra the cut line gains: `seam` and `single` add `width`,
`double` adds `2 * width` and also yields a fold line at the finished width.
There is no stored side: the outward direction follows from the walk's winding,
so a piece keeps offsetting outward when its edges are reversed.

`validatePiece` accepts only cut line/curve/arc edges, at least three of them,
each unused by another piece, forming one closed chain: every edge continues at
the vertex where the previous edge ended and the last closes back to the first.
A star selection that only shares one common vertex is rejected. Circles are not
supported as piece edges in v0.2.

### Rounded piece corners

A corner round trims both of its lines away from the sharp corner, so a loop
walking those edges finds a gap where the arc belongs. The walk fills it with a
**bridge**: the round's derived arc polyline, inserted between the two trimmed
edges on every read. The piece stores no round and keeps its `edges` and
`allowances`; removing the round restores the sharp corner and closes the loop
directly again. `validatePiece` and `pieceLoop` share one assembly routine, so
both accept and reject exactly the same gaps.

The bridge carries the allowance of the two edges it joins. Both must agree —
both absent, or the same `width` and effective `kind` (an omitted kind means
`seam`) — because a single tangent offset exists only for one distance. A
disagreeing pair is rejected by `add_corner_round` and `set_piece_allowance`;
a hand-edited document that contains one cannot resolve its loop. The cut loop
offsets the arc outward like any other segment, and `pieceFoldLines` draws the
double-fold fold line around it too.

Derived functions in `piece.ts` return `null` or `[]` rather than throwing when
a reference goes stale, so a deleted point degrades every consumer to an absent
piece instead of breaking the canvas or export:

- `pieceEdges(document, piece)` — the resolved edge entities in stored order;
  missing, construction, point and circle references are skipped.
- `pieceLoop(document, piece)` — the stitch boundary as one closed polyline,
  reversing edges whose stored direction runs against the walk, plus one signed
  outward distance per segment.
- `pieceCutLoop(document, piece)` — the cut loop: the stitch boundary offset per
  edge with a join generated at every vertex, plus reported self-intersections.
- `pieceFoldLines(document, piece)` — the double-fold fold loop, empty when no
  edge is a double fold; for a uniformly doubled piece it is exactly the
  single-fold cut outline.
- `pieceCutVertex(document, piece, anchor)` — the resolved cut-loop point at one
  end of a loop edge, used by cut dimensions.
- `pieceCutBounds` / `pieceMetrics` — cut bounding box, finished and cut sizes,
  cut area, allowance area and quantity.
- `basicPieceForLoops(document)` — every simple closed chain of cut edges, used
  by the 0.1 migration to adopt closed seam chains.

## Later entities (specced, not built)

- `dart` — first-class construction element.
- `grainline`, `notch`, `label` — annotations attached to pieces.

## Document

A `PatternDocument` is the versioned JSON container persisted in
`patterns.geometry` (see `data-model.md`). It carries the schema tag
(`PATTERN_SCHEMA`), `units: 'mm'`, and the `entities`, `constraints` and `pieces`
arrays. The legacy `seams` array is deprecated: the 0.1 migration moves every
seam that closes a loop onto its piece as a `kind: 'seam'` allowance, and only
seams outside any piece remain there for the dashed legacy rendering. Document
helpers in `document.ts`:

- `createEmptyDocument()` — a valid empty document.
- `getEntity(document, id)` — entity by id, or `undefined`.
- `getConstraint(document, id)` — constraint by id, or `undefined`.
- `allPoints(document)` — every `point` entity, construction included.
- `cutEdges(document)` — every line/curve/circle/arc that is part of the cut
  pattern (i.e. not construction geometry); the source for cut-edge layers and
  exports.
- `entityPoints(document, entity)` — the point entities an entity references, in
  order (a circle resolves to centre then rim, an arc to start, through, end);
  throws when a reference is missing or is not a point.
- `constraintEntityIds(constraint)` — the point ids a constraint references, in
  semantic order (shared by the solver and the command core).
- `bounds(document)` — axis-aligned `{ min, max }` over all points (construction
  included), widened by each circle's radius and each arc's cardinal extents, or
  `null` for a point-less document.
- `getSeam(document, id)` / `seamForEdge(document, edge)` — look up a legacy seam
  allowance by its own id or by the edge it is attached to.
- `pieceById(document, id)` / `pieceForEdge(document, edge, ignorePiece?)` — look
  up a piece by id or by one of its loop edges.
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

## Circular arcs (`arc.ts`)

An `arc` is a true circular arc referencing three ordinary points — `start`,
`end` and a `through` point on the arc between them. Everything else is derived:
`arcThroughPoints(start, end, through)` returns an `ArcGeometry`
(`center`, `radius`, `startAngle`, `endAngle`, `sweep`, `largeArc`), or `null`
when the points are collinear within `MIN_BULGE` (`0.001` mm), `start` and `end`
coincide, or the maths overflows. Angles are measured in the document's **y-down**
frame, so a positive `sweep` runs in the direction of increasing `atan2` angle.
The sweep always takes the direction that passes through `through`, which is what
makes `largeArc` and the SVG sweep flag agree with the clicked bulge.
`arcGeometry(document, arc)` resolves the three references first and returns
`null` when one is missing or is not a point, or when a constraint solve has
flattened them.

- `arcPoints(geometry, start, end, segments?)` — flatten from `start` to `end`,
  pinning both exact endpoints; `segments` defaults to `FLATTEN_SEGMENTS`, the
  same resolution curves use, so seam allowances tessellate every curved edge
  alike.
- `arcExtents(geometry)` — the cardinal points inside the sweep, which can lie
  beyond the three referenced points and therefore widen `bounds`.
- `svgArcCommand(geometry, start, end)` — the full `M … A …` path data for export
  and the canvas preview, using the derived radius, `largeArc` and sweep flags.
- `formatSvgNumber(value)` (`number.ts`) — millimetre formatting shared by the
  arc command and the SVG exporter, rounded to 1e-4 mm.

## Seam allowance (`offset.ts`)

A seam allowance is a per-edge offset stored on the document as
`Seam { id, edge, width, side? }`. `width` is millimetres; the default when a
command omits it is `10` (`DEFAULT_SEAM_ALLOWANCE`). `side` is `'left'` or
`'right'` relative to the edge's start→end direction; `seamSide(seam)` resolves
an omitted side to `'left'`, which is how documents written before sides existed
keep rendering. Line, curve and arc edges can carry one, and at most one seam per
edge; a seam allowance on an arc follows the `start`→`end` direction. A circle
has no direction for a closed offset, so `add_seam_allowance` rejects one with
"seam allowances need a line, curve or arc edge". Since the pieces migration the
legacy seam is a read-only rendering path: the app authors allowances per piece
(`set_piece_allowance`) and offers no seam editing UI.

The offset is produced by pure functions:

- `offsetPolyline(points, distance, options?)` — offset a polyline by a signed
  distance (positive = left of travel). `options.join` is `'miter'` (default,
  with a `miterLimit` bevel fallback) or `'round'`; `options.closed` joins the
  last vertex back to the first.
- `findSelfIntersections(path, options?)` — non-adjacent segment crossings of an
  offset path, reported (not hidden) so a folded allowance can be flagged.
- `edgePolyline(document, edge, segments?)` — flatten a line (two points), a
  cubic Bézier (sampled) or an arc (sampled along its sweep) to a polyline, or
  `null` for an arc that has become degenerate.
- `seamAllowancePath(document, seam, options?)` / `seamAllowancePaths(document, options?)`
  — the offset `path` plus its `side` and `selfIntersections`, or `null` for an
  edge that is missing or is a point. The offset distance is `+width` for a
  `left` seam and `-width` for a `right` seam; the width itself stays positive.
- `cubicPoint` / `curvePoints` — cubic Bézier evaluation and flattening.

The editor renders `seamAllowancePaths(document)` as a dashed, pointer-transparent
layer (self-intersecting offsets use the destructive style) and exposes a per-edge
width input (default 10 mm) plus a show/hide presentation toggle; neither changes
the document.

The per-edge path is the **legacy** route, kept for seams on edges outside any
piece. Edges that belong to a piece are offset by `pieceCutLoop`, which uses
`offsetVariablePolyline` so each loop segment can carry its own distance and every
loop vertex gets a join. Both routes share `edgePolyline`,
`findSelfIntersections` and the same left/right sign convention.

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
- `roundBetween(document, first, second)` — the committed round whose two ends
  are exactly these lines, in either order.
- `roundBridge(document, first, second)` — that round's arc as a polyline
  oriented from `first`'s tangent to `second`'s tangent, or `null` when there is
  no round or its arc cannot be resolved. Used by the piece walk.
- `incidentLines(document, pointId)` — every line whose start or end is the
  point, the one rule both the piece walk and the corner-point pick use to decide
  what a corner is.

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

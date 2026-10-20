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

| Kind    | References  | Notes                            |
| ------- | ----------- | -------------------------------- |
| `point` | —           | the only solver variable in v0.1 |
| `line`  | two points  | straight segment / edge          |
| `curve` | four points | cubic Bézier (p0, p1, p2, p3)    |

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
- `cutEdges(document)` — every line/curve that is part of the cut pattern (i.e.
  not construction geometry); the source for cut-edge layers and exports.
- `entityPoints(document, entity)` — the point entities an entity references, in
  order; throws when a reference is missing or is not a point.
- `constraintEntityIds(constraint)` — the point ids a constraint references, in
  semantic order (shared by the solver and the command core).
- `bounds(document)` — axis-aligned `{ min, max }` over all points (construction
  included), or `null` for a point-less document.
- `getSeam(document, id)` / `seamForEdge(document, edge)` — look up a seam
  allowance by its own id or by the edge it is attached to.

## Linear dimensions (`dimension.ts`)

A linear dimension is not an entity: it is the CAD rendering of a driving
`distance` constraint (see `constraint-solver.md`). The pure helpers in
`dimension.ts` compute that rendering and are consumed by the frontend canvas:

- `dimensionGeometry(document, constraint)` — extension lines, dimension line,
  end chevrons and a rotated value label for a `distance` constraint, or `null`
  when its points are missing. Honors `orientation` and `offset`
  (`DEFAULT_DIMENSION_OFFSET` is `20` mm).
- `measureLinearDimension(document, a, b, orientation)` — the span the constraint
  would drive, or `null` when a point is missing.
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
`Seam { id, edge, width }`. `width` is millimetres; the default when a command
omits it is `10` (`DEFAULT_SEAM_ALLOWANCE`). Only line and curve edges can carry
one, and at most one seam per edge.

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
  — the offset `path` plus its `selfIntersections`, or `null` for an edge that is
  missing or is a point.
- `cubicPoint` / `curvePoints` — cubic Bézier evaluation and flattening.

The editor renders `seamAllowancePaths(document)` as a dashed, pointer-transparent
layer (self-intersecting offsets use the destructive style) and exposes a per-edge
width input (default 10 mm) plus a show/hide presentation toggle; neither changes
the document.

Seam allowance offsetting depends on the entity model only (edges), not on
`piece`. When pieces are modelled (see below), `piece` becomes a grouping for the
edges and their allowances.

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

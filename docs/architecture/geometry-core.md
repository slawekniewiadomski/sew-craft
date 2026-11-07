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

Every entity has an `id` (string), an owning `piece` and an optional `role`.
The role is `cut` when absent, `construction` for a guide, and `annotation` for a
sewing mark. Construction and annotation geometry are never part of a cut edge or
export; annotation is styled separately and is always visible. The deprecated
`construction: boolean` is accepted on read only. `text` is a sixth entity kind
and is annotation by definition.

`roles.ts` owns the one predicate every consumer uses: `roleOf`, `isCut`,
`isConstruction`, `isAnnotation`, `pieceEntities` and `pieceConstraints`.

### Points

```ts
interface PointEntity {
  id: string;
  kind: 'point';
  x: number;
  y: number;
  piece: EntityId;
  role?: 'construction' | 'annotation';
  fixed: boolean; // excluded from the solver variable vector
}
```

`fixed` points act as anchors. At least one fixed point is needed for a
non-translating solution.

## Pieces

A `piece` is the **container** for everything drawn on it. It owns an ordered
list of cut line, curve and arc edges plus one allowance per loop edge. It is not
an entity: it stores no geometry of its own and no loop points, only references.
A piece may be empty; its loop is captured later with `set_piece_loop` when one
simple closed chain of its cut edges exists.

```ts
interface Allowance {
  edge: EntityId;
  width: number; // millimetres, the finished allowance
  kind: 'seam' | 'single' | 'double';
}

interface CornerAllowance {
  round: EntityId; // the corner round this width belongs to
  cutWidth: number; // millimetres, the distance the cut line moves
}

interface Piece {
  id: EntityId;
  name?: string;
  edges: EntityId[]; // closed chain, in loop order
  allowances: Allowance[];
  cornerAllowances?: CornerAllowance[];
  quantity?: number; // defaults to 1
  notes?: string;
  fabric?: string;
  color?: string; // #rrggbb
  defaults?: { allowance: AllowancePreset | null };
}
```

`kind` sets how much extra the cut line gains: `seam` and `single` add `width`,
`double` adds `2 * width` and also yields a fold line at the finished width.
There is no stored side: the outward direction follows from the walk's winding,
so a piece keeps offsetting outward when its edges are reversed.

A corner round's band resolves per **boundary segment**, not per edge
(`resolveLoopSegments` in `piece.ts`): a stored edge's own allowance; else, on a
bridge, the round's own `CornerAllowance`; else the width both adjacent edges
agree on; else one half per edge, split at the vertex nearest half the bridge's
arc length, so a split half belongs to the edge on its side. A corner has no
`kind` and no fold line: its stored number is the cut distance. Because a line and
a flattened arc meet at a visible angle (≈2.8°), a distance change there would
otherwise fit a long miter; `pieceCutLoop` passes `OffsetOptions.tangentStep`
(10°) so a change cuts square across instead.

`pieceBandRegions(document, piece)` returns that resolution as geometry: one
closed polygon per target (`{ kind: 'edge' }` or `{ kind: 'round' }`) that tiles
the band exactly once. An edge region spans its own segment run plus half of each
sharp-corner wedge (split from the stitch vertex to the cut join, or a bevel's
midpoint); a round region spans the crescent, and a split crescent contributes its
halves to the adjacent edge regions. A target with no band is absent, and a
compacted or self-intersecting cut loop yields no regions.

`validatePiece` accepts only cut line/curve/arc edges owned by the piece, at
least three of them, forming one closed chain: every edge continues at the vertex
where the previous edge ended and the last closes back to the first. Annotation
and construction edges are refused, as is an edge owned by another piece. A star
selection that only shares one common vertex is rejected. Circles are not
supported as piece edges in v0.4.

A piece's stored coordinates are its own: nothing outside the piece reads their
absolute values. The piece tab fits the piece's bounds, and an assembly places a
copy by its **derived anchor** rather than by an origin that could go stale.

## Assembly placement (`assembly.ts`)

`pieceAnchor(document, piece)` is the centre of the stitch-loop bounds when the
loop resolves, otherwise the centre of the bounds of the piece's own points,
otherwise `null`. Using the finished loop rather than the cut loop keeps an
instance in place when an allowance changes.

`instancePlacement(document, piece, instance)` combines that anchor with the
stored placement; `placePoint` maps one piece-local point `p` into assembly space:

```
p' = (x, y) + rotate(rotation) · (mirrored ? (-(p.x - a.x), p.y - a.y) : p - a)
```

where `a` is the anchor. Mirror happens **before** rotation, about the anchor's
vertical axis, and rotation uses SVG's y-down convention (positive turns
clockwise on screen). This is a contract: changing it would rewrite every stored
instance, so asymmetric fixtures pin it in `tests/assembly.test.ts`.

`instanceLoops` returns the cut loop, stitch loop, fold lines and resolved V
notches transformed into assembly coordinates; `assemblyBounds` unions the
transformed cut bounds, ignoring
pieces with no anchor and pieces whose cut loop does not resolve. An instance of
an empty piece still has a placement when the piece owns points and renders a
placeholder; the transform is always derived on read and never written back.

### Annotation text

`TextEntity` stores one line of content, an anchor point, alignment, rotation,
cap height in millimetres and an optional leader point. It is never a solver
variable. `text.ts` derives the rotated selection box (`textLayout`) and, for a
label with a leader, `textLeaderGeometry`: a rule under the baseline spanning the
label width, a shaft from whichever rule end is nearer the target, and a filled
arrow head whose tip is the target. The helper owns the rule gap (`0.12 ×`
cap height) and the head's `0.30 ×` length and `0.15 ×` width, shrinking the head
proportionally when the leader is shorter. Everything is DOM-free, using
`MONO_ADVANCE_RATIO = 0.6`. Text is canvas-only in this change; export is
unchanged.

### Ownership rules

Every create names an existing piece, and a constraint may reference only
entities of its own piece. `delete_entity` removes the id from any loop and keeps
the piece (which then reports a broken loop); `delete_piece` cascades everything
the piece owns. `move_piece` translates all owned points, fixed ones included.

### Rounded piece corners

A corner round trims both of its lines away from the sharp corner, so a loop
walking those edges finds a gap where the arc belongs. The walk fills it with a
**bridge**: the round's derived arc polyline, inserted between the two trimmed
edges on every read. The piece stores no round and keeps its `edges` and
`allowances`; removing the round restores the sharp corner and closes the loop
directly again. `validatePiece` and `pieceLoop` share one assembly routine, so
both accept and reject exactly the same gaps.

The bridge resolves its own width: the round's `CornerAllowance` when it has one,
else the width both adjacent edges agree on, else a split in half at the arc's
midpoint (see _Pieces_). A differing pair is therefore allowed by both
`add_corner_round` and `set_piece_allowance`. The cut loop offsets the arc outward
like any other segment, and `pieceFoldLines` draws the double-fold fold line around
it too.

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
  end of a loop edge, used by cut dimensions. Returns `null` for an `at: 'edge'`
  anchor, which has no single vertex.
- Both vertex resolvers read an edge's natural start and end from its own span,
  so a reversed edge's `end` is its walk start rather than the next edge's
  start. This is a behaviour fix: before, `at: 'end'` on a reversed edge wrapped
  one span past the edge.
- `pieceLoopVertex(document, piece, anchor)` — the same vertex on the **stitch**
  loop, index for index, including the trimmed tangent points a corner-round
  bridge contributes and a reversed edge. Returns `null` for `at: 'edge'`.
- `pieceCutEdge(document, piece, edge)` — the edge's **own** cut segment, from
  the outgoing offset point at its natural start to the incoming offset point at
  its natural end. At a bevel join these differ from `pieceCutVertex`'s point,
  so an edge anchor never uses the vertex resolver for both ends; this is exactly
  the source line plus the edge's cut-distance offset, independent of the
  adjacent allowance and a corner round. `null` for a missing edge, a non-line
  source or an unresolvable loop (a compacted cut loop has no addressable
  per-edge span).
- `resolvePieceAnchor(document, piece, anchor)` — the single dispatch every
  reader uses: an anchor with `loop: 'stitch'` resolves through
  `pieceLoopVertex`, anything else through `resolveCutAnchor`.
- `resolveCutAnchor(document, piece, anchor)` — a vertex point or an edge cut
  segment, or `null`.
- `pieceCutBounds` / `pieceMetrics` — cut bounding box, finished and cut sizes,
  cut area, allowance area and quantity.
- `basicPieceForLoops(document)` — every simple closed chain of cut edges, used
  by the 0.1 migration to adopt closed seam chains.

## Seams and the sewability check (`seams.ts`)

An assembly records which edge runs are sewn to each other in optional `seams`
and which edges are finished instead in optional `finishedEdges`. Both are
advisory data: nothing in the editor, save, autosave, versioning or export path
blocks on them.

```ts
interface SeamRun {
  instance: EntityId;
  /** Consecutive ids in Piece.edges order; may wrap once. */
  edges: EntityId[];
  /** Traverse from the run's other end; absent means forward. */
  reversed?: boolean;
}

interface SeamMatch {
  id: EntityId;
  /** Two or more sides, ordered by layer. */
  sides: SeamRun[];
  /** A deliberate length difference; downgrades a mismatch to a warning. */
  eased?: boolean;
}

interface FinishedEdge {
  instance: EntityId;
  edge: EntityId;
  kind: 'hem' | 'binding' | 'fold' | 'opening';
}
```

**Resolution.** `resolveSeamRun(document, assembly, run)` walks the side's run in
authored `Piece.edges` order into one assembly-space polyline. It orients each
edge to connect to the previous one, inserts a committed corner round's **bridge**
between consecutive edges, and reverses the whole chain when `reversed` is true.
The run starts at the first edge's **outer end** (the end not shared with the
next edge). It returns `null` for any unresolvable instance, piece, edge or loop
and never throws. The same polyline is the check's length and a future 3D
preview's vertex correspondence, so the seam's start and `reversed` are part of
the contract, not presentation.

**Validation.** `validateSeamRun` checks one side (instance belongs to the
assembly, its piece resolves, every edge is in the loop). `validateSeam` adds the
cross-side rules: at least two sides, consecutive runs with at most one wrap, no
repeated edge, and no edge already sewn by another seam or marked finished. The
four commands (`add_seam_match`, `update_seam_match`, `remove_seam_match`,
`set_edge_finished`) call the same validators; `split_line` replaces a split edge
in place with its two halves inside every run.

**Report.** `sewabilityReport(document, assembly)` returns counts and a flat,
severity-ordered issue list:

| Kind                 | Severity             | Meaning                                                  |
| -------------------- | -------------------- | -------------------------------------------------------- |
| `unmatched_edge`     | error                | no seam and no finish mark                               |
| `edge_used_twice`    | error                | two seams, or a seam and a finish, claim one edge        |
| `missing_reference`  | error                | instance, piece, edge or loop no longer resolves         |
| `length_mismatch`    | error, warning eased | side lengths differ by more than `SEAM_LENGTH_TOLERANCE` |
| `allowance_mismatch` | warning              | cut distances across the seam differ                     |
| `folded_edge_sewn`   | warning              | an edge with a `double` allowance is sewn                |

`SEAM_LENGTH_TOLERANCE` is 5 mm and `ALLOWANCE_MATCH_TOLERANCE` is 1e-6 mm; both
are exported constants, not stored per seam. An empty assembly is vacuously
sewable. Errors are listed before warnings, and each group keeps document order.

## 3D preview (`drape.ts`)

The preview turns an assembly's stitch loops and seam record into one welded,
inflated mesh. It is derived and read-only: no command writes it, no document
field stores it, and save, autosave, versioning and export never read it. ADR-0011
chooses SVG projection over WebGL.

`drapeAssembly(document, assembly, options)` returns a `PreviewMesh | null`:

```ts
interface PreviewMesh {
  positions: Vec3[]; // assembly millimetres, z is the inflation axis
  triangles: { a: number; b: number; c: number; panel: number }[];
  panels: { instance: EntityId; piece: EntityId; color: string | null }[];
  openBoundaries: number[][];
  simplified: boolean;
  skipped: EntityId[];
}
```

The pipeline:

1. **Panels.** Each instance contributes its stitch loop (`instanceLoops`).
   Ear clipping triangulates it and conforming midpoint subdivision stops at
   `PREVIEW_MAX_EDGE = 18` mm, the level cap or the triangle budget.
2. **Seam samples.** Each seam side is resampled at a common
   `PREVIEW_SAMPLE_SPACING = 4` mm along `resolveSeamRun`; the samples are
   inserted into the panel boundary by splitting the owning boundary triangle.
   The k-th sample of every side of a seam shares a weld group, so the seam is
   closed topologically.
3. **Direction.** Seam `sides` order is layer order: side 0 inflates one way,
   every other side the other way. A panel accumulates the directions of its
   seams; ties stay outward.
4. **Inflate.** A deterministic position-based loop runs
   `PREVIEW_ITERATIONS = 60` times: move along the area-weighted vertex normal
   by `inflate × 0.35` mm, project every triangle edge back to its rest length
   (three passes), project interior-edge opposite-vertex distances at a soft
   `0.25` factor, and pin one vertex. No gravity, collision or time step.
5. **Open boundaries.** Edges used by exactly one triangle form boundary loops.
   They stay open: finished edges are the object's openings.
6. **Cost.** `PREVIEW_TRIANGLE_LIMIT = 6000`; a panel that would exceed its share
   stops subdividing, and `simplified` says so.

The frontend's `frontend/src/lib/preview-mesh.ts` projects the mesh
orthographically (yaw around Z, then pitch around X), sorts triangles back to
front and shades each face with a fixed Lambert term. The dialog paints one SVG
`<polygon>` per triangle; wireframe keeps the outline and drops the fill. There is
no WebGL context, camera or saved pose.

## Later entities (specced, not built)

- `dart` — first-class construction element.
- `grainline`, `label` — annotations attached to pieces.

## Marks

A `mark` entity is a sewing mark with a `type` discriminator: `notch` or
`centre_line`. It is presentation only — no solver variable, no constraint, never
a loop edge — and it resolves from the document on every read, so it follows the
allowance instead of drifting. `@sewcraft/geometry/src/mark.ts` owns the
constants, `notchGeometry`, `centreLineGeometry` and the broken-mark predicate:

- A notch is anchored to a snapped point plus the loop edge whose allowance it
  cuts into. The V opens on that edge's cut line, `3` mm either side of the
  point, and reaches `depth × cutDistance` inward (`0.5` by default, clamped to
  `0.05`–`0.9`). The outward side comes from the loop's winding, never from the
  edge's own direction, so a reversed edge draws the same V.
- A mark is **broken** when its allowance is removed, its point leaves the edge
  or its edge leaves the loop: it records nothing wrong and renders nothing,
  returning as soon as the condition is repaired. The piece panel lists it as a
  broken row; export skips it.
- Deleting a mark's point or edge deletes the mark through `delete_entity`, the
  same cascade a label has with its anchor.

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
  when its anchors are missing or the span is degenerate. Honors `orientation`
  and `offset` (`DEFAULT_DIMENSION_OFFSET` is `20` mm); a line anchor forces
  aligned.
- `lineEndpoints(document, id)` / `resolveAnchor(document, id)` — a straight
  line's endpoints, or one anchor as a point or a line segment (`null` for a
  curve, arc, circle or missing reference).
- `resolveAnchorSpan(document, a, b)` / `resolveDistanceSpan(document,
constraint)` — the resolved span and anchor kinds for point → point, point ↔
  line (perpendicular foot on the infinite supporting line, normalized
  point-first) and line ↔ line (canonical by entity id, first midpoint → second
  line). `null` when the span is at or below `1e-9` mm.
- `distanceAnchorIssue(document, a, b)` — the shared pick-time verdict the
  command and canvas both map (`missing`, `not-a-line`, `not-parallel`,
  `point-on-line`, `coincident`, `zero-length`), plus the span.
- `measureDistanceDimension(document, constraint)` — absolute span length when a
  line is an anchor, otherwise the stored-axis measurement.
- `measureLinearDimension(document, a, b, orientation)` — the point-to-point span
  the constraint would drive, or `null` when a point is missing; kept for entity
  lengths and other point-only callers.
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

### Cut dimensions (`derived_distance`)

A cut dimension is a read-only `derived_distance` constraint over a piece's loop;
it adds no solver equation. `resolveCutSpan(document, constraint)` resolves both
anchors, each against the loop it names (`loop: 'stitch'` reads the seamline,
omitted or `cut` reads the allowance boundary), and returns the measured span:

- **vertex → vertex** — the two loop points, as stored. A stitch and a cut anchor
  may be mixed in one dimension; their positions differ wherever an allowance
  offsets the edge.
- **vertex → edge / edge → vertex** — the vertex and its perpendicular foot on
  the edge's infinite cut line, normalized vertex-first so the pick order does
  not flip the dimension line.
- **edge → edge** — canonicalized by piece edge order: the earlier edge's cut
  segment midpoint and its foot on the later edge's cut line. The 0.5°
  `|cross(unitA, unitB)|` parallel rule is a pick-time guard only; a pair that
  later rotates out of parallel still resolves as midpoint → line.

`resolveCutSpan` returns `null` for a span of at most `1e-9` mm, so a dynamic
zero gap reports broken instead of `0`. `measureCutDimension` and
`derivedDimensionGeometry` force `aligned` when either anchor is an edge.

`cutAnchorIssue(document, piece, a, b)` is the single predicate shared by the
command and the canvas. It returns `{ reason, span }` with one of `missing`,
`not-straight`, `different-piece`, `same-anchor`, `not-parallel` or `zero-span`
(a span of at most `1e-6` mm), or a `null` reason and the span. The command maps
reasons to validation errors; the canvas maps the same reasons to hints, so the
two cannot drift.

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
loop vertex gets a join. It also passes `tangentStep`, so a distance change at a
nearly-tangent vertex (a round's tangent, a split crescent's midpoint) cuts a
straight step instead of fitting a miter that would run far outside the piece.
Every other caller leaves the option at `0`, which keeps its joins exactly as
before. Both routes share `edgePolyline`,
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
  center?: EntityId; // derived radius centre; optional for older documents
  cornerConstruction: boolean; // the corner's flag before the round
}
```

`PatternDocument.cornerRounds` is optional so documents written before the
feature load unchanged. A line may carry one round at each end; a sharp corner
may carry at most one. Derived ids are deterministic from the command id:
`<id>:a`, `<id>:b` (tangent points), `<id>:c1`, `<id>:c2` (controls), `<id>:arc`
and `<id>:center` (the radius centre). The centre is an ordinary fixed
construction point entity, so it can be selected, snapped to and measured; it is
never added to a piece loop and is not exported.

The derived entities carry the selected lines' `piece`. A per-piece document
slice (`documentForPiece`) also keeps every derived entity of a round whose
lines it contains, so a round written before ownership — or one shared by two
pieces — still yields a resolvable loop and cut line inside the slice.

### Math

With `uA` and `uB` the unit directions from the sharp corner to the two
opposite anchors, `θ` the interior angle, and `r` the radius:

- Reject `θ` within 1° of 0° (spike) or 180° (straight).
- Tangent distance `t = r / tan(θ / 2)`; tangent points
  `T_A = corner + uA·t`, `T_B = corner + uB·t`.
- Radius centre `O = corner + normalize(uA + uB)·(r / sin(θ / 2))`, one radius
  from both lines and both tangent points.
- Control distance `k = (4/3)·tan((π − θ)/4)·r`; controls
  `P1 = T_A − uA·k`, `P2 = T_B − uB·k`.
- The arc is the cubic `T_A, P1, P2, T_B`. Its error against a true circle is
  below ~0.03 % of the radius, far under a sewing tolerance.

### Helpers

- `cornerRoundsForEntity(document, id)` — every feature that references a line,
  arc, tangent, control, centre, sharp corner or anchor.
- `isCornerRoundDerived(document, id)` — true for an arc, tangent, control or
  centre point; used by command validation and the canvas. The canvas filters
  arcs and controls out of the drafting handles and draws the centre and tangents
  as always-visible feature dots instead.
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
  persisted entities stay as static geometry. A kept round written before
  feature points gains its deterministic `<id>:center` entity, minted once from
  the stored radius; an existing centre coordinate is never rewritten. Never
  throws. The frontend load path calls it once.
- `roundBetween(document, first, second)` — the committed round whose two ends
  are exactly these lines, in either order.
- `roundBridge(document, first, second)` — that round's arc as a polyline
  oriented from `first`'s tangent to `second`'s tangent, or `null` when there is
  no round or its arc cannot be resolved. Used by the piece walk.
- `incidentLines(document, pointId)` — every line whose start or end is the
  point, the one rule both the piece walk and the corner-point pick use to decide
  what a corner is.
- `lineEndpointAnchor(document, lineId, endpoint)` — the authored point at a line
  end: the sharp corner when a round replaced that end with its tangent,
  otherwise the endpoint itself.
- `lineSupportAnchors(document, lineId)` — the two authored points that name the
  line's supporting line, or `null` when the id is not a line or either current
  endpoint is no longer a point. The corner, the tangent and the opposite anchor
  are collinear by construction, so the pair describes the same support line.

Direction constraints — `point_on_line`, `horizontal` and `vertical` — store the
support-anchor pair rather than the current endpoints. A rounded end therefore
names the sharp corner, which survives radius changes, `remove_corner_round` and
undo; a constraint created before a round already names that corner and keeps
working. `distance` and `equal` keep the visible endpoints because they measure
the trimmed segment, so they remain rejected on a rounded line. The inspector
matches a direction constraint against either pair.

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

## Line split (`commands.ts`)

`split_line { line, point }` replaces a straight edge with two halves that share
`point`: the original keeps its id as `start → point`, and the new half takes the
command id as `point → end`. The point must be an authored, non-derived point
within 0.001 mm of the edge and at least 0.001 mm from either end. An
`at: 'edge'` cut anchor on the edge blocks the split, because it measures the
whole edge rather than one half.

The split is a geometric no-op, so the command returns `inverse: null` and undo
uses the journal snapshot. The piece loop inserts the new half after the
original; a per-edge allowance and a legacy seam are copied; a corner round's end
follows the tangent it owns; a notch follows the half that contains its point; a
measured chain becomes both halves and is canonicalised with
`measurementChain`; a line-form midpoint becomes the two-point form; and an
`at: 'end'` cut anchor moves to the second half.

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
const svg = toSvgPiece(document, piece, { construction: false });
```

Keep the public surface small and typed. New exports go through `src/index.ts`.

## Rendering

The geometry package does **not** render to screen. The frontend maps entities to
SVG (`path`, `line`, `polygon`) and controls styling, hit-testing and viewport.
Exports (SVG/PDF/DXF) are serializers that consume the same document; the SVG
serializer (`toSvgPiece`, see `export.md`) is the first of these.

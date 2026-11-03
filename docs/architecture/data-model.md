# Data Model

Persistence is PostgreSQL. Geometry is stored as JSON so the schema stays stable
while the entity model evolves. The canonical geometry document is versioned.

## Tables

### `projects`

| Column                      | Type       | Notes    |
| --------------------------- | ---------- | -------- |
| `id`                        | bigint PK  |          |
| `name`                      | string     | required |
| `description`               | text, null |          |
| `created_at` / `updated_at` | timestamp  |          |

A project is the top-level container a user opens and exports.

### `patterns`

| Column                      | Type                    | Notes                                 |
| --------------------------- | ----------------------- | ------------------------------------- |
| `id`                        | bigint PK               |                                       |
| `project_id`                | FK → projects (cascade) |                                       |
| `name`                      | string                  |                                       |
| `geometry`                  | json, null              | current `PatternDocument` (see below) |
| `created_at` / `updated_at` | timestamp               |                                       |

The `geometry` column holds the working copy. It is a snapshot, not the source of
truth history — that is `pattern_versions`. Saves write it as a whole document
snapshot (`PUT /projects/{id}/pattern`) rather than replaying commands on the
server; see `api.md`. One pattern per project in v1: the lowest id wins, and the
first save creates it lazily with the project's name.

### `pattern_versions`

| Column       | Type                    | Notes                    |
| ------------ | ----------------------- | ------------------------ |
| `id`         | bigint PK               |                          |
| `pattern_id` | FK → patterns (cascade) |                          |
| `version`    | unsigned int            | monotonic per pattern    |
| `origin`     | string(16)              | `manual` \| `autosave`   |
| `geometry`   | json                    | frozen `PatternDocument` |
| `created_at` | timestamp               |                          |

Unique on `(pattern_id, version)`. Appended once per changed save, and once for
the pre-upgrade working copy immediately before an upgrade save. An unchanged
save appends nothing.

`origin` separates deliberate checkpoints from background writes. Explicit saves
and upgrade archives write `manual`; a client that opts into autosave sends
`origin: "autosave"` and the server keeps only the newest autosave row per
pattern, pruning earlier autosave rows in the same transaction. Manual rows are
never pruned, so history keeps every deliberate save while a drafting session
cannot grow it without bound. This supersedes the earlier "no pruning" promise.
Pruning leaves gaps in version numbers: the next version is `max(version) + 1`,
computed under a row lock, and a version is a token rather than a count.

### `exports`

| Column                      | Type                    | Notes                           |
| --------------------------- | ----------------------- | ------------------------------- |
| `id`                        | bigint PK               |                                 |
| `pattern_id`                | FK → patterns (cascade) |                                 |
| `format`                    | string                  | `svg` \| `pdf` \| `dxf`         |
| `disk`                      | string                  | Laravel filesystem disk         |
| `path`                      | string                  | stored artifact path            |
| `status`                    | string                  | `pending` \| `done` \| `failed` |
| `created_at` / `updated_at` | timestamp               |                                 |

## `PatternDocument`

The JSON stored in `patterns.geometry`. Schema version is explicit so migrations
can be written when it changes.

```jsonc
{
  "schema": "sewcraft.pattern/0.4",
  "units": "mm",
  "entities": [
    // Every entity names its piece; role absent means cut.
    { "id": "p1", "kind": "point", "x": 0, "y": 0, "piece": "pc1", "fixed": true },
    { "id": "p2", "kind": "point", "x": 120, "y": 0, "piece": "pc1", "fixed": false },
    { "id": "l1", "kind": "line", "start": "p1", "end": "p2", "piece": "pc1" },
    { "id": "p3", "kind": "point", "x": 120, "y": 90, "piece": "pc1", "fixed": false },
    { "id": "l2", "kind": "line", "start": "p2", "end": "p3", "piece": "pc1" },
    {
      "id": "g1",
      "kind": "line",
      "start": "p1",
      "end": "p3",
      "piece": "pc1",
      "role": "construction",
    },
    { "id": "mark", "kind": "point", "x": 60, "y": 20, "piece": "pc1", "role": "annotation" },
    {
      "id": "t1",
      "kind": "text", // always annotation; never a solver variable
      "piece": "pc1",
      "anchor": "mark",
      "content": "rivet",
      "alignment": "left",
      "rotation": 0,
      "fontSize": 6,
    },
  ],
  "constraints": [
    { "id": "c1", "type": "horizontal", "a": "p1", "b": "p2", "piece": "pc1" },
    {
      "id": "c2",
      "type": "distance",
      "a": "p1",
      "b": "p2",
      "piece": "pc1",
      "value": 120,
      "orientation": "horizontal",
      "offset": 20,
    },
    {
      "id": "c4",
      "type": "derived_distance",
      "piece": "pc1",
      "a": { "edge": "l1", "at": "start" },
      "b": { "edge": "l1", "at": "end" },
    },
  ],
  "pieces": [
    {
      "id": "pc1",
      "name": "Front",
      "edges": ["l1", "l2"], // the captured cut loop; may be empty
      "allowances": [
        { "edge": "l1", "width": 10, "kind": "double" },
        { "edge": "l2", "width": 10 },
      ],
      "cornerAllowances": [{ "round": "cr1", "cutWidth": 20 }],
      "quantity": 2,
      "notes": "Cut two mirrored",
      "fabric": "Linen",
      "color": "#336699",
      "defaults": { "allowance": { "width": 10, "kind": "seam" } },
    },
  ],
  "assemblies": [
    {
      "id": "as1",
      "name": "Outer shell",
      // The anchor is the piece's derived finished-loop centre.
      "instances": [{ "id": "in1", "piece": "pc1", "x": 100, "y": 100, "rotation": 1.57 }],
    },
  ],
  // Authoritative tab order: every piece and assembly exactly once.
  "tabs": [
    { "kind": "piece", "id": "pc1" },
    { "kind": "assembly", "id": "as1" },
  ],
  "defaults": { "allowance": { "width": 10, "kind": "seam" } },
  "cornerRounds": [],
}
```

`defaults` is optional and additive: a document written without it resolves the
built-in **10 mm seam** preset, and `normalizeDocument` fills the field on load
(one-way and idempotent). `defaults.allowance` is the document-wide preset
`set_piece_loop` copies onto new loop edges; `null` means new pieces start with no
allowance. A piece may override it with `defaults.allowance` (absent inherits,
`null` means none). Changing or clearing either default never rewrites an existing
piece's allowances. An invalid stored width or kind falls back to the built-in
preset; the pattern schema string is `sewcraft.pattern/0.4`.

`cornerRounds` is optional, so documents written before the feature load
unchanged. A round is a live feature: it stores the sharp corner, both line
anchors and the radius, while its derived entities (tangent points `r1:a`,
`r1:b`, controls `r1:c1`, `r1:c2`, the cubic arc `r1:arc` and the radius centre
`r1:center`) live in `entities` and are omitted from the snippet. `l1` and `l2`
are trimmed to the tangent points, and `p2` stays as a construction point.
`center` is optional and additive — it points at a fixed construction point, is
minted once on load for rounds written before feature points, and never joins a
piece loop or the SVG export. The schema string is `sewcraft.pattern/0.4`.

An `arc` entity is a true circular arc referencing three ordinary points: `start`
and `end` bound it and `through` lies on it between them, fixing both the bulge
and the sweep direction. The circumcentre, radius, start/end angles, signed sweep,
large-arc flag and extents are derived on read and never stored, so the three
points remain the only solver variables and constraints on them move the arc. A
`solve` can flatten the three points into collinearity, which makes the arc
invalid: render, export and bounds skip it and the properties panel shows an
"invalid" state rather than throwing. The entity kind is additive, so a document
written before the feature loads unchanged and a document containing an arc is
still valid JSON for older builds.

A `circle` entity references its centre point and one point on the rim; the
radius is derived as the distance between them and is never stored. Its bounding
box is the centre widened by the radius in each direction, and `add_seam_allowance`
rejects a circle in v1. The entity kind is additive, so a document written before
the feature loads unchanged and a document containing a circle is still valid
JSON for older builds.

A `piece` is a closed loop of existing cut edges cut from fabric. `edges` is the
loop order, which is also what defines "outward"; a piece never stores a side.
`allowances` holds at most one entry per loop edge — an edge with no entry has no
allowance, which is how a shared edge (cut on the stitch line) is expressed.
`width` is the **finished** width in millimetres and `kind` is one of `seam`
(omitted default), `single` or `double`; a `double` fold cuts at `2 × width` and
adds a fold line at `width`. `name` and `quantity` are optional (quantity omitted
means 1). Derived geometry is never stored: the stitch loop, cut loop, fold lines,
metrics and cut bounds are recomputed from the document on read.

`cornerAllowances` is optional and holds at most one entry per corner round: a
`round` id and the **cut** distance that crescent uses, which wins over the width
its two edges agree on. A round with no entry inherits that width, or splits in
half when the two edges differ. Entries naming a round the piece does not hold are
ignored when resolving and dropped when the loop changes.

`notes`, `fabric` and `color` are optional piece parameters: free text trimmed to
500 and 120 characters, and a stored `#rrggbb` colour used for the tab dot and the
assembly fill. An empty string is not stored. `defaults.allowance` is the piece's
own override; absent inherits the document default, `null` means none.

The schema is `sewcraft.pattern/0.4`. `normalizeDocument` in
`packages/geometry/src/migration.ts` refuses every other schema (a stored 0.3
document included) through `UnsupportedPatternSchemaError`: there is no
load-time migration. It also fills `defaults`, defaults a missing `assemblies` to
`[]`, and normalises `tabs` — duplicate refs and refs to missing objects are
dropped, and every piece and assembly missing from the order is appended in
pieces-then-assemblies order. The normalisation is one-way and idempotent, and an
already-current document is returned unchanged.

An `assembly` is a named list of **instances**. Each instance references a piece
and stores a placement: `x`/`y` is the assembly-space position of the piece's
derived anchor, `rotation` is in radians with SVG's y-down convention, and
`mirrored` flips the piece about the anchor's vertical axis before rotating.
Nothing about a piece's position in an assembly is written back to its geometry.
`tabs` is the authoritative tab order; it lives in the document because reordering
is undoable, and every valid document holds each piece and assembly exactly once.

The whole set of placement rules is in `docs/architecture/geometry-core.md`.

A `distance` constraint without `value` or `reference` is a **driven** dimension:
it reports the live measurement and adds no solver equation. Its `a`/`b` fields
name a point **or a straight line**; the entity kind selects the anchor. A point
and a line measure the perpendicular to the line's infinite supporting line; two
parallel lines measure from the canonical first midpoint (lower id) to the second
line. A line-anchored dimension is always aligned and carries no extra stored
field, so the schema string is `sewcraft.pattern/0.3`. A `reference` links
one dimension to another; the effective value is derived, so the constraint
stores no duplicate `value`. When the source disappears, the dependent keeps its
`reference`, stores the last resolved number in `lastKnownValue` and renders as
**broken** until the user re-links it. At most one of `value` and `reference` is
present. A pre-feature build accepts the document but reports a line anchor as an
unknown point when it solves, so a line-anchored document is not downgradeable.

A `midpoint` constraint pins its `point` to the middle of a straight line
(`{ point, line }`) or halfway between two points (`{ point, a, b }`). The target
is derived, not stored state: no `fixed` flag is written and removing the
constraint leaves an ordinary free point at its last coordinate. The line form
stores the line id so it follows the line's visible endpoints through a
corner-round trim; the two-point form keeps its named points. A target may not be
corner-round derived, already a midpoint target, or a source of another midpoint,
and neither may a source be an existing target (no chains). The document stays
`sewcraft.pattern/0.4`; only the constraint list gains an additive entry.

A `derived_distance` constraint is a **cut dimension**. It addresses two anchors
of one piece by `{ edge, at: 'start' | 'end' | 'edge', loop?: 'stitch' | 'cut' }`
rather than by point id, because the loops have no entities of their own.
`start`/`end` address a loop vertex; `edge` addresses the whole straight cut
edge's **own** cut segment, the source line plus the edge's cut-distance offset
(its cut line). `loop` picks the loop the anchor resolves against: omitted means
`cut`, the allowance boundary and the meaning every stored anchor has always had;
`stitch` addresses the seamline itself, including the trimmed tangent points of a
corner-round bridge. `loop: 'stitch'` never combines with `at: 'edge'`. A stitch
anchor is an ordinary optional field, so a `0.2` document without it loads and
measures exactly as before; an older build ignores `loop` and reads the cut
position, a wrong number rather than a crash. An edge anchor
resolves from the edge's own outgoing/incoming cut points, not from two
`pieceCutVertex` calls, because a bevel join's two points differ. Its value is
measured from the resolved loop on every read: two vertices as stored, a
vertex and its perpendicular foot on the other edge's cut line (normalized
vertex-first), or two edges' canonical first midpoint and its foot on the second
cut line. Edge-to-edge pairs must be parallel within 0.5° when placed; a later
drift still resolves as midpoint → line. A span of at most 1e-9 mm resolves to
nothing, so a dynamic zero gap renders as broken rather than `0`. An edge-anchored
dimension is always aligned.

The dimension adds no solver equation (`solveDocument` filters it out) and is
read-only: `update_constraint` accepts only `orientation` (vertex-to-vertex) and
`offset`. When the piece or an anchored edge is deleted, `delete_entity` or
`delete_piece` removes the dimension, and a cut dimension whose anchors no longer
resolve keeps its references but has no reading to show, so it renders as broken
without a number. Deleting a loop **point** leaves the piece in place, so the
dimension stays and becomes broken; only the piece/edge cascade removes it.

**Schema decision (Q4).** The schema string is `sewcraft.pattern/0.3`: every
entity and constraint names its piece, `role` replaces `construction`, text joins
the entity union and the legacy `seams` field is gone. This feature does not
consume it. An older build reads `at: 'edge'` as `end` (its anchor resolver only
knows two values), renders the wrong vertex and can edit and save that misread.
That is the accepted shipping-now trade-off, documented in
`BACKWARD_COMPATIBILITY.md`; a later schema can make the downgrade read-only once
the `0.3` seam removal has landed.

See `docs/architecture/geometry-core.md` for
entity semantics and `docs/domain/command-spec.json` for the machine-readable
command schema.

## Notes

- Use `json` (not `jsonb`) for now so the in-memory SQLite test connection works
  unchanged. Revisit if we need indexing into geometry.
- No `user_id` yet; single-user self-hosted. Add it together with Sanctum when
  multi-user arrives.

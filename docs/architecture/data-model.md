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
| `geometry`   | json                    | frozen `PatternDocument` |
| `created_at` | timestamp               |                          |

Unique on `(pattern_id, version)`. Appended once per changed save, and once for
the pre-upgrade working copy immediately before an upgrade save. An unchanged
save appends nothing, so history stays meaningful without pruning. The next
version is `max(version) + 1`, computed under a row lock.

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
  "schema": "sewcraft.pattern/0.2",
  "units": "mm",
  "entities": [
    { "id": "p1", "kind": "point", "x": 0, "y": 0, "construction": true, "fixed": true },
    { "id": "p2", "kind": "point", "x": 120, "y": 0, "construction": false, "fixed": false },
    { "id": "l1", "kind": "line", "start": "p1", "end": "p2", "construction": false },
    { "id": "p3", "kind": "point", "x": 120, "y": 90, "construction": false, "fixed": false },
    { "id": "l2", "kind": "line", "start": "p2", "end": "p3", "construction": false },
    { "id": "p4", "kind": "point", "x": 130, "y": 40, "construction": false, "fixed": false },
    { "id": "p5", "kind": "point", "x": 110, "y": 50, "construction": false, "fixed": false },
    {
      "id": "ar1",
      "kind": "arc",
      "start": "p2",
      "end": "p4",
      "through": "p5",
      "construction": false,
    },
    { "id": "p6", "kind": "point", "x": 130, "y": 0, "construction": false, "fixed": false },
    { "id": "ci1", "kind": "circle", "center": "p2", "rim": "p6", "construction": false },
  ],
  "constraints": [
    { "id": "c1", "type": "horizontal", "a": "p1", "b": "p2" },
    {
      "id": "c2",
      "type": "distance",
      "a": "p1",
      "b": "p2",
      "value": 120, // omitted makes the dimension driven (measurement only)
      "orientation": "horizontal", // aligned (default) | horizontal | vertical
      "offset": 20, // dimension line offset in mm; presentation only
    },
    {
      "id": "c3",
      "type": "distance",
      "a": "p2",
      "b": "p3",
      "reference": "c2", // effective value is resolved through c2
    },
    {
      "id": "c4",
      "type": "derived_distance", // read-only cut dimension; no solver equation
      "piece": "pc1",
      "a": { "edge": "l1", "at": "start" },
      "b": { "edge": "l1", "at": "end" },
    },
  ],
  "pieces": [
    {
      "id": "pc1",
      "name": "Front",
      "edges": ["l1", "l2"], // ordered closed loop of cut edges
      "allowances": [
        { "edge": "l1", "width": 10, "kind": "double" }, // finished width 10 mm, cuts 20 mm
        { "edge": "l2", "width": 10 }, // kind omitted means "seam"
      ],
      "quantity": 2,
    },
  ],
  "seams": [{ "id": "s1", "edge": "l1", "width": 10 }], // deprecated: edges outside any piece
  "cornerRounds": [
    {
      "id": "r1",
      "corner": "p2",
      "ends": [
        { "line": "l1", "anchor": "p1", "tangent": "r1:a" },
        { "line": "l2", "anchor": "p3", "tangent": "r1:b" },
      ],
      "radius": 8,
      "arc": "r1:arc",
      "controls": ["r1:c1", "r1:c2"],
      "cornerConstruction": false,
    },
  ],
}
```

`cornerRounds` is optional, so documents written before the feature load
unchanged. A round is a live feature: it stores the sharp corner, both line
anchors and the radius, while its derived entities (tangent points `r1:a`,
`r1:b`, controls `r1:c1`, `r1:c2`, and the cubic arc `r1:arc`) live in
`entities` and are omitted from the snippet. `l1` and `l2` are trimmed to the
tangent points, and `p2` stays as a construction point.

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

The schema is `sewcraft.pattern/0.2`. `normalizeDocument` in
`packages/geometry/src/migration.ts` brings a document up to it on load and is
one-way and idempotent. A 0.1 document's closed seam chains become one piece each,
with those seams as `kind: 'seam'` allowances at the stored width and `side`
discarded. Seams on edges that close no loop stay in the deprecated `seams` field,
which is read-only after load and keeps its legacy dashed rendering until it is
removed in 0.3. The editor has no legacy-allowance authoring surface: allowances
are edited per piece, through the Pieces drawer or the entity inspector. Documents without `pieces` gain an empty list, and an
already-current document is returned unchanged.

A `distance` constraint without `value` or `reference` is a **driven** dimension:
it reports the live measurement and adds no solver equation. A `reference` links
one dimension to another; the effective value is derived, so the constraint
stores no duplicate `value`. When the source disappears, the dependent keeps its
`reference`, stores the last resolved number in `lastKnownValue` and renders as
**broken** until the user re-links it. At most one of `value` and `reference` is
present.

A `derived_distance` constraint is a **cut dimension**. It addresses two loop
vertices of one piece by `{ edge, at }` anchors rather than by point id, because
the cut loop has no entities of its own. Its value is measured from the resolved
cut loop on every read, it adds no solver equation (`solveDocument` filters it
out), and it is read-only: `update_constraint` accepts only `orientation` and
`offset`. When the piece or an anchored edge is deleted, `delete_entity` or
`delete_piece` removes the dimension, and a cut dimension whose anchors no longer
resolve keeps its references but has no reading to show, so it renders as broken
without a number.

See `docs/architecture/geometry-core.md` for
entity semantics and `docs/domain/command-spec.json` for the machine-readable
command schema.

## Notes

- Use `json` (not `jsonb`) for now so the in-memory SQLite test connection works
  unchanged. Revisit if we need indexing into geometry.
- No `user_id` yet; single-user self-hosted. Add it together with Sanctum when
  multi-user arrives.

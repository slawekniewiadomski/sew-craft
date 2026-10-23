# Command Spec

The machine-readable contract is [`command-spec.json`](./command-spec.json). The
runtime source of truth is `config/geometry.php`, exposed at `GET /api/commands`.
**Keep all three in sync** when a command changes.

## Envelope

```jsonc
{
  "id": "01J9Z...", // ULID, client-generated, makes commands idempotent
  "type": "add_point",
  "params": { "x": 0, "y": 0, "construction": true },
  "issuedAt": "2026-10-14T11:00:00Z",
}
```

## Commands (v0.11)

### `add_point`

Create a point. `construction` defaults to `false`. Points may later be marked
`fixed` (via a subsequent constraint/param) to anchor the sketch.

- params: `x: number`, `y: number`, `construction?: bool`
- inverse: `delete_entity`

### `move_point`

Move an existing point to new coordinates (the drag primitive). Re-solving after
this command is what makes a dragged point keep its constraints.

- params: `id: entity_id`, `x: number`, `y: number`
- inverse: `move_point` (back to the previous coordinates, keeping the command id)

### `add_line`

Segment between two existing points.

- params: `start: entity_id`, `end: entity_id`, `construction?: bool`
- inverse: `delete_entity`

### `add_curve`

Cubic Bézier through four control points `p0..p3`.

- params: `p0..p3: entity_id`, `construction?: bool`
- inverse: `delete_entity`

### `add_arc`

Create a true circular arc through three existing points: `start` and `end` bound
it and `through` is a point on the arc between them, which fixes both the bulge
and the sweep direction. The circle, centre, radius, angles and extents are all
derived and never stored, so the solver keeps operating on points only.

- params: `start: entity_id`, `end: entity_id`, `through: entity_id`,
  `construction?: bool`
- All three ids must resolve to drafting points distinct from each other and not
  derived by a corner round, and `start` must differ from `end`.
- `through` must lie at least `MIN_BULGE` (`0.001` mm) off the `start`→`end`
  chord; a smaller sagitta is a validation error ("through must be at least
  0.001 mm off the start-end chord").
- Re-applying a command whose arc id already exists is a no-op.
- inverse: `delete_entity`
- A seam allowance is allowed on an arc: it flattens to a polyline and the side
  follows the `start`→`end` direction.

### `add_circle`

Create a circle from two existing points: the centre and a point on the rim. The
radius is derived as the distance between them and is never stored, so the solver
keeps operating on points only.

- params: `center: entity_id`, `rim: entity_id`, `construction?: bool`
- Both ids must resolve to drafting points, distinct from each other and not
  derived by a corner round.
- `center` and `rim` must differ and their distance must be at least `MIN_RADIUS`
  (`0.001` mm); a smaller radius is a validation error.
- Re-applying a command whose circle id already exists is a no-op.
- inverse: `delete_entity`
- A seam allowance cannot be added to a circle in v1; `add_seam_allowance`
  rejects it with "seam allowances need a line, curve or arc edge".

### `add_construction_line`

Reference-only segment that is never a cut edge.

- params: `start: entity_id`, `end: entity_id`
- inverse: `delete_entity`

### `set_construction`

Convert an entity between construction geometry (a guide) and a cut edge. A
no-op when the entity already has the requested value, so it is idempotent.

- params: `id: entity_id`, `construction: bool`
- inverse: `set_construction` (restores the entity's previous value)

### `delete_entity`

Remove an entity and cascade-remove constraints that reference it, legacy seams on
it and any piece that uses it (a piece edge must exist). Removing a piece also
removes its cut dimensions.

- params: `id: entity_id`

### `add_constraint`

- params: `type` (§ solver), `entities: entity_id[]`, `value?: number`,
  `reference?: entity_id`,
  `orientation?: 'aligned' | 'horizontal' | 'vertical'`, `offset?: number`
- `value` is required for `angle` (radians). For `distance` it is optional: a
  finite value `> 0` creates a **set** dimension; omitting it creates a
  **driven** dimension that measures the sketch without adding an equation.
- `reference` applies only to `distance` and links it to an existing set or
  referenced dimension. It is mutually exclusive with `value`. The source must
  exist, be a `distance`, not be the same point pair, resolve to a finite
  positive value, and must not create a reference cycle. The new dimension
  stores `reference` and `lastKnownValue`, never a literal `value`.
- `orientation` and `offset` apply only to `distance`; they are presentation for
  the linear dimension that renders the constraint. `orientation` defaults to
  `aligned`, `offset` to `20` mm (signed, measured from the span).
- inverse: `remove_constraint`

Constraint param mapping:

| type            | entities order             | value   |
| --------------- | -------------------------- | ------- |
| `coincident`    | `[a, b]`                   | —       |
| `horizontal`    | `[a, b]`                   | —       |
| `vertical`      | `[a, b]`                   | —       |
| `point_on_line` | `[point, a, b]`            | —       |
| `distance`      | `[a, b]`                   | mm      |
| `angle`         | `[a, b, c]` (angle at `b`) | radians |
| `equal`         | `[a1, a2, b1, b2]`         | —       |

### `update_constraint`

Change the driving value or reference of a dimensional constraint, or a distance
constraint's dimension presentation. At least one of `value`, `reference`,
`orientation` or `offset` is required. A value/reference edit re-solves the
sketch; an orientation/offset-only edit changes presentation and is a no-op for
the solver.

- params: `id: entity_id`, `value?: number | null`,
  `reference?: entity_id | null`, `orientation?: aligned|horizontal|vertical`,
  `offset?: number`
- `value` keeps the `add_constraint` rules when it is a number (`distance > 0`,
  `angle` finite). A number breaks any existing reference; `null` clears a
  `distance` to driven. Omitting it leaves the current state untouched; `null`
  is rejected for `angle`.
- `reference` links a `distance` to an existing source using the same validation
  as `add_constraint`; it removes any literal `value` and stores the source's
  resolved value as `lastKnownValue`. `reference: null` unlinks and keeps the
  current effective value as a literal `value`, so geometry does not jump.
- `value` and `reference` are mutually exclusive in one update; `reference: null`
  still counts as a reference field and cannot be combined with `value`.
- `orientation`/`offset` are rejected for non-distance constraints.
- A **cut dimension** (`derived_distance`) accepts `orientation` and `offset` only;
  `value` and `reference` are rejected because the number follows the cut loop and
  drives nothing.
- A no-op update (same value, same link, same presentation) returns
  `inverse: null`.
- inverse: `update_constraint` (restores the previous state and effective
  presentation values, keeping the command id; a link edit inverts to the
  previous `reference`/`lastKnownValue`, a literal edit to its previous `value`,
  and an unlink to the previous `reference`)

### `remove_constraint`

- params: `id: entity_id`
- Removing a referenced source leaves its dependents' `reference` recorded and
  writes the last resolved number into `lastKnownValue`, so they render as
  broken rather than disappearing.
- Removing a cut dimension is a normal removal; its inverse recreates it with
  `add_derived_dimension`.
- inverse: `add_constraint` (params rebuilt from the removed constraint, keeping
  its id), or `add_derived_dimension` for a cut dimension.

### `add_seam_allowance`

> **Deprecated (v0.10):** kept for edges outside any piece. New work uses
> `set_piece_allowance`; the seam commands are removed in 0.3.

Attach a seam allowance to a cut line or curve edge. The allowance is stored per edge
and generated as a true offset of that edge (see `@sewcraft/geometry`'s
`seamAllowancePath` / `offsetPolyline`). At most one allowance may be attached to
an edge. Construction guides (`add_construction_line`) are not cut edges and are
rejected. An edge that belongs to a piece is rejected: set the allowance on the
piece instead.

- params: `edge: entity_id`, `width?: number` (mm; defaults to `10`),
  `side?: left|right` (defaults to `left`)
- `width` must be finite and greater than `0`.
- `side` selects the offset side relative to the edge's start→end direction. An
  omitted side stores `left`, which is the original rendering.
- inverse: `remove_seam_allowance` (targets the created seam id)

### `remove_seam_allowance`

> **Deprecated (v0.10):** see `add_seam_allowance`.

Detach the seam allowance from an edge.

- params: `id: entity_id` (the seam id, i.e. the `add_seam_allowance` command id)
- inverse: `add_seam_allowance` (params rebuilt from the removed seam, keeping its
  id, width and stored side)

### `set_seam_allowance`

> **Deprecated (v0.10):** see `add_seam_allowance`; `set_piece_allowance` replaces
> it for loop edges.

Change the width or side of an attached seam allowance without detaching it.

- params: `id: entity_id` (an existing seam id), `width?: number` (mm),
  `side?: left|right`
- At least one of `width` and `side` is required.
- `width` follows the `add_seam_allowance` rule: finite and greater than `0`.
- `side` must be `left` or `right`; an unknown value is a validation error.
- An unknown seam is a validation error. Re-applying the current values is a
  no-op with `inverse: null`.
- inverse: `set_seam_allowance` (restores the previous width and, when it was
  stored or changed, the previous side; keeping the command id)
- additive: v0.5 payloads still apply; `spec_version` is bumped to `0.6.0`.

### `add_corner_round`

Round a corner between two lines. Both lines are trimmed to their tangent points,
a cubic Bézier arc and its control points are derived, and the sharp corner stays
as a construction point so dimensions and constraints on it keep driving the
sketch.

- params: `first: entity_id`, `second: entity_id`, `radius: number` (mm)
- Both params name distinct `line` entities that share exactly one point.
- Neither line may already be rounded at that shared corner, carry a seam
  allowance, or be joined at the corner by a third line of the same
  construction flag.
- Both lines must have the same `construction` flag; the arc and tangent points
  inherit it.
- `radius` must be finite, at least `0.001`, and fit both lines while leaving at
  least `0.001` mm of each line outside the tangent point. The corner angle must
  be strictly between `0°` and `180°` with a `1°` guard at each end.
- Derived ids are deterministic: `<id>:a` and `<id>:b` (tangent points),
  `<id>:c1`/`<id>:c2` (controls) and `<id>:arc`. Re-applying a command whose
  feature exists is a no-op.
- inverse: `remove_corner_round` with the feature id.

### `set_corner_round_radius`

Change the radius of an existing round without removing it. Both tangent points,
the arc and the line endpoints regenerate in the same command.

- params: `id: entity_id` (the feature id), `radius: number` (mm)
- Same fit and angle rules as `add_corner_round`, including any round at the
  opposite end of either line. An out-of-range radius is a validation error and
  leaves the document unchanged.
- Re-applying the current radius is a no-op with `inverse: null`.
- inverse: `set_corner_round_radius` with the previous radius.

### `remove_corner_round`

Restore a rounded corner.

- params: `id: entity_id` (the feature id)
- Restores both line endpoints to the sharp corner, restores the corner's
  previous construction flag, deletes the tangent points, control points and arc,
  and removes the feature. A line with a round at its other end keeps that round.
- inverse: `add_corner_round` with the original lines and radius.

### `create_piece`

Create a **piece**: one closed loop of existing cut edges that is cut from
fabric. The edge order is the loop order and is the single source of truth for
"outward", which is why no side is ever requested.

- params: `edges: entity_id[]` (ordered, closed), `name?: string`,
  `quantity?: int` (≥ 1), `allowance?: 'default' | 'none' | { width, kind? }`
- `allowance: 'default'` copies the document's effective default onto every loop
  edge, one entry per edge; `'none'` or an omitted param keeps today's empty list;
  an object copies that preset. A preset `width` is a finite number greater than
  `0`, and an unknown `kind` is a validation error. An omitted preset `kind`
  copies as `seam`.
- Validation: at least three edges; every edge is an existing non-construction
  `line`, `curve` or `arc`; no duplicate edge; each edge's end is the next edge's
  start and the last connects back to the first; no edge already belongs to
  another piece. A `circle` cannot be a loop edge in v1.
- A rejected loop names the first edge that fails to connect.
- `name` is trimmed and must be non-empty; `quantity` must be an integer of at
  least 1. Both are optional; an omitted quantity means 1.
- Re-applying a command whose piece id already exists is a no-op.
- inverse: `delete_piece` for the new piece.

### `update_piece`

Rename a piece or change its cut quantity.

- params: `id: entity_id`, `name?: string | null`, `quantity?: int | null`
- At least one of `name` and `quantity` is required.
- A string sets the trimmed name; `null` clears it. A quantity is an integer of at
  least 1; `null` clears it, which means 1.
- Re-applying the current values is a no-op with `inverse: null`.
- inverse: `update_piece` with the previous values (`null` for a value that was
  absent).

### `delete_piece`

Remove a piece and cascade-remove its cut dimensions.

- params: `id: entity_id`
- Deleting an already-missing piece is a no-op.
- inverse: `null`; restoring a piece together with its cut dimensions is not a
  single command, so undo uses the journal's document snapshot (as
  `delete_entity` does).

### `set_piece_allowance`

Set, change or remove the allowance of one loop edge of a piece.

- params: `piece: entity_id`, `edge: entity_id`, `width?: number` (mm, finished
  width), `kind?: seam|single|double`, `remove?: bool`
- `edge` must be in that piece's loop.
- `remove: true` removes the edge's allowance and takes neither `width` nor
  `kind`; removing an allowance that is not there is a no-op.
- Otherwise `width` is required, finite and greater than `0`. It is the
  **finished** width: a `seam` or `single` offset cuts at `width`, a `double`
  offset cuts at `2 × width` and adds a fold line at `width`.
- `kind` defaults to `seam`; an unknown kind is a validation error.
- Re-applying the same width and effective kind is a no-op with `inverse: null`.
- inverse: `set_piece_allowance` with the previous width and kind, or with
  `remove: true` when the edge previously had no allowance.

### `set_default_allowance`

Set, change or clear the allowance that `create_piece` copies onto a new piece.

- params: `width?: number` (mm, finished width), `kind?: seam|single|double`,
  `remove?: bool`
- `width` is the **finished** width, like `set_piece_allowance`: a `seam` or
  `single` offset cuts at `width`, a `double` offset cuts at `2 × width`.
- `kind` defaults to `seam`; an unknown kind is a validation error.
- `remove: true` clears the default and takes neither `width` nor `kind`;
  clearing an already-off default is a no-op.
- A document without a stored default resolves to the built-in **10 mm seam**, so
  setting that preset is a no-op. Changing the default never rewrites an existing
  piece; only pieces created afterwards copy it.
- inverse: `set_default_allowance` restoring the previous effective preset, or
  `remove: true` when the default is created from the off state.

### `add_derived_dimension`

Add a read-only **cut dimension** between two loop vertices of one piece.

- params: `piece: entity_id`, `a: cut_anchor`, `b: cut_anchor`,
  `orientation?: aligned|horizontal|vertical`, `offset?: number`
- A `cut_anchor` is `{ edge: entity_id, at: 'start' | 'end' }`: it addresses a
  loop vertex by an edge of the piece rather than by point id, because the cut
  loop has no entities of its own.
- Both anchors must name edges in that piece and must differ. The two vertices
  must not resolve to the same point.
- The dimension stores no value: it is measured from the resolved cut loop on
  every read, adds no solver equation, and is read-only in v1. `update_constraint`
  accepts only `orientation` and `offset` for it.
- When the piece or an anchored edge disappears the dimension is **broken**: it
  stores no reading, so it shows no number and adds no equation until its
  anchors resolve again, exactly like a dangling reference.
- Re-applying a command whose dimension id already exists is a no-op.
- inverse: `remove_constraint`

### Migration from spec 0.10.0

`set_default_allowance` is new and the optional `defaults` document field it
maintains is additive, so every 0.10.0 payload still applies unchanged. A
document written without `defaults` resolves the built-in 10 mm seam on load; the
pattern schema string stays `sewcraft.pattern/0.2`. `create_piece` gains an
optional `allowance` param whose absence keeps the previous empty-list behaviour.
`spec_version` is bumped to `0.11.0`.

### Migration from spec 0.9.0

Pieces are new. `create_piece`, `update_piece`, `delete_piece`,
`set_piece_allowance` and `add_derived_dimension` are additive commands, and the
`pieces` document collection and the `derived_distance` constraint type are
additive, so every 0.9.0 payload still applies unchanged. The `seam` commands stay
available, marked deprecated, for edges outside any piece. They have **no editor
surface**: the app renders a legacy seam read-only and edits allowances only per
piece (`set_piece_allowance`).

The pattern schema moves from `sewcraft.pattern/0.1` to `sewcraft.pattern/0.2`.
A 0.1 document is migrated on load: every closed chain of seam-carrying edges
becomes one piece with those allowances as `kind: 'seam'`, the stored width kept
and `side` discarded; seams on edges that close no loop stay in the deprecated
`seams` field for the legacy dashed rendering. The migration is one-way and
idempotent. `spec_version` is bumped to `0.10.0`.

### Migration from spec 0.8.0

`add_arc` is new and the `arc` entity kind is additive, so every 0.8.0 payload
still applies unchanged. The pattern schema string stays `sewcraft.pattern/0.1`.
`spec_version` is bumped to `0.9.0`.

### Migration from spec 0.7.0

`add_circle` is new and the `circle` entity kind is additive, so every 0.7.0
payload still applies unchanged. The pattern schema string stays
`sewcraft.pattern/0.1`. `spec_version` is bumped to `0.8.0`.

### Migration from spec 0.6.0

`add_corner_round`, `set_corner_round_radius` and `remove_corner_round` are new.
The optional `cornerRounds` document collection they maintain is additive, so
existing 0.6.0 payloads still apply unchanged.

`add_constraint` and `update_constraint` accept an optional `reference` on
`distance` constraints, linking one dimension to another. A referenced dimension
stores no literal `value`; its effective number is derived, and `lastKnownValue`
preserves the display when the source disappears. Both fields are additive, so
every 0.6.0 payload still applies unchanged. `spec_version` is bumped to `0.7.0`.

### Migration from spec 0.5.0

`add_seam_allowance` and `set_seam_allowance` accept an optional `side`
(`left` or `right`) for the offset relative to the edge direction. An omitted
side on `add_seam_allowance` means `left`, so existing payloads render exactly as
before. `set_seam_allowance.width` becomes optional because a payload may change
only the side (the Flip side action); every payload with a width still applies
unchanged. Both changes are additive — `spec_version` is bumped to `0.6.0`.

### Migration from spec 0.4.0

`add_constraint` for `distance` no longer requires `value`: an omitted value
creates a driven dimension. `update_constraint` accepts `value: null` to clear a
distance back to driven. Both changes are additive — every 0.4.0 payload still
applies unchanged (a distance with a value is still set). `spec_version` is
bumped to `0.5.0`.

### Migration from spec 0.3.0

`set_seam_allowance` is new. Existing payloads are unchanged and still apply.
`spec_version` is bumped to `0.4.0`.

### Migration from spec 0.2.0

`add_constraint` gained optional `orientation` and `offset` params for `distance`.
They are additive, so v0.2 payloads still apply unchanged. `update_constraint`
is new; `spec_version` is bumped to `0.3.0`.

### Migration from spec 0.1.0

`add_seam_allowance` previously required `piece` and `width`. The v0.1 model has
no `piece` entity, so the command always rejected; the allowance is now stored per
edge. The new params are `edge` + optional `width`; a legacy `piece` param is
ignored, so existing payloads still apply. The response shape is unchanged.
`spec_version` is bumped to `0.2.0`. A `piece` param can be reintroduced
additively once pieces are modelled (spec 006) — since 0.10 they are, through
`create_piece` and `set_piece_allowance`.

### `solve`

Request a solver rebuild. Typically emitted after a batch of geometry commands.

- params: `{}`

## Derived ids and idempotency

- An `add_*` command creates the entity/constraint with **id = the command's
  `id`**. Re-applying a command whose product already exists is a no-op.
- `delete_entity` / `remove_constraint` are no-ops when the target is already
  gone, so an at-least-once retry can never fail or double-apply.

## Validation rules

- Referenced entity ids must exist when the command is applied.
- `distance`/`angle` `value` must be finite; `distance` must be `> 0`.
- `add_curve` points must be distinct.
- A piece loop has at least three edges, each used once, each non-construction,
  and closes with no gaps; an edge belongs to at most one piece.
- A cut anchor names an edge of its own piece and a pair of anchors resolves to
  two distinct points.
- A piece allowance is `> 0` and the edge is in the piece; an allowance width is
  the finished width.

## Adding a command

1. Add an entry to `config/geometry.php` and `command-spec.json`.
2. Document it here.
3. Implement `applyCommand` handling in `@sewcraft/geometry` with tests.
4. Wire any UI affordance. Emit it from the command bus — never mutate state
   directly.

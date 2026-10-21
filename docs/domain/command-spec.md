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

## Commands (v0.7)

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

Remove an entity and cascade-remove constraints that reference it.

- params: `id: entity_id`

### `add_constraint`

- params: `type` (§ solver), `entities: entity_id[]`, `value?: number`,
  `orientation?: 'aligned' | 'horizontal' | 'vertical'`, `offset?: number`
- `value` is required for `angle` (radians). For `distance` it is optional: a
  finite value `> 0` creates a **set** dimension; omitting it creates a
  **driven** dimension that measures the sketch without adding an equation.
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

Change the driving value of a dimensional constraint, or a distance constraint's
dimension presentation. At least one of `value`, `orientation` or `offset` is
required. A value edit re-solves the sketch and moves the measured geometry; an
orientation/offset-only edit changes presentation and is a no-op for the solver.

- params: `id: entity_id`, `value?: number | null`, `orientation?: aligned|horizontal|vertical`,
  `offset?: number`
- `value` keeps the `add_constraint` rules when it is a number (`distance > 0`,
  `angle` finite). `null` clears a `distance` to driven; omitting it leaves the
  value untouched; `null` is rejected for `angle`.
- `orientation`/`offset` are rejected for non-distance constraints.
- inverse: `update_constraint` (restores the previous state and effective
  presentation values, keeping the command id; a cleared dimension inverts to
  its previous value, and a driven one inverts to `value: null`)

### `remove_constraint`

- params: `id: entity_id`
- inverse: `add_constraint` (params rebuilt from the removed constraint, keeping its id)

### `add_seam_allowance`

Attach a seam allowance to a cut line or curve edge. The allowance is stored per edge
and generated as a true offset of that edge (see `@sewcraft/geometry`'s
`seamAllowancePath` / `offsetPolyline`). At most one allowance may be attached to
an edge. Construction guides (`add_construction_line`) are not cut edges and are
rejected.

- params: `edge: entity_id`, `width?: number` (mm; defaults to `10`),
  `side?: left|right` (defaults to `left`)
- `width` must be finite and greater than `0`.
- `side` selects the offset side relative to the edge's start→end direction. An
  omitted side stores `left`, which is the original rendering.
- inverse: `remove_seam_allowance` (targets the created seam id)

### `remove_seam_allowance`

Detach the seam allowance from an edge.

- params: `id: entity_id` (the seam id, i.e. the `add_seam_allowance` command id)
- inverse: `add_seam_allowance` (params rebuilt from the removed seam, keeping its
  id, width and stored side)

### `set_seam_allowance`

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

### Migration from spec 0.6.0

`add_corner_round`, `set_corner_round_radius` and `remove_corner_round` are new.
The optional `cornerRounds` document collection they maintain is additive, so
existing 0.6.0 payloads still apply unchanged; `spec_version` is bumped to
`0.7.0`.

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
`spec_version` is bumped to `0.2.0`; a `piece` param can be reintroduced
additively once pieces are modelled (spec 006).

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

## Adding a command

1. Add an entry to `config/geometry.php` and `command-spec.json`.
2. Document it here.
3. Implement `applyCommand` handling in `@sewcraft/geometry` with tests.
4. Wire any UI affordance. Emit it from the command bus — never mutate state
   directly.

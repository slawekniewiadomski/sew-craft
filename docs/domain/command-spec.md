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

## Commands (v0.1)

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

### `delete_entity`

Remove an entity and cascade-remove constraints that reference it.

- params: `id: entity_id`

### `add_constraint`

- params: `type` (§ solver), `entities: entity_id[]`, `value?: number`
- `value` is required for `distance` (mm) and `angle` (radians).
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

### `remove_constraint`

- params: `id: entity_id`
- inverse: `add_constraint` (params rebuilt from the removed constraint, keeping its id)

### `add_seam_allowance`

Set seam allowance width on a piece edge.

- params: `piece: entity_id`, `edge: entity_id`, `width: number` (mm)
- Not yet reversible in v0.1; use a snapshot checkpoint for undo.

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

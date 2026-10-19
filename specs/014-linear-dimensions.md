# 014 — Linear dimensions

Status: done
Depends on: 003, 004, 013

## 📝 TLDR

Give the editor a **linear dimension tool**: click a line (or two points) and a
CAD-style dimension appears — extension lines from the measured entities, a
dimension line with a chevron at each end, and the millimetre value on top.
Double-clicking the value edits it inline; changing it drives the geometry
through the constraint solver. The same value, measurement axis and offset can be
edited from a dedicated **Dimensions** sidebar drawer.

## 📝 Problem Statement

- **Who needs it:** the maker drafting a pattern who must set and read exact
  measurements (bust width, hem length) instead of eyeballing the grid.
- **What happens today:** the solver already supports `distance` constraints and
  the canvas draws a small `distance` icon at the span midpoint, but there is no
  way to see the value in CAD form, no way to place a dimension by picking
  geometry, and no way to edit a value on the canvas. Distances are created only
  by the generic constraint picker and can only be read by reading the document.
- **Evidence it matters:** every CAD tool a sewist has used (AutoCAD, Fusion,
  Shapr3D, SolidCraft) shows dimensions as first-class, editable annotations; a
  pattern without readable measurements is unusable for cutting.
- **Constraint:** dimensions are derived from the existing `distance`
  constraint — no new entity kind, no database migration, and the command layer
  stays the only mutation path.

## 📝 Proposed Solution

A dimension **is** a driving `distance` constraint plus presentational fields.
The geometry package owns the layout maths; Vue owns rendering and input.

### Model and commands

`DistanceConstraint` gains two optional, presentation-only fields:

| Field         | Type                                    | Default   | Meaning                                      |
| ------------- | --------------------------------------- | --------- | -------------------------------------------- |
| `orientation` | `aligned` \| `horizontal` \| `vertical` | `aligned` | which span the constraint drives             |
| `offset`      | `number` (mm, signed)                   | `12`      | distance from the span to the dimension line |

The `distance` residual becomes orientation-aware:

- `aligned`: `‖b−a‖ − value`
- `horizontal`: `|bx−ax| − value`
- `vertical`: `|by−ay| − value`

`add_constraint` accepts `orientation`/`offset` for `distance`; a new
`update_constraint` command edits `value`, `orientation` and/or `offset` and is
its own inverse. The command spec moves to **0.3.0** (additive: v0.2 payloads
still apply). No `add_dimension` command exists.

### Geometry (`packages/geometry/src/dimension.ts`)

Pure, DOM-free layout helpers consumed by the canvas:

- `dimensionGeometry(document, constraint)` → extension lines (with a small gap
  from the measured points and an overshoot past the dimension line), the
  dimension line, two end chevrons and a value label with a rotation angle that
  keeps text upright. Returns `null` when a point is missing.
- `measureLinearDimension`, `inferDimensionOrientation`,
  `dimensionOffsetForPointer`, `findDistanceConstraint`,
  `constraintOrientation`, `constraintOffset`.

### Editor interaction

- **Dimension tool** in the ribbon (Sketching group). Picking a **line** emits a
  placement for its endpoints; picking **points** collects a pair. While the
  placement is armed a live preview follows the pointer, choosing the axis
  (`inferDimensionOrientation`) and offset (`dimensionOffsetForPointer`); the next
  click commits. `Escape`/another tool cancels.
- The canvas renders dimensions from every `distance` constraint: extension
  lines and chevrons in world space, the value label in screen space (constant
  size, upright).
- **Double-click a value** opens an inline editor. Enter commits, Escape cancels,
  blur commits a valid value and discards an invalid one; invalid values keep the
  editor open. Committing emits `update_constraint` and re-solves.
- **Drag the dimension line or its label** to change `offset` only.
- If a distance already exists between the picked points, placing reuses it
  (updating presentation) instead of adding a duplicate equation.
- A **View** toggle shows/hides the dimension layer without touching the
  document.

### Sidebar

A new **Dimensions** drawer lists every `distance` constraint with its value
(mm), orientation and offset, all editable, plus Remove. Distance constraints are
removed from the generic **Constraints** list so they have one home.

## 📝 Acceptance criteria

- [x] A `distance` constraint can carry `orientation` and `offset`; the solver
      drives the aligned, horizontal or vertical span accordingly.
- [x] `add_constraint` accepts `orientation`/`offset`; `update_constraint` edits
      value/orientation/offset with a lossless inverse; invalid params are
      rejected without mutating the document.
- [x] The dimension tool places a dimension from a line or two points, with a
      live, orientation-aware preview, and reuses an existing distance.
- [x] The canvas renders extension lines, a chevron dimension line and an upright
      value label for every dimension; the layer can be hidden via View.
- [x] Double-clicking a value edits it inline (Enter/Escape/blur) and the new
      value re-solves the geometry.
- [x] Dragging a dimension line changes only its offset.
- [x] The Dimensions drawer edits value/orientation/offset and removes a
      dimension; the Constraints drawer lists non-distance constraints only.
- [x] Command spec, config and JSON schema agree at `0.3.0`; docs updated.
- [x] Unit coverage stays at 100% and lint/format/typecheck/build pass.

## Out of scope

- Angular, radial, diameter, ordinate and baseline/chained dimensions.
- Associativity across `delete_entity` beyond "the constraint disappears when its
  points disappear".
- Dimension text overrides, tolerances, precision settings and unit switching.
- A dimension being an undoable _view_ setting (only value/orientation/offset
  changes go through commands).

## Checks

```bash
cd packages/geometry && npx vitest run --coverage
npm run test:coverage            # frontend + geometry, 100% gate
npm run lint
npm run format:check
npm run typecheck
npm run build
docker compose run --rm app php artisan test
```

## Files

- `packages/geometry/src/dimension.ts`, `types.ts`, `solver.ts`, `commands.ts`,
  `index.ts` (+ tests)
- `frontend/src/lib/dimensions.ts`, `editor-tools.ts`, `editor-ribbon.ts`,
  `ribbon-icons.ts`, `editor-drawers.ts` (+ tests)
- `frontend/src/components/PatternCanvas.vue`,
  `frontend/src/views/EditorView.vue` (+ tests)
- `config/geometry.php`, `docs/domain/command-spec.md`,
  `docs/domain/command-spec.json`, `docs/architecture/*`, `docs/domain/glossary.md`

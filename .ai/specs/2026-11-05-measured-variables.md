# Measured variables — a variable that reads a chain of edges

Status: **implemented** — the decisions below were taken with the maintainer in
the design conversation that produced this spec, and the feature ships on the
branch that carries it.
Builds on: `014-variables-and-expressions.md` (document variables, `Param`),
`2026-10-20-driven-and-set-dimensions.md` (a driven dimension measures geometry
and stores no value), and `2026-10-20-referenced-dimensions.md` (a broken
reference keeps `lastKnownValue`).
Command spec: `0.18` → `0.19`. Pattern schema: `sewcraft.pattern/0.6` → `0.7`.

## 📝 TLDR

A variable can now be **measured** instead of written: it stores an ordered,
connected chain of line/curve/arc/circle ids and resolves to the total length of
that chain on every read. Drag an endpoint and the number follows; use it in any
formula (`$neck/2`, `$armhole + 2cm`) exactly like a written variable. It is
still one row in the same panel and one command, `set_variable` with
`kind: 'measurement'`. Deleting a source freezes the row at its last reading and
marks it Broken, so dependents keep solving.

## 📝 Problem Statement

- **Who needs it:** the maker who measures an armhole and drives the sleeve cap
  from it, or who wants the neckline length at hand while drafting. Today that
  number exists only as a driven dimension on one edge, cannot be named, cannot
  span several edges, and cannot be used in a formula.
- **What exists today:** `Variable` (`types.ts`) is a name bound to a `Param`
  (literal or formula over other variables). A driven `DistanceConstraint`
  measures geometry but is not nameable and measures only one span.
  `derivedDimensionValue` measures a piece's cut loop but yields a number for a
  label, not a variable. There is no way to bind a name to geometry.
- **Constraint:** commands stay the only mutation path, `@sewcraft/geometry` stays
  pure and dependency-free, every 0.6 document keeps loading, and the 100 %
  coverage gate applies to every new branch.

## 📝 Decisions

| #   | Question                                                     | Decision                                                                                                                                             |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Which entities can be sources?                               | **Lines, curves, arcs and circles, in any role** (cut and construction). A corner-round arc is a normal arc entity with a stable id, so it needs no new source kind. |
| Q2  | How is a length taken?                                       | Lines straight, arcs true arc length, cubics through the existing flatten, circles by circumference. Seam-allowance offsets and piece loops are not sources. |
| Q3  | Must the selection be connected?                             | **Yes.** Consecutive edges share an endpoint point id, in either orientation. A single edge is a valid chain of one; a circle is only valid alone. A gap is rejected with a message naming the pair. |
| Q4  | May a measured variable drive a dimension?                   | **Yes, anywhere a number goes.** A write-time guard rejects the obvious self-reference (the dimension sits on the measured chain); deeper loops rely on the solver's non-convergence rollback. |
| Q5  | What happens when a source is deleted?                       | The chain total is captured into `lastKnown` before the entity leaves, the row shows that number plus **Broken**, and formulas that name it keep resolving to it. |
| Q6  | One list or two in the panel?                                | **One table.** Measured rows show a read-only value, a `Measured · N` pill (the pill is the highlight button) and a comment. |
| Q7  | Where is a measured variable created?                        | **Both**: a Selection action on a multi-selection, and a small kind picker under the panel's New button. The panel picker is disabled when the selection is not a valid chain. |
| Q8  | What does the canvas show?                                   | Only while the row is active: its sources highlighted in the formula colour. Nothing is drawn otherwise. |
| Q9  | Sum or more aggregates?                                      | **Sum only.** Ordered ids are stored anyway, so a perimeter or min/max can follow later. |
| Q10 | Does a measured variable have a unit?                        | Yes, for display only; the value is a length in mm and the toggle converts the shown number. |

## 📝 Data Model

```ts
/** A named value: written (a literal or formula) or measured from geometry. */
export type Variable = ValueVariable | MeasuredVariable;

export interface ValueVariable {
  slug: string;
  name: string;
  unit: Unit;
  /** Absent means value, so 0.6 documents need no conversion. */
  kind?: 'value';
  value: Param;
  comment?: string;
}

export interface MeasuredVariable {
  slug: string;
  name: string;
  unit: Unit;
  kind: 'measurement';
  /** Ordered connected chain; every id is a line, curve, arc or circle. */
  sources: EntityId[];
  /** The last total in mm, captured when the chain breaks. */
  lastKnown?: number;
  comment?: string;
}
```

- `sources` is stored in chain order. The command accepts any order, validates
  connectivity and canonicalises (start at a free end, or at the first id for a
  closed loop) so an agent or the UI can send a selection set.
- `lastKnown` is a fallback only; while the chain resolves the live total wins.
  It is written on creation, on a source re-pick, and before a delete.
- No `value` on a measured variable: two sources of truth are the thing this
  avoids.

## 📝 Resolution

`measurement.ts` (new, alongside `expression.ts` in `@sewcraft/geometry`):

```ts
export function isMeasuredVariable(variable: Variable): variable is MeasuredVariable;
/** Ordered chain, or the reason it is not one. */
export function measurementChain(entities, ids): MeasurementChainResult;
/** Total length in mm, or null when a source is missing or degenerate. */
export function measurementLength(entities, sources): number | null;
```

- `VariableScope` gains `entities?: readonly Entity[]`, so `resolveVariable` can
  read the chain. Callers that pass a whole `PatternDocument` already satisfy it;
  a bare `{ variables }` scope simply cannot resolve a measurement (null), which
  is correct for tests and legacy call sites.
- A measured variable resolves to `{ value: length, exponent: 1 }`. A broken
  chain resolves to `lastKnown` when it exists, so dependents keep solving.
- `variableRows` in the frontend reports `type: 'measured'`, the live number (or
  `lastKnown`), the source count and `broken` (chain resolves to null), and marks
  the row's edit control read-only.

## 📝 Commands

`set_variable` gains `kind?: 'value' | 'measurement'` and `sources?: EntityId[]`;
`value` becomes optional, still required for a value variable.

- `kind: 'measurement'` requires a non-empty `sources`; `value` must be absent.
  The chain is validated and canonicalised; `lastKnown` is the resolved total.
- A value variable may not carry `sources`.
- `update_variable` accepts `sources` (measurement rows only) and rejects `value`
  on a measured row; the kind never changes.
- `remove_variable` is unchanged.
- `delete_entity` refreshes `lastKnown` for every measured variable whose chain
  still resolves, before the entity is removed, mirroring
  `captureBrokenDependents`. Restoring the entity is a journal snapshot, as with
  cascaded constraints.
- Self-reference guard: a formula stored on a driving dimension
  (`add_constraint` / `update_constraint` with a value) is rejected when its
  transitive variable closure names a measured variable whose chain contains one
  of the dimension's own anchor points or anchor lines.

## 📝 UI

- `VariablesPanel`: a measured row renders the value read-only with a chain
  glyph, the unit as plain text, a `Measured · N` pill (a button that emits
  `highlight` with the sources, cleared on a second click), and the comment
  input.
- Header keeps `+ New` (value) and adds an inline icon action
  "Add measured variable from selection", enabled only when the current selection
  is a valid chain.
- `SelectionSummary` gains "Add as measured variable" for 2+ selected edges,
  disabled with a hint when the selection is not a connected chain.
- `PatternCanvas` gains `highlightedEntityIds` and draws those edges in
  `text-dimension-formula` above the normal geometry, pointer-events none.
- `EditorView` owns the highlight state (one slug at a time) and dispatches both
  creation paths.

## 📝 Acceptance Criteria

- A chain of two or more connected edges becomes a variable whose value equals
  the sum of their lengths, and follows a point drag without a command per frame.
- An arc contributes its true arc length; a circle only as a lone source.
- A disjoint, branching or unknown selection is rejected and nothing changes.
- A measured variable can be used in any length formula, including a driving
  dimension that is not on its own chain; a self-referencing write is rejected.
- Deleting a source keeps the row's last number, marks it Broken, and dependents
  keep their value; re-picking sources heals it.
- The panel and the Selection action both create a measured variable.
- 100 % coverage for statements, branches, functions and lines.

## 📝 Testing

- `packages/geometry/tests/measurement.test.ts`: chain ordering (open, closed,
  single, reversed), circle-alone rule, gap/branch/duplicate/kind rejections,
  lengths for each kind, degenerate geometry, missing points.
- `packages/geometry/tests/variables.test.ts`: measured create/update/delete,
  `lastKnown` capture, formula resolution, self-reference guard, no-op updates,
  unit display.
- `frontend/tests/lib/variables.test.ts`: measured rows, broken rows, display
  unit conversion.
- `frontend/tests/components/VariablesPanel.test.ts`: read-only value, highlight
  emit, header action enablement.
- `frontend/tests/components/SelectionSummary.test.ts` (or the existing
  SelectionSummary coverage): the measure action and its hint.
- `frontend/tests/components/PatternCanvas.test.ts`: the highlight layer renders
  the measured sources and nothing when the prop is empty.
- `tests/Feature/CommandSpecTest.php`: the new params and the bumped version.

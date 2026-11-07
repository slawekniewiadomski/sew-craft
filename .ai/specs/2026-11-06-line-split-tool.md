# Split line tool — a shared vertex instead of a break

Status: **implemented** — the decisions below were settled with the maintainer
before implementation and ship on the branch that carries this spec.
Builds on: `2026-10-19-ribbon-icon-groups.md` and
`2026-10-23-feature-group-and-piece-corner-rounds.md` (the tool model and Features
group), `2026-10-22-pieces-and-allowance.md` (piece loops, per-edge allowances),
`2026-10-25-piece-containers-and-annotations.md` (the piece still owns its
vertices), `2026-10-24-point-on-line.md` (projection and snap precedents),
`2026-10-23-cut-dimension-tool.md` (cut anchors), and
`2026-11-05-measured-variables.md` (measured chains).
Command spec: `0.19` → `0.20`. Pattern schema: unchanged
(`sewcraft.pattern/0.7`).

## 📝 TLDR

A new **Split** tool splits one straight line into **two connected halves** at a
point the user chooses. The halves share a single vertex, so the piece loop stays
closed and there is no gap or seam at the split. The original edge keeps its id
as the first half; one new edge is created for the second half. Everything that
references the edge follows the geometry: allowances, corner rounds, notches,
measured chains, midpoint constraints and cut dimensions.

## 📝 Problem Statement

- **Who needs it:** a maker who wants to place a notch, a cut dimension or a
  seam exactly in the middle of a long edge, or who needs a vertex where a
  measurement or a construction line meets the edge.
- **What fails today:** the only way to get a new vertex on an edge is to delete
  the edge and redraw two new ones. That breaks the piece loop, drops the
  allowance, detaches corner rounds, and silently loses notches, measured
  variables and cut dimensions that named the old edge.
- **Why a dedicated tool:** splitting is a geometric edit with its own pick
  target (a point on a line). A selection action would have to infer the point
  from the current selection, which is ambiguous when several entities are
  selected. The tool makes the intent explicit and keeps the command layer
  simple.

## 📝 Decisions

- **Shared vertex, not a break.** The two halves stay connected at the split
  point. A gap or a coincident-constraint pair is rejected: the piece's loop is
  the source of truth and a single vertex keeps it exact.
- **Straight lines only.** Curves, arcs and circles are out of scope; the tool
  ignores them rather than approximating a split.
- **A first-class command.** `split_line { line, point }` is its own command, not
  a composed `[delete, add, add]` batch, because a line id is referenced in
  several independent places. One command owns the cascade, is idempotent, and
  can be tested as one unit.
- **Original id stays first.** The original edge keeps its id and its role as
  `start → split`; the new half is `split → original end` and takes the
  command's `id`. A caller that holds the original id (a selection, a dimension,
  an export) keeps a valid, visible edge.
- **The split is a geometric no-op.** Cut geometry, allowance rendering and the
  exported path are unchanged. The command therefore returns `inverse: null`;
  undo restores the journal snapshot.
- **Existing authored points are reused.** A point within 6 mm of the projection
  and within 0.001 mm of the line is reused as the shared vertex; otherwise the
  tool creates the point. This keeps dimensions and constraints attached when the
  user splits at a point that already exists.
- **No implicit constrain.** The new point is not constrained to the line. The
  split point is already the half's endpoint, so a `point_on_line` constraint
  would be redundant and could fight later edits.
- **Whole-edge cut dimensions block the split.** A `derived_distance` anchor with
  `at: 'edge'` measures the edge as a whole. Splitting would silently halve it,
  so the command refuses and the UI can explain why.
- **Nothing is selected afterwards.** A split changes the entity under the
  pointer; keeping a stale selection of the original id would highlight only one
  half. The user can select either half deliberately.

## 📝 Data Model

No schema change. The command edits existing fields:

| Field | Change |
| --- | --- |
| `LineEntity` (original) | `end` becomes the split point; every other field is copied. |
| `LineEntity` (new) | `id` = command id, `start` = split point, `end` = the original `end`; role, construction, piece copied. |
| `Piece.edges` | The new id is inserted **immediately after** the original in every loop that contains it. |
| `Piece.allowances` | A per-edge allowance on the original is copied onto the new half (same `width`, `kind`). No allowance is invented. |
| `PatternDocument.seams` | A legacy seam on the original is copied with id `<command-id>:seam`. |
| `CornerRound.ends[].line` | Each end keeps the half that owns its `tangent`; an end whose tangent is the original `start` stays, otherwise it moves to the new half. |
| `NotchMark.edge` | Moves to the half that contains the notch point, measured along the original line. |
| Measured `Variable.sources` | The original id is replaced in place by both halves, then canonicalised with `measurementChain`. |
| `MidpointConstraint` (line form) | Converted to the two-point form `{ a: line.start, b: line.end }` with the original endpoints, so the midpoint does not move. |
| `DerivedDistanceConstraint` anchors | An anchor with `at: 'end'` on the split line moves to the new half; `at: 'start'` and `at: 'edge'` stay (the latter blocks the split). |
| Constraints naming points | Untouched: the split adds a vertex, it does not move or replace the original points. |

## 📝 Commands

### `split_line` (version 0.20)

```json
{
  "id": "01J...",
  "type": "split_line",
  "params": { "line": "l1", "point": "p7" }
}
```

- `line` — an existing **straight line** (`kind: 'line'`).
- `point` — an existing point, strictly between the line's endpoints.

Validation, in order:

1. The command is a no-op when `command.id` already exists (idempotency).
2. `line` exists and is a line; `point` exists and is a point.
3. The point is not derived by a corner round and is not the target of a
   midpoint constraint.
4. When both carry a `piece`, the pieces match.
5. The point is not `line.start` or `line.end`.
6. The line has length, the point is within **0.001 mm** of it, and both halves
   are at least **0.001 mm** long.
7. No `derived_distance` anchor on `line` uses `at: 'edge'`.

The command returns `inverse: null`. A failure throws `CommandValidationError`
with a message the UI can show directly.

## 📝 UI

- **Placement:** the Features group, immediately after **Round corner**, with a
  new `split` ribbon glyph (a line with a highlighted midpoint). Label: **Split**.
- **Hover:** only a straight line that can be split is highlighted (thicker,
  primary colour). The pointer is projected onto the line and a ghost marks the
  split: a small filled circle at the projection, a diamond at the line's centre,
  or the snapped authored point.
- **Snap:** the nearest authored point within the 6 mm point tolerance of the
  projection is reused, provided it lies within 0.001 mm of the line, is not an
  endpoint, is not derived, and is not in another piece. With no point to reuse,
  a projection within the same tolerance of the line's centre snaps to the exact
  midpoint, so an even split needs no eye-balling; an authored point wins over
  the centre when both are in range. The ghost grows slightly for a reused point
  and the hint says "at this point" or "at its centre".
- **Click:** dispatches `[add_point, split_line]` when the click creates the point,
  or `split_line` alone when it reuses one, as **one journal entry**. The tool
  stays armed for the next split.
- **Status hint:** "Click a straight line to split it." while armed; "Click to
  split this line here.", "… at this point." or "… at its centre." over a valid
  line.
- **Guards:** no hover, ghost, hint or dispatch in a read-only document. A
  click on a curve, an endpoint, a sliver, or empty canvas does nothing. A line in
  another piece follows the existing cross-piece prompt; it is not split before
  the user switches pieces.
- **After the split:** nothing is selected. Both halves are ordinary cut edges and
  can be selected, dimensioned or rounded like any other edge.

## 📝 Acceptance Criteria

- [ ] Splitting a line at a new point creates exactly two lines that share the
      point; the original keeps its id and role; the new line uses the command id.
- [ ] A straight piece loop stays closed; the new edge follows the original in
      loop order and its allowance renders identically.
- [ ] A corner round at the original start stays on the original; a round at the
      original end moves to the new half; the rounded geometry does not move.
- [ ] A notch moves to the half that contains its point; a notch on another edge
      or with an unresolvable point is untouched.
- [ ] A measured variable that included the edge now includes both halves in a
      connected chain; a broken variable is left unchanged.
- [ ] A line-form midpoint constraint is converted to the two-point form and the
      midpoint stays where it was.
- [ ] An `at: 'end'` cut anchor moves to the new half; an `at: 'start'` anchor
      stays; an `at: 'edge'` anchor blocks the split.
- [ ] Points in another piece, derived points, midpoint targets, endpoints,
      off-line points and slivers are rejected with a clear message.
- [ ] A pointer near the line's centre snaps the ghost to the exact midpoint and
      the created point sits there; an authored point in range still wins.
- [ ] Re-applying the command is a no-op; undo restores the single edge.
- [ ] The tool is keyboard- and touch-usable through the shared canvas pointer
      path, and clears its hover on pointer leave, Escape, tool change and any
      document edit.

## 📝 Testing

- `packages/geometry/tests/split-line.test.ts` — every remap and every rejection
  branch, idempotency, shared-vertex geometry, a rounded piece solved through the
  command, and 100% statement/branch/function/line coverage of `applySplitLine`.
- `frontend/tests/lib/split-line.test.ts` — projection, point and centre snap
  tolerance, piece and derived-point filters, role mirroring (including legacy
  `construction`), and a batch that the command core accepts.
- `frontend/tests/components/PatternCanvas.test.ts` — idle/hover/point hints,
  ghost position and size, line highlight, emit payload, endpoint/curve/read-only
  guards, cross-piece refusal, and clearing on leave, Escape and tool change.
- `frontend/tests/views/EditorView.canvas.test.ts` — one journal entry for a new
  point, point reuse without a new entity, no dispatch for a broken line, and undo.
- `tests/Feature/CommandSpecTest.php` — the command is exposed at
  `GET /api/commands` with `inverse: null`.

## 📝 Out of scope

- Splitting curves, arcs or circles.
- Splitting an edge at a point that is not on it (no "break with gap").
- Splitting multiple selected edges in one gesture.
- A separate "split at midpoint" command; the Split tool's centre snap covers
  the even split.
- Snapping to the centre of a curve, arc or circle; only straight lines split.

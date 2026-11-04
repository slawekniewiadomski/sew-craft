# Piece marks — V notches and centre lines

Status: **implemented** — the design decisions below (Q1–Q8) were taken with the
maintainer before any code was written, and the feature ships on the branch that
carried this spec.

Builds on: `2026-10-22-pieces-and-allowance.md` (piece loop and allowances),
`2026-10-23-default-piece-seam-allowance.md` (the document default),
`2026-10-24-seamline-points.md` (derived, read-once anchors), and
`2026-10-25-annotation-text-leader.md` (annotation text and labels).
Command spec: `0.17` → `0.18`. Pattern schema: `sewcraft.pattern/0.5` → `0.6`.

## 📝 TLDR

A piece gains two kinds of **mark**: a **V notch** that sits on a piece edge and
is drawn into that edge's seam allowance, and a **centre line** between two
snapped points across the piece. Both are visual markings only — the cut loop,
the offset, the piece area and every existing cut geometry stay exactly as they
are. A notch is anchored to an existing point and to the loop edge it notches,
so it costs no new positioning model: place points with the tools that already
exist, then mark. Both marks export on their own layer.

## 📝 Problem Statement

- **Who needs it:** the maker who matches two pieces by snipping the allowance
  at the same spot, and who marks a fold/centre line (CF, CB) so the piece is
  cut or folded on the right axis.
- **What happens today:** `add_point` with `role: 'annotation'` gives a
  free-floating dot that ignores the allowance and does not know which edge it
  belongs to; `add_line` with the annotation role gives a guide line that is not
  exported at all (`roles.ts` documents annotation geometry as "never
  exported"). The glossary already lists **Notch** and names notch and cut as
  the Features tools to come, `docs/architecture/geometry-core.md` lists
  `notch`, `grainline` and `label` under "Later entities", and
  `docs/architecture/export.md` expects a notches layer. The seam allowance
  exists and is parametric, so the geometry a notch needs is already resolved on
  every read.
- **Why not use an annotation point plus a short annotation line:** nothing ties
  that pair to the allowance. Change the allowance width or round a corner and
  the pair stays where it was, now floating in the wrong place — the same lossy
  workaround `2026-10-24-seamline-points.md` rejected for dimensions.
- **Constraints:** commands are the only mutation path, `@sewcraft/geometry` stays
  pure, stored documents keep loading, marks must follow allowance and edge
  changes, and the 100 % coverage gate applies to every new branch.

## 📝 Decisions

| #   | Question                                                       | Decision                                                                                                                     |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Does a notch cut into the cut path or is it drawn on top?      | **Drawn on top.** The cut loop, offset, cut area and existing exporters are untouched.                                        |
| Q2  | What is a "piece centre" mark?                                 | **Both** a centre line across the piece and, separately, notches on edges. The centre line is v1's answer to centre marks.    |
| Q3  | How is a notch positioned along an edge?                       | **Snap to points only.** No arbitrary distance or fraction; the point carries the position.                                   |
| Q4  | How deep does the V reach?                                     | **A share of the allowance width**, so it scales with the allowance instead of moving relative to it.                         |
| Q5  | Which shapes in v1?                                            | **Single V only.** Double V, slit and dot are follow-ups.                                                                     |
| Q6  | Is there a symmetric pair mode?                                | **No.** One mark per placement.                                                                                               |
| Q7  | Edge choice at a shared corner, missing allowance, centre-line source, label | Edge is **stored**; no allowance means the notch is **invalid**; centre line is **two snapped points**; labels **reuse text**. |
| Q8  | Notches at heights along the centre line?                      | **Not in v1.** A V needs an allowance to cut into and the piece body has none. The centre line ships alone.                    |

## 📝 Proposed Solution

### Mark model

Three shapes were possible; the discriminator wins because a grainline and a
dart label are already specced as "annotations attached to pieces" and will want
the same lifecycle.

| #   | Option                                                                                                            | Trade-offs                                                                                                                                                                    | Verdict                        |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A   | **One `mark` entity kind with a `type` discriminator** (`'notch'`, later `'grainline'`)                            | Selection, delete cascade, undo, inspector rows and `getEntity` come free; one union member for every future mark. Cost: a new entity kind, so `entityPoints`, `pieceEdges`, selection and export need their cases. | **Recommended**                |
| B   | **Two entity kinds** (`notch`, `centre_line`)                                                                      | Same benefits, but the union grows once per mark type and every `switch` gains two arms instead of one.                                                                        | Rejected — B is A with extra churn |
| C   | **Piece-level arrays** (`piece.notches`, `piece.centreLines`) like `allowances`                                    | No entity union change; allowance rows already live in the piece panel. Cost: no `delete_entity`, no selection id, a second lifecycle and a second undo path.                  | Rejected — pays for itself only if marks are never selectable |

```ts
/** A V notch drawn into one edge's seam allowance. */
export interface NotchMark {
  id: EntityId;
  kind: 'mark';
  type: 'notch';
  piece: EntityId;
  /** The loop edge whose allowance the V cuts into; fixes the V's direction. */
  edge: EntityId;
  /** The snapped point the V is centred on; a vertex of `edge` or on it. */
  point: EntityId;
  /** Share of the edge's cut distance; absent means {@link DEFAULT_NOTCH_DEPTH}. */
  depth?: number;
}

/** A straight centre line between two snapped points. */
export interface CentreLineMark {
  id: EntityId;
  kind: 'mark';
  type: 'centre_line';
  piece: EntityId;
  start: EntityId;
  end: EntityId;
}
```

`Entity` becomes `PointEntity | LineEntity | CurveEntity | CircleEntity |
ArcEntity | TextEntity | MarkEntity`. A mark owns no solver variable, has no
constraints, and `entityPoints()` returns `[start, end]` for a centre line and
`[]` for a notch.

### Notch geometry

`notchGeometry(document, piece, notch)` in a new `packages/geometry/src/mark.ts`
resolves on every read:

1. Resolve the allowance on `notch.edge`; none means `null` (the mark is broken,
   see edge cases).
2. `D = allowanceDistance(allowance, scope)` — a double allowance contributes
   `2 × width`, exactly like the cut line it draws on.
3. Project `notch.point` onto `notch.edge`; the projection must be within
   `NOTCH_SNAP_TOLERANCE` (0.01 mm) of the point, otherwise `null`.
4. `d = clamp(depth ?? DEFAULT_NOTCH_DEPTH, MIN_NOTCH_DEPTH, MAX_NOTCH_DEPTH) × D`.
5. The V opens on the cut line at `P + D·n`, where `n` is the edge's outward
   normal at the projection, and points back at the stitch line. Its two feet sit
   `NOTCH_HALF_WIDTH` (3 mm) either side of that point, measured along the edge's
   tangent. The normal's sign comes from the **loop's winding** (an outward probe
   tested with `pointInPolygon`), never from the edge's own direction, so a
   reversed edge draws the same V.

Defaults: `DEFAULT_NOTCH_DEPTH = 0.5`, `MIN_NOTCH_DEPTH = 0.05`,
`MAX_NOTCH_DEPTH = 0.9`, `NOTCH_HALF_WIDTH = 3`.

A V at a shared corner is measured from its stored edge alone, not from the
joined cut loop, so at a beveled corner one foot can sit slightly inside the
neighbouring allowance. That is accepted: the V must follow the edge it belongs
to, and the edge is what the maker pointed at.

### Centre line

A plain segment `start → end`, dashed on canvas and in export. It carries no
label of its own: a maker who wants "CF" adds it with the existing Text tool.
That keeps one labelling system, no half-owned text entity, and no cascade rule
between a line and a label.

### Placement

- **Notch.** The Features group gains a **Notch** tool. Hovering the pointer over
  the canvas snaps to point entities that are loop vertices, edge midpoints or
  points lying on a loop edge, and shows a ghost V for the nearest such point.
  The candidate edge is the edge nearest the pointer; within a corner's snap
  radius the pointer side decides which of the two adjacent edges is used, so the
  stored edge is always what the maker aimed at. Click emits `add_notch`. Escape
  cancels.
- **Centre line.** The Features group gains a **Centre line** tool: two clicks on
  snapped points, a ghost line between them, then `add_centre_line`.
- Both tools refuse a target that is not a drafting point of the current piece
  and show the prompt bar's existing inline rejection.
- The piece panel gains a **Marks** section: one row per notch (with a depth
  field in percent) and one per centre line, each with delete, and each
  highlighting its mark on the canvas while hovered or selected.

### Editing and selection

- Clicking a notch's V or a centre line selects the mark; `Delete` removes it
  through `delete_entity`, which needs no new cascade work.
- `update_notch` changes the depth share only. Clear it to return to the default.
- `update_centre_line` moves either endpoint; both points must stay drafting
  points of the same piece.
- A notch whose allowance is removed, or whose point leaves the edge, keeps its
  record and renders nothing: the inspector shows the row marked broken with a
  "no allowance on this edge" note, matching how broken loops and broken
  dimensions read. It returns as soon as the condition is repaired.

### Export

- SVG gains an optional `marks` layer, on by default, emitted as
  `<g data-layer="marks">`: notches as open `path` elements with
  `data-kind="notch"`, centre lines as `line` elements with
  `data-kind="centre_line"` and a dash-dot pattern.
- PDF (printed from the SVG) inherits it.
- DXF is still specced and unbuilt (`011-dxf-export.md`); the layer names it will
  need are `NOTCH` and `CENTRE`. Update `docs/architecture/export.md` when it
  lands.

### Commands

| Command               | Params                                                   | Inverse                                   |
| --------------------- | -------------------------------------------------------- | ----------------------------------------- |
| `add_notch`           | `piece`, `edge`, `point`, `depth?`                       | `delete_entity`                           |
| `update_notch`        | `id`, `depth` (null clears)                              | `update_notch` with the previous share    |
| `add_centre_line`     | `piece`, `start`, `end`                                  | `delete_entity`                           |
| `update_centre_line`  | `id`, `start?`, `end?`                                   | `update_centre_line` with previous values |

Validation: the piece exists; `edge` is a cut edge of that piece's loop and
carries an allowance; `point`/`start`/`end` resolve to drafting points of the
same piece, are not text or marks, and (for a notch) lie on `edge` within
`NOTCH_SNAP_TOLERANCE`; a centre line's endpoints differ. Re-applying a command
whose mark id already exists is a no-op. Removal is `delete_entity`, so no
`remove_*` command is added.

## 📝 Edge cases

- **No allowance on the edge:** `add_notch` rejects with "This edge has no seam
  allowance"; a later removal breaks existing notches rather than deleting them.
- **Allowance narrower than two half-widths:** the V's feet may fall outside the
  cut line. Allowed — the V is a mark, not a boundary — but the render clips the
  feet to the cut line's tangent so the V never points backwards.
- **Double allowance:** the depth is a share of the full cut distance, so the V
  stays halfway into the visible allowance.
- **Curve and arc edges:** the normal at the projected point orients the V, and
  the depth is measured along that normal. Points rarely land on a curved edge
  without a constraint, so in practice these notches come from a shared corner.
- **Reversed loop edge:** the natural start/end reading from `pieceCutEdge` is
  used, so the feet sit on the edge's own cut segment rather than a neighbour's.
- **Piece deleted or loop broken:** the mark goes with the cascade; a broken loop
  already renders the piece as broken and the notch is simply absent.
- **Notch outside the cut loop's bounds:** impossible with a valid allowance, and
  the export viewBox is derived from the cut bounds, so no padding change is
  needed.
- **Older documents:** marks are additive, so 0.5 loads unchanged, the migration
  rewrites only the schema tag, and `KNOWN_PATTERN_SCHEMAS` gains 0.5.
- **Duplicate notch at the same point and edge:** allowed by the contract, but
  the tool skips a click that resolves to an existing notch.

## 📋 Implementation Plan

1. **Geometry model** — `NotchMark`/`CentreLineMark` in `types.ts`, `mark.ts`
   with constants, `notchGeometry`, `centreLineGeometry`, and the broken-mark
   predicate; tests for every branch (line, arc, corner, missing allowance,
   clamped share, tolerance).
2. **Document plumbing** — `entityPoints`, `pieceEdges` exclusion, `getEntity`,
   selection and rect-hit cases, `KNOWN_PATTERN_SCHEMAS`, schema bump; tests.
3. **Commands** — the four commands with validation, idempotency and inverses;
   `applyCommand` arms; `config/geometry.php`, `docs/domain/command-spec.json`
   and `command-spec.md` in sync at v0.18; tests.
4. **Export** — `marks` layer in `toSvgPiece` with its option and tests; update
   `docs/architecture/export.md`.
5. **Tool and canvas** — `notch` and `centre_line` in `editor-tools.ts` and the
   Features ribbon group, the snap candidates, the ghost V and ghost line, hit
   testing and selection in `PatternCanvas.vue`; Vitest for the tool helpers.
6. **Inspector** — the Marks section in `PiecePanel.vue` with depth editing,
   broken rows and delete; tests.
7. **Docs** — glossary entries for **Notch** and **Centre line**, the geometry
   doc's "later entities" list, and `AGENTS.md` if the command count is quoted.

## 📋 Acceptance criteria

- [ ] A notch can be placed on a loop vertex, an edge midpoint and a point on a
      line, and follows allowance width, allowance kind and corner rounds.
- [ ] Removing the allowance leaves the notch record, hides the V, and shows a
      broken row; restoring the allowance brings the V back unchanged.
- [ ] A centre line can be drawn between two snapped points and exports as part
      of the marks layer.
- [ ] Cut loop, cut area, piece metrics and every existing export are byte-identical
      with and without marks.
- [ ] All four commands are documented in the three contract files, undo/redo
      cleanly, and are idempotent.
- [ ] 100 % coverage for statements, branches, functions and lines in the touched
      packages; lint, format and typecheck green.

## 📝 Open questions

1. **Default depth.** 0.5 of the cut distance is the proposed default; a real
   15 mm allowance wants roughly 5 mm, which is 0.33. Confirm 0.5 or set 0.33.
2. **Half-width.** 3 mm either side (6 mm opening) is the proposal. Notches are
   usually narrower; 2 mm either side may read better at export scale.
3. **Centre-line style.** Dash-dot to distinguish it from the allowance fold
   lines that already export on the `fold` layer, or reuse the same dash so the
   pattern reads as one family of folding marks.
4. **Broken mark visibility.** Hidden entirely, or drawn faintly with a broken
   marker like a broken loop — the proposal hides it from the canvas and exports
   nothing.

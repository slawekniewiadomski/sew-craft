# Visual feedback while picking dimensions

Status: draft — design review; Q2 (resting canvas appearance) and R5 (point click
tolerance) need a human answer; the reviewed design runs on their recommended
answers
Refs: [#80 — Visual feedback when adding dimensions](https://github.com/slawekniewiadomski/sew-craft/issues/80)
Builds on: `.ai/specs/2026-10-20-driven-and-set-dimensions.md`,
`.ai/specs/2026-10-19-movable-linear-dimensions.md`,
`.ai/specs/2026-10-23-cut-dimension-tool.md` and
`.ai/specs/2026-10-23-dimension-point-and-line-anchors.md`
Command spec: unchanged
Pattern schema: unchanged (no document field is added)

## 📝 TLDR

A maker who arms the Dimension or Cut dimension tool today gets a hint line and
a crosshair, but no visual answer to “what did I just pick?” or “what will the
second pick be?”. The first click is stored invisibly in
`dimensionPending`/`cutDimensionPending`; only after the **second** pick does a
ghost dimension start following the pointer.

Proposed future behaviour: while a dimension tool is armed, the anchor under the
pointer is pre-highlighted; the first pick stays visibly marked; and a dashed
ghost runs from that anchor to the pointer, snapping to a valid second anchor.
The same feedback covers the Cut dimension tool, with its same-piece rule. This
is a canvas-only change: no command, solver, API, schema or data-model change.

## 📝 Problem Statement

- **Who needs it:** anyone placing a linear or cut dimension, especially on a
  busy sketch where points sit close together and a seam line is one of several
  similar lines.
- **What happens today:** `onDimensionPointer()` pushes the first pick into
  `dimensionPending` and changes only the hint text (`Pick the second anchor.`).
  Nothing renders from `dimensionPending`: `onCanvasPointerMove()` updates
  `dimensionPlacement` only after the second pick exists, and only then does
  `dimensionPreviewConstraint` feed the dashed dimension preview. The first
  anchor is therefore acknowledged by words alone.
- **The same gap in the cut tool:** `cutVertexHandles` rings every piece corner
  while the Cut dimension tool is armed, but the corner actually picked is not
  distinguished from the rest, and no band connects it to the pointer. An edge
  pick starts placement immediately, so it has no first-pick state at all.
- **Hover carries no meaning:** `pointClass()` and `entityClass()` react to
  selection, marquee and the constraint/round tools, never to a dimension pick.
  `onEntityHover()` exists only to reveal corner-round handles. A maker cannot
  tell an eligible point or line from a decorative or unsupported one until
  after clicking it.
- **Evidence it matters:** #80 describes exactly these three failures — no mark
  on the clicked point, no preview of the second point, and no sense that the
  tool is in “adding a dimension” mode. Similar tools in mature CAD products
  (Onshape, Fusion 360, FreeCAD) all pre-highlight the pick target and rubber-band
  from the first pick; that is the interaction language makers already expect.
- **Constraints:** commands remain the only mutation path, the geometry package
  stays pure, and this slice must not change the anchoring rules delivered by
  #71/#72 or the cut-loop rules delivered by the cut-dimension spec.

## 📝 Proposed Solution

### Vocabulary

| Term | Meaning |
| ---- | ------- |
| **Candidate** | An entity the armed tool would accept as the next pick (point or straight line for Dimension; piece corner or piece edge for Cut dimension). |
| **First pick** | The anchor already committed to the in-memory gesture (`dimensionPending[0]` or `cutDimensionPending`). Not yet a document change. |
| **Ghost** | A dashed, non-interactive line from the first pick's preview position to the pointer. It is never written to the document and never shows the committed dimension geometry. |
| **Preview position** | Where the ghost starts or ends for an anchor: the point's coordinate, a line's midpoint, or a piece's cut-loop vertex. A cursor guide, not a measurement. |
| **Placement preview** | The existing post-second-pick dimension object that follows the pointer and shows the authoritative value. It is kept as is. |

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **Hover + first-pick mark + rubber-band ghost** — one shared feedback layer for both dimension tools | Answers all three complaints in #80 with existing tokens and primitives; no new command or data. Cost: new hover/pointer state in an already large canvas component, and point hit targets must grow to be hoverable | **Recommended** |
| B | **Mode overlay only** — tint the canvas, show a persistent “Dimension mode” banner and a crosshair, no geometry ghost | Smallest change and impossible to misread as a placed dimension. Cost: the maker still cannot see which anchor was picked or where the second one will land, so the two concrete complaints remain | Rejected — it advertises the mode but does not answer “what did I pick?” |
| C | **Full live dimension object** — build the real dimension geometry and value from the first anchor to the pointer, including extension lines and a numeric readout | Closest to the final result and gives immediate numeric feedback. Cost: for line anchors the intermediate value is not the final measurement (point → perpendicular foot; line → canonical midpoint), so the number would be wrong or need a second resolver; it can also be mistaken for a committed value | Rejected for this slice — a live value is deferred (R3) |
| D | **Build nothing** — rely on the existing hint text and crosshair | No code, no risk. | Rejected — #80 is a direct usability report and the hints already exist; they are not enough |

Option A wins because it treats feedback as a **pick-layer** concern, separate
from dimension geometry: it can mark any anchor type, including the Cut tool's
loop vertices, without touching `dimensionGeometry` or the command layer. The
ghost is deliberately not a dimension; it is a line from a preview position to
the pointer.

### Behaviour

1. **Armed, no pick.** The Dimension tool accepts a point or a straight line.
   Moving the pointer over an eligible entity pre-highlights it in the primary
   colour; moving over a curve, arc or circle pre-highlights nothing. The hint
   stays `Pick a point or a line.`
2. **First pick.** Clicking a candidate stores the pick as today and leaves a
   persistent mark on it: a 2 px primary ring around a point, or a 3 px primary
   stroke on a whole line. The hint becomes `Pick the second anchor.`
3. **Ghost.** While one pick is pending and no placement is active, a 1 px
   dashed primary line runs from the first pick's preview position to the
   pointer. When the pointer is over a **valid** second anchor, the ghost snaps
   to that anchor's preview position and the candidate is highlighted. Over an
   invalid or empty target it follows the raw pointer and shows no candidate
   highlight; the click-time hints are unchanged.
4. **Second pick.** The ghost disappears, both picks keep their marks, and the
   existing placement preview (dimension line, value label, pointer-driven
   orientation/offset) takes over. The third click commits exactly as today.
5. **Cancel.** `Escape`, a tool change, or a click on empty canvas clears any
   pending pick, marks and ghost. Before the first pick there is nothing to
   clear; the idle hint remains. A click on empty canvas after the first pick
   already resets the gesture today; it does the same here.
6. **Cut dimension.** The tool keeps its existing all-corner rings while armed.
   Hovering a corner or a piece edge adds the stronger candidate emphasis. After
   a corner pick, that corner gets the first-pick ring, the other corners of the
   **same piece** remain candidates, and the ghost snaps only to them. Other
   pieces' corners stay at the resting ring. Hovering a non-piece edge never
   highlights. An edge pick still starts placement immediately and therefore
   skips the ghost stage.
7. **No document change.** Nothing is emitted until the existing placement
   commit; the ghost and marks are view state only.

### Prior art

Onshape and Fusion 360 pre-highlight a hovered vertex/edge, keep the picked
entity visibly selected, and rubber-band a construction line to the pointer
before the second pick. SketchUp additionally labels the inference. The common
pattern is **progressive confirmation**: acknowledge each pick immediately and
preview only the next decision. This spec follows that pattern and deliberately
stops short of a live measurement (option C), which those tools show only once
the measurement is unambiguous.

## 📝 Architecture

| Module | Change |
| ------ | ------ |
| `frontend/src/lib/dimension-feedback.ts` (new) | Pure helpers: classify an entity as a Dimension pick; resolve an anchor's preview position (point coordinate, line midpoint, cut-loop vertex); select the hovered target for each tool. Unit-tested in isolation so the component keeps only wiring. |
| `frontend/src/components/PatternCanvas.vue` | Track the hovered entity and raw pointer world position while a dimension tool is armed; derive first-pick/candidate/ghost views; render candidate rings, first-pick marks, the dashed ghost and its end marker; add an enlarged point hit target while armed; clear the state on pointer leave, Escape, tool change and commit. |
| `frontend/src/components/PatternCanvas.test.ts` | Behaviour tests for hover, first pick, snapping, invalid targets, cancellation and read-only. |
| `frontend/src/lib/dimension-feedback.test.ts` (new) | Helper tests for every anchor kind and every null path. |

No geometry-package change: `distanceAnchorIssue()`, `getEntity()`,
`pieceCutVertex()`, `anchorForPoint()`, `piecesAtPoint()` and `pieceOwningEdge()`
already supply everything the helpers need. No `EditorView` change: the canvas
already owns the gesture state and emits only on commit. No ribbon or tool
definition change.

### State and rendering

```
Dimension tool
  armed ──hover valid──▶ candidate emphasis
    │ click
    ▼
  first pick ──pointer over valid second──▶ ghost snapped + candidate emphasis
    │ click (valid)                         │ click (invalid)
    ▼                                       ▼
  placement preview (existing)            hint, stay in first pick
    │ third click
    ▼
  emit add-dimension (existing)
```

View state added to `PatternCanvas`:

```ts
/** The entity under the pointer while a dimension tool is armed. */
const hoveredPick = ref<{ id: EntityId; kind: string } | null>(null);
/** The pointer in world space, for the ghost's unsnapped end. */
const pointerWorld = ref<Vec2 | null>(null);
```

Derived views (all `computed`, so tests can assert without timers):

- `dimensionFirstPickIds` — the pending ids, or an empty set.
- `dimensionCandidate` — `hoveredPick` when it passes `distanceAnchorIssue()`
  against the pending first pick (or when no pick exists), otherwise `null`.
- `dimensionGhost` — `{ from, to, snapped }` where `from` is
  `pickPreviewPosition(document, firstPick)` and `to` is the candidate's preview
  position when snapped, otherwise `pointerWorld`. `null` when there is no first
  pick, no pointer, or either position cannot resolve.
- The Cut equivalents (`cutDimensionFirstPick`, `cutDimensionCandidate`,
  `cutDimensionGhost`) use `cutDimensionPending` plus `pieceCutVertex()` and
  enforce the same-piece rule.

Candidate emphasis is applied through the existing class helpers so the drawing
does not gain a parallel style system: `pointClass()` gains the candidate and
first-pick cases, `entityClass()`/`lineWidth()` gain the same for lines. First
pick keeps an extra ring so it is distinguishable from a hover.

The enlarged point hit target is a transparent `<circle>` rendered only while
`props.tool === 'dimension' || props.tool === 'cut_dimension'`, with
`r = 6 / viewport.scale` (a 12 px diameter, matching the invisible line hit
stroke's 12 px `stroke-width` + `vector-effect="non-scaling-stroke"`). It shares
the visible point's identity attributes (`data-entity-id`, `data-kind="point"`)
and adds the selector hook `data-dimension-hit-target`, so `hitEntity()` reads
it exactly like the visible point while tests can address it uniquely. The
visible dot renders first, so existing `find()` selectors still match it before
the hit circle. Anchor validation is unchanged; only the click tolerance for
points widens while a dimension tool is armed (R5).

## 📝 Data Model

None. The feature is transient canvas view state; no entity, field, table,
migration or schema version changes. The document is untouched until the
existing `add_constraint` / `add_derived_dimension` command is dispatched on
commit.

## 📝 API Contracts

None. The command spec, `packages/geometry` exports and the REST API are
unchanged. The canvas emits the same `add-dimension` and `add-cut-dimension`
events with the same payloads.

## 📝 UI/UX

### Feedback states

| Tool / stage | Canvas | Hint (live region) | Test hook |
| ------------ | ------ | ------------------ | --------- |
| Dimension armed | Hovered point: 1.5 px primary ring; hovered line: 3 px primary stroke. Nothing for curves/arcs/circles/empty | `Pick a point or a line.` | `data-dimension-candidate` on the entity |
| Dimension first pick | Picked point: 2.5 px primary ring plus a soft halo; picked line: 3 px primary stroke plus a midpoint tick. Dashed primary ghost from the anchor to the pointer, 3 px hollow end marker | `Pick the second anchor.` | `data-testid="dimension-pick-first"`, `data-testid="dimension-rubber-band"` |
| Dimension ghost snapped | Same as above, ghost ends on the valid candidate and that candidate gains its ring/stroke | `Pick the second anchor.` | `data-dimension-candidate` plus a snapped ghost |
| Dimension placing | Existing preview line, chevrons and value label follow the pointer; both picks keep their marks | (none, as today) | `dimension-lines-dimension-preview` (existing) |
| Cut armed | All piece corners keep their 1.5 px primary rings; hovered corner thickens its ring to 2 px / hovered piece edge gets a 3 px primary stroke | `Pick two corners of one piece, or a piece edge.` (new idle hint) | `cut-vertex-handle` (existing), `data-cut-dimension-candidate` |
| Cut first corner | Picked corner: filled primary dot plus a 2.5 px ring and a soft halo. Ghost from that cut vertex to the pointer; only same-piece corners are candidates | `Pick second corner of the same piece` (existing) | `data-testid="cut-dimension-pick-first"`, `data-testid="cut-dimension-rubber-band"` |

Hooks follow one convention: dedicated markers get `data-testid`
(`dimension-pick-first`, `dimension-rubber-band`, `dimension-rubber-band-end`,
`cut-dimension-pick-first`, `cut-dimension-rubber-band`); emphasis applied to an
existing entity gets a `data-*` attribute (`data-dimension-candidate`,
`data-cut-dimension-candidate`, `data-dimension-first-pick` on a line). Identity
attributes are shared with the hit target; selector hooks are not.

Invalid targets are never highlighted and never snap the ghost; clicking one
keeps the existing rejection hint (`Pick a point or a straight line.`,
`Pick two parallel lines — use Angle for a corner.`, `The point lies on the
line.`, `Both corners must belong to the same piece`, …).

### Visual language

- Reuse the existing tokens: `primary` (green) for candidates, first picks and
  the ghost; `muted-foreground` for resting handles. No new colour token, no new
  icon and no animation.
- First pick is distinguished from a candidate by a soft halo plus a heavier
  ring (points) or a midpoint tick (lines); candidates have neither, so the
  distinction is not hue alone.
- The ghost is `aria-hidden` and `pointer-events-none`, so it never intercepts a
  pick or appears in the accessibility tree. Size does not scale with zoom
  (`vector-effect="non-scaling-stroke"` on the dashes).
- The cursor stays `crosshair` for both tools (already the case). No
  `not-allowed` cursor: an invalid click already produces a spoken hint, and a
  cursor change would not explain *why* the target is invalid.

### Accessibility

- The hint paragraphs remain `role="status"`; the first-pick and rejection
  messages are the non-visual channel for every state change.
- Hover-only highlighting is an enhancement, not the only signal: every valid
  action still has text before and after the click, and the first pick is
  announced by the `Pick the second anchor.` status.
- The ghost adds no focusable element and no keyboard interaction; the existing
  Escape cancel path is preserved.

### Mockup

`assets/dimension-pick-feedback/feedback-states.svg` (rendered companion:
`feedback-states.png`) shows the three states statically: hover on an eligible
point, first pick plus a snapped ghost, and the Cut tool's first corner. It is
illustrative, not evidence that the interaction is implemented.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Expected behaviour |
| -------- | ------------------ |
| Pointer leaves the canvas mid-gesture | Hover and ghost end are cleared; the pending pick and its mark stay. Re-entering resumes the ghost at the new pointer. |
| Escape with one pick pending | Pending pick, mark and ghost clear; the hint returns to `Pick a point or a line.` |
| Tool change mid-gesture | All dimension and cut feedback clears with the existing tool watcher. |
| Click empty canvas before the first pick | No pick, no mark, no ghost; hint stays the idle message. |
| Click empty canvas after the first pick | The gesture resets as today (pending cleared); the mark and ghost disappear. |
| Click the same anchor twice | Still a no-op, as today; the first-pick mark stays and the hint still asks for a second anchor. |
| Second anchor invalid (same id, non-parallel lines, point on line, coincident lines) | No snap, no commit, existing hint; ghost stays on the raw pointer. |
| First anchor deleted or undone while pending (remote update) | `pickPreviewPosition()` returns `null`, so the mark and ghost disappear; the next click validates through `distanceAnchorIssue()` exactly as today. |
| First pick is a line | The ghost starts at the line's midpoint. This is only a guide; no value is shown, because the final span may be point → foot (R3). |
| First pick is a construction line | Construction lines are still valid Dimension anchors (they are straight lines); the candidate styling is the same. |
| Zoomed far out | The point hit target stays 12 screen px; the visual ring is world-scaled like the point, but the `data-entity-id` hit area remains usable. |
| Read-only canvas | No hover, mark or ghost; the existing early return in `onPointerDown()` is mirrored by the hover guard. |
| Touch input | No hover phase; the first tap leaves the mark and the ghost appears on the next pointer move, if any. |
| Very dense sketch | Only the hovered target is emphasised, never every point, so the drawing does not become a field of rings. |
| Reduced motion | No animation is added; nothing to disable. |

## 📝 Risks & Impact Review

- **Canvas component growth (medium).** `PatternCanvas.vue` is already ~3 200
  lines. The mitigation is to keep every non-trivial rule in
  `dimension-feedback.ts` and leave the component with refs, computed views and
  template branches. A reviewer should reject inline geometry or anchor
  classification in the template.
- **Hover vs. selection semantics.** `pointClass()`/`entityClass()` already
  encode selection, marquee and constraint picks. Adding dimension candidates
  must be an extra case, not a replacement; a select-tool hover must not start
  highlighting points. Tests pin both the dimension-tool and select-tool states.
- **Larger point hit target changes picking.** Enlarging points to 12 px only
  while a dimension tool is armed makes a near-miss pick the point; that is the
  desired behaviour and matches the invisible line stroke, but it is an input
  change and gets its own test (a click just outside the visible dot but inside
  the target). The hit circle carries `data-dimension-hit-target` so tests and
  reviewers can tell it from the visible dot; existing `find()` selectors still
  match the visible dot first, and the only `findAll('[data-kind="point"]')`
  assertions run under the Select tool, where no hit circle exists.
- **Ghost ambiguity for line anchors.** A line's “position” is not unique. The
  midpoint is a deliberate, documented approximation; it is never used for the
  measurement, and the authoritative geometry appears only after the second
  pick. A live value is deferred (R3); adding one later would need a resolver
  that knows how the final span is formed.
- **Two hit elements per line.** Lines already render a visible stroke and a
  12 px transparent stroke. Hover is derived from `pointermove` +
  `hitEntity(event.target)`, so there is one state, not an enter/leave race.
- **Performance.** The ghost is two SVG nodes recomputed on pointer move from
  already-loaded entities; no document scan beyond the single anchor lookup.
  The existing pointermove handler already runs for every tool.
- **No compatibility exposure.** No stored data, API or schema changes, so no
  migration, downgrade or export impact. `BACKWARD_COMPATIBILITY.md` surfaces
  are untouched.
- **Mockup limits.** The committed SVG is an illustration of the three states,
  not a browser capture. No current-app screenshot is attached because no shared
  test-env descriptor exists and booting the full Docker stack would not add
  evidence for a view-state design review.

## ❓ Open Questions

This is the one product/UX call for #80. The design is written under the
recommended answer; the PR stays draft until a human confirms that answer or
accepts the default, then a reviewer applies `spec-ready`.

| # | Question | Why it blocks | Recommended answer |
| - | -------- | ------------- | ------------------ |
| Q2 | Should every eligible anchor get a **resting ring** while the Dimension tool is armed, or only the hovered one? | It changes the resting appearance of every sketch and is the difference between maximum discoverability and visual noise. The Cut tool already rings all piece corners, so the two tools would differ. | **Hover-only for Dimension** (points and lines are already the drawing; a field of rings would obscure it), while Cut keeps its existing all-corner rings because loop corners are otherwise invisible. Alternative: ring all eligible points/lines while armed. |

## ✅ Resolved assumptions (autonomous defaults)

| # | Assumption | Why | Status |
| - | ---------- | --- | ------ |
| R1 | Both the Dimension and Cut dimension tools get the feedback; anchor rules, dedupe and command payloads are unchanged (only the point click tolerance widens, R5) | #80 says “any dimension”; the gesture state already exists in both tools, and treating them differently would be arbitrary | Reversible |
| R2 | Dimension candidates are hover-only; Cut keeps its resting corner rings | Contingent on Q2's recommended answer; the cut corners are derived geometry that needs the resting affordance, points and lines do not | Reversible, pending Q2 |
| R3 | The ghost starts at a line anchor's midpoint and never shows a value | A line has no single anchor position; the midpoint is unambiguous as a cursor guide and cannot be mistaken for the measured span. A live value is deferred, not rejected forever | Reversible |
| R4 | The ghost snaps only to targets the existing pick rules accept, and stays on the raw pointer otherwise | Reuses `distanceAnchorIssue()` and the cut same-piece checks rather than inventing a second validity model | Reversible |
| R5 | Point hit targets grow to 12 screen px only while a dimension tool is armed | `r = 4` world units is hard to hover at low zoom; the 12 px line hit stroke is the existing precedent | ⚠ NEEDS HUMAN CONFIRMATION — changes click tolerance |
| R6 | First pick is shown by a soft halo plus a heavier mark, not by a new colour | Keeps the existing primary/muted token set and does not rely on hue alone | Reversible |
| R7 | The ghost is view-only; nothing is emitted before the existing commit | Preserves “commands are the only mutation path” and keeps undo/redo untouched | Reversible |
| R8 | Read-only mode and non-dimension tools show no feedback | No pick can be made, so highlighting would promise an action that cannot happen | Reversible |
| R9 | The idle Cut hint gains `Pick two corners of one piece, or a piece edge.` | The tool currently has no idle message; the ghost stage makes the missing mode cue more obvious | Reversible |
| R10 | No mockup of every state is committed; one static three-state SVG is added for review | The decision is about state feedback, and one diagram makes the sequence reviewable without pretending it is live evidence | Reversible |

## 📋 Phasing

- **Phase 1 — Hover affordances.** Candidate classification and the enlarged
  point hit target for both tools.
- **Phase 2 — First-pick acknowledgement.** Persistent marks for point, line,
  cut corner; idle Cut hint; cancellation coverage.
- **Phase 3 — Ghost.** Pointer tracking, snapped/unsnapped end, dashed rendering
  for both tools.
- **Phase 4 — Hardening.** Pointer leave, read-only, stale anchors, edge cases,
  accessibility pass and the full validation gate.

Each phase leaves the app working and is shippable on its own: Phase 1 already
answers “what can I pick?”, Phase 2 “what did I pick?”, Phase 3 “where is it
going?”. If R5 is declined, Phase 1 drops only the enlarged hit target and its
hover stays on the existing 4-unit point dot; nothing else depends on it.

## 📋 Implementation Plan

### Phase 1 — Hover affordances

1. Add `frontend/src/lib/dimension-feedback.ts` with `isDimensionPick()`,
   `pickPreviewPosition()`, `cutAnchorPreviewPosition()` and
   `sameDimensionPick()`; add the matching spec file and cover every null path.
2. In `PatternCanvas.vue`, track `hoveredPick` from the existing `pointermove`
   handler (`hitEntity(event)`) only while a dimension tool is armed and the
   canvas is writable; clear it on pointer leave.
3. Render the 12 px transparent point hit target while a dimension tool is
   armed, and apply candidate styling through `pointClass()`/`entityClass()`/
   `lineWidth()` plus `data-dimension-candidate` /
   `data-cut-dimension-candidate` hooks.
4. Tests: hover a point, a line, a curve (no highlight), a cut corner and a
   non-piece edge; select tool shows none; read-only shows none.

### Phase 2 — First-pick acknowledgement

5. Derive `dimensionFirstPickIds` and `cutDimensionFirstPick`, and render the
   first-pick ring/line mark and the Cut corner mark. Add the Cut idle hint.
6. Wire the existing clear paths (Escape, tool change, empty click, commit) to
   the new state and add the hooks listed in the UI/UX state table.
7. Tests: first pick on a point and on a line keeps its mark; Cut corner mark;
   invalid second pick keeps the mark; Escape/tool change/empty click clears it;
   same-anchor click is still a no-op.

### Phase 3 — Ghost

8. Track `pointerWorld` in `onCanvasPointerMove` (raw pointer, no grid snap) and
   derive `dimensionGhost`/`cutDimensionGhost` with snap-to-candidate using the
   existing validity rules.
9. Render the dashed ghost and end marker as `pointer-events-none` /
   `aria-hidden` SVG, above entities and below committed dimension labels.
10. Tests: ghost appears after one pick, snaps to a valid point/line, stays on
    the raw pointer over an invalid target, starts at a line midpoint, respects
    the Cut same-piece rule, and disappears on the second pick.

### Phase 4 — Hardening and verification

11. Handle pointer leave, stale/deleted anchors (`null` preview positions),
    touch and reduced motion; add the `aria-hidden`/role assertions.
12. Add the state mockup under `.ai/specs/assets/dimension-pick-feedback/` and
    reference it from the spec and PR.
13. Run `npm run format`, `npm run typecheck`, `npm run lint`,
    `npm run format:check`, `npm run test:coverage`, `npm run build` and the
    backend Pest coverage command from `AGENTS.md`; confirm 100 % coverage for
    the new helpers and every new canvas branch.

## ✅ Acceptance criteria

- [ ] Hovering an eligible point or straight line with the Dimension tool armed
      highlights it before any click; curves, arcs and circles do not highlight.
- [ ] After the first pick, that anchor stays visibly marked (halo plus heavier
      ring on a point, tick on a line) until the gesture ends, and the hint
      reads `Pick the second anchor.`
- [ ] A dashed ghost runs from the first anchor to the pointer and snaps to a
      valid second anchor; it never commits a dimension and shows no numeric
      value.
- [ ] The Cut dimension tool shows its idle hint
      `Pick two corners of one piece, or a piece edge.`, marks its first corner,
      and only offers same-piece corners as snapped candidates; an edge pick
      still places immediately.
- [ ] While a dimension tool is armed, a click inside the 12 px point target but
      outside the visible dot (r = 4 world units at scale 1) picks that point;
      the target does not exist under any other tool.
- [ ] Invalid second picks (same anchor, non-parallel lines, point on line,
      coincident lines) never highlight, snap or commit, and each keeps its
      existing hint text.
- [ ] Pointer leave clears the hover and ghost end while keeping the pending
      pick and its mark; Escape, tool change and empty-canvas clicks clear all
      feedback.
- [ ] Read-only mode shows no feedback, and no command, API, schema or
      data-model change ships.
- [ ] New helpers and canvas branches keep statements, branches, functions and
      lines at 100 % coverage; the full validation gate passes.

## Out of scope

- Changing the anchor rules, dedupe or command payloads; the only input change
  is the point click tolerance in R5.
- Live numeric values in the ghost before both anchors exist (deferred; R3).
- Extension lines or chevrons in the ghost, or a full dimension preview before
  the second pick (option C).
- A global hover/hit-target redesign for the Select or sketch tools.
- Keyboard-first dimension placement, snapping to grid intersections or
  inference labels such as “on line” / “perpendicular”.
- Animations, new colour tokens or icons.

## Checks

```bash
npm run format
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run build
docker compose run --rm --no-deps -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: \
  app sh -c "composer install --no-interaction && php artisan test --coverage --min=100"
```

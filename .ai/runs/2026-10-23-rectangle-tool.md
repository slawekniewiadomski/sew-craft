# Execution plan — rectangle sketching (adopted from PR #61)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-23 because
PR #61 is a design-only spec PR that the maintainer marked `spec-ready`, which
continues implementation on the same branch.
**PR:** #61 · **Branch:** `spec/rectangle-tool` · **Base:** `develop`
**Spec:** `.ai/specs/2026-10-23-rectangle-tool.md`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by
editing this file or commenting on the PR.

## 🎯 Goal

Add a Rectangle tool family to the canvas with three gestures — two diagonal
corners, a centre plus one corner, and a corner plus the end of the first side and
a width point for a rotated rectangle — each writing four shared points and four
lines as one undoable command batch, with the constraints that keep an
axis-aligned rectangle axis-aligned.

## Scope

- New `frontend/src/lib/rectangle-tool.ts`: `RectangleMode`, `MIN_RECTANGLE_SIZE`,
  `RECTANGLE_CLICKS`, `rectangleCorners`, `newRectangleCorners` and
  `buildRectangleCommands`, fully unit-tested.
- `frontend/src/lib/editor-tools.ts`, `editor-ribbon.ts`, `ribbon-icons.ts`: three
  tools in the Sketching group, after Circle, with their glyphs.
- `frontend/src/components/PatternCanvas.vue`: per-mode pending clicks, dashed
  preview from the same corner function the commit uses, provisional corner dots,
  Escape / tool-change / document-load cancellation, test ids.
- `frontend/src/views/EditorView.vue`: three handlers, one `dispatchGroup` call
  each.
- Phase 5 verification and the spec's status line.

## Non-goals

- No `rectangle` entity, rectangle record, schema, command or `spec_version`
  change; a rectangle stays four points and four lines.
- No rectangle-level selection, highlight, properties or width/height readout.
- No consolidated mode picker (Q3 = A: three ribbon buttons).
- No construction switch in the gesture; rectangles are cut geometry.

## Decisions

Q1–Q3 in the spec are unanswered on issue #60. The maintainer applied
`spec-ready`, which the repository's issue-driven workflow defines as the signal
to start implementation, so the spec's recommended answers are taken as accepted:

- **Q1 = I1:** the third mode is a rotated rectangle (corner → end of the first
  side → perpendicular width), the CAD "aligned rectangle".
- **Q2 = A:** newly created corners get constraints (two horizontal + two
  vertical for the axis-aligned modes, three 90° angles when rotated); a corner
  that reuses an existing point skips them, so geometry the user already
  constrained is never silently over-constrained.
- **Q3 = A:** three ribbon buttons for v1.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is the three-mode rectangle tool writing four points + four lines | Issue #60, spec TLDR and Proposed Solution | high |
| Recommended answers to Q1–Q3 stand | `spec-ready` applied by the maintainer; prior combined PR #51 applied the same rule | high |
| No command, schema or API change | Spec "API Contracts" and "Not edited (and why)" | high |
| Constraint policy and its conflict risk | Spec "Risks & Impact Review", `add_constraint` applies without conflict detection | high |
| Gesture plumbing mirrors the Arc and Circle tools | `frontend/src/lib/arc-tool.ts`, `circle-tool.ts`, `drafting.ts` | high |

## Assumptions

- An existing point exactly at a derived corner's coordinates is reused, so only
  the corners that need a point are created and undo removes only those.
- Both ends of the solver's signed `angle` constraint are honoured: the 90°
  constraints carry the sign the derived winding produces, so the solver cannot
  flip the rectangle while converging.
- The tool stays active after a commit, like Line, Arc and Circle.

## Risks

- Auto-added constraints make a fresh rectangle rigid (Q2 = A); the trade-off is
  four constraint icons per rectangle, as the spec records.
- A reused corner skips constraints, so an attached rectangle can still skew —
  deliberate, to avoid conflicts with the user's existing constraints.
- Over-constrained reuse would make the whole batch fail loudly through the
  existing error bar rather than create a distorted shape; a test pins that.

## Verification

Run in the real app through the integration harness (Laravel API + built SPA),
captured under `.ai/runs/assets/2026-10-23-rectangle-tool/`:

| Check | Result |
|---|---|
| Diagonal preview mid-gesture | dashed `rectangle-preview` plus four provisional corner markers |
| Diagonal commit | four points, four lines, two horizontal and two vertical constraints |
| Centre commit | the same, mirrored around the centre click |
| Rotated commit | four points, four lines, three signed right angles |
| Escape mid-gesture | pending clicks and preview clear, no command written |
| One undo | removes the four lines and the points the gesture created, nothing else |
| Rotated edge | inspector reports 208.806 mm; a dimension places across the diagonal |
| Rotated corner round | `R 5` applied through the existing prompt bar, edges trimmed |
| Piece from the rotated loop | `Piece 1` created, finished 225.321 × 144.404 mm |
| Rotated seam allowance | 10 mm on one edge, cut 228.195 × 153.982 mm, allowance area 208.061 mm² |
| SVG export | cut layer with the piece path and piece metadata |
| Console | no errors across the run |

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Gesture math

- [x] 1.1 Add `rectangleCorners` with `RectangleMode`, `MIN_RECTANGLE_SIZE` and `RECTANGLE_CLICKS`, tested per mode, per corner reuse and per degenerate guard — 0aa5afc
- [x] 1.2 Add `newRectangleCorners` and `buildRectangleCommands`, tested for command order, id uniqueness, point reuse and a batch the command core accepts — 0aa5afc

### Phase 2: Tool surface

- [x] 2.1 Add the three `EditorTool` members and labels, with the tool test updated — 5ea1102
- [x] 2.2 Add the three ribbon items and the three glyphs, with the ribbon and icon tests updated — 5ea1102

### Phase 3: Canvas

- [x] 3.1 Add per-mode pending state, the dashed preview and the provisional corner markers, driven by `rectangleCorners` — ec197c5
- [x] 3.2 Wire clicks, Escape, tool change and document load to the pending state, tested for cancellation without a command — ec197c5
- [x] 3.3 Add the three `EditorView` handlers through `dispatchGroup`, tested for one journal entry, one-step undo and a rolled-back failing group — ec197c5

### Phase 4: Constraints

- [x] 4.1 Append the horizontal/vertical or 90° angle commands to the builder, skipping them when a corner is reused, and test both branches — 49ca726
- [x] 4.2 Test that a rectangle whose corner already carries an incompatible constraint surfaces the solve error instead of a distorted shape — 49ca726

### Phase 5: Verification

- [x] 5.1 Run the full validation gate (format, typecheck, lint, format:check, coverage, build, Pest, Pint) — 1dea7d5
- [x] 5.2 Verify the three gestures in the running app, including dimensions, a rounded corner, a seam allowance and a piece on a rotated rectangle, one-step undo, Escape and SVG export; record the result on the PR — 1dea7d5

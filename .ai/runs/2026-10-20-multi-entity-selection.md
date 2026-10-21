# Execution plan — multi-entity selection on the canvas (adopted from PR #51)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because
PR #51 carried no execution plan.
**PR:** #51 · **Branch:** `spec/multi-entity-selection` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by
editing this file or commenting on the PR.

## 🎯 Goal

Let a user select several points, lines and curves at once — by Ctrl/Cmd-click or
by dragging a rectangle on empty canvas — then delete the whole set as one undo
entry, while the sidebar switches from the single-entity inspector to a compact
selection summary.

## Scope

- New pure set/gesture rules in `frontend/src/lib/selection.ts` (modifier mode,
  ordered replace/add/subtract, toggle, orphaned-edge guard).
- New rectangle predicates in `packages/geometry/src/selection.ts` (point,
  segment and convex-hull overlap; window versus crossing), exported additively.
- `frontend/src/components/PatternCanvas.vue`: ordered `selectedEntityIds`
  contract, multi-entity styling, the 4 px marquee gesture with live candidates,
  modifier clicks, touch/pointer/wheel/blur cancellation.
- `frontend/src/components/SelectionSummary.vue`: counts by kind and a guarded
  Delete button for two or more selected entities.
- `frontend/src/views/EditorView.vue`: selection state, grouped Delete, stale-id
  pruning, sidebar branch, live-region count.
- Update the `005-canvas-editor-interactions` contract and add tests; full
  validation gate with 100 % coverage.

## Non-goals

- Bulk property editing or group move.
- Keyboard canvas selection, select-all, copy/paste, layers or auto-scroll.
- Command, schema, API, database or persisted-document changes.
- A command-layer cascade for deleting dependent edges; the UI refuses instead.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is multi-selection plus safe bulk delete | PR #51 body, issue #50 | high |
| Q1–Q3 recommended defaults were accepted | `spec-ready` applied by the maintainer; spec Resolved assumptions | high |
| Marquee, click and delete behaviour | `.ai/specs/2026-10-20-multi-entity-selection.md` acceptance criteria | high |
| Geometry package stays additive | Spec “No command, schema, API or persisted-document change” | high |

## Assumptions

- The maintainer's `spec-ready` accepts the spec's recommended answers to Q1–Q3:
  bare-canvas left-drag becomes a marquee, middle/Space still pan, and Delete
  refuses to orphan an edge instead of cascading.
- A stale id is pruned on the next document change; a temporarily stale id in a
  summary is skipped rather than throwing.
- Touch keeps its existing tap/pan gestures; pen drags marquee.

## Risks

- Bare-canvas left-drag no longer pans (Q1); middle-drag and Space-drag remain,
  and the change is a contained pointerdown revert if users object.
- Points with unselected dependent edges cannot be deleted in one step (Q3); the
  error names the edges and the long-term fix is a command-layer cascade spec.
- macOS Ctrl+click and some Linux Alt+drag chords are environment-dependent;
  Cmd and the Ctrl/Cmd+Shift alias cover those desktops.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Spec and set rules

- [x] 1.1 Spec `.ai/specs/2026-10-20-multi-entity-selection.md` on the branch — d410987
- [x] 1.2 Add `frontend/src/lib/selection.ts` with modifier mode, ordered replace/add/subtract, toggle and the orphaned-edge guard, plus unit tests — 5ba041b

### Phase 2: Rectangle geometry

- [x] 2.1 Add `packages/geometry/src/selection.ts` with point/segment/hull overlap, window versus crossing and document-order results; export it and test boundaries, collinear overlap, the curve counterexample, construction and dangling references — 5ba041b

### Phase 3: Canvas gesture and selection contract

- [x] 3.1 Migrate `PatternCanvas.vue` to `selectedEntityIds`, style the whole set, and implement click modifiers, the 4 px marquee with live candidates, cancellation and ignored wheel; cover both directions, all three modes and touch — 5ba041b

### Phase 4: Editor wiring

- [x] 4.1 Add `SelectionSummary.vue`, the sidebar branch, grouped Delete with the orphan guard, the live-region count, stale-id pruning and the workspace hint fix; cover one/two-plus/zero states — 5ba041b

### Phase 5: Verification

- [x] 5.1 Update the `005-canvas-editor-interactions` contract, bump the geometry package minor version and run the full validation gate — 5ba041b

# Execution plan — make dimensions selectable and bulk-deletable (adopted from PR #83)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-24 because PR #83 carried no execution plan.
**PR:** #83 · **Branch:** `spec/selectable-dimensions` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Let a maker select one or many dimensions on the canvas and in the Dimensions drawer, and remove the whole dimension selection in one grouped undo step, keeping the change entirely in ephemeral frontend view state.

## Scope

- `frontend/src/views/EditorView.vue` — `selectedDimensionIds`, drawer row selection, grouped `remove_constraint` delete, summary/badge/live-region counts, prune watcher.
- `frontend/src/components/PatternCanvas.vue` — selection-first press around the existing dimension drag, selected treatment, clearing on entity gestures, title copy.
- `frontend/src/components/SelectionSummary.vue` — optional dimension count and dimension note.
- `frontend/src/lib/selection.ts` — reused unchanged (`selectionModeFrom`, `applySelection`, `toggleSelection`).
- Tests for the three touched frontend modules; one line in `.ai/specs/005-canvas-editor-interactions.md`.

## Non-goals

- No mixed entity+dimension selection, no marquee over dimensions, no mixed Delete composition (spec Q1, option B — deferred).
- No dimension property inspector, context menu, select-all, or confirmation flow for dependent dimensions.
- No change to `PatternDocument`, the journal, the HTTP API, the command spec, exports or `@sewcraft/geometry`.
- No new command: removal keeps using the existing `remove_constraint` inside one `dispatchGroup`.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The goal is canvas + drawer dimension selection with one grouped delete | issue #82 ("select one or many dimensions - for example, to delete them") and the spec's acceptance criteria | high |
| Q1 is answered as "separate, mutually exclusive selection" (option A) | spec Open Questions recommended answer; `spec-ready` is the repo's human design gate (`AGENTS.md`, `docs/architecture`), applied to PR #83 | high |
| Implementation ships on this branch, not a second PR | user brief for this run; `AGENTS.md` feature route ("one combined PR"; `spec-ready` → implementation continues on the same branch) | high |
| Removal must go through `remove_constraint` in one `dispatchGroup` | spec constraints and `docs/domain/command-spec.md`; `EditorView` already uses `dispatchGroup` for grouped undo | high |
| The work is frontend-only, 100 % coverage applies | `AGENTS.md` testing gate; spec Modules table | high |

## Assumptions

- **Q1 default accepted.** The `spec-ready` label is treated as the human confirmation that unlocks the recommended option A; if the maintainer meant to pick option B, this plan's `EditorView` selection shape is the part to rewrite.
- **Entity selection also clears dimensions through an `EditorView` watcher** in addition to the canvas emits the spec names, so Outline selection and other non-canvas entry points keep the mutual-exclusion invariant.
- **Drawer row selection uses the row header only**; inputs and the per-row Remove stay independent, exactly as the spec states.
- **Spec status flips to accepted/implemented in place**, matching how previous specs on combined PRs record that `spec-ready` answered their open questions.

## Risks

- Adding selection to an existing pointer-down path that also drags and double-click-edits: mitigated by "select on press, drag only on plain press, no update without movement", with the existing drag tests extended.
- Two selection arrays must stay exclusive: one watcher pair in `EditorView` plus one canvas gesture wrapper, both covered by tests.
- The goal is stated by the issue and spec, so inference risk is low; the only inferred item is the adopted plan itself, not the feature.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Land the selectable-dimensions spec (design only) — c7e2298

### Phase 2: Single-dimension selection

- [x] 2.1 Add `selectedDimensionIds` to EditorView with status, badge, pruning, and piece-selection clearing — e418a5f
- [x] 2.2 Add the PatternCanvas prop/emit and the selection-first dimension press wrapper — e418a5f
- [x] 2.3 Render the selected dimension halo and label outline — e418a5f
- [x] 2.4 Clear dimensions on the entity and marquee gestures the spec names — e418a5f

### Phase 3: Multiple dimensions, drawer and delete

- [x] 3.1 Apply the selection helpers in the canvas wrapper and the drawer row handler — e418a5f
- [x] 3.2 Add the grouped dimension branch to `deleteSelected` with ribbon and live-region wiring — e418a5f
- [x] 3.3 Extend SelectionSummary and branch the Properties drawer, hint and badge — e418a5f
- [x] 3.4 Turn the Dimensions drawer row header into a selection button — e418a5f
- [x] 3.5 Update the dimension title copy for select, drag and edit — e418a5f

### Phase 4: Hardening and verification

- [x] 4.1 Cover the edge cases and add the 005 interaction line — e418a5f
- [x] 4.2 Run the full validation gate and the authoritative review pass — e8f65ba

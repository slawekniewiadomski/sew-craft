# Execution plan — marquee selection includes dimensions (adopted from PR #86)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-24 because PR #86 carried no execution plan.
**PR:** #86 · **Branch:** `spec/marquee-dimension-selection` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

A Select-tool marquee selects the dimensions its rectangle covers as well as the
entities, and Delete removes a mixed selection as one undo entry. The marquee is
the only gesture that may leave both selections non-empty; clicks, drawer rows
and piece selection stay exclusive.

## Scope

- `packages/geometry/src/selection.ts` — additive `dimensionsInRect()` hit-testing
  the dimension line only, with cascade tests and the `0.13.0` bump.
- `frontend/src/components/PatternCanvas.vue` — dimension hits in
  `finishMarquee`, the latched preview halo, and mutually exclusive click emits.
- `frontend/src/views/EditorView.vue` — mixed delete as one `dispatchGroup`,
  mixed live-region text, the Create-piece gate, and explicit clears in the
  click/drawer paths replacing the two mutual-exclusion watchers.
- `frontend/src/components/SelectionSummary.vue` — mixed count line while
  keeping the entity breakdown.
- `frontend/src/components/EditorRibbon.vue` — the Create-piece tooltip reason.
- `.ai/specs/005-canvas-editor-interactions.md` — the marquee contract line.

## Non-goals

- No typed selection model (Q1 option C), no select-all, no mixed inspector.
- No marquee over pieces, seams, feature points or corner rounds.
- No screen-space label hit target, no touch additive mode, no auto-scroll.
- No command, schema, API, document or export change.

## Assumptions

- **Q1 accepted as option B.** `spec-ready` on PR #86 is the human confirmation
  of the spec's recommended answer.
- **Spec and implementation ship on this branch**, per the user brief and
  `AGENTS.md`'s one-combined-PR feature route.
- **The hidden-dimension rule lives in the canvas**, because the View toggle is
  presentation state the geometry package does not model.
- **The package version bumps** for the additive public export, matching
  `BACKWARD_COMPATIBILITY.md`.

## Risks

- **A third selection state.** Every consumer is given a rule and a test:
  summary, live region, Create piece, Delete enablement and the inspector.
- **Delete safety.** The orphan guard runs over the entity half before any
  command is built and refuses the whole group; a mixed delete stays atomic.
- **Cascade surprise.** `delete_entity` still removes constraints anchored to a
  deleted entity; that is existing behaviour, documented in the spec.
- **Coverage.** Hidden, derived, broken, empty and modified gestures all have
  tests, including preview/commit equality.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dimension line predicate

- [x] 1.1 Add `dimensionsInRect()` with crossing, window, label and extension-line tests, and bump the package to `0.13.0`

### Phase 2: Marquee selection and mixed state

- [x] 2.1 Make clicks mutually exclusive in the canvas and clear the other kind in the drawer handlers
- [x] 2.2 Extend `deleteSelected` to one mixed group with the entity-half orphan guard
- [x] 2.3 Add the mixed live-region, summary and Create-piece gate
- [x] 2.4 Emit dimension hits from `finishMarquee` and preview them while latched

### Phase 3: Hardening and verification

- [x] 3.1 Cover hidden, derived, broken, modified, cancelled and read-only cases; update the 005 contract line
- [x] 3.2 Mark the spec implemented and run the full validation gate and the authoritative review pass

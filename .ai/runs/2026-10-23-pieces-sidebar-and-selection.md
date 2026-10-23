# Execution plan — pieces sidebar, Outline selection and allowance retirement (adopted from PR #57)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-23 because PR #57 carried no execution plan.
**PR:** #57 · **Branch:** `feat/pieces-sidebar-and-selection` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Retire the legacy per-edge allowance **authoring** UI while keeping the legacy
`seams` model and its read-only dashed rendering, add a **Pieces** drawer that
lists every piece with its finished/cut sizes and expands a shared piece card,
and make **Outline rows select their entity** with the canvas' modifier
semantics. Piece selection is separate from entity selection.

The maintainer's brief for this run overrides the skill's default spec-only
guard: the specification is the plan, implementation lands **on this same branch
and PR**, and no second PR is opened.

## Scope

- `frontend/src/lib`: drop `add_allowance` and the `allowance` glyph; add the
  `pieces` drawer, `pieceSummaries`, `allowance-width.ts`; drop the seam field
  from `entity-properties`.
- `frontend/src/components`: delete `SeamWidthEditor.vue`; extract
  `PiecePanel.vue`; remove the inspector seam section and the canvas seam hit
  layer/editor; add the piece highlight input to `PatternCanvas`.
- `frontend/src/views/EditorView.vue`: seam handlers and Outline controls
  removed; `selectedPieceId`, `#pieces` slot, Outline row selection, toggle
  rename to `showAllowances`.
- Docs: spec statuses, compatibility note, deprecation wording.
- 100 % statements/branches/functions/lines across geometry, frontend and `app/`.

## Non-goals

- Removing `Seam`, `seams` or the three seam commands (0.3 cleanup).
- Selecting points or dimensions in the Outline; multi-piece selection;
  reordering; zoom-to-piece.
- Any geometry, command-core, PHP, schema, export or cut-dimension change.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The goal is the three connected UI changes | `.ai/specs/2026-10-23-pieces-sidebar-and-selection.md` (TLDR, Behaviour 1–11, Implementation Plan, Acceptance criteria) | high |
| Implementation must land on this PR, not a second one | maintainer brief in the run request; the PR body's "implementation follows on its own PR" is superseded by that brief | high |
| Legacy seams stay in schema 0.2 and render read-only | spec Decision A, Behaviour 3, Out of scope | high |
| Priority `medium`, risk `medium`, QA required | spec Risks table + user-facing UI; PR labels `priority-medium`, `risk-medium` | high |

## Assumptions

- Category `feature`: the change adds a Pieces drawer and Outline selection
  behaviour, not only documentation, so `documentation` is dropped.
- `needs-qa`: new user-facing sidebar and selection behaviour; replaces `skip-qa`.
- The spec's acceptance criteria are the definition of done.

## Risks

- `showSeamAllowance` → `showAllowances` rename touches many tests; mechanical.
- 100 % coverage across a large removal plus a new component and slot.
- `selectedPieceId` and entity selection must clear each other in both directions.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Retire allowance authoring

- [x] 1.1 Drop `add_allowance` from tool union, registry, ribbon map/group and the `allowance` glyph + tests
- [x] 1.2 Delete `SeamWidthEditor.vue`/test; remove the seam hit layer, double-click editor and emits from `PatternCanvas.vue`; keep the dashed layer
- [x] 1.3 Remove the seam handlers from `EditorView.vue` and the Outline width/flip/remove controls
- [x] 1.4 Remove the inspector seam section, seam emits and `seam` field from `entity-properties.ts`
- [x] 1.5 Replace `seam-width.ts` with `allowance-width.ts` for the piece editor
- [x] 1.6 Rename the toggle to `showAllowances` / `show-allowances` / "Show allowances"

### Phase 2: Pieces drawer

- [ ] 2.1 Add the `pieces` drawer after Properties, open by default, + drawer/sidebar tests
- [ ] 2.2 `pieceSummaries(document)` in `pieces.ts` + tests for empty, named, unnamed, broken
- [ ] 2.3 Extract `PiecePanel.vue` from the inspector with `PieceSummary`, edits and Remove piece; use it in the inspector + tests
- [ ] 2.4 `selectedPieceId` in `EditorView`: row toggle, expansion, entity-selection clearing, missing-piece clearing, empty state
- [ ] 2.5 Highlight the selected piece on the canvas (`selectedPieceId` prop) + tests

### Phase 3: Outline selection

- [ ] 3.1 Outline id/summary becomes a selection button (`selectionModeFrom`/`toggleSelection`/`applySelection`), `aria-current`, selected tint, controls outside it
- [ ] 3.2 Clear `selectedPieceId` on entity selection and entity selection on piece selection
- [ ] 3.3 `EditorView.test.ts` for plain click, Ctrl/Cmd toggle, Ctrl/Cmd+Shift subtract, control isolation, empty values, hand-off

### Phase 4: Docs and gate

- [ ] 4.1 Spec statuses, compatibility/deprecation docs, run outcome
- [ ] 4.2 Full validation gate, `om-auto-review-pr --autofix`, label normalization, PR finalization

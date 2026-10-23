# Execution plan — Features ribbon group and corner rounds inside pieces (adopted from PR #66)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-23 because
PR #66 is a design-only spec PR that the maintainer marked `spec-ready`, which
continues implementation on the same branch.
**PR:** #66 · **Branch:** `spec/feature-group-and-piece-corner-rounds` · **Base:** `develop`
**Spec:** `.ai/specs/2026-10-23-feature-group-and-piece-corner-rounds.md`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by
editing this file or commenting on the PR.

## 🎯 Goal

Ship the three asks of #63: a **Features** ribbon group that owns Round corner, a
**corner-point pick** alongside the existing two-line pick, and **rounding a
corner that belongs to a piece** by inserting the round's derived arc as a bridge
in the piece boundary, keeping the piece, its allowances and its cut dimensions.

## Scope

- `packages/geometry/src/corner-round.ts`: `roundBetween`, `roundBridge`,
  `incidentLines`; shared rules used by the piece walk and the frontend.
- `packages/geometry/src/piece.ts`: bridge-aware loop assembly used by both
  `validatePiece` and `orientedPolylines`; bridge distances in `pieceLoop` and
  `pieceFoldLines`; `pieceCutVertex` still addressing real edges.
- `packages/geometry/src/commands.ts`: `add_corner_round` accepts piece corners,
  enforces equal allowances and rejects a folding cut line; `set_piece_allowance`
  rejects a mismatch at a rounded corner; `remove_corner_round` keeps the piece.
- `frontend/src/lib/editor-ribbon.ts`: new `features` group, Round corner moves.
- `frontend/src/lib/corner-round.ts`: point picks, `roundableCorners`, prompts and
  the new rejection reasons.
- `frontend/src/components/PatternCanvas.vue`: point pick target, roundable rings.
- `frontend/src/views/EditorView.vue`: point-pick plumbing (no new command).
- `docs/architecture/geometry-core.md`, `docs/domain/glossary.md`: bridge rule.

## Non-goals

- No document-schema, command-set or command-spec (`spec_version`) change; the
  bridge is derived on read and a piece never stores a round.
- No notch/cut tools in the Features group — only Round corner moves now.
- No change to radius editing, tangent drag, removal, undo, cascade on delete or
  the properties panel.
- No new constraints for the arc or its tangents.
- No second PR: implementation lands on this branch and this PR is retitled.

## Decisions

Q1 on issue #63 is unanswered; the maintainer applied `spec-ready`, which the
repository's issue-driven workflow defines as the signal to implement. The spec's
recommended answer is taken as accepted:

- **Q1 = (a):** both adjacent edges at a rounded piece corner must carry the same
  allowance (both absent, or equal width and effective kind); the bridge offsets
  by that distance. Unequal allowances are rejected with a remedy message, and
  `set_piece_allowance` rejects a change that would create a mismatch.
- R2/R3: a point pick resolves both line slots and replaces a pending line pick;
  both pick paths stay.
- R4: Features sits between Tools and Sketching; Create piece stays in Tools.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is the three gaps in #63 | Issue #63, spec TLDR and Proposed Solution | high |
| Q1 = equal allowances on both edges | Spec Open Questions recommendation; `spec-ready` applied by the maintainer; PR #61 applied the same rule | high |
| Bridge is derived, never stored | Spec "Why the bridge is derived"; current `cornerRounds` model | high |
| No schema/command/spec-version change | Spec Architecture, API Contracts and R8 | high |
| Existing rejection and walk sites | `packages/geometry/src/commands.ts:1378-1380`, `piece.ts` `validatePiece`/`orientedPolylines` | high |

## Assumptions

- Equal-allowance equality compares `width` and the effective kind (an omitted
  kind means `seam`), matching `effectiveKind` in `commands.ts`.
- A loop with a bridge whose two edge allowances do not match cannot be resolved;
  the command layer prevents that state and `pieceLoop` returns `null` for a
  hand-edited document, the same degradation as any unresolvable loop.
- The self-intersection guard compares the affected piece's cut-loop
  self-intersection count before and after the round, so a drawing that already
  folds is not rejected for an unrelated pre-existing fold.
- Point picks are pointer targets; the two-line path remains the keyboard route.

## Risks

- The bridge walk touches a branch-heavy function under a 100 % coverage gate;
  Phase tests enumerate each bridge and rejection case before the UI lands.
- The allowance rule is deliberately strict (remove the round to change one side);
  it is the approved Q1 recommendation, called out in the messages.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Design spec for the Features group, corner pick and piece corner rounds — cc229ba

### Phase 2: Geometry bridge

- [ ] 2.1 `corner-round.ts`: `roundBetween`, `roundBridge`, `incidentLines`, with tests
- [ ] 2.2 `piece.ts`: bridge-aware loop assembly shared by `validatePiece` and `orientedPolylines`, bridge distances and fold lines, with tests
- [ ] 2.3 `pieceCutVertex` and `naturalStart` addressing with a bridge, with tests

### Phase 3: Commands

- [ ] 3.1 `add_corner_round`: accept piece corners, equal-allowance validation, folding-cut-loop rejection, with tests
- [ ] 3.2 `set_piece_allowance`: reject a mismatch at a rounded corner, with tests
- [ ] 3.3 `remove_corner_round`: piece, allowances and cut dimensions survive, with tests

### Phase 4: Ribbon

- [ ] 4.1 `features` group between Tools and Sketching, Round corner moves, with tests

### Phase 5: Corner pick

- [ ] 5.1 Frontend corner-round point picks, `roundableCorners`, prompts and rejections, with tests
- [ ] 5.2 `PatternCanvas.vue`: point pick target and roundable rings, with tests
- [ ] 5.3 `EditorView.vue`: point-pick plumbing and mismatch message, with tests

### Phase 6: Docs and gate

- [ ] 6.1 `docs/architecture/geometry-core.md` and `docs/domain/glossary.md` describe the bridge rule
- [ ] 6.2 Full validation gate green (format, typecheck, lint, format:check, coverage, build, Pest 100 %, Pint)
- [ ] 6.3 `om-auto-review-pr` pass with findings addressed
- [ ] 6.4 Retitle the PR, flip to ready, normalize labels and report

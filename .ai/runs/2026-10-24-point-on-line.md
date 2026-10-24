# Execution plan — create a point on a line in one gesture (adopted from PR #87)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-24 because PR #87 carried no execution plan.
**PR:** #87 · **Branch:** `spec/point-on-line` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

With the Point tool active, a click on a straight line creates the point at its
projection and applies `point_on_line` in one undoable journal entry, while every
other click keeps today's free-point behaviour.

## Scope

- `packages/geometry/src/dimension.ts` — export the existing private
  `footOnLine()` as `projectPointOnLine()`, with direct unit tests; bump the
  package to `0.13.0` for the additive export.
- `frontend/src/lib/point-on-line.ts` — pure `buildPointOnLineCommands()`
  composing `add_point` and `add_constraint` with fresh ids.
- `frontend/src/components/PatternCanvas.vue` — hovered-line highlight,
  projection ghost, status hint, point-snap precedence and the
  `add-point-on-line` emit.
- `frontend/src/views/EditorView.vue` — one handler that dispatches the batch
  through the existing `dispatchGroup`; no new store state.

## Non-goals

- No dedicated Point-on-line tool or split Point control (Q1 options B/C).
- No point inference for drafting endpoints, no point-on-curve relation.
- No segment-clamped constraint, deletion-cascade change or modifier override.
- No command, schema, HTTP API or solver change.

## Assumptions

- **Q1 accepted as option A.** `spec-ready` on PR #87 is the human confirmation
  of the spec's recommended answer; the Point tool infers the relation.
- **Spec and implementation ship on this branch**, per the user brief and
  `AGENTS.md`'s one-combined-PR feature route.
- **Projection uses the raw world pointer**, not the grid-snapped position, and
  the 6 mm point snap still wins.
- **The package version bumps** for the additive public export, matching
  `BACKWARD_COMPATIBILITY.md` and the `entitiesInRect` precedent.

## Risks

- **Reversed Point-tool meaning.** Mitigated by the pre-click line highlight,
  projection ghost and status hint, all covered by tests.
- **Hidden near-duplicate.** The 6 mm point snap runs before line inference; an
  explicit test pins the precedence.
- **Coverage.** Every new branch has a test, including the total `null` paths of
  the projection and the command builder.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Projection and command composition

- [x] 1.1 Export `projectPointOnLine()` from the geometry package with unit tests and the `0.13.0` bump
- [x] 1.2 Add `buildPointOnLineCommands()` with its unit tests

### Phase 2: Gesture and affordance

- [x] 2.1 Wire the Point-tool hover signal, ghost, hint and `add-point-on-line` emit in `PatternCanvas`
- [x] 2.2 Dispatch the batch as one journal entry in `EditorView`, with the `null` guard

### Phase 3: Verification

- [x] 3.1 Mark the spec implemented and tick its acceptance criteria
- [x] 3.2 Run the full validation gate and the authoritative review pass

# Execution plan — movable linear dimensions (adopted from PR #32)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #32 carried no execution plan.
**PR:** #32 · **Branch:** `spec/issue-30` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Ship issue #30's movable linear dimensions: a 20 mm default offset, dragging with
both the Select and Dimension tools, a 24 px invisible hit strip with move
cursors, and clean `pointercancel` / tool-switch / unmount teardown — with the
spec and the implementation on this single branch.

## Scope

- `packages/geometry/src/dimension.ts` — the default offset constant and its test.
- `frontend/src/components/PatternCanvas.vue` — drag eligibility, hit strip,
  cursors, tooltip, `pointercancel` and shared teardown.
- `frontend/src/components/PatternCanvas.test.ts`,
  `frontend/src/views/EditorView.test.ts` — updated offsets plus the new
  dragging, hit-target, cursor, cancellation and listener tests.
- `docs/architecture/geometry-core.md`, `docs/architecture/data-model.md`,
  `docs/domain/command-spec.md` — 12 mm → 20 mm.

## Non-goals

- Dragging dimensions with the Point, Line, Curve or Seam allowance tools.
- Auto-placement, collision avoidance, offset snapping or keyboard nudging.
- Any change to `update_constraint`'s schema, the command spec version, the
  solver, persistence or the API.
- A second, implementation-only PR. `AGENTS.md` requires `feature` work to ship
  spec and implementation on one branch, which overrides the skill's default
  spec-only hand-off; this is recorded here deliberately.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The goal is issue #30: dimensions render too close and cannot be pulled away | issue #30 title/body, spec TLDR | high |
| The intended design is the 20 mm default, dual-tool dragging, 24 px strip, move cursors, `pointercancel` teardown | `.ai/specs/2026-10-19-movable-linear-dimensions.md` | high |
| The work ships on this branch as one combined PR | `AGENTS.md` § Issue-driven work (`feature` → one combined PR) and the operator brief for this run | high |
| Current code matches the spec's "today" description (12 mm, `select`-only drag, 14 px strip, no `pointercancel`) | spec Problem Statement, verified by the Copilot design review on this PR | high |
| One low-severity review nit is open: "Dragging moved out or in" at spec line 296 | inline review comment r4317352614 | high |

## Assumptions

- The spec's own Implementation plan is the authoritative step breakdown; no
  extra design is needed before coding.
- The 14 → 24 px hit strip and cursor changes are presentation-only and need no
  command change, matching the spec's "keep the command layer untouched".
- The spec stays `Status: proposed` until the implementation lands; it is then
  marked accepted in the same PR rather than in a separate one.

## Risks

- `PatternCanvas.vue` is a large component; the drag-eligibility refactor can
  affect constraint placement and inline editing. Mitigated by keeping the
  existing `constraintActive` guard and adding regression tests for both.
- A missed listener leak would fail the 100 % coverage gate rather than ship
  silently.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Specification landed (reconstructed)

- [x] 1.1 Write `.ai/specs/2026-10-19-movable-linear-dimensions.md` — b7ab549

### Phase 2: Default offset and review nit

- [ ] 2.1 Raise `DEFAULT_DIMENSION_OFFSET` to 20 mm and pin it with a test
- [ ] 2.2 Update every hard-coded 12 mm assertion in the canvas and view tests
- [ ] 2.3 Fix the "Dragging moved out or in" phrasing flagged at spec line 296

### Phase 3: Canvas drag eligibility and affordance

- [ ] 3.1 Derive drag eligibility from the active tool and `constraintActive`; render the strip only when draggable
- [ ] 3.2 Widen the line hit strip to 24 px and apply move/edit cursors and tooltip copy

### Phase 4: Pointer teardown

- [ ] 4.1 Add `pointercancel` and a shared teardown; cancel drags on tool switch and layer hide

### Phase 5: Tests

- [ ] 5.1 Canvas tests for Dimension-tool dragging, hit strip, cursors, cancellation and listener cleanup
- [ ] 5.2 EditorView tests for Dimension-tool dragging and the 20 mm offset

### Phase 6: Docs and gate

- [ ] 6.1 Correct the 12 mm default in geometry-core, data-model and command-spec docs
- [ ] 6.2 Run the full validation gate and the automated review, then finalize the PR

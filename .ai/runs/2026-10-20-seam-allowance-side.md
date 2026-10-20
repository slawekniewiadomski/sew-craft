# Execution plan — per-edge seam allowance side with a Flip side control (adopted from PR #43)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #43 carried no execution plan (it is a spec-only PR promoted by `spec-ready`).
**PR:** #43 · **Branch:** `spec/seam-allowance-side` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Store a per-edge seam allowance side (`left`/`right`, default `left`) and expose a **Flip side** action in the Outline drawer and the Properties inspector, dispatched as `set_seam_allowance { id, side }`, so the dashed allowance can move to the other side of the cut edge with one undoable command.

## Scope

- `packages/geometry`: `SeamSide`, optional `Seam.side`, `seamSide()`, signed offset in `seamAllowancePath`, `side` on `SeamAllowancePath`, command validation and inverses.
- Command contract: `config/geometry.php`, `docs/domain/command-spec.md`, `docs/domain/command-spec.json`, geometry package version `0.6.0`.
- `frontend`: Flip side buttons in the Outline drawer and `EntityPropertiesPanel`, one handler in `EditorView`.
- Tests and docs for all of the above.

## Non-goals

- Loop/piece topology, inside/outside vocabulary, or auto-guessing the side (Q1 recommended answer taken: edge-relative for v1).
- SVG/PDF/DXF export changes (spec 008 is not implemented).
- SQL migration or schema version bump; a canvas double-click flip gesture; a new flip command.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is an explicit per-edge side plus a Flip side control | PR #43 body, spec `2026-10-20-seam-allowance-side.md` TLDR + Behaviour | high |
| Edge-relative `left` default is the v1 decision | spec Q1 recommended answer and R1; `spec-ready` on the PR implies approval to proceed | high |
| Command contract changes are additive, v0.5.0 → v0.6.0 | spec API Contracts, R6; `BACKWARD_COMPATIBILITY.md` protected surface | high |
| Only spec files are landed so far | PR #43 diff (3 files, all under `.ai/specs/`) | high |
| UI lives in the Outline drawer row and inspector seam section | spec UI/UX; `EditorView.vue:601-630`; `EntityPropertiesPanel.vue` seam section | high |

## Assumptions

- The `spec-ready` label on the draft PR is the approval to implement; implementation happens on this same branch and PR (explicit run brief).
- Q1 is answered by the recommended option: edge-relative flip now, loop-aware later with pieces.
- A seam written by `add_seam_allowance` always stores `side` (default `left`); legacy seams without it render exactly as before.
- The inspector emits only the seam id; `EditorView` resolves the current side from the document.
- No new public helper for the opposite side is needed; the UI inverts the resolved side.

## Risks

- The goal was inferred from the spec (there is no written execution plan) — medium confidence, mitigated by the spec's explicit implementation plan.
- Wording left/right can mislead; the UI never prints it, per spec.
- Adding `side` to the inverse of `set_seam_allowance` must not mutate legacy seams on undo; the inverse carries `side` only when it was stored.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Spec and mockup committed on the branch — 73be795

### Phase 2: Geometry model

- [x] 2.1 Add `SeamSide`, optional `Seam.side`, `seamSide()` and tests — 8b1811f
- [x] 2.2 Sign the seam offset by side, expose `side` on `SeamAllowancePath`, tests, docs — 8b1811f

### Phase 3: Commands and contract

- [x] 3.1 Extend add/set params with validated `side`, carry it through inverses, command tests — 73a152a
- [x] 3.2 Bump command spec 0.6.0 across PHP, Markdown and JSON; bump geometry package to 0.6.0 — 73a152a

### Phase 4: UI

- [x] 4.1 Add `flipSeam` in `EditorView` and the Flip side buttons in drawer and inspector, with tests — 35307c4
- [x] 4.2 Expose the resolved side in the entity-properties view model and update its tests — 35307c4

### Phase 5: Verification

- [x] 5.1 Run the full validation gate and fix any failures — 53bea86
- [x] 5.2 Run `om-auto-review-pr`, address findings, finalize labels and PR state — 348ae7f
- [x] 5.3 Merge the latest `develop` (conflict with #45), re-run the gate and push — 0b8c095

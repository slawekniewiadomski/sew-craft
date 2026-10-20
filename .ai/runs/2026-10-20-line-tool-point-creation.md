# Execution plan — line tool creates its own points (adopted from PR #44)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #44 carried no execution plan; the approved spec at `.ai/specs/2026-10-20-line-tool-point-creation.md` is the source of the phases below.
**PR:** #44 · **Branch:** `spec/line-tool-point-creation` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Let the Line tool start and end a line on bare canvas: each click resolves to an
existing point or a new snapped coordinate, and the new points plus the line
commit as one undoable gesture (#42), implemented on this same branch and kept
green under the 100% coverage gate.

## Scope

- `frontend/src/lib/line-tool.ts` (new) — `LineEndpoint`, `resolveLineEndpoint`,
  `sameEndpoint`, `buildLineCommands`, with unit tests.
- `frontend/src/stores/editor.ts` — `dispatchGroup` plus optional
  `commands`/`inverses` on `JournalEntry`, with redo replay.
- `frontend/src/composables/use-command-bus.ts` — expose `dispatchGroup`.
- `frontend/src/components/PatternCanvas.vue` — pending `LineEndpoint`, provisional
  point (`line-pending-point`) and dashed rubber band (`line-preview`), new
  `add-line` payload, cancellation rules.
- `frontend/src/views/EditorView.vue` — compose the batch and dispatch it once.
- Tests for each file, and the spec status flipped to implemented.

## Non-goals

- No new command, HTTP, schema, database or export change; `add_line` keeps
  taking two existing point ids.
- The curve tool stays on the existing id-only collection path; no keyboard
  creation path; no constraint to clicked geometry.
- No second PR: per `AGENTS.md` the feature issue ships spec and implementation
  on one combined PR.

## Evidence

| Conclusion                                         | Drawn from                                                                        | Confidence |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| The goal is the three click cases in issue #42     | Issue body and spec Behaviour section                                             | high       |
| Q1 is decided as lazy commit with one grouped undo | Spec Open Questions Q1 recommended answer; `spec-ready` applied by the maintainer | high       |
| Only frontend files change                         | Spec Data Model, API Contracts, Edited modules                                    | high       |
| Tests belong in the existing Vitest suites         | Spec Phasing and `AGENTS.md` 100% coverage gate                                   | high       |

## Assumptions

- **The spec is the plan.** Its Phase 1–4 implementation plan is adopted; the
  spec document itself already landed in this PR's first commit.
- **The PR becomes the implementation PR.** The maintainer's brief explicitly
  continues implementation on this branch and forbids a second PR.
- **QA meta is `needs-qa`.** Drawing on canvas is user-facing behaviour.
- **Category is `feature`.** Priority stays `priority-medium`; risk rises from
  `risk-low` to `risk-medium` because the change reaches the central editor store
  and the most interactive component, as the spec's risk review notes.

## Risks

- Grouped dispatch touches the only mutation path: apply on a local document,
  assign once, and test undo/redo plus mid-batch failure.
- Every new branch in the canvas resolution must be exercised or the 100%
  coverage gate fails.
- Q1's alternative (immediate commits) remains a product decision; this run
  follows the recommended answer already documented in the spec.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Endpoint resolution and command composition

- [x] 1.1 Add `line-tool.ts` with `LineEndpoint`, `resolveLineEndpoint`, `sameEndpoint` and `buildLineCommands` — 09db8ec
- [x] 1.2 Cover every click case, snapping and identical endpoints in `line-tool.test.ts` — 09db8ec

### Phase 2: Grouped dispatch

- [x] 2.1 Add `dispatchGroup` and grouped journal replay to the editor store and command bus — 09db8ec
- [x] 2.2 Test one entry per batch, undo, redo, empty batch and mid-batch failure — 09db8ec

### Phase 3: Canvas interaction

- [x] 3.1 Replace line pending ids with one `LineEndpoint` and emit the new `add-line` payload — 4ddfae0
- [x] 3.2 Render the provisional point and dashed preview, and clear them on completion, tool change and doc change — 4ddfae0
- [x] 3.3 Test the click combinations, identical-endpoint guard, cancellation and preview test ids — 66bd368

### Phase 4: Editor wiring and verification

- [x] 4.1 Wire `EditorView.onAddLine` to `buildLineCommands` + `dispatchGroup` — 4ddfae0
- [x] 4.2 Test the resulting document and one-step undo in `EditorView.test.ts` — 66bd368
- [x] 4.3 Mark the spec implemented and run the full validation gate — 8fc280a
- [x] 4.4 Run `om-auto-review-pr 44 --autofix` and resolve findings — f8eddbc
- [ ] 4.5 Retitle the PR, normalize labels, promote it to ready and report

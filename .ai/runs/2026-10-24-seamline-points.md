# Seamline points as dimension anchors

Goal: implement `.ai/specs/2026-10-24-seamline-points.md` on `spec/seamline-points`
(PR #79) and complete the same PR — the spec is the plan. Refs #78.

Resumed by `om-auto-continue-pr` with the explicit brief to implement on this
branch: the project ships a feature spec and its implementation on one combined
PR (`AGENTS.md`, issue-driven work).

Product calls follow the spec's recommended answers because `spec-ready` was
applied by the maintainer after review, no different answer was posted on #78,
and the previous spec in this chain (#77) shipped under exactly this rule:

- **Q1 → A (the stitch loop).** Seamline points are the sew-line corners of the
  piece loop, including the trimmed ends a corner-round bridge contributes. The
  allowance boundary's remaining gap (a bevel's second cut point) stays a
  follow-up (R6).
- **Q2 → A (an optional `loop` on `CutAnchor`).** `loop?: 'stitch' | 'cut'`,
  omitted means `cut`, so every stored anchor and #77's `at: 'edge'` payloads
  keep their meaning. #77's implementation has landed (merged as #77), so the
  sequencing gate is satisfied and the pattern schema stays `0.2`.

Non-blocking defaults R1–R11 are adopted unchanged.

## Non-goals

- A driving dimension to a seamline point (R10); that needs a projection
  constraint and its own spec.
- Cross-piece anchors (R2), a new tool id (R4), or the bevel's second cut point
  (R6).
- A schema bump or a migration of stored anchors; `loop` is additive.

## Assumptions

- `pieceCutVertex`'s `naturalStart` / `spans` arithmetic is the shared vertex
  contract for both loops, including a reversed edge.
- Derived handles stay visible only while the derived-dimension tool is armed
  (R11), exactly like today's cut-vertex rings.
- Docker (Pest) and npm (Vitest) remain the validation entry points.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Geometry

- [x] 1.1 Add `loop?: 'stitch' | 'cut'` to `CutAnchor` and the stitch-loop `pieceLoopVertex` resolver — 9638855
- [x] 1.2 Add `resolvePieceAnchor` dispatching to the stitch or cut position, with unit tests — 9638855

### Phase 2: Dimension and command contract

- [x] 2.1 Resolve derived spans and anchor issues through `resolvePieceAnchor`, loop-aware identity — 9638855
- [x] 2.2 Accept and validate `loop` in `add_derived_dimension`, including the `stitch`+`edge` rejection — 9638855
- [x] 2.3 Add the `loop` compare to `sameAnchor` and the loop prefix to the inspector anchor label — 29e9f75
- [x] 2.4 Sync the command spec (php, json, md) and the docs (glossary, geometry-core, data-model) — 502cb61

### Phase 3: Canvas

- [x] 3.1 Render stitch and cut loop handles from the resolved loops while the tool is armed — 29e9f75
- [x] 3.2 Pick seamline points with the pure nearest-point helper, with the coincident-corner collapse — 29e9f75
- [x] 3.3 Cover the handles, the pick helper and each hint with tests — 29e9f75

### Phase 4: Verification

- [x] 4.1 Run the full validation gate and record results — gate green: format, typecheck, lint, format:check, build, Vitest 100% coverage, Pest 52 passed at 100%, Pint
- [x] 4.2 Run `om-auto-review-pr --autofix` and apply its findings — APPROVE, no findings
- [x] 4.3 Finalize the PR: retitle, labels, draft→ready, `Closes #78` — 3c56afa

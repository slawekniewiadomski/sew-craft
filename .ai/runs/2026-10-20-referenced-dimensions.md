# Execution plan — reference one dimension from another (adopted from PR #48)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #48 carried no execution plan.
**PR:** #48 · **Branch:** `spec/referenced-dimensions` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Let a distance dimension reference another dimension instead of holding a
literal, so changing the source updates every dependent in one solve, and a
removed source leaves dependents visibly broken and repairable.

## Scope

- Geometry package: `reference` / `lastKnownValue` fields, four-state
  `dimension.ts` resolver, per-solve value map in `solver.ts`, reference and
  cascade handling in `commands.ts`.
- Frontend: state-aware canvas labels (blue referenced, red broken), `#`
  reference picker, drawer and inspector fields, badges, Re-link and Remove
  reference actions.
- Documentation: geometry core, data model, glossary, command spec `0.7.0` and
  the PHP config mirror.
- Unit and component tests keeping both workspaces at 100 % coverage.

## Non-goals

- Angle references, arithmetic expressions and cross-project references (spec R8).
- Referencing driven or broken dimensions (spec Q1, R5).
- Any HTTP route, database column, SVG/PDF/DXF export change.
- Automatic freezing of dependents at their last value (spec Q3 chooses broken).

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is referenced dimensions with a `#` picker and broken state | PR #48 body, issue #47, `.ai/specs/2026-10-20-referenced-dimensions.md` | high |
| Open questions Q1–Q3 take their recommended answers | `spec-ready` applied by the maintainer; spec's Resolved assumptions R1–R9 | high |
| Model, command contract, rendering and editing shape | Spec's Implementation Plan Phases 1–5 | high |
| 100 % coverage and documented contracts are required | `AGENTS.md` Definition of done, `docs/architecture/standards.md` | high |

## Assumptions

- The maintainer's `spec-ready` accepts the spec's recommended answers to Q1–Q3;
  the implementation follows R1 (a field on the existing constraint), R5 (picker
  exclusions) and R6 (last-known value is display-only).
- An exact inverse is not expressible when a reference is already broken
  (its target is dangling); those transitions return `inverse: null` and rely on
  the journal snapshot. This is the most reversible option the document model
  allows.
- The blue reference token is `oklch(0.488 0.243 264.376)` (blue-700, ≈ 6.7:1 on
  the canvas background) because the previous blue-600 brand token was removed.

## Risks

- The exported `DistanceConstraint` type and the two command contracts change,
  so the package minor bump and three-way spec sync are mandatory.
- A cyclic or dangling reference from a hand-edited document must render broken
  and add no residual, never recurse or hang a solve; covered by read-path tests.
- The goal was reconstructed from the spec rather than stated as a plan;
  confidence is high because the spec's Implementation Plan maps to the phases.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Spec `.ai/specs/2026-10-20-referenced-dimensions.md` on the branch — 31b393e
- [x] 1.2 Geometry model, resolver, solver map and command contract with tests — 00c2a4d
- [x] 1.3 Canvas labels, `#` picker, drawer/inspector wiring with tests — 00c2a4d
- [x] 1.4 Documentation and command spec `0.7.0` sync — 00c2a4d

### Phase 2: Verification and review

- [x] 2.1 Full validation gate: format, typecheck, lint, format:check, coverage (100 %), build, Pest coverage, Pint
- [x] 2.2 `om-auto-review-pr` review with autofix until merge-ready — approve; four non-blocking minors recorded on the PR
- [x] 2.3 Normalize labels, retitle to the implementation title, flip draft → ready — finalization commit

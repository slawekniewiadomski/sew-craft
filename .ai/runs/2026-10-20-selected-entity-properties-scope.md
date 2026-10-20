# Execution plan — scope selected-entity properties to the selected edge (adopted from PR #45)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #45 carried no execution plan.
**PR:** #45 · **Branch:** `spec/selected-entity-properties-scope` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Selecting a line in the Properties inspector lists only the dimensions and
constraints that act on that line's own endpoint pair, with a short hint and
entity-specific empty states, so a rectangle's `ab` shows `width` and `bottom`
without the neighbouring edges' rows (#41), implemented on this branch with the
100% coverage gate green.

## Scope

- `frontend/src/lib/entity-properties.ts` — replace the any-shared-point filter
  with a type-switched `constraintActsOnEntity` predicate and `samePair` helper.
- `frontend/src/lib/entity-properties.test.ts` — relation-matrix tests, including
  the seeded rectangle, cross-edge constraints and the broken-line case.
- `frontend/src/components/EntityPropertiesPanel.vue` — per-kind hint for
  line/curve selections and "on this line/curve/point" empty states.
- `frontend/src/components/EntityPropertiesPanel.test.ts` — hint and empty-state
  copy assertions.
- `.ai/specs/2026-10-20-selected-entity-properties-scope.md` — status flipped from
  `proposed` to `implemented`.

## Non-goals

- No schema, command, API, database, package-version or export change; the
  predicate is read-side only.
- Point and curve selections keep their current relation rule; the
  document-wide Outline, Dimensions and Constraints drawers stay unchanged.
- No collapsed "Endpoint constraints" section, no new controls, no curve-specific
  narrowing, no multi-selection.
- No second PR: per `AGENTS.md`, this feature issue ships spec and implementation
  on one combined PR, so this branch continues as that PR.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The goal is the relation matrix in the scope spec | Spec `.ai/specs/2026-10-20-selected-entity-properties-scope.md` (Chosen rule, Phasing, Implementation Plan) | high |
| Q1 is decided: hide endpoint-anchoring constraints | Spec Resolved questions Q1 and the PR's status comment on #41 | high |
| Only the frontend selector and panel copy change | Spec Edited files, Data Model, API Contracts, Risks | high |
| Tests belong in the existing Vitest suites | Spec Phase 1–2 and `AGENTS.md` 100% coverage gate | high |
| The earlier selection-inspector spec is already amended | PR diff for `.ai/specs/2026-10-20-selected-entity-properties.md` | high |

## Assumptions

- **The spec is the plan.** Its Phase 1–2 implementation steps are adopted; the
  spec's Phase 3 is already landed in this PR's spec commit, and Phase 4 becomes
  this run's verification and handoff phases.
- **The PR becomes the implementation PR.** The maintainer's brief explicitly
  continues implementation on this branch and forbids a second PR.
- **QA meta is `needs-qa`.** The change alters what users see in the inspector
  (rows disappear, copy appears), so it is user-facing even though the blast
  radius is small.
- **Category is `feature`.** The PR adds behaviour (#41) rather than documentation
  after the implementation lands; priority and risk stay `priority-medium` and
  `risk-low` because the scope did not widen beyond the spec.

## Risks

- Strict matching deliberately hides endpoint-anchoring constraints on a line;
  the point inspector and the Constraints drawer remain the escape hatches (Q1).
- A coverage regression in either new switch branch would fail the 100% gate; the
  tests below exercise every constraint type and both arms of cross-edge
  constraints.
- The goal was reconstructed from the spec rather than stated in the PR body.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Spec, UI evidence and the earlier-spec amendment committed — 131410b

### Phase 2: Relation predicate

- [x] 2.1 Add `samePair` and `constraintActsOnEntity`; use the predicate in `entityProperties` — 0f369a8
- [x] 2.2 Replace the selector tests with the relation matrix, rectangle and broken-line cases — 0f369a8

### Phase 3: Panel copy and states

- [x] 3.1 Add the per-kind hint and entity-named empty states — 644f55a
- [x] 3.2 Cover the hint and empty-state copy in the panel tests — 644f55a
- [x] 3.3 Mark the scope spec implemented — b033cd1

### Phase 4: Verification and handoff

- [x] 4.1 Run the full validation gate — b033cd1
- [x] 4.2 Run `om-auto-review-pr 45 --autofix` and resolve findings — 5893eb9
- [x] 4.3 Retitle the PR, normalize labels, promote it to ready and report — 5893eb9

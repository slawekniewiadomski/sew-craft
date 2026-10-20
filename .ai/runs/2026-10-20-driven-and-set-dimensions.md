# Execution plan — Driven and set linear dimensions (adopted from PR #36)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #36 carried no execution plan.
**PR:** #36 · **Branch:** `spec/issue-34` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

A newly placed linear dimension is **driven** — a live measurement in parentheses
with no solver equation — and typing a length makes it **set**, driving the sketch
and rendering without parentheses; clearing the value returns it to driven without
moving geometry. Ships on this PR, on the same branch as the spec.

## Scope

- `@sewcraft/geometry`: optional `DistanceConstraint.value` (absent = driven), a
  solver that skips value-less distances, `isDrivenDimension` / `dimensionValue`
  helpers, command contract for add/update/clear with precise inverses, package
  minor bump.
- Command spec sync to `0.5.0` in `config/geometry.php`,
  `docs/domain/command-spec.md` and `docs/domain/command-spec.json`.
- Frontend: parentheses and accessible names on the canvas label, effective value
  plus `Driven`/`Set` state in the Dimensions drawer, clear-to-driven in the
  shared inline editor, Dimension tool placement defaults to driven.
- Docs: geometry core, data model and glossary.

## Non-goals

- No database, HTTP route, response-shape or export change; `PatternDocument.schema`
  stays `0.1`.
- No driven state for `angle` constraints.
- The ribbon Distance **constraint** tool stays set (explicit-equation path), per
  the spec's Q3/R4 recommendation.
- No second PR: the design doc and implementation share this branch (the repo's
  combined-PR convention for feature issues).

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The goal is the spec's driven/set split | `.ai/specs/2026-10-20-driven-and-set-dimensions.md`, PR body | high |
| The issue asks for driven-by-default, set on edit, driven on clear | issue #34 body | high |
| Q1–Q3 recommended defaults were approved by the human `spec-ready` label on the spec PR | PR #36 labels, spec Open Questions | high |
| The spec explicitly anticipates implementing on the same branch as the spec for feature issues | repo `AGENTS.md` issue-driven workflow | high |
| Driven is represented as an absent `value` (R1) | spec option A, Resolved assumptions | medium — contract change; the human `spec-ready` approval is treated as confirmation of R1 |

## Assumptions

- Q1: setting a value drives the sketch immediately (recommended answer).
- Q2: clearing preserves current geometry (recommended answer).
- Q3: the ribbon Distance constraint tool keeps requiring a value (recommended
  answer).
- R1 is accepted via the `spec-ready` label; the migration path and package minor
  bump make it explicit rather than silent.

## Risks

- The geometry type and command contract are protected surfaces: package minor
  bump, three-way spec sync and migration note are mandatory (`BACKWARD_COMPATIBILITY.md`).
- 100 % coverage gate: every new branch in solver, command inverses, canvas
  editing and sidebar state needs a test.
- The goal was adopted rather than stated in a tracking plan; confidence is high
  because the spec is the plan.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Model and solver

- [x] 1.1 Make `DistanceConstraint.value` optional and skip value-less distances in the solver, with a driving-constraint convergence shortcut (tests) — fee70ef
- [x] 1.2 Add `isDrivenDimension` and `dimensionValue` helpers (tests) — fee70ef
- [x] 1.3 Bump the geometry package minor and refresh the lockfile — fee70ef

### Phase 2: Command contract

- [x] 2.1 Allow `add_constraint` to create a driven distance when `value` is omitted (tests) — 7e1b1e1
- [x] 2.2 Let `update_constraint` clear to driven with `value: null`, with state-precise inverses (tests) — 7e1b1e1
- [x] 2.3 Round-trip driven constraints through `constraintToParams` and sync the command spec at `0.5.0` (tests) — 7e1b1e1

### Phase 3: Rendering

- [x] 3.1 Add `formatDimensionLabel` and `parseDimensionEdit` (tests) — 8fce795
- [x] 3.2 Render driven labels in parentheses with stateful accessible names and effective values on the canvas (tests) — 8fce795
- [x] 3.3 Show the effective value and a `Driven`/`Set` badge in the Dimensions drawer (tests) — 8fce795

### Phase 4: Editing

- [x] 4.1 Default Dimension-tool placement to driven and keep existing dimensions' state on reuse (tests) — 8fce795
- [x] 4.2 Clear-to-driven in the canvas inline editor with the Enter/blur table (tests) — 8fce795
- [x] 4.3 Share the set/clear handlers in the sidebar and cover undo/redo across set and clear (tests) — 8fce795

### Phase 5: Documentation and verification

- [x] 5.1 Update the geometry, data-model and glossary docs — 9f4e7f9
- [ ] 5.2 Run the full validation gate and the automated review pass

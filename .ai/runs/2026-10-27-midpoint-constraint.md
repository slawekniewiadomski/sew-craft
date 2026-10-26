# Run: midpoint constraint (PR #99)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-27 because
PR #99 carried a spec-only PR with no execution plan. The PR is unauthored by the
pipeline (`om-auto-write-spec` opened it as a design deliverable), carries
`spec-ready`, and has no implementation PR.
**PR:** #99 · **Branch:** `spec/midpoint-constraint` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by
editing this file or commenting on the PR.

## 🎯 Goal

Implement `.ai/specs/2026-10-27-midpoint-constraint.md` on the spec PR's own
branch: a derived `midpoint` constraint, a Midpoint entry in the Constraints
group, and an 8 px midpoint magnet in the Point, Line, Arc, Circle and Rectangle
tools. The spec is the plan; there is no separate implementation PR.

## Scope

- `@sewcraft/geometry`: constraint type, derived-target substitution in the
  solver, `add_constraint` validation, `move_point` rejection, cascade and helper
  exports.
- Frontend: midpoint candidate helper, drafting endpoint variant, five
  point-creating tools, hover marker/hint, Constraints-group tool.
- Docs and contracts: `docs/domain/command-spec.md` + `.json`, `config/geometry.php`,
  `docs/architecture/constraint-solver.md`, `docs/architecture/data-model.md`,
  `BACKWARD_COMPATIBILITY.md`, geometry package version.

## Non-goals

- Arc, circle or curve midpoints; midpoint snapping while dragging; dimension
  anchors; `point_on_line` changes; a schema-string bump or migration; keyboard
  creation paths; ribbon layout changes.
- No second PR, no merge.
- No `qa`, `qa-approved`, `qa-self-verified`, `blocked` or `do-not-merge` labels.

## Evidence

| Conclusion | Drawn from | Confidence |
| --- | --- | --- |
| The goal is to implement this spec on this branch, not to ship a second PR | The user's explicit brief for this run; `AGENTS.md` feature workflow; PR #97/#93/#92 precedent | high |
| The spec is complete and approved | PR #99 `spec-ready` label; spec has no open questions | high |
| Implementation surface is the geometry package, five tools and the Constraints group | Spec `Architecture` and `Implementation Plan` sections | high |
| The document schema stays `sewcraft.pattern/0.4`; command spec moves to `0.16.0` | Spec `Resolved design decisions` D9 and `Data Model` | high |
| No subject issue exists for this feature | `gh issue list` — no midpoint issue; PR body carries no `Refs #` | high |

## Assumptions

- The PR is already non-draft, so the "flip draft → ready" step is a no-op; the
  run leaves it ready.
- No issue exists, so no `Refs`/`Closes` line can be added; the PR body links the
  spec instead.
- Browser QA evidence may be unavailable because the spec records that the
  shared test-env descriptor and `agent-browser` provider are not installed in
  this checkout. If so, the run reports the gap instead of claiming visual proof.

## Risks

- The goal is stated by the user, not inferred, so intent risk is low.
- The solver substitution and rectangle corner mapping are the two areas the spec
  flags as medium risk; both get dedicated tests.
- 100 % coverage is a hard gate on every new branch.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Land the midpoint spec document — a2dca44

### Phase 2: Geometry and command contract

- [ ] 2.1 Add `midpoint` to the constraint model and reference helpers
- [ ] 2.2 Add midpoint helpers with unit tests
- [ ] 2.3 Substitute derived midpoint targets in the solver
- [ ] 2.4 Validate `add_constraint`, reject `move_point`, verify cascade and undo
- [ ] 2.5 Version the command spec to `0.16.0` in all three places

### Phase 3: Constraints-group entry point

- [ ] 3.1 Add midpoint slots, prompts, labels, roles, icon and rejection reasons
- [ ] 3.2 Resolve midpoint params and component-test the pick order

### Phase 4: Inference and affordance

- [ ] 4.1 Add the 8 px midpoint candidate helper and drafting endpoint variant
- [ ] 4.2 Emit midpoint `add_point` + `add_constraint` through the shared builder
- [ ] 4.3 Add the midpoint hover marker/hint and Point-tool click precedence
- [ ] 4.4 Wire Line, Arc, Circle and Rectangle inference and rectangle corner mapping
- [ ] 4.5 Cover all five tools, precedence, boundary and one-undo behaviour

### Phase 5: Documentation, validation and review

- [ ] 5.1 Update architecture docs, command spec and compatibility notes
- [ ] 5.2 Run the full validation gate
- [ ] 5.3 Run `om-auto-review-pr 99 --autofix` and resolve findings
- [ ] 5.4 Update the PR body, normalize labels and report

## Validation

`npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run test:coverage`, `npm run build`, plus the backend Pest/Pint gate from
`.ai/agentic.config.json`.

## Evidence links

- Spec: `.ai/specs/2026-10-27-midpoint-constraint.md`
- Run: `.ai/runs/2026-10-27-midpoint-constraint.md`

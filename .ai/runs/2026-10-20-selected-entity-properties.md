# Execution plan — selection inspector in the Properties drawer (adopted from PR #37)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #37 carried no execution plan.
**PR:** #37 · **Branch:** `spec/issue-35` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Turn the Properties drawer into a selection inspector that shows the selected
point, line or curve with its geometry, measured length, related dimensions and
constraints, and seam allowance, editing them through the existing commands.

## Scope

- New pure selector `frontend/src/lib/entity-properties.ts`.
- New presentational `frontend/src/components/EntityPropertiesPanel.vue`.
- `frontend/src/views/EditorView.vue`: render the panel in the Properties drawer,
  keep the workspace summary below it, dispatch existing commands.
- Unit and component tests; full frontend validation gate.

## Non-goals

- Point/endpoint/fixed editing (Q1: read-only, drag on canvas).
- Multi-selection (Q4).
- Driven/set dimension vocabulary — soft dependency #34 has not landed, so the
  panel shows the stored value.
- Any geometry-package, command, schema, API, database or export change.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is a selection inspector in the Properties drawer | PR #37 body, issue #35 | high |
| Q1–Q4 recommendations were accepted | `spec-ready` applied by the maintainer; spec's Resolved assumptions R4/R5 | high |
| File layout, helpers, test ids and acceptance behaviour | `.ai/specs/2026-10-20-selected-entity-properties.md` Implementation Plan | high |
| Workspace summary stays below the inspector | Spec R6, PR body | high |

## Assumptions

- The maintainer's `spec-ready` accepts the spec's recommended answers to Q1–Q4;
  the plan follows R4 (read-only coordinates, editable construction/seam/dimension).
- #34 stays out of this branch; the panel reads `constraint.value` directly.
- A line or curve whose point reference is missing degrades to the workspace
  summary rather than throwing — the most reversible handling for partial documents.

## Risks

- Duplicate edit surfaces (Outline, Dimensions, inspector) can drift: mitigated by
  dispatching the same commands with no local drafts.
- The goal was reconstructed, not stated as a plan; confidence is high because the
  spec's own Implementation Plan maps to the phases below.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Spec `.ai/specs/2026-10-20-selected-entity-properties.md` on the branch — dc48f9f

### Phase 2: Selector

- [x] 2.1 Add `entity-properties.ts` with typed geometry, seam, dimension and constraint summaries plus unit tests — adfe0e5

### Phase 3: Panel

- [x] 3.1 Add `EntityPropertiesPanel.vue` with sections, empty/degenerate states, accessible labels and component tests — 76480f1

### Phase 4: Wiring and editing

- [x] 4.1 Render the panel in `EditorView.vue`, keep the workspace summary below it and dispatch existing commands; cover selection and dispatch in view tests — 6e0a2e5

### Phase 5: Verification

- [x] 5.1 Run the full frontend validation gate and `om-auto-review-pr --autofix` — 4d04937

# Execution plan — grouped rectangle tools with a mode menu (adopted from PR #70)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-24 because
PR #70 is a design-only spec PR that the maintainer marked `spec-ready`, which
continues implementation on the same branch.
**PR:** #70 · **Branch:** `spec/grouped-sketch-tools` · **Base:** `develop`
**Spec:** `.ai/specs/2026-10-23-grouped-sketch-tools.md`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by
editing this file or commenting on the PR.

## 🎯 Goal

Replace the three peer rectangle buttons in the Sketching ribbon with one split
control — an icon half that arms the displayed mode plus a caret that opens a
menu of Rectangle, Centre rectangle and 3-point rectangle — backed by a reusable
`tool-group` ribbon item kind, with the three gestures, commands, document schema
and API untouched.

## Scope

- `frontend/src/lib/editor-ribbon.ts`: the `RibbonToolGroupItem` union member, a
  `toolGroup()` helper and the grouped Sketching entry.
- `frontend/src/components/RibbonToolGroup.vue` (new): displayed-mode
  resolution, split-button markup, menu, focus return and read-only state.
- `frontend/src/components/ui/dropdown-menu/**` (new): the shadcn-vue wrapper set
  over the already-installed `reka-ui`.
- `frontend/src/components/EditorRibbon.vue`: render the group by kind, widen
  `isActive` and forward `select-tool`.
- `frontend/src/lib/ribbon-icons.ts`: one `chevron-down` glyph.
- Tests beside each of the above, plus `EditorRibbon.test.ts`'s 25 → 24 control
  count and label list.
- `.ai/specs/2026-10-23-rectangle-tool.md`: its Status, Q3 verdict and UI/UX
  wording record the grouped surface.

## Non-goals

- No `packages/geometry`, command, solver, schema, route, storage or `spec_version`
  change.
- No edit to `EditorView.vue`, `PatternCanvas.vue`, `editor-tools.ts` or
  `stores/editor.ts`: the three tool ids, events and gestures stand.
- No persistence of the chosen mode (Q2 = A) and no grouping of any other family
  in v1 (R2).
- No other ribbon group, label, order or action changes.

## Decisions

Q1–Q2 in the spec are unanswered on issue #68. The maintainer applied
`spec-ready`, which the repository's issue-driven workflow defines as the signal
to start implementation, so the spec's recommended answers are taken as accepted:

- **Q1 = A:** a split control. The icon half arms the displayed mode; the caret
  opens the menu of all three modes.
- **Q2 = A:** no persistence. The displayed mode resets to the diagonal rectangle
  on load and follows the active tool within a session.

## Evidence

| Conclusion                                                                     | Drawn from                                                          | Confidence |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------- |
| Goal is one split rectangle control plus a reusable group item kind            | Issue #68, spec TLDR and Proposed Solution                          | high       |
| Recommended Q1 = split control and Q2 = no persistence stand                   | `spec-ready` applied by the maintainer; same rule on PR #61          | high       |
| No command, geometry or document change                                        | Spec "API Contracts", "Not edited (and why)"                        | high       |
| Existing tool ids and canvas gestures must keep working                        | Spec "Behaviour" 11, R3 and R5                                      | high       |
| Ribbon is data-driven and the change is presentational                         | `frontend/src/lib/editor-ribbon.ts`, `EditorRibbon.vue`             | high       |
| `reka-ui` is already installed, so the menu adds no dependency                 | `frontend/package.json`, spec "Constraints"                        | high       |

## Assumptions

- `toolGroup(id, label, items)` derives `primary` from `items[0]` and prefixes the
  bare id with `tool-`, matching the spec's `toolGroup('rectangle', …)` example.
- `RibbonToolGroup` receives an `active` boolean from `EditorRibbon` rather than
  reading `activeConstraint` itself, so the constraint rule stays in one place.
- Choosing the already-armed mode from the menu is handled inside the group (it
  closes without emitting), so `EditorView`'s toggle rule and file stay untouched.
- The shadcn-vue CLI cannot install here (`npm` rejects `--allow-scripts` in a
  project-scoped install), so the `dropdown-menu` wrappers are authored in the
  same registry style over `reka-ui`, without a new `lucide` dependency.
- The caret is 20 × 36 px, matching the ribbon's `size="icon"` height (the spec's
  28 px figure predates the current button scale).

## Risks

- Two small targets side by side are easy to mis-hit; mitigated by a divider, an
  accessible name and a tooltip.
- A menu that swallows `Escape` or `Tab` would break the canvas; tests cover focus
  return, outside click and tool-change dismissal.
- The plan's goal is inferred from the spec and the `spec-ready` signal, not from
  a fresh human answer on Q1/Q2.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Add the grouped-sketch-tools spec to `.ai/specs` — 79b1867

### Phase 2: Ribbon data

- [ ] 2.1 Add `RibbonToolGroupItem`, the `toolGroup()` helper and the grouped Sketching entry, with ribbon-data tests
- [ ] 2.2 Add the `chevron-down` glyph to the icon registry, with its icon test updated

### Phase 3: Control

- [ ] 3.1 Add the shadcn-vue `dropdown-menu` wrappers and their test
- [ ] 3.2 Build `RibbonToolGroup.vue` with displayed-mode resolution, split-button markup, primary and menu selection, focus return and read-only state, tested against the behaviour table
- [ ] 3.3 Wire the group into `EditorRibbon.vue`, widen `isActive` and forward `select-tool`, with ribbon tests at 24 controls

### Phase 4: Verification and docs

- [ ] 4.1 Update `.ai/specs/2026-10-23-rectangle-tool.md` to record the grouped ribbon surface
- [ ] 4.2 Run the full validation gate and record the result on the PR
- [ ] 4.3 Verify the grouped control in the running app — all three modes, toggle, Escape, keyboard, read-only and narrow width — and record the result on the PR

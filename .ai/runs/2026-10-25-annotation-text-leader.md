# Execution plan — annotation text with a leader

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-25 from
PR #92's spec (`.ai/specs/2026-10-25-annotation-text-leader.md`).
**PR:** #92 · **Branch:** `spec/annotation-text-leader` · **Base:** `develop`
**Operator brief:** implement the spec on this same branch; do not open a second
PR; never merge. The spec is the plan of record — this file only tracks progress.

## 🎯 Goal

Annotation text gains a 10 mm default and a **Text / Text with leader** split
control. A leader draws a rule under the label and a filled arrow from the
rule's nearer end to the picked point. Dragging the label moves only its anchor;
dragging the target moves only that point. Pure derived geometry in
`packages/geometry/src/text.ts`; no document schema or command shape change.

## Scope

- `packages/geometry`: `DEFAULT_TEXT_SIZE` 10, replace `textLeader` with
  `textLeaderGeometry` (underline, shaft, filled head), exports and tests.
- `frontend`: `add_text_leader` tool and `text-leader` glyph, Annotation split
  control, anchor/target resolvers, two-click gesture with preview and refusal
  hints, rule/arrow rendering, drag-aware text views, label drag, properties
  panel cleanup.
- `config/geometry.php` `spec_version` `0.14.0`, `docs/domain/*`,
  `docs/architecture/*`, spec status.

## Non-goals

- No schema or command change: `TextEntity.leader` stays a point reference.
- No migration of existing labels; stored `fontSize` wins.
- `update_text.leader` is kept for agents but no editor UI emits it.
- Export of annotations is unchanged.

## Assumptions

- `spec-ready` on PR #92 is the maintainer's approval of the six autonomous
  defaults (Q1–Q6 in the spec).
- The implementation ships on this branch, per the operator brief and
  `AGENTS.md`'s one-combined-PR feature route.
- A provisional anchor is a coordinate, not a document point, so it cannot
  disappear; no defensive missing-anchor branch is added.

## Risks

- **Visual change to existing labels (low, accepted).** Labels with a leader
  gain the rule and arrow; data is untouched.
- **10 mm default (low).** Only new labels; stored sizes are preserved.
- **Coverage.** Every new branch in geometry, resolvers, the command builder and
  the canvas state machine gets a test; thresholds stay at 100 %.
- **Shared anchors on old labels (low).** Dragging them moves the shared point,
  like any point drag; new labels always get a dedicated anchor.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Geometry and rendering

- [x] 1.1 Default 10 mm and `textLeaderGeometry` with underline, shaft and head — c2a318d
- [x] 1.2 Canvas rule, shaft and filled head rendering with the new test ids — 4307b28
- [x] 1.3 Docs and command contract at `spec_version` 0.14.0 — 38e5449

### Phase 2: Creation and cleanup

- [ ] 2.1 `add_text_leader` tool, `text-leader` glyph and the Annotation split group
- [ ] 2.2 Anchor and leader resolvers in `drafting.ts`
- [ ] 2.3 Leader-aware `buildTextCommands` with annotation-role points
- [ ] 2.4 Two-click gesture: preview, refusal hints, cancel paths, commit
- [ ] 2.5 Remove the leader picker from the properties panel and editor view

### Phase 3: Independent movement

- [ ] 3.1 Drag-aware text views for the anchor and target
- [ ] 3.2 Label drag moves only the anchor in the Select tool
- [ ] 3.3 Target drag test, glossary/geometry-core pass and the full gate

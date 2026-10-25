# Execution plan — piece tabs, assemblies and per-piece parameters (adopted from PR #94)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-25 because PR #94 carried no execution plan. The spec committed on this branch is the plan of record; this file is its executable checklist.
**PR:** #94 · **Branch:** `spec/piece-tabs-and-assemblies` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Implement `.ai/specs/2026-10-25-piece-tabs-and-assemblies.md` on this same branch so the
workspace gains piece tabs, per-piece parameters, assemblies with placed instances and
per-piece SVG export at schema `sewcraft.pattern/0.4`, keeping every existing gate green.

## Scope

- `packages/geometry`: schema 0.4 types, tab normalisation, piece/assembly/instance
  commands, `pieceAnchor`/`instancePlacement` placement math, `documentForPiece` /
  `documentForAssembly`, `toSvgPiece` export, command spec sync at `spec_version 0.15.0`.
- `frontend`: editor store active tab, tab bar and `+` menu, piece/pattern drawers,
  assembly canvas, assembly inspector and ribbon, read-only/empty states, tab reordering.
- Docs: `docs/architecture/{data-model,geometry-core,export,command-core}.md`,
  `docs/domain/{command-spec.md,command-spec.json,glossary.md}`,
  `BACKWARD_COMPATIBILITY.md`, `config/geometry.php`.

## Non-goals

- The drawing workflow (technical sheets, tables, title blocks, packing).
- Cross-piece geometry, constraints, seam measurement and assembly annotations.
- Exporting an assembly or a sheet of pieces.
- Nested assemblies, pattern grading, multiple fabrics per piece, mobile redesign.
- No migration from 0.3: old documents are refused through the unsupported-format path.

## Evidence

| Conclusion | Drawn from | Confidence |
| --- | --- | --- |
| The goal is the full spec, on this branch, as one combined PR | maintainer brief + `AGENTS.md` feature route + `.ai/specs/2026-10-25-piece-tabs-and-assemblies.md` | high |
| The spec is settled (D1–D12, no open questions) and schema 0.4 is deliberate | spec Status line and decisions table | high |
| Implementation breakdown maps 1:1 onto phases/steps | spec "Implementation Plan" | high |
| No tracker issue exists; the spec is the artifact under review | PR body "No tracker issue" | high |
| Branch currently contains only the spec and its assets | `git diff --stat origin/develop...HEAD` | high |

## Assumptions

- The maintainer's instruction supersedes the skill's spec-only guard: implementation ships
  on this branch, not on a second PR.
- `needs-qa` replaces the inherited `skip-qa`, because the change is user-facing.
- `risk-low` is raised to `risk-high`: the spec itself calls the schema break `risk-high`.
- `priority-medium` is preserved (no issue to inherit from).
- 100 % coverage is a hard gate, so every new branch in the new code gets a test.

## Risks

- Stored schema is a hard break (0.4 refuses 0.3); accepted by the sole maintainer (D6).
- Large UI surface against a 100 % coverage gate; each phase is committed separately.
- Transform convention is contract-level: asymmetric fixtures pin mirror-before-rotate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Land the spec and its prototype assets — 1c78d6f

### Phase 2: Tabs, piece isolation and per-piece parameters

- [ ] 2.1 Schema 0.4, tab normalisation and per-piece fields
- [ ] 2.2 Piece commands: create/update/default allowance/tabs/loop
- [ ] 2.3 `reorder_tabs` and the command-spec three-way sync
- [ ] 2.4 Pure tab helpers
- [ ] 2.5 Store active tab, load restore and undo reconciliation
- [ ] 2.6 Tab bar with the `+` menu
- [ ] 2.7 Active-piece canvas and removal of the cross-piece/Move paths
- [ ] 2.8 Piece and Pattern drawers
- [ ] 2.9 Active-piece export

### Phase 3: Assemblies

- [ ] 3.1 Assembly and instance commands with `delete_piece` cascade
- [ ] 3.2 Placement math: anchor, transform, loops, bounds
- [ ] 3.3 Assembly canvas and `documentForAssembly`
- [ ] 3.4 Assembly inspector and ribbon
- [ ] 3.5 Docs and compatibility update

### Phase 4: Order, undo and polish

- [ ] 4.1 Drag and keyboard tab reordering with persistence
- [ ] 4.2 Reconciliation, read-only, empty states and delete confirmation
- [ ] 4.3 Full validation gate and review pass

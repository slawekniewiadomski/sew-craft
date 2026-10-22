# Execution plan — pieces, allowance kinds and cut dimensions (adopted from PR #56)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-22 because PR #56 carried no execution plan.
**PR:** #56 · **Branch:** `spec/pieces-and-allowance` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Make the **piece** the cutting unit: persist closed loops of existing edges with
per-edge allowances (`seam` / `single` / `double`), derive a joined cut loop and
fold lines from the loop, export the cut loop as the `cut` layer, and expose
read-only cut dimensions — without touching the constraint solver.

The maintainer's brief for this run overrides the skill's default spec-only
guard: the specification is the plan, implementation lands **on this same
branch and PR**, and no second PR is opened.

## Scope

- `@sewcraft/geometry`: variable-offset polyline, new `piece.ts`, schema 0.2
  migration, piece commands, piece-driven export, derived cut dimensions.
- `frontend`: canvas layers, Create-piece action, allowance editor, piece card,
  cut-dimension creation and read-only value.
- Contracts: `spec_version` 0.10.0 across `config/geometry.php`,
  `docs/domain/command-spec.json` and `docs/domain/command-spec.md`; glossary,
  export contract, backward-compatibility and roadmap docs.
- 100 % statements/branches/functions/lines across geometry, frontend and `app/`.

## Non-goals

- Fabric requirement, layout and nesting (quantity is stored only).
- PDF/DXF export, dimension annotations in SVG, printing cut dimensions.
- Darts, notches, grainline, cut-on-fold marks, interior cutouts, circle pieces.
- Editable/driving derived dimensions; the solver never receives one.
- Removing the legacy per-edge seam commands (deprecated until 0.3).

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The goal is schema 0.2 pieces + allowances + cut loop + export + derived cut dimensions | `.ai/specs/2026-10-22-pieces-and-allowance.md` (TLDR, Behaviour, Implementation Plan, Acceptance criteria) | high |
| Implementation must land on this PR, not a second one | maintainer brief in the run request; PR body "implementation follows on its own PR" is superseded by that brief | high |
| Documentation and command-spec versions must move together to 0.10.0 | spec API Contracts + `docs/domain/command-spec.md`; `config/geometry.php` is the served contract | high |
| The existing seam path stays as deprecated legacy for open loops | spec Behaviour 12, Q3, API Contracts | high |
| Priority is medium and risk is high | no priority/risk label on the PR; spec Risks & Impact Review (schema migration, export contract change, broad cross-cutting edit) | medium |

## Assumptions

- Priority `medium` (ordinary feature) and risk `high` (schema migration + export
  contract + cross-cutting geometry/frontend changes) are inferred because the PR
  carries neither; the maintainer can correct them on the PR.
- QA is required (`needs-qa`): the work adds user-facing canvas, inspector and
  export behaviour.
- The spec's "Resolved assumptions (autonomous defaults)" settle open questions
  Q1–Q5 for v1; no additional product decision is invented here.
- The legacy `seams` field remains readable and rendered for open chains; closed
  chains migrate to pieces on load.

## Risks

- The 0.2 schema bump is one-way; existing drawings must keep rendering through
  the load migration.
- The export contract changes meaning for the `cut` layer; existing export tests
  and `docs/architecture/export.md` must be rewritten in the same PR.
- The 100 % coverage gate is the dominant cost of the variable-offset work.
- The goal was stated in the spec, not inferred; only the label values are inferred.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Land the pieces / allowance / cut-dimension specification — a3b1be5

### Phase 2: Geometry core

- [x] 2.1 `offsetVariablePolyline` with per-segment distances, joins and self-intersection, `offsetPolyline` delegating
- [x] 2.2 `piece.ts`: loop validation, cut loop, fold lines, vertices, metrics, cut bounds, loop discovery
- [x] 2.3 Export the new geometry from `index.ts`; 100 % coverage for the new branches

### Phase 3: Model, commands and migration

- [x] 3.1 Schema 0.2 types (`Allowance`, `Piece`, `DerivedDistanceConstraint`, `CutAnchor`) and document fields
- [x] 3.2 `normalizeDocument` 0.1 → 0.2 migration, `createEmptyDocument`, frontend `load()` wiring — f8a6d30
- [x] 3.3 Piece and derived-dimension commands, validation, inverses and delete cascades
- [x] 3.4 `spec_version` 0.10.0 across PHP config, JSON contract and markdown contract

### Phase 4: Canvas and inspector

- [x] 4.1 Cut / stitch / fold / band canvas layers from piece geometry, legacy seam layer for open chains — f8a6d30
- [x] 4.2 Create-piece ribbon action with closed-chain validation feedback — f8a6d30
- [x] 4.3 Allowance editor and piece inspector card (name, quantity, sizes, area, per-edge allowances) — f8a6d30

### Phase 5: Export and derived cut dimensions

- [x] 5.1 Piece-driven SVG export: closed cut paths, optional stitch/fold/construction layers, cut-bounds viewBox, metadata
- [x] 5.2 Download path and export dialog layer toggles — f8a6d30
- [x] 5.3 `derived` dimension state, `resolveCutSpan`, read-only value, broken handling; solver never sees it

### Phase 6: Documentation and gate

- [x] 6.1 Glossary, export layer contract, backward-compatibility, roadmap, 007 supersede note
- [ ] 6.2 Full validation gate, `om-auto-review-pr --autofix`, label normalization and PR finalization

## Outcome

Implemented on this branch as one combined PR, per the maintainer's brief.

- **Commands:** `create_piece`, `update_piece`, `delete_piece`,
  `set_piece_allowance` and `add_derived_dimension`; the seam commands stay as
  deprecated legacy for edges outside a piece. `spec_version` is `0.10.0` in the
  PHP config, the JSON contract and the markdown contract.
- **Document:** schema `sewcraft.pattern/0.2` with `pieces` and
  `derived_distance`; `normalizeDocument` migrates a 0.1 document on load
  (closed seam chains become pieces, open chains stay legacy), one-way and
  idempotent, and preserves the identity of an already-current document.
- **Geometry:** `offsetVariablePolyline` with per-segment distances,
  `piece.ts` (validation, cut loop, fold lines, vertices, metrics, bounds, loop
  discovery) and a piece-driven `toSvg` (closed cut loops, optional stitch/fold/
  construction layers, cut-bounds viewBox, per-piece metadata). The solver never
  receives a derived dimension.
- **Frontend:** Create piece, allowance editor for an edge or the whole piece,
  piece card with finished/cut sizes and area, cut/stitch/fold/band canvas
  layers, read-only cut dimensions, export layer toggles and the load migration.
- **Reference case covered by tests:** 200 × 200 with three 10 mm allowances cuts
  220 × 210; switching them to double cuts 240 × 220 with the fold line on
  220 × 210; the cut dimension reads 220 and 210 and follows the changes.
- **Not done, by design:** fabric layout/nesting, PDF/DXF, annotations in SVG,
  editable derived dimensions, circle pieces and interior cutouts.

### Gate

| Check | Result |
| --- | --- |
| `npm run format:check` | pass |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:coverage` | 100 % statements/branches/functions/lines (frontend 642 tests, geometry 526) |
| `npm run build` | pass |
| Pest `--coverage --min=100` | 23 passed, 100 % |
| `vendor/bin/pint --test` | pass |

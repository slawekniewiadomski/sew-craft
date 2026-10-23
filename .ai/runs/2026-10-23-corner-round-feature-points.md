# Corner round feature points

Goal: implement `.ai/specs/2026-10-23-corner-round-feature-points.md` on
`spec/corner-round-feature-points` (PR #75) and complete the same PR — the spec
is the plan. Refs #73.

Resumed by `om-auto-continue-pr` with the explicit brief to implement on this
branch: the project ships a feature spec and its implementation on one combined
PR (`AGENTS.md`, issue-driven work).

Product calls follow the spec's resolved table because `spec-ready` was applied
by the maintainer after review without a different answer on the issue:

- Q1 — the feature points are derived and fixed; editing stays on the radius.
- Q2 — the tangent points already exist and are only made visible; the centre is
  the one new point.
- Q3 — always visible, independent of hover or the active tool.
- Q4 — construction only; never a piece loop vertex.
- Q5 — persisted as an optional `center` id plus its point entity.
- Q6 — no document-schema bump.

## Non-goals

- Draggable feature points or a second radius-editing interaction.
- A per-document "show derived points" toggle.
- Keyboard selection of canvas points (the canvas has none today).
- Any change to stitch/cut loops, SVG export, commands or HTTP contracts.

## Assumptions

- The frontend load path (`editor.load`) is the only normalisation point.
- The centre id is deterministic (`<round-id>:center`), so minting is idempotent.
- Docker (Pest) and npm (Vitest) are the validation entry points.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Geometry

- [ ] 1.1 Add the centre to `CornerRoundGeometry` and `cornerRoundGeometry`
- [ ] 1.2 Create the centre entity in `add_corner_round` and persist the field
- [ ] 1.3 Regenerate the centre and remove it with the round
- [ ] 1.4 Treat the centre as derived in `cornerRoundsForEntity` / `isCornerRoundDerived`
- [ ] 1.5 Mint the centre in `normalizeCornerRounds` without moving geometry

### Phase 2: Canvas

- [ ] 2.1 Add the always-visible feature-point layer with selected styling
- [ ] 2.2 Select a derived point without starting a drag
- [ ] 2.3 Verify snapping and dimension picks on a feature point

### Phase 3: Docs and gate

- [ ] 3.1 Update the data-model, command-spec and geometry-core docs
- [ ] 3.2 Run the full validation gate and record results

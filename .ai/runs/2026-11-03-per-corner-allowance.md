# Execution plan — per-corner allowance and band regions

Source doc: `.ai/specs/2026-11-03-per-corner-allowance.md` (spec PR #102, design-only, stays unmerged here)

## Goal

A rounded corner carries its own absolute cut width, the green allowance band is
partitioned into selectable regions (edge strips, wedge halves, round crescents),
and one or several regions can be edited in a single undo step.

## Scope

- Geometry: `CornerAllowance` on the piece, per-segment allowance resolution with
  the midpoint split, `OffsetOptions.tangentStep`, `pieceBandRegions`.
- Command layer: `set_piece_corner_allowance`, retirement of the two
  equal-allowance guards, cleanup on round/edge/loop changes.
- Contract: three-way command-spec sync at `0.17.0`, geometry package `0.16.0`.
- Frontend: region hover/selection (click, Cmd/Ctrl), the *Rounded corners* block,
  the *Selected regions* editor and its bulk `dispatchGroup`.
- Docs: `geometry-core`, `data-model`, `glossary`, `BACKWARD_COMPATIBILITY`.

## Non-goals

- No taper/interpolation of a corner width, no kind (fold) on a corner.
- No per-side (`left`/`right`) allowance, no width varying along one edge.
- No new tool, no new bulk command, no export change.
- No UI change to the assembly canvas or to legacy seams.

## Implementation Plan

Phases mirror the spec's Phasing; Steps are the spec's Implementation Plan steps.

### Phase 1 — Model and geometry

1. Types and helper: `CornerAllowance { round, cutWidth }`, optional on `Piece`,
   `cornerAllowanceForRound`, ignored invalid entries.
2. Bridge identity: `LoopSegment.round` set in `walkLoop` from `roundBetween`.
3. Offset step option: `OffsetOptions.tangentStep`, join turn test,
   `pieceCutLoop` passes 10°.
4. Per-segment resolver: three cases (own / shared / split), five projection for
   `pieceFoldLines`. A bridge always flattens into 16 chords, so the split is
   symmetric and needs no odd-segment tie-break.
5. Regions: `pieceBandRegions` tiling the band (edge strips with wedge halves,
   round crescents, split halves owned by edges).
6. Guards: retire `requireRoundedAllowancesMatch`, `roundedNeighbours` and the
   `add_corner_round` allowance check.

### Phase 2 — Command and contract

7. `set_piece_corner_allowance` with validation, no-op, inverse; cleanup in
   `remove_corner_round`, `delete_entity` and both `set_piece_loop` paths.
8. Command spec: three files, `spec_version` `0.17.0`, migration section, shared
   validation list, `CommandSpecTest` version.

### Phase 3 — Surface

9. Frontend data: corner rows and regions in `PieceSummary`,
   `allowance-regions.ts`, the dispatch paths and the bulk handler.
10. Canvas: region layer, hover, replace/add/subtract selection, release rule,
    touch tap, clear rules.
11. Card: *Rounded corners* rows, the *Selected regions* editor, Double/Inherit,
    bulk Apply.

### Phase 4 — Docs and verification

12. Docs: `geometry-core.md`, `data-model.md`, `glossary.md`,
    `BACKWARD_COMPATIBILITY.md`.
13. Verification: full gate plus a browser pass with screenshots.

## Risks

- `tangentStep` changes piece cut-loop joins for shallow vertices whose widths
  differ — a geometry-contract change, pinned by tests and recorded in
  `geometry-core.md`.
- A mixed selection's number is a cut width; a double-fold edge stores half.
- Wedge ownership must tile without gaps or overlaps.

## Progress

PR: #103

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Model and geometry

- [x] 1.1 Types and helper — fe83d71
- [x] 1.2 Bridge identity — fe83d71
- [x] 1.3 Offset step option — fe83d71
- [x] 1.4 Per-segment resolver — fe83d71
- [x] 1.5 Regions — fe83d71
- [x] 1.6 Guards — fe83d71

### Phase 2: Command and contract

- [x] 2.1 Corner allowance command — fe83d71
- [x] 2.2 Command spec sync — 61e3ad5

### Phase 3: Surface

- [x] 3.1 Frontend data and dispatch — aea98c9
- [x] 3.2 Canvas regions and selection — aea98c9
- [x] 3.3 Card rows and selection editor — aea98c9

### Phase 4: Docs and verification

- [x] 4.1 Docs — 61e3ad5
- [x] 4.2 Verification — gate green (see PR)

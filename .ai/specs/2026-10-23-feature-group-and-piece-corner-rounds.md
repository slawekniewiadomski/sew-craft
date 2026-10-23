# Feature ribbon group and corner rounds inside pieces

Status: draft — design review
Refs #63
Builds on: `2026-10-20-corner-rounding-tool.md` (implemented), `2026-10-22-pieces-and-allowance.md`,
`2026-10-20-seam-allowance-side.md`
Supersedes: Q3 of `2026-10-20-corner-rounding-tool.md` ("reject allowances on a rounded edge
in v1") for corners that belong to a piece.

## 📝 TLDR

Three coupled changes come out of #63: a new **Features** ribbon group for tools that modify
the sketch (Round corner moves into it, later notch/cut tools join it); the Round corner
tool accepts a **corner point** as well as two lines; and a round can be applied **while the
corner belongs to a piece**, without removing the piece first. The piece keeps its edge list
and allowances; during the boundary walk the round's arc is inserted between the two trimmed
lines, so the stitch loop closes and the cut loop offsets the arc like any other segment.
v1 requires the two edges at the rounded corner to carry the **same allowance** (both absent,
or the same width and kind); a mismatch is rejected with a message rather than producing an
ambiguous cut line.

## 📝 Problem Statement

- **Who needs it:** the maker working with pieces, which is the normal state once a pattern
  has allowances and cut dimensions.
- **What happens today:**
  - `applyAddCornerRound` refuses a corner whose line belongs to a piece
    (`packages/geometry/src/commands.ts:1378-1380`, "Remove the piece first."). The canvas
    pick path only rejects legacy seams (`frontend/src/lib/corner-round.ts`, reason `seam`);
    the piece rejection surfaces from the command.
  - The workaround is destructive: remove the piece, round the corner, create the piece
    again. Removing a piece also removes its **cut dimensions** (documented cascade in
    `docs/architecture/data-model.md`), and the per-edge allowances have to be re-entered.
  - The boundary walk cannot cope with a round anyway: `orientedPolylines`
    (`packages/geometry/src/piece.ts:251`) and `validatePiece` (`piece.ts:138`) require each
    edge to end exactly where the next one starts. A committed round trims both lines to
    tangent points, leaving a gap where the arc belongs, so the loop resolves to `null`.
  - Round corner sits in the **Tools** group next to Select, Create piece and history
    (`frontend/src/lib/editor-ribbon.ts:87-97`). It only accepts two line picks
    (`applyCornerRoundPick` and the "pick the first/second line" prompts).
- **Evidence it matters:** #63 names all three gaps, including the exact workaround the
  maker performs today. The corner tool is implemented and in use, so this is feedback on a
  shipped feature rather than a new tool.
- **Constraints:** commands stay the only mutation path; geometry stays pure and in
  `@sewcraft/geometry`; a piece never stores a side or derived geometry; document schema,
  command set and command spec version must not change; 100 % coverage.

## 📝 Proposed Solution

### Vocabulary

| Term | Meaning |
| ---- | ------- |
| **Feature group** | A new ribbon group for tools that modify existing sketch geometry (round, later notch/cut). |
| **Corner pick** | Selecting a single point whose two incident lines define the corner, instead of picking both lines. |
| **Bridge** | The derived polyline of a round's arc inserted into a piece loop between the two trimmed lines. Never stored on the piece. |
| **Rounded piece corner** | A corner of a piece loop where a committed corner round supplies the bridge. |

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **Piece-aware round with a bridge arc; the allowance follows the arc; both adjacent allowances must match** | Keeps the piece, its allowances and its cut dimensions; no schema change; the cut loop stays closed. Cost: the piece walk and `validatePiece` become round-aware, and changing one allowance of a rounded corner needs the round removed first | **Recommended** |
| B | **Allow rounding only on allowance-free piece corners** | Much smaller: reuse the bridge, keep the existing allowance rejection. Cost: the common piece (10 mm seam on every edge) cannot round any corner without clearing two allowances, which is most of the friction the issue reports | Rejected for v1 — fails the reported workflow |
| C | **Offset the arc per side (split it at the midpoint, interpolate between two allowance widths)** | Handles mixed allowances and looks continuous. Cost: no single tangent offset exists, the midpoint is arbitrary, and the cut line no longer corresponds to a real construction rule | Rejected — invents geometry |
| D | **Bake the round into the piece** (store the arc as a piece edge) | Simple for rendering. Cost: the round stops being editable, contradicts the implemented live feature, and adds piece-level schema | Rejected |
| E | **Retire two-line picking** and accept only corner points | One obvious gesture. Cost: #63 says "like that, **or** by selecting corner point"; two-line picking is also the only way to round a corner whose point is buried under other geometry | Rejected — keep both |

Option A is the smallest design that actually removes the reported workaround. The
allowance rule is the one product compromise; it is the blocking question on the issue.

### Behaviour

1. **Features ribbon group.** A new group `features`, caption **Features**, sits between
   Tools and Sketching. **Round corner** moves into it from Tools. Tools keeps Select,
   Create piece, Undo, Redo, Delete and Fit. The group accepts future modifier tools
   (notch, cut) without another layout change.
2. **Corner-point pick.** With Round corner active:
   - Picking a **line** fills slot 1; a second line fills slot 2 and opens the radius
     field. This is today's flow, unchanged.
   - Picking a **point** resolves both slots at once and opens the radius field. The point
     must be shared by exactly two lines of the same construction kind. A point pick
     replaces any pending line pick, so the gesture is never half-old, half-new.
   - Any other entity (curve, arc, circle) rejects with "Rounding needs two straight lines."
     A point with zero/one incident line rejects with "Pick a corner between two lines."
     A point with more than two rejects with today's third-edge message.
   - If the corner already has a round, the pick rejects with "This corner is already
     rounded."
3. **Eligible-corner highlight.** While the tool is active, every roundable corner shows a
   ring (class `roundable-corner`, `data-testid="roundable-corner"`). A corner is roundable
   when it has exactly two incident cut (or two construction) lines, no committed round, no
   legacy seam on either line, and — inside a piece — the same allowance on both edges. The
   highlight teaches the new gesture; the prompt is the fallback.
4. **Round inside a piece.** `add_corner_round` accepts a corner whose lines belong to one
   or more pieces. The command still rejects: mixed construction, more than two edges at the
   corner, an existing round, a legacy seam, a radius above the fit, unequal piece
   allowances, and a radius that folds an affected cut line.
5. **Bridge rule.** A piece loop keeps its `edges` list, order and allowances. When the walk
   reaches the end of a piece edge that does not meet the next edge, it looks for a
   committed round whose two `ends` are exactly those lines and whose tangents are exactly
   the gap endpoints, and inserts the round's arc polyline there. The bridge is derived on
   every read, like the arc itself; removing the round restores the sharp corner and the
   loop closes directly again.
6. **Allowance on the bridge.** v1 requires both adjacent edges to have the same allowance
   (both absent, or equal `width` and effective `kind`). The bridge then carries that
   allowance distance, so the cut loop offsets the arc outward and stays a single closed
   curve; a double fold draws its fold line around the arc too.
7. **Allowance edits.** `set_piece_allowance` rejects a change (or removal) that would leave
   the two edges of a rounded corner unequal, with "Remove the corner round before changing
   one side of a rounded corner." The user removes the round, sets both allowances, and
   re-adds it with the same radius. This is the cost of the equal-allowance rule and is
   called out in the trade-offs.
8. **Shared corners.** If two pieces share the same two lines at a corner, both loops insert
   the same bridge and each offsets it by its own (equal within that piece) allowance. One
   geometric feature, two piece boundaries — no per-piece duplication.
9. **Everything else is unchanged.** Radius editing, tangent drag, the `R` label, the
   properties panel, removal, undo, cascade on delete and the command shapes all stay as
   implemented. Rounding does not add constraints; the sharp corner remains the construction
   point that dimensions drive.

### What the workaround currently costs

| Today | After |
| ----- | ----- |
| Remove the piece (loses allowances) | Piece stays |
| Round the corner | Round the corner |
| Re-create the piece, re-pick four-plus edges | — |
| Re-enter every allowance | Allowances unchanged |
| Re-place every cut dimension (deleted with the piece) | Cut dimensions unchanged |

## 📝 Architecture

| Module | Change |
| ------ | ------ |
| `packages/geometry/src/piece.ts` | `roundBridge(document, first, second)` helper; bridge-aware `orientedPolylines`; bridge segments in `pieceLoop` distances; `validatePiece` accepts a bridge between consecutive edges |
| `packages/geometry/src/commands.ts` | `applyAddCornerRound`: remove the `pieceForEdge` rejection (1378-1380); add equal-allowance validation for every piece containing both lines; reject a radius that makes an affected cut loop self-intersect. `applySetPieceAllowance`: reject a mismatch at a rounded corner. `applyRemoveCornerRound`: assert the piece survives (behaviour already correct, add the test) |
| `packages/geometry/src/corner-round.ts` | Export a helper to find the round between two lines and to list a point's incident lines, so the frontend and `piece.ts` share one rule |
| `frontend/src/lib/corner-round.ts` | Point picks in `applyCornerRoundPick`; `roundableCorners(document)`; new rejection reasons (`not-corner`, `needs-lines`, `allowance`) and prompts |
| `frontend/src/lib/editor-ribbon.ts` | New `features` group; move `round_corner`; update the group-order and tools-item tests |
| `frontend/src/components/PatternCanvas.vue` | Round-tool point hit-test path; `roundable-corner` rings; point-pick event |
| `frontend/src/views/EditorView.vue` | Prompt and pick plumbing for the point path; allowance-mismatch message |
| `docs/architecture/geometry-core.md`, `docs/domain/glossary.md` | Bridge rule and rounded piece corner term |

No backend, schema, command or command-spec change. `spec_version` stays `0.10.0`;
`PATTERN_SCHEMA` stays `sewcraft.pattern/0.2`.

### Why the bridge is derived, not stored

A piece is an ordered list of cut edges; putting the arc into `piece.edges` would make the
piece own a derived entity (the arc is regenerated from the corner and the radius) and would
break removal and radius edits. Deriving the bridge on read keeps one authority — the round
feature — and keeps old documents byte-identical. It also means a hand-edited document with
an inconsistent round still resolves as the sharp corner after `normalizeCornerRounds` drops
the round.

## 📝 Data Model

No change.

| Structure | Change |
| --------- | ------ |
| `PatternDocument.pieces[].edges` | Unchanged: still only real cut edges |
| `PatternDocument.pieces[].allowances` | Unchanged: one entry per real edge |
| `PatternDocument.cornerRounds` | Unchanged: the existing feature record |
| Derived piece loop | Inserts bridge segments for rounded corners on read |

The bridge is not addressable as a piece edge, so cut-dimension anchors keep addressing the
two real edges. A cut anchor at the rounded end resolves to the edge's tangent vertex — the
loop vertex that exists. The inspector's cut width/height remains the authoritative
bounding size; a cut dimension spanning two rounded corners reads tangent-to-tangent (see
edge cases).

## 📝 API Contracts

None. No HTTP, command or spec-version change.

## 📝 UI/UX

### Ribbon

Before:

```
TOOLS                          SKETCHING
[Select] [Round corner] [Create piece] [Undo] [Redo] [Delete] [Fit]
```

After:

```
TOOLS                 FEATURES        SKETCHING
[Select] [Create      [Round corner]  [Point] [Line] [Curve] [Arc] ...
 piece] [Undo]
 [Redo] [Delete] [Fit]
```

- Group caption: `Features`, same `text-2xs` uppercase caption as the other groups.
- Round corner keeps its glyph and tooltip ("Round corner — pick two lines or a corner").
- The group is data-driven, so adding a notch tool later is one list entry.

### Canvas

```
   before a round              tool active                 after commit (in a piece)
        │                          ◯  ← roundable           │
   ─────┼─────                ─────┼─────                   ╭──
        │                     ring on eligible             │
                              corners only                 │
```

- Ring: 4 px diameter, primary colour at 60 %, `aria-hidden` (decorative; the prompt and
  live region carry the meaning for assistive tech).
- Point pick: the existing point hit target grows by 2 px while the round tool is active,
  matching the Cut dimension tool's corner target.
- Prompt: "Round corner — pick two lines or a corner." → "Round corner — set the radius."
- Rejections (inline, destructive text): "Rounding needs two straight lines.", "Pick a
  corner between two lines.", "This corner is already rounded.", "Both edges need the same
  allowance to round this corner.", "Remove the corner round before changing one side of a
  rounded corner."

### Accessibility

- The tool button keeps `aria-label="Round corner"`; the tooltip names both gestures.
- Point picks are pointer targets; the two-line path remains the keyboard-accessible route,
  so no capability is pointer-only. The radius field is labelled and autofocused once a
  corner is resolved, as today.
- A polite live region announces "Corner selected — set the radius." and every rejection.
- The eligible-corner ring is decorative and never the sole carrier of eligibility.

## 📝 Edge Cases & Failure Scenarios

| Case | Handling |
| ---- | -------- |
| Unequal allowances at the corner | Reject at add time; name both edges and their widths |
| Changing one allowance of a rounded corner | Reject; ask the user to remove the round first |
| Double-fold allowance | Bridge carries the same width; the fold line offsets the arc as well |
| Concave corner, allowance wider than the arc | The offset polyline self-intersects; the command rejects with "This radius with the current allowance folds the cut line" |
| Radius above the fit | Existing maximum check runs before the piece check |
| Corner shared by two pieces | One round, two bridges, each offset per piece |
| Round at both ends of one line | Existing model already supports it; both bridges resolve |
| Remove the round inside a piece | Loop closes at the sharp corner again; allowances and cut dimensions survive |
| Delete a rounded piece edge | Existing rule: the edge belongs to a piece; remove the piece first. The round is untouched |
| Cut dimension anchored at a rounded corner | Resolves to the tangent vertex; reads the resolved loop. Bounding cut size stays the inspector value |
| Piece with a hand-edited round that no longer matches | `normalizeCornerRounds` drops the round; the loop resolves as the sharp corner or reports the existing piece error |
| Two rounds meeting on a very short line | Radius fit already accounts for tangent overlap; the second round's maximum shrinks |
| Construction corner (no piece) | Unchanged two-line behaviour |
| Legacy seam on either line | Still rejected; legacy seams are not piece allowances |

## 📝 Risks & Impact Review

| Risk | Level | Mitigation |
| ---- | ----- | ---------- |
| Cut geometry changes silently for an existing drawing | None | Rounds inside pieces could not be committed before this change, so no stored document can regress |
| Bridge logic disagrees between `validatePiece` and `orientedPolylines` | Medium | One shared `roundBridge` helper used by both, with tests on the same fixtures |
| Allowance rule blocks a user workflow | Medium | Explicit message naming both edges; the round can be removed, allowances set, and re-added. This is Q1 on the issue |
| Offset arc self-intersects at extreme values | Low | Command-level rejection with the computed reason; existing self-intersection reporting on read |
| Coverage gate on a branch-heavy walk | Medium | Phase tests enumerate every bridge/rejection case before wiring the UI |
| Ribbon test churn | Low | Group order and Tools items are asserted in one test file; update it deliberately |
| Cut dimensions read tangent points | Low | Documented; inspector bounds remain authoritative; a follow-up can snap an anchor to the arc extremum |

## ❓ Open Questions

Blocking product decision, asked on #63. The design follows the recommendation.

| # | Question | Why it blocks | Recommendation |
| - | -------- | ------------- | -------------- |
| Q1 | **How should allowances behave at a rounded piece corner?** (a) both adjacent edges must match, and the arc offsets by that allowance; (b) round only allowance-free corners; (c) split the arc and interpolate between two allowances | It decides whether the reported workflow is actually fixed. A piece with seam allowances is the normal case; rejecting all allowances (b) keeps most of the friction, while (c) invents a cut rule with no construction meaning | **(a) Equal allowances, arc offsets with them.** Differing allowances are rejected with a message; changing one side requires removing the round first |

## ✅ Resolved assumptions (autonomous defaults)

| # | Assumption | Why | Status |
| - | ---------- | --- | ------ |
| R1 | The bridge arc is derived on read; the piece stores no round | One authority for derived geometry; old documents stay valid; removal and radius edits stay live | ✅ Reversible |
| R2 | A point pick resolves both line slots and replaces a pending line pick | Removes the half-selected state and makes the gesture predictable | ✅ Reversible |
| R3 | Both pick paths stay (two lines and one corner point) | #63 asks for "or"; some corners are easier to hit as a point, some as two lines | ✅ Reversible |
| R4 | Features group sits between Tools and Sketching; Round corner moves; Create piece stays in Tools | Caption order follows the workflow, and Create piece does not modify sketch geometry | ✅ Reversible |
| R5 | A corner shared by two pieces rounds both | It is one geometric feature; duplicating it per piece would fork the radius | ✅ Reversible |
| R6 | Equal allowance required on both sides (follows Q1's recommendation) | A single tangent offset exists only for one distance | ⚠ NEEDS HUMAN CONFIRMATION |
| R7 | Radius, removal, drag, properties and undo are unchanged | The corner tool is implemented; this spec only widens where it applies | ✅ Reversible |
| R8 | No command, schema or command-spec change | The change is derived geometry plus UI; agents keep the same command set | ✅ |
| R9 | Cut dimensions anchored at a rounded corner resolve to the tangent vertex | That is the loop vertex that exists; bounds stay the cut size authority | ✅ Reversible |
| R10 | No constraints are added for the arc or tangents | Parity with the implemented corner spec | ✅ |

## 📋 Phasing

- **Phase 1 — Geometry bridge.** Shared `roundBridge`, bridge-aware walk, `validatePiece`,
  `pieceLoop` distances, self-intersection rejection. Ships a document that can round a
  piece corner in unit tests, before UI.
- **Phase 2 — Commands.** Remove the piece rejection, allowance equality, allowance-edit
  guard, removal keeps the piece. Ships the command contract and inverse tests.
- **Phase 3 — Ribbon.** Features group and the Round corner move; group-order and item
  tests.
- **Phase 4 — Corner pick.** Point picks, eligible-corner computation and highlight,
  prompts and rejections, canvas and view wiring.
- **Phase 5 — Docs and gate.** Geometry/glossary updates, full validation gate, a manual
  four-corner walkthrough on a piece with 10 mm allowances.

## 📋 Implementation Plan

| Step | Description | Tests |
| ---- | ----------- | ----- |
| 1 | `corner-round.ts`: `roundBetween(document, first, second)`, `incidentLines(document, pointId)` | Unit |
| 2 | `piece.ts`: `roundBridge`, bridge-aware `orientedPolylines`, bridge distances in `pieceLoop`, `validatePiece` gap acceptance | `piece.test.ts` |
| 3 | `pieceCutVertex` index check with a bridge | Unit |
| 4 | `commands.ts`: remove the piece rejection; equal-allowance validation across affected pieces; self-intersection rejection | `commands.test.ts` |
| 5 | `set_piece_allowance`: mismatch guard; removal guard | Unit |
| 6 | `remove_corner_round`: piece survives, loop closes, cut dimensions survive | Unit + inverse |
| 7 | `editor-ribbon.ts`: `features` group; move `round_corner` | `editor-ribbon.test.ts` |
| 8 | `corner-round.ts` (frontend): point picks, `roundableCorners`, prompts, rejections | `corner-round.test.ts` |
| 9 | `PatternCanvas.vue`: point path, rings, prompt | `PatternCanvas.test.ts` |
| 10 | `EditorView.vue`: point-pick plumbing, mismatch message | `EditorView.test.ts` |
| 11 | Docs: `geometry-core.md`, `glossary.md` | Review |
| 12 | Full gate (`npm run format`, typecheck, lint, format:check, test:coverage, build, Pest 100 %) | All |

## ✅ Acceptance criteria

- [ ] A **Features** group exists between Tools and Sketching and contains Round corner;
      Tools no longer does.
- [ ] Round corner accepts a single corner point and opens the radius field, in a piece and
      outside one.
- [ ] Round corner still accepts two lines; a point pick after a line pick restarts cleanly.
- [ ] Eligible corners are ringed while the tool is active; ineligible picks explain why.
- [ ] A round can be committed on a piece corner without removing the piece; the stitch and
      cut loops stay closed and the piece keeps its allowances and cut dimensions.
- [ ] With equal 10 mm allowances on both edges, the cut loop offsets the arc and its size
      is correct within the existing tolerance.
- [ ] Unequal allowances are rejected at add time and by `set_piece_allowance`, with a
      message naming the remedy.
- [ ] Removing the round restores the sharp corner, the original cut loop and every cut
      dimension.
- [ ] A corner shared by two pieces rounds both loops from one feature.
- [ ] No document-schema, command or command-spec change; older documents load unchanged.
- [ ] Pest and Vitest suites pass at 100 % statements, branches, functions and lines.
- [ ] `npm run lint`, `npm run format:check` and `npm run typecheck` pass.
- [ ] `docs/architecture/geometry-core.md` and the glossary describe the bridge rule.

## Checks

Design checks only — this is a design-only PR. No application code was written or run, so
no behaviour is claimed:

- Traced the corner-round command, canvas pick flow, ribbon data and piece boundary walk.
- Read `piece.ts` (`validatePiece`, `orientedPolylines`, `pieceLoop`, `pieceCutLoop`),
  `commands.ts` (add/set/remove round, `set_piece_allowance`), the corner-round and pieces
  specs, the glossary, the data model and the standards.
- Checked the 100 % coverage, command-only mutation and doc-sync rules against the plan.

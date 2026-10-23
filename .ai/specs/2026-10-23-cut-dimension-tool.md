# Cut dimension tool

Status: draft
Builds on: 2026-10-22-pieces-and-allowance (pieces, allowance kinds, cut dimensions)
Supersedes: the Dimension tool's implicit cut-dimension behaviour on piece corners

## 📝 TLDR

A **Cut dimension** tool is added to the Sketching ribbon group, distinct from the existing Dimension tool. The Dimension tool always creates a stitch/driving dimension (`distance` constraint) — even between two corners of a piece. The Cut dimension tool creates only a read-only derived cut dimension (`derived_distance`) measuring the piece's cut loop, and it refuses picks that are not two loop vertices of the same piece or a single piece edge. Cut dimensions dedupe on the same piece + anchor pair and update orientation/offset instead of duplicating. When the Cut dimension tool is active, piece corners are highlighted so eligible picks are visible.

## 📝 Problem Statement

Today the Dimension tool implicitly converts any dimension between two piece corners into a cut dimension. This is surprising and removes the ability to place a driving dimension between those corners — which is necessary to constrain the piece's stitch size. Users need a clear, separate workflow:

- **Dimension** → "I want to drive or measure the stitch geometry."
- **Cut dimension** → "I want to annotate the cut size (read-only)."

The current implicit rule also means there's no discoverable way to create a cut dimension intentionally; it happens as a side effect of the tool you already know.

## 📝 Proposed Solution

Add a dedicated **Cut dimension** tool with its own pick rules, live preview and dedupe logic. The existing Dimension tool stops looking at pieces entirely.

### Picking rules (Cut dimension tool)

| Pick | Accepted? | Behaviour |
|------|-----------|-----------|
| First point: loop vertex of a piece | ✅ | Becomes pending anchor A; show hint "Pick second corner of the same piece" |
| First point: not a piece corner | ❌ | No pending state; show hint "Pick a corner of a piece" |
| Second point: loop vertex of the **same** piece | ✅ | Start placement with anchors A, B |
| Second point: loop vertex of a **different** piece | ❌ | Reset; show hint "Both corners must belong to the same piece" |
| Second point: same corner as first | ❌ | Show hint "Corners must be different" |
| Click a piece edge (line/curve/arc) as first pick | ✅ | Start placement with that edge's two loop vertices |
| Click a non-piece edge / circle / construction edge | ❌ | Show hint "Pick a piece edge" |

### Live preview

While placing, the preview renders the **cut span** (from `resolveCutSpan`) with the "… cut" label and derived colour — not the stitch span. The existing shared placement preview always shows the stitch value; the new tool fixes that for cuts.

### Dedupe

If a `derived_distance` constraint already exists for the same `piece` and anchor pair (either order: `{a, b}` or `{b, a}`), dispatch `update_constraint` with the new orientation/offset instead of adding a duplicate.

### Corner highlight

When the Cut dimension tool is active, every point that is a loop vertex of any piece gets a highlight ring (class `cut-vertex-handle`, `data-testid="cut-vertex-handle"`). This makes the eligible pick targets visible without relying on the hint alone.

### Dragging

Derived (cut) dimensions become draggable with Select, Dimension **and** Cut dimension tools. The existing `dimensionDragEnabled` computed is split so derived dimensions accept the cut tool as well.

### Hint overlay

A small overlay (like the existing `arc-hint`): "Pick two corners of one piece." Appears when the first pick is pending and the pointer is over an invalid target; cleared on a valid pick or tool change.

### Commands

No new command. Reuses `add_derived_dimension` (already added by the pieces spec). The Dimension tool's `onAddDimension` no longer calls `cutDimensionForPoints` — the implicit branch is deleted.

## 📝 Architecture

| Module | Change |
|--------|--------|
| `frontend/src/lib/editor-tools.ts` | Add `cut_dimension` tool + label |
| `frontend/src/lib/editor-ribbon.ts` | Add tool item after Dimension in Sketching group |
| `frontend/src/lib/ribbon-icons.ts` | Add `cut-dimension` glyph |
| `frontend/src/lib/pieces.ts` | New helpers: `piecesAtPoint`, `edgeEndpoints`, `findDerivedDimension` |
| `packages/geometry/src/dimension.ts` | Extract `inferOrientationFromSpan(span, pointer)`; `inferDimensionOrientation` delegates to it |
| `frontend/src/lib/dimensions.ts` | Add `CutDimensionPlacement` type (piece + anchors + orientation + offset) |
| `frontend/src/components/PatternCanvas.vue` | New tool branch: pick validation, hint, corner highlight, cut-span preview, edge-click path, derived-drag split |
| `frontend/src/views/EditorView.vue` | Remove `cutDimensionForPoints` branch from `onAddDimension`; add `onAddCutDimension` with dedupe; wire `@add-cut-dimension` event |

No backend, schema or command-spec change. Command spec stays `0.10.0`.

## 📝 Data Model

No new entities. Uses existing `DerivedDistanceConstraint` (`derived_distance`) with fields:

```ts
type DerivedDistanceConstraint = {
  id: EntityId;
  type: 'derived_distance';
  piece: EntityId;          // owning piece
  a: CutAnchor;             // { edge, at: 'start' | 'end' }
  b: CutAnchor;
  orientation?: DimensionOrientation;
  offset?: number;
};
```

Dedupe key: `(piece, unordered {a, b})`.

## 📝 UI/UX

### Ribbon

Sketching group gains a new item after **Dimension**:

```
[Dimension] [Cut dimension] [Seam allowance]
```

Label: "Cut dimension"  
Icon: new `cut-dimension` glyph (12×12 box, similar weight to `dimension`, visually distinct — e.g. scissors or a cut-line glyph).

### Canvas hints

| Situation | Text |
|-----------|------|
| Tool active, no pick | (none) |
| First pick done, pointer over non-piece point | "Pick a corner of a piece" |
| Second pick over different piece | "Both corners must belong to the same piece" |
| Second pick same corner | "Corners must be different" |
| Clicked non-piece edge | "Pick a piece edge" |

### Accessibility

- Tool button: `aria-label="Cut dimension"`; tooltip "Cut dimension (read-only, measures the cut loop)"
- Live-region announcement on pick validation failure (reuses the existing selection-count live region pattern).
- Cut dimension labels render `data-dimension-state="derived"` and `data-dimension-derived="<id>"`; colour is `fill-dimension-derived` (already defined by the pieces spec).

## 📝 Edge Cases & Failure Scenarios

| Case | Handling |
|------|----------|
| Piece deleted while placing | Placement cancels; hint "Piece no longer exists" |
| Allowance changed while placing | Preview updates on next pointer move (cut span recomputed) |
| Undo after placing | Removes the `derived_distance`; piece and its cut dimensions restored together (existing cascade) |
| Two cut dimensions on same span | Dedupe prevents the second add; offset/orientation updated instead |
| Switch tool mid-placement | Pending picks, placement, preview and hint all cleared |

## 📝 Risks & Impact Review

| Risk | Level | Note |
|------|-------|------|
| Breaking existing drawings | None | No schema change; existing `derived_distance` constraints unchanged |
| Users unable to drive piece size | None | Dimension tool still works on piece corners (creates stitch `distance`) |
| Confusion between two dimension tools | Low | Clear labels, distinct icons, corner highlight on cut tool; doc in spec |
| Regression: implicit cut-dimension still fires | Tested | Regression test: Dimension on `pieceDoc` corners `a→c` must emit `distance` |

## 📋 Phasing

### Phase 1 — Tool registry + helpers + geometry extract
1. Add `cut_dimension` to `EDITOR_TOOLS`, ribbon item, icon; update registry tests.
2. Add `piecesAtPoint`, `edgeEndpoints`, `findDerivedDimension` to `pieces.ts` + tests.
3. Extract `inferOrientationFromSpan` in `dimension.ts` + tests; keep `inferDimensionOrientation` behaviour identical.

### Phase 2 — Canvas tool implementation
4. New tool branch in `PatternCanvas.vue`: pick validation, hint overlay, corner highlight (`cut-vertex-handle`), edge-click path.
5. Cut-span live preview (appended to `derivedDimensionDrawings` with `preview: true`).
6. Split `dimensionDragEnabled` so derived dims accept Cut dimension tool.
7. Emit new `add-cut-dimension` event with `CutDimensionPlacement`.

### Phase 3 — View wiring + regression
8. Remove `cutDimensionForPoints` branch from `onAddDimension` (the bug fix).
9. Add `onAddCutDimension` with dedupe; wire `@add-cut-dimension`.
10. Update `EditorView.test.ts`: regression test (Dimension on piece corners → `distance`), positive cut-tool tests, rejection tests.

### Phase 4 — Spec doc
11. Write this spec (done).
12. Amend `2026-10-22-pieces-and-allowance.md` Behaviour 11 and Phase 5.2: creation is via the dedicated Cut dimension tool; Dimension always creates stitch dimensions.

## 📋 Implementation Plan

| Step | Description | Tests |
|------|-------------|-------|
| 1 | `editor-tools.ts`: add `cut_dimension`; `editor-tools.test.ts` | Unit |
| 2 | `editor-ribbon.ts`: add item after Dimension; `editor-ribbon.test.ts` sketching list | Unit |
| 3 | `ribbon-icons.ts`: add `cut-dimension` glyph; `ribbon-icons.test.ts` | Unit |
| 4 | `pieces.ts`: `piecesAtPoint`, `edgeEndpoints`, `findDerivedDimension`; `pieces.test.ts` | Unit |
| 5 | `dimension.ts`: extract `inferOrientationFromSpan`; `dimension.test.ts` | Unit |
| 6 | `dimensions.ts`: add `CutDimensionPlacement` type | Unit |
| 7 | `PatternCanvas.vue`: cut tool branch, picks, hint, corner highlight, edge-click, cut preview, drag split | `PatternCanvas.test.ts` |
| 8 | `PatternCanvas.test.ts`: valid picks → emit; invalid picks → no emit + hint; edge-click; dedupe preview; tool switch clears | Integration |
| 9 | `EditorView.vue`: remove implicit branch; `onAddCutDimension` with dedupe | `EditorView.test.ts` |
| 10 | `EditorView.test.ts`: regression (Dimension on `pieceDoc` a→c → `distance`), cut tool flow, rejections, dedupe | Integration |
| 11 | Update `2026-10-22-pieces-and-allowance.md` Behaviour 11 / Phase 5.2 | Doc |
| 12 | Run full gate | All |

## ✅ Acceptance Criteria

- [ ] Cut dimension tool appears in Sketching ribbon group after Dimension
- [ ] Selecting Cut dimension tool highlights piece corners (`cut-vertex-handle`)
- [ ] Two same-piece corners → `add_derived_dimension` with correct anchors, cut-span preview while placing
- [ ] One piece edge click → `add_derived_dimension` for that edge's cut span
- [ ] Non-piece point / cross-piece / same corner / non-piece edge → no command, hint shown
- [ ] Dedupe: second placement on same piece + anchors updates orientation/offset, no duplicate constraint
- [ ] **Regression**: Dimension tool on `pieceDoc` corners `a→c` creates `distance` constraint (not `derived_distance`)
- [ ] Derived dimensions draggable with Select, Dimension **and** Cut dimension tools
- [ ] Tool switch / Escape clears pending state, preview, hint
- [ ] All unit tests pass; 100% coverage maintained
- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check` pass
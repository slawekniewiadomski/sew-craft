# Split the `PatternCanvas` view models by domain

Status: **in progress** — phases 1–2 have landed.
Refs #178

## 📝 TLDR

The `PatternCanvas` scene split (#170–#177) moved the markup out: the component
is now 1,924 lines, of which only 269 are template. What remains is a
1,655-line `script setup` with 94 declarations: every scene view model,
dimension drawing derivation, annotation row and pointer dispatch in one scope.
This spec moves the derived view models into domain composables, leaving the
component with the state it actually owns — pointer and keyboard dispatch,
inline editing — and the template shell.

## 📝 Problem Statement

- **Who needs it:** anyone changing what the canvas draws. Adding one visual
  layer means finding its derivation among 94 declarations.
- **What happens today:** `PatternCanvas.vue` derives lines, curves, arcs,
  circles, piece bands, regions, seams, cut/stitch/folds, points, annotations,
  marks, dimensions, cut dimensions, labels and previews in the same scope as
  the pointer state machines and inline editors.
- **Constraints:** behaviour and the 260 `PatternCanvas` tests stay unchanged;
  the composables must remain pure derivations over the document, selection,
  viewport and the gesture state that the component already owns.
- **Evidence:** the earlier split proved the pattern: previews, ruler, marquee,
  entities, annotations, points, piece layers and dimension layers all moved
  without changing a single test.

## 📝 Proposed Solution

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **Domain composables for the derived views** | Each scene domain owns its own derivation and exposes the arrays the template binds. Pointer state stays in the component. Small, testable steps. | **Recommended** |
| B | **One `useCanvasScene` composable** | One boundary, but it would be a 1,000-line grab bag with a huge options object — the same problem one level down. | Rejected |
| C | Leave the script | The markup is clean; every new visual layer still pays the navigation cost. | Rejected |

### Phases

1. **Dimension scene** → `composables/use-dimension-scene.ts` (this PR).
   Distance and derived constraints, drawing options, preview constraints,
   drawings, labels, the label class and the inline editor position.
2. **Canvas scene views** → `composables/use-canvas-scene-views.ts` (done).
   Points and visible points, lines/curves/arcs/circles, seams, the allowance
   band and its regions, piece views, text and mark rows.
3. What remains in the component: pointer/keyboard state machines, the inline
   editor state and the SVG shell. That is the part that genuinely belongs
   there.

### Phase 1 contract

```ts
const dimensionScene = useDimensionScene({
  document: () => props.document,
  showDimensions: () => props.showDimensions,
  constraintActive: () => props.constraintActive,
  selectedDimensionIds: () => props.selectedDimensionIds,
  dimensionDrag: () => dimension.dimensionDrag.value,
  dimensionDragEnabled: () => dimension.dragEnabled.value,
  derivedDrag: () => dimension.derivedDrag.value,
  dimensionPlacement: () => dimension.dimensionPlacement.value,
  cutDimensionPlacement: () => dimension.cutDimensionPlacement.value,
  viewport: () => viewport.value,
  editingDimension: () => editingDimension.value,
})
```

It returns the arrays and values the template already binds. The component keeps
the `editingDimension` ref and the inline input because their focus lifecycle is
pointer-side state.

## 📝 Edge Cases & Failure Scenarios

- **Dimensions hidden** — `showDimensions` still drops both committed sets and
  keeps the previews off in the same places.
- **Drag state** — the drawing options read the same `dimensionDrag` /
  `derivedDrag` values from the gesture composable.
- **Editor position** — `dimensionEditor` resolves only when a label exists; the
  existing non-null assumption stays because the editor opens from that label.
- **Coverage** — every branch is exercised through the existing canvas tests.

## 📝 Verification

- `npm run test:coverage` — 100% statements, branches, functions and lines.
- `PatternCanvas.test.ts` (260 tests) passes unchanged.
- `npm run lint`, `npm run typecheck`, `npm run format:check`.

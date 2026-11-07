# Split `PatternCanvas` by gesture

Status: **in progress** — phases 1–3 landed (#141, #142, #143).
Refs #141, #142, #143

## 📝 TLDR

`frontend/src/components/canvas/PatternCanvas.vue` is 4,764 lines and owns every
canvas concern: viewport and resize, hit testing, five drafting tools, three
dimension tools, corner-round editing, allowance bands, marquee selection, pan
and zoom, and the whole SVG layer stack. The editor split (#133–#139) showed the
pattern works: move one cohesive state machine at a time into a composable, keep
the component as the renderer, and let the existing 261 tests carry the
behaviour. No command, API or document changes.

## 📝 Problem Statement

- **Who needs it:** anyone changing a canvas gesture. The dimension tools alone
  span state refs, ~200 lines of feedback computeds, ~300 lines of handlers,
  three pointer dispatch sites, two watchers and four label elements.
- **What happens today:** `PatternCanvas.vue` is the largest file in the repo
  (4,764 lines). Its test file is 5,447 lines. A new gesture adds another `ref`,
  another branch in `onPointerDown`, another block in `onKeyDown`, and another
  watcher.
- **Constraints:** behaviour and `PatternCanvas.test.ts` stay unchanged; the
  command layer remains the only mutation path; coverage stays at 100%.
- **Evidence:** previous canvas slices (#126, #130, #131) removed the drawer
  panels, the dimension drawings and the shared pickers without changing tests.
  What remains is mostly state machines and markup.

## 📝 Proposed Solution

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **One composable per gesture, component keeps rendering** | Each slice owns its refs, computeds and pointer/escape handling behind a `use*` call; the component calls it from its pointer dispatch. Small reviewable steps with the existing tests as the safety net. | **Recommended** |
| B | **Split the SVG into layer components first** | Shrinks the template, but most state still lives in the component; layers would need ~30 props each and the gestures stay tangled. | Deferred — after A |
| C | Rewrite on a canvas library | Changes the rendering contract and the 100% SVG-based tests; no benefit for the current feature set. | Rejected |
| D | Leave it | Every new tool makes the file harder to change; the cost compounds. | Rejected |

### Phases

1. **Dimension gesture** → `composables/use-dimension-gesture.ts` (landed;
   `PatternCanvas` 4,764 → 4,172 lines; #141).
   Pending picks, placement, drags, hover feedback, hints, ghost previews,
   pointer down/move/up, Escape, tool-change and document-change cleanup for
   both the Dimension and Cut dimension tools.
2. **Drafting gestures** → `composables/use-drafting-gestures.ts` (landed;
   `PatternCanvas` 4,172 → 3,463 lines; #142). Line, arc, circle, rectangle, text
   leader, point, point-on-line, split and midpoint.
3. **Corner-round editing** → `composables/use-corner-round-edit.ts` (landed;
   `PatternCanvas` 3,463 → 3,176 lines; #143). Handles, tangent drag, inline
   radius editor, previews.
4. **Viewport, pointer and hit testing** → `composables/use-canvas-viewport.ts`.
   Resize observer, pan/zoom, screen/world conversion, hit extraction.
5. **SVG layers** → `components/canvas/CanvasGrid.vue`, `CanvasEntities.vue`,
   `CanvasDimensions.vue`, `CanvasAnnotations.vue`, `CanvasPreviews.vue`.
   Only once phases 1–4 have concentrated the data each layer needs.

### Phase 1 contract

```ts
const dimension = useDimensionGesture({
  document: () => props.document,
  tool: () => props.tool,
  readOnly: () => props.readOnly,
  selectedDimensionIds: () => props.selectedDimensionIds,
  viewport,
  beginPointerTracking: addPointerListeners,
  screenToWorld: (screen) => screenToWorld(viewport.value, screen),
  onAddDimension: (placement) => emit('add-dimension', placement),
  onAddCutDimension: (placement) => emit('add-cut-dimension', placement),
  onUpdateDimension: (id, patch) => emit('update-dimension', id, patch),
  onSelectDimensions: (ids) => emit('update:selectedDimensionIds', ids),
  onSelectEntities: (ids) => emit('update:selectedEntityIds', ids),
})
```

The component still decides when the tool is armed and what a pointer hit is;
the composable owns the picks, placement geometry and drag offsets. Its
returned refs feed the template exactly as the local ones did.

## 📝 Edge Cases & Failure Scenarios

- **Escape** must clear the dimension gesture before the canvas-level handler
  falls through; the composable returns whether it consumed the key.
- **Tool switch** clears pending picks, placements, hover and drags.
- **Document edit** drops a cut placement whose piece disappeared.
- **Read-only** never starts a drag or a pick.
- **Tab overflow / pointer cancellation** still commits or drops a drag exactly
  where it did before.
- **Coverage** comes from the existing `PatternCanvas.test.ts`; any new branch
  the composable adds is exercised through the existing tests or gets one.

## 📝 Verification

- `npm run test:coverage` — 100% statements, branches, functions and lines.
- `PatternCanvas.test.ts` (261 tests) and the editor suites pass unchanged.
- `npm run lint`, `npm run typecheck`, `npm run format:check`.

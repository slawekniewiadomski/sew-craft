# 005 — Canvas editor interactions

Status: done
Depends on: 004

## Goal

A user can create and edit points, lines and curves on an interactive SVG canvas
with pan/zoom and selection, and changes are parametric (solver rebuilds).

## Context

Read `docs/architecture/constraint-solver.md` and `command-core.md`. The
`EditorView` currently renders a static demo; this makes it real.

## Inputs

Geometry package, command bus, `PatternDocument`.

## Deliverables

- `PatternCanvas.vue`: SVG renderer for entities (cut vs construction styling),
  selection handles, drag to move points, grid + rulers (mm).
- Viewport: pan (middle-drag or Space-drag) and zoom (wheel), fit-to-bounds.
- Snap (grid + to points) as a frontend concern.
- Tools: select, add point, add line, add curve.
- Selection: click, Ctrl/Cmd-click to toggle, and a left-drag marquee
  (right = crossing, left = window); Delete removes the whole selection as one
  undo entry, refusing when a selected point would orphan an unselected edge.
- Emits commands via the bus; renders solver output.

## Acceptance criteria

- [x] Dragging a point emits a move command and re-solves.
- [x] Constraints visibly hold (e.g. horizontal stays horizontal).
- [x] Selection + deletion via keyboard work.
- [x] Multiple entities can be selected with Ctrl/Cmd-click or a marquee, and
      the two-or-more case shows a summary instead of the property inspector.
- [x] No geometry math in the component (delegates to the package).

## Out of scope

- Copy/paste, layers, undo UI (see 004), bulk property editing and group move.

## Checks

```bash
npm test
npm run lint
npm run build
```

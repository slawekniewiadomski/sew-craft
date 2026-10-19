# Execution plan — constraint icons on the canvas

Tracking plan for `om-auto-create-pr`. Resume with `om-auto-continue-pr {prNumber}`.

## Goal

Show every constraint as a small, legible icon on the pattern canvas so the
solver state is visible while drafting, without changing the geometry,
command or persistence contracts.

## Scope

- `frontend/src/lib/constraint-view.ts`: labels, roles, value validation, icon
  geometry, and marker centroids for the canvas overlay.
- `frontend/src/components/PatternCanvas.vue`: fixed-size, screen-space icon
  overlay with a presentation toggle and staggered placement.
- `frontend/src/views/EditorView.vue` and the constraints drawer: list existing
  constraints, add one through the command bus, and remove one.
- Tests for every helper, the canvas overlay and the drawer wiring.

## Non-goals

- No changes to `@sewcraft/geometry`, the solver, commands, API, database or
  export formats.
- No new constraint types or solver diagnostics.
- No interactive editing of constraint icons (select/drag/delete on canvas);
  the drawer remains the editing surface.
- No measurement labels on the canvas; the full constraint name is exposed as
  the marker's accessible label and tooltip.

## Decisions

- Icons are drawn in **screen space** at a fixed 18 px size so zooming does not
  shrink them into unreadable chips.
- Constraints that share a midpoint are **staggered** by 20 px along the icon
  row instead of overlapping.
- The overlay is **presentation only** and controlled by the `Show constraints`
  toggle; it never mutates the document.
- The constraints drawer is included because it is the only UI that can create
  constraints, and the model already supports them.

## Implementation Plan

### Phase 1: Constraint presentation helpers

- Add constraint labels, role names, value units/validation and icon geometry to
  `constraint-view.ts`.
- Resolve each constraint to a centroid marker from the points it references,
  skipping dangling references.
- Cover every helper with unit tests.

### Phase 2: Canvas icon overlay

- Render one fixed-size icon per marker in a screen-space layer above the canvas
  geometry.
- Stagger markers that share an anchor; expose label/tooltip metadata.
- Keep the layer behind the `showConstraints` prop and test both states.

### Phase 3: Constraints drawer

- Register a collapsible Constraints drawer that lists constraints and removes
  them through `remove_constraint`.
- Add a form that emits `add_constraint` with entity roles and an optional value.
- Wire the presentation toggle and icon prop from `EditorView`, with tests for
  add, remove, validation and visibility.

### Phase 4: Validation and evidence

- Run the full validation gate and the production build.
- Capture the editor with the seeded sketch and verify the icons in a real
  browser.
- Record the outcome on the PR.

## Risks

- The overlay could cover geometry: mitigated by offsetting icons from the
  anchor and keeping them small.
- Marker positions could go stale while dragging: markers recompute from the
  committed document; the next solve refreshes them.
- The seeded sketch is fully constrained, so adding a conflicting constraint
  surfaces a solver error in the drawer instead of silently changing geometry —
  expected behaviour.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Constraint presentation helpers

- [ ] 1.1 Add constraint labels, roles, value helpers and icon geometry
- [ ] 1.2 Resolve constraint markers to point centroids

### Phase 2: Canvas icon overlay

- [ ] 2.1 Render fixed-size screen-space icons with staggering and a toggle

### Phase 3: Constraints drawer

- [ ] 3.1 Register the constraints drawer and add/remove controls
- [ ] 3.2 Wire the icon toggle and command handlers in the editor view

### Phase 4: Validation and evidence

- [ ] 4.1 Run the full validation gate and capture browser evidence

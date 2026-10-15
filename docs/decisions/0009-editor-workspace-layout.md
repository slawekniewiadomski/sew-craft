# ADR-0009: Editor workspace layout — ribbon + resizable drawer sidebar

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The pattern editor is where all drafting happens, but its controls were rendered
as a single wrapping row above a fixed-height canvas, with per-edge parameters
stacked _below_ the canvas inside a scrolling page. As tools and parameters grow
this neither scales nor keeps parameters near the tool that owns them, and the
canvas never fills the window. Spec `013-editor-workspace-shell.md` restructures
the editor into a full-height workspace.

## Decision

- The app shell is a fixed-height column (`h-screen`); the routed view fills it
  (`<main>` is `flex-1 min-h-0`), and the footer is hidden on the editor route.
- The editor is a **tool ribbon** (data-driven groups) over a body of canvas
  (`flex-1`) + a **right sidebar**.
- The sidebar hosts **accordion drawers** (multiple open at once): Properties and
  Outline open, View collapsed.
- The sidebar is resizable (240–560 px, default 320) and collapsible; width and
  collapsed state persist in `localStorage`.
- Layout definitions and persistence logic are pure functions in
  `frontend/src/lib/`, wired by a `use-sidebar-layout` composable; components
  stay thin. New UI primitives come from shadcn-vue
  (`collapsible`/`separator`/`tooltip`/`scroll-area`).

## Consequences

- The command bus stays the only mutation path; the layout adds no command and no
  second state store.
- Panel state (which drawers are open) is intentionally **not** persisted;
  width/collapsed are.
- Future drawers (Constraints/Layers/Measurements/Export) slot into the existing
  accordion without reworking the shell.
- All editor control `data-testid`s are preserved so the existing suite keeps
  guarding behaviour after the move.

## Alternatives considered

- **Fixed, non-resizable sidebar:** simpler, but the issue asks for a resizable,
  collapsible rail and a drag handle is cheap with the composable.
- **Tabbed panels instead of accordion drawers:** hides parameters when another
  panel is active; the issue asks for multiple-open accordion sections.
- **Overlay/floating panels:** more complex focus and pointer handling than the
  workspace warrants at this stage.

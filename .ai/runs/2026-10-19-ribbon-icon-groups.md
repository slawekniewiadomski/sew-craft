# Execution plan — Ribbon icons and named groups

Goal: ship the frontend change described by
`.ai/specs/2026-10-19-ribbon-icon-groups.md` — the editor ribbon renders
**icon-only buttons with tooltips**, regrouped into four labelled groups
(**Tools**, **Sketching**, **Constraints**, **Export**) with a small uppercase
caption at each group's top-left, without adding a dependency and without
changing any command, API, geometry or database contract.

Source doc: .ai/specs/2026-10-19-ribbon-icon-groups.md
Refs: #23 (spec PR — stays design-only; this implementation ships separately)

## Scope

- `frontend/src/lib/ribbon-icons.ts` (new): `RibbonIcon` descriptors, the
  `RibbonIconName` union, `RIBBON_ICONS` (constraint entries reused from
  `CONSTRAINT_ICONS`) and a `ribbonIcon` accessor.
- `frontend/src/components/RibbonIcon.vue` (new): renders a descriptor as an
  `aria-hidden` inline SVG (paths + optional filled dots).
- `frontend/src/lib/editor-ribbon.ts`: every item gains `icon`; `RIBBON_GROUPS`
  becomes Tools (Select, Undo, Redo, Delete, Fit), Sketching (Point, Line,
  Curve), Constraints (7 types), Export (Download SVG).
- `frontend/src/components/EditorRibbon.vue`: icon-only buttons, a tooltip per
  control, the visible group caption, `aria-label`s; `data-testid`s and emits
  unchanged.
- Colocated `*.test.ts` for every touched/new file.

Non-goals: new tools/constraints/commands; keyboard shortcuts; a collapsible or
tabbed ribbon; canvas constraint markers; mobile redesign; any new runtime
dependency.

## Implementation Plan

### Phase 1 — Icon data and renderer

1. Add `frontend/src/lib/ribbon-icons.ts` with the icon type/union, the registry
   (tools/actions authored, constraints re-exported from `CONSTRAINT_ICONS`) and
   the accessor; unit-test every member and the constraint reuse.
2. Add `frontend/src/components/RibbonIcon.vue` rendering paths and optional
   dots at a caller-set size; test paths, dots, default size and `aria-hidden`.

### Phase 2 — Ribbon data and component

3. Extend `frontend/src/lib/editor-ribbon.ts` with `icon` per item and the four
   named groups; update `editor-ribbon.test.ts` for group ids/labels and icons.
4. Update `frontend/src/components/EditorRibbon.vue` to render icon-only buttons
   inside tooltips, show the uppercase group caption, and expose `aria-label`s;
   update `EditorRibbon.test.ts` and confirm `EditorView` consumers are intact.

### Phase 3 — Verification

5. Run the full validation gate (`format`, `typecheck`, `lint`, `format:check`,
   `test:coverage`, `build`, backend Pest/Pint) and capture the UI evidence.

## Risks

- **100 % coverage gate:** every new template/data branch needs a test; the
  `dots`-optional branch in `RibbonIcon.vue` and the group-caption branch in
  `EditorRibbon.vue` are the easy misses.
- **Contract stability:** `data-testid`s and the `select-tool` /
  `select-constraint` / `action` emits must not change, so `EditorView.vue` and
  its tests stay untouched.
- **Tooltip-on-disabled:** a native `disabled` button may suppress its tooltip in
  some browsers; accepted as best-effort per the spec.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles.

### Phase 1: Icon data and renderer

- [ ] 1.1 Add `ribbon-icons.ts` with descriptors and accessor (tests)
- [ ] 1.2 Add `RibbonIcon.vue` renderer (tests)

### Phase 2: Ribbon data and component

- [ ] 2.1 Extend `editor-ribbon.ts` with icons and four named groups (tests)
- [ ] 2.2 Update `EditorRibbon.vue` for icon-only buttons, tooltips and captions (tests)

### Phase 3: Verification

- [ ] 3.1 Run the full validation gate and record results

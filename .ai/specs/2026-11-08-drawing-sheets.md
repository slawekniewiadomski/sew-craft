# Drawing sheets — scaled piece layouts with a technical title block

Status: **proposed** — discovery draft; no implementation started. Open questions
remain at the end and must be settled before the first phase.
Builds on: `008-svg-export`, `010-pdf-tiled-export`,
`docs/architecture/export.md`.
Related: `2026-10-25-piece-tabs-and-assemblies` (its disabled **New drawing** tab
item and out-of-scope note reserve this workflow).

## 📝 TLDR

A **drawing sheet** is a composed page: one or more piece views placed at a chosen
scale on standard paper, with dimensions, annotation text, marks, grainlines and a
technical title block (project, author, revision, date, scale, sheet number). The
sheet is persisted in the pattern document, edited through commands and exported
as SVG now and PDF later.

This is distinct from `010-pdf-tiled-export`: that feature prints a pattern at
**1:1 across tiled pages**. A drawing sheet is a **scaled presentation sheet** —
a portfolio page, tech-pack sheet or print-shop handoff — and may intentionally
show a piece smaller than life.

## 📝 Problem Statement

- **Who needs it:** a maker sharing a finished pattern with a test sewer, a print
  shop, a pattern publisher or a portfolio. They need one page that says what the
  piece is, what scale it is drawn at, who made it and which revision it is.
- **What happens today:**
  - `toSvgPiece` exports exactly one piece, at 1:1, with cut, stitch, fold,
    construction and marks. Dimensions and annotation text are **not exported**
    (`docs/architecture/export.md`).
  - The canvas can select pieces and dimensions, but there is no paper model, no
    page composition and no way to place several pieces on one sheet.
  - Project metadata carries only name and description; there is no author,
    revision, date or sheet number.
  - The piece-tabs tab bar already shows a disabled **New drawing** item; this
    spec describes what it should eventually create.
- **Evidence it matters:** `docs/architecture/export.md` explicitly says
  “assembling or exporting a sheet of pieces belongs to the future drawing
  workflow”, and `2026-10-25-piece-tabs-and-assemblies` lists technical sheets,
  tables and title blocks as out of scope for that feature. The groundwork is
  already named.
- **Constraints:** commands remain the only mutation path; sheets never touch the
  solver; `@sewcraft/geometry` stays pure and framework-agnostic; units are
  millimetres; coverage stays at 100 % for `packages/geometry/src`,
  `frontend/src` and backend `app/`.

## 📝 Proposed Solution

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **Persisted sheet composer with manual placement** — sheets are document state, piece views are dragged/scaled/rotated on a paper page | Reuses the command model, keeps sheets in undo/save/version, supports multiple pieces per page and a real title block. Costs a schema addition and a new editor surface. | **Recommended starting point** |
| B | **Export-only preset** — choose pieces, paper and scale; the app auto-arranges one page and exports | Much cheaper; no sheet editor or persisted layout. But the maker cannot correct overlaps, choose page composition or keep a specific layout across edits, and the “drawing feature” is only a dialog. | Viable fallback for a first slice |
| C | **Compose in an external tool** — export SVG per piece and lay out in Inkscape/Illustrator | No new app surface and maximum flexibility, but no title-block automation, no live dimensions/text and no round trip. | Rejected as the main workflow |
| D | **Full CAD sheet set** — free vector drawing, sections, tolerances, multiple view types, revision management | Powerful, but a different product and months of scope. | Rejected |

### Starting shape

The model below is a draft, not a settled contract. It exists to make the phases
and open questions concrete.

```ts
Sheet {
  id: EntityId
  name: string
  paper: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'Legal' | 'Tabloid'
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number } // mm
  scale: number // 1 = 1:1, 2 = 1:2, 5 = 1:5 ...
  titleBlock: {
    project?: string
    pattern?: string
    author?: string
    revision?: string
    date?: string
    sheet?: string   // "1 of 3"
    notes?: string
  }
  views: SheetView[]
}

SheetView {
  id: EntityId
  piece: EntityId
  /** Paper-space position of the view anchor, in millimetres. */
  x: number
  y: number
  rotation?: number
  /** Optional override of the sheet scale. */
  scale?: number
  layers: {
    cut: boolean
    stitch: boolean
    allowances: boolean
    construction: boolean
    dimensions: boolean
    annotations: boolean
    marks: boolean
  }
  label?: string
}
```

Sheets live in `PatternDocument.sheets` (optional, normalised to `[]`), so they
save, undo and version with the pattern. They are **not** piece entities and
never enter the solver.

Candidate commands:

- `add_sheet`, `update_sheet` (paper, orientation, margins, scale, title block),
  `remove_sheet`, `reorder_sheets`
- `add_sheet_view`, `move_sheet_view`, `scale_sheet_view`, `rotate_sheet_view`,
  `set_sheet_view_layers`, `remove_sheet_view`
- later: `add_revision_row`, `set_piece_schedule`

### Pure drawing layer

`@sewcraft/geometry` owns everything that can be tested without a DOM:

- **Paper registry** — standard sizes in millimetres, orientation and printable
  area.
- **Sheet math** — page bounds, margins, view transform (scale + rotation),
  clipping, auto-placement.
- **Display list** — a neutral description of what to draw: cut/stitch paths,
  dimension strokes and arrows, text runs, marks, title-block lines and labels.
- **Serializers** — `toSvgSheet` first; a PDF page renderer later.

A display list prevents the drawing from being implemented twice: the sheet
preview and the serializer consume the same primitives. The canvas keeps its own
SVG renderer for editing, but dimension and annotation formatting should move
towards shared pure helpers when the sheet work begins.

### Workspace

The tab bar's disabled **New drawing** item becomes the entry point. A drawing
tab shows a page editor:

- paper outline with margins and a grid;
- a piece list beside the page;
- drag, scale and rotate views, with snapping to margins and a grid;
- layer toggles per view;
- a title-block form with the fields above;
- **Auto-place selected pieces** as a starting layout, then manual adjustment;
- page preview and **Export SVG/PDF**.

Whether drawings are tab kinds or a separate workspace is an open question.

### v1 scope

- One or more sheets per project; A4/A3 plus Letter, portrait/landscape.
- Place piece views at a chosen scale, with cut, stitch, allowances, marks and
  grainline.
- Render dimensions and annotation text on the page.
- Piece label, quantity and scale label.
- Title block: project/pattern, author, revision, date, scale, sheet number,
  notes.
- Manual placement after an auto-place action.
- Export one SVG page per sheet.

### Deferred

- Revision-history table and piece-schedule table.
- Custom title-block templates and multiple drawing styles.
- Multiple view types (detail, section, flattened, nested).
- Graded/nested size sets.
- Free vector text and line tools.
- DXF drawing export.
- Tiled 1:1 printing — that remains `010`.

## 📝 Edge Cases & Failure Scenarios

- **A piece is deleted** — its sheet views are removed (or the sheet marks the
  view broken) as part of the same undo step; a dangling view never renders.
- **A piece's geometry changes** — views are live references, so the drawing
  updates on the next render; dimensions move with the geometry.
- **Scale and print fidelity** — a 200 mm piece at 1:2 must measure 100 mm on
  paper; a print test asserts this with a ruler, not a screenshot.
- **Text metrics** — title-block and dimension text sizes are millimetres, not
  screen pixels; PDF font selection must not change layout.
- **Paper locale** — ISO A-series and US sizes differ; a sheet must store a
  concrete size, not just “A4-ish”.
- **Broken dimensions** — a dimension that cannot resolve renders as a dash or is
  omitted per a settled rule, never as a bogus measurement.
- **Read-only documents** — the sheet editor is inspect-only; the fieldset and
  command guards stay the single gate.
- **Schema** — adding `sheets` bumps the pattern schema; a document without
  sheets normalises to `[]`.
- **Undo granularity** — a drag is one gesture, one command; auto-place is one
  group.

## 📝 Open Questions

These must be settled before Phase 1:

1. **Purpose and scale** — is the primary artifact a scaled presentation sheet,
   or should sheets also print at 1:1? If 1:1, this overlaps with tiled export
   and may need tiling inside a sheet.
2. **Composition** — is manual drag/scale/rotate required in v1, or is
   auto-arrangement with a later editor acceptable?
3. **Sheet count** — one sheet per project, or many sheets with `n of m`?
4. **v1 content** — are dimensions and annotation text mandatory in v1, or can
   the first slice ship outlines, marks and a title block only?
5. **Author and revision** — stored in project settings with per-sheet
   overrides, or entirely per sheet? Manual revision or an explicit “release
   revision” action?
6. **Workspace** — a new drawing tab kind (activating the disabled menu item) or
   a separate drawings screen?
7. **Export order** — SVG first, or wait for the PDF foundation? PDF is the
   natural print artifact, but a vector SVG page is a useful first proof.
8. **Paper locale** — ISO A-series only, or include US Letter/Legal/Tabloid from
   day one?
9. **Dimensions scope** — every dimension on the piece, only driving/driven
   dimensions, or only dimensions the maker selected for the drawing?
10. **Piece schedule and revision table** — both in v1 or deferred? If deferred,
    does the title block need placeholder rows?

## 📝 Draft Acceptance Criteria

- [ ] A sheet stores paper, orientation, margins, scale and title-block fields;
      changing them is a command and survives reload.
- [ ] A piece view can be placed, moved, scaled and rotated on the page; the
      drawing re-renders from the live piece.
- [ ] A 100 mm line at 1:2 prints 50 mm on paper when the PDF is printed at
      100 %.
- [ ] Dimensions and annotation text appear on the sheet with the same values the
      canvas shows.
- [ ] The title block shows the stored author, revision, date, scale and sheet
      number.
- [ ] Exporting a sheet produces one SVG (and later one PDF page) per sheet.
- [ ] Deleting a piece removes its views in the same undo step.
- [ ] 100 % coverage; sheet math and serializers are pure and unit-tested.

## 📝 Verification

- `npm run test:coverage` — 100 % statements, branches, functions and lines.
- Geometry tests for paper sizes, transforms, auto-place bounds and SVG sheet
  structure.
- A print fidelity check for the 1:1 / 1:2 scale criteria.
- `npm run lint`, `npm run typecheck`, `npm run format:check`.

## 📝 Out of Scope

- Full CAD drawing tools (sections, tolerances, free vectors, hatching).
- 1:1 tiled print output (`010-pdf-tiled-export`).
- DXF drawing exchange (`011-dxf-export`).
- Measurements, grading and size sets (`012`).
- Fabric layout / nesting.

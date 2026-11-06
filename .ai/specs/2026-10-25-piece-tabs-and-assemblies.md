# Piece tabs, assemblies and per-piece parameters

Status: **proposed** — design-only PR, implementation not started. Every decision
below was settled with the maintainer during the 2026-10-25 exploration; there are
no open questions. The proposal changes the stored pattern schema to
`sewcraft.pattern/0.4` and deliberately drops 0.3 compatibility (D6).
Builds on: `2026-10-25-piece-containers-and-annotations`,
`2026-10-22-pieces-and-allowance`, `2026-10-23-pieces-sidebar-and-selection`,
`2026-10-23-default-piece-seam-allowance`, `008-svg-export`.
Supersedes: the single-canvas editing model (every piece is drawn in one shared
view and coordinate space) and the document-wide SVG export.
Prototype: `.ai/specs/assets/piece-tabs-and-assemblies/mockup-01-piece-tabs.html`
Static previews: `mockup-02-assembly.png`, `mockup-03-piece-tab.png`,
`mockup-04-new-menu.png` in the same directory.

## 📝 TLDR

A pattern becomes a set of **independent pieces** plus **assemblies** that place
instances of them. The editor gains an Onshape-style tab bar along the bottom of
the workspace: one tab per piece and per assembly, with a `+` menu that creates a
piece or an assembly (a third type, **drawing**, is visible but disabled).
A piece tab edits exactly one piece, fitted and in its own coordinates. An
assembly tab shows every placed piece, lets the user move, rotate and mirror each
instance, and edits the piece's parameters — name, quantity, default allowance,
notes, fabric, colour — without exposing sketch tools. Instances reference the
piece, so editing the piece updates every place it appears. Export becomes
**active piece only**. This is future behaviour; today every piece shares one
canvas and one coordinate space, only the active piece is editable, and export
writes every piece into one document-sized SVG.

### Settled decisions

| #   | Decision                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Pieces and assemblies are siblings in one pattern document. Geometry is independent of assembly placement.                                    |
| D2  | An assembly holds **instances**; the same piece may appear many times, each with its own transform and `mirrored` flag.                       |
| D3  | No cross-piece geometry or constraints in v1. Assemblies place instances and edit piece parameters only.                                      |
| D4  | A piece tab renders only its piece, fitted on activation. The existing "switch to the owning piece" cross-piece edit path disappears.        |
| D5  | A piece may override the document default allowance; the override applies when the loop is captured or new edges join it, never retroactively. |
| D6  | No migration: schema 0.4 refuses 0.3 documents through the existing unsupported-format path. Old projects are expected to be recreated.       |
| D7  | An instance transform is translate + rotate + mirror. Rotate and mirror are inspector controls in v1, not drag handles.                       |
| D8  | New assemblies start empty; pieces are added through an **Add piece** picker in the assembly view.                                            |
| D9  | Every piece and assembly always has a tab, in creation order, reorderable by drag. The order is stored in the document and reordering is undoable. |
| D10 | Per-piece parameters are name, quantity, default allowance, notes, fabric and colour. Per-edge allowances and the loop stay piece-tab-only.    |
| D11 | Deleting a piece removes its instances from every assembly and its tab, after a confirmation that names the affected assemblies.               |
| D12 | Export downloads the active piece only; assembling or exporting a sheet of pieces belongs to the future drawing workflow.                      |

## 📝 Problem Statement

- **Who needs it:** the maker drafting a multi-panel pattern (front, back, pocket,
  strap) who must currently lay every panel out in one canvas, remember which
  edges belong to which panel, and cannot see how the panels relate once cut.
- **What happens today:**
  - Geometry is document-wide. Each entity names its piece
    (`packages/geometry/src/types.ts`), but every piece is drawn in the same view
    and coordinate space. The canvas renders all pieces' loops
    (`PatternCanvas.vue`, `pieceViews`) and gates editing on `activePieceId`.
  - Clicking geometry that belongs to another piece is refused with
    `Switch to the owning piece to edit it.` (`EditorView.vue`,
    `onCrossPiece`); there is no way to change focus other than the Pieces drawer
    or a `move_piece` drag, which moves geometry, not a view.
  - A piece's parameters are only name and quantity
    (`UpdatePieceParams`); the default allowance is document-wide
    (`set_default_allowance`), and there is no place to record fabric, notes or a
    colour.
  - Every piece lives at its drawing coordinates. Arranging pieces for a visual
    check means permanently moving their geometry, and mirrored pairs are
    impossible without duplicating a piece.
  - `toSvg(document)` serialises every piece into one SVG using their shared
    coordinates (`packages/geometry/src/export.ts`), which is only meaningful
    while the pieces are laid out in that space.
- **Evidence it matters:** the maintainer's 2026-10-25 exploration and prototype
  (the assets above): the desired workflow is Onshape's part-studio/assembly
  split, and the existing piece container is the natural place to draw the line.
  The prototype was reviewed visually; layout and interactions are settled.
- **Constraints:** commands remain the only mutation path (`AGENTS.md` rule 1);
  `@sewcraft/geometry` stays pure and framework-agnostic; units are millimetres;
  coverage stays at 100 % for `packages/geometry/src`, `frontend/src` and backend
  `app/`. The stored document is the only place tab order may live (D9), so
  reordering is a command, not a UI preference.
- **Why it was ambiguous:** whether pieces keep document coordinates or become
  local, whether an assembly owns copies or references, whether an assembly is
  implied by the document, and what "not editable in the assembly" means for
  parameters. D1–D12 settle those; the remaining design work is how the model,
  commands and editor surfaces express them.

## 📝 Proposed Solution

### Options considered

| #   | Option                                                                                                                       | Trade-offs                                                                                                                                                                                                                                                                                                                              | Verdict                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A   | **Local pieces + assembly instances** (one document; `assemblies[].instances[]` reference piece ids with x/y/rotation/mirror) | Keeps a single save/version/undo path and one command bus; a piece is edited once and every instance follows. Costs a schema break and a new transform surface.                                                                                                                                                                          | **Recommended**                               |
| B   | **Shared space, tabs only switch focus**                                                                                     | No schema change; the tab bar and active-piece isolation ship alone. But two assemblies cannot lay the same piece out differently, mirrored pairs need duplicate pieces, and export still depends on accidental coordinates.                                                                                                            | Rejected — it cannot express D2 or D7       |
| C   | **Assembly owns a deep copy of each piece**                                                                    | A layout is self-contained and pieces can differ per assembly. But a fix to a piece does not reach its copies; the user must re-place it, and undo/versioning doubles the geometry.                                                                                                                                                   | Rejected — violates "edit a piece, update every instance" |
| D   | **One implicit assembly per pattern**                                                                          | Cheapest instance model; no assembly list, no tabs for assemblies. But "new assembly" is an explicit part of the requested tab bar, and a second layout becomes a schema change later.                                                                                                                                                | Rejected — narrower than the request          |

### Shape

- **Model.** `Piece` keeps its geometry, loop and allowances and gains optional
  `notes`, `fabric`, `color` and `defaults.allowance`. `Assembly` is a named list
  of instances. `TabRef[]` fixes the tab order. Schema becomes
  `sewcraft.pattern/0.4`; 0.3 is refused (D6).
- **Coordinates.** A piece's stored coordinates are its own: nothing outside the
  piece reads their absolute values. The piece tab fits the piece's bounds, and an
  assembly anchors each instance on the piece's **derived finished-loop centre**
  (the stitch loop when it resolves, otherwise its owned points). An anchor avoids
  storing an origin that could go stale, and using the finished loop rather than
  the cut loop keeps an instance in place when an allowance changes.
- **Commands.** New `create_assembly`, `update_assembly`, `delete_assembly`,
  `add_instance`, `remove_instance`, `update_instance`, `reorder_tabs` and
  `set_piece_default_allowance`; `update_piece` gains the new parameters;
  `create_piece` loses its deprecated loop arguments and gains `color`/`defaults`;
  `delete_piece` cascades instances; `move_piece` retires.
- **Editor.** The store holds an ephemeral active tab (persisted per pattern in
  `localStorage` as a view preference) and derives `activePieceId` from it. The
  canvas receives a document filtered to the active piece, so the cross-piece
  rejection path is deleted rather than kept. The assembly tab is a separate
  canvas component that renders derived loops transformed by the instance.
- **Export.** `toSvgPiece(document, piece, options)` replaces `toSvg(document,
options)`: one piece, its cut/stitch/fold layers and metadata, a viewBox from its
  own cut bounds. The legacy no-pieces branch and document-wide seam layer are
  removed with it.

## 📝 Architecture

```mermaid
flowchart LR
  Doc[PatternDocument 0.4] --> Pieces[Piece[]]
  Doc --> Assemblies[Assembly[]]
  Doc --> Tabs[TabRef[]]
  Assemblies --> Inst[AssemblyInstance]
  Inst -->|piece id| Pieces
  Cmd[Command core] --> Doc
  Store[editor store: active tab] --> PieceView[Piece canvas<br/>documentForPiece]
  Store --> AssembliesView[Assembly canvas<br/>instancePlacement]
  PieceView --> Cmd
  AssembliesView --> Cmd
  Export[toSvgPiece] --> Pieces
```

Existing components stay where they are; new modules are labelled by their role:

- `packages/geometry/src/assembly.ts` — pure placement math:
  `pieceAnchor`, `instancePlacement` (returns the transform or the transformed
  points), `instanceLoops`, `assemblyBounds`. No Vue, DOM or network. The anchor
  is the finished (stitch) loop's bounds centre, so allowance edits never move an
  instance.
- `packages/geometry/src/document.ts` — `documentForPiece` returns a valid
  document containing only the active piece's entities, constraints and corner
  rounds (with empty `assemblies`/`tabs`), so the piece canvas never sees another
  piece. A kept round brings its derived arc, controls, centre, tangents and
  anchors with it, so the piece loop and its cut line still resolve inside the
  slice; `documentForAssembly` keeps the pieces an assembly references;
  `pieceBounds` (stitch bounds with an owned-points fallback) is shared by the
  piece tab fit and the anchor.
- `packages/geometry/src/types.ts`, `migration.ts` — schema 0.4 and tab
  reconciliation.
- `packages/geometry/src/commands.ts` — the command cases and their validation.
  Each mutation keeps tab bookkeeping atomic inside the command.
- `frontend/src/stores/editor.ts` — `activeTab` + `setActiveTab`; `activePieceId`
  becomes a computed; `load`, `undo` and `redo` reconcile the active tab against
  the document.
- `frontend/src/lib/tabs.ts` — pure helpers: tab labels (with fallbacks), next
  palette colour, reconciling a missing/duplicate tab, the persisted-tab key.
- `frontend/src/components/EditorTabs.vue` — the bottom bar, `+` menu, drag
  reorder, keyboard.
- `frontend/src/components/AssemblyCanvas.vue` — instance rendering, selection,
  drag, nudge, delete, Add piece picker, fit. The picker is fed the pattern's
  full piece list through `pieces` (the canvas document is the assembly slice and
  only holds placed pieces); a drag previews only the pressed instance. The view
  fits on mount, on an assembly/tab change and on Fit — never on an instance
  edit — and the wheel zooms around the pointer while the middle button pans.
  The canvas display menu drives six layer props: cut shapes, allowances, stitch
  lines, fold lines, notches and piece labels.
- `frontend/src/components/AssemblyPanel.vue` — assembly name, instance transform
  fields, selected piece parameters and the "Open piece tab" action.
- `frontend/src/components/PiecePanel.vue` — the active piece's parameters; the
  per-edge allowance editor is unchanged.
- `EditorView.vue` — switches the canvas, ribbon and sidebar by tab kind and owns
  the tab actions; `PatternCanvas.vue` drops the cross-piece path and `move_piece`
  wiring.
- `frontend/src/lib/editor-ribbon.ts` / `EditorRibbon.vue` — a second, minimal
  ribbon for assembly tabs.

Backend: no code, migration or API change. `patterns.geometry` is opaque JSON, so
the 0.4 shape travels as-is; `PatternPersistence`, autosave and versioning are
untouched.

## 📝 Data Model

```ts
export const PATTERN_SCHEMA = 'sewcraft.pattern/0.4';

interface Piece {
  id: EntityId;
  name?: string;
  edges: EntityId[];
  allowances: Allowance[];
  quantity?: number;
  /** Free text, trimmed, max 500 characters; absent or empty means none. */
  notes?: string;
  /** Trimmed, max 120 characters; absent or empty means none. */
  fabric?: string;
  /** `#rrggbb`; absent means the neutral fallback. */
  color?: string;
  /**
   * Per-piece overrides. Absent means inherit the document default; an explicit
   * `{ allowance: null }` means this piece starts with no allowance.
   */
  defaults?: { allowance: AllowancePreset | null };
}

interface Assembly {
  id: EntityId;
  /** Required, trimmed, 1–80 characters; defaults to "Assembly N" on creation. */
  name: string;
  instances: AssemblyInstance[];
}

interface AssemblyInstance {
  id: EntityId;
  /** The piece it places. Must exist in the same document. */
  piece: EntityId;
  /** Assembly-space position of the piece's derived anchor, in millimetres. */
  x: number;
  y: number;
  /** Radians, SVG convention (positive turns clockwise on screen); omitted means 0. */
  rotation?: number;
  /** Horizontal flip about the anchor's vertical axis; omitted means false. */
  mirrored?: boolean;
}

interface TabRef {
  kind: 'piece' | 'assembly';
  id: EntityId;
}

interface PatternDocument {
  schema: 'sewcraft.pattern/0.4';
  units: 'mm';
  entities: Entity[];
  constraints: Constraint[];
  pieces: Piece[];
  assemblies: Assembly[];
  /** Authoritative tab order: every piece and assembly exactly once. */
  tabs: TabRef[];
  defaults?: PatternDefaults;
  cornerRounds?: CornerRound[];
  // The deprecated legacy `seams` field is untouched by this change.
}
```

`defaults` resolves as: `piece.defaults.allowance` when present (including `null`),
otherwise `document.defaults.allowance`, otherwise the built-in 10 mm seam preset.
`create_piece` and `set_piece_loop` copy that effective preset onto new loop edges;
changing either default never rewrites an existing piece's `allowances` (D5).

`color` is a stored choice, not a theme token: the UI offers six palette colours
and assigns the next one on creation, so every tab has a dot and every instance a
fill. A colour is validated as exactly `#` plus six lowercase hex digits; the
schema keeps it optional so a hand-written document without one still loads.

`tabs` is normalised on load (one-way, idempotent): duplicate refs and refs to
missing objects are dropped, and every piece and assembly missing from the order is
appended in `pieces`-then-`assemblies` order. A stored 0.4 document therefore
never fails to open because of a stale tab. A hand-edited 0.4 document may
omit `assemblies`; it normalises to `[]`.

**Anchor and transform.** `pieceAnchor(document, piece)` is the centre of the
stitch-loop bounds when the loop resolves, otherwise the centre of the bounds of
the piece's own points, otherwise `null`. The placement of an instance maps a piece
point `p` as:

```
p' = (x, y) + rotate(rotation) · (mirrored ? (-(p.x - a.x), p.y - a.y) : (p - a))
```

where `a` is the anchor and mirror happens before rotation, about the anchor's
vertical axis. Rotation uses SVG's y-down convention. The transform is derived on
every read; nothing about a piece's position in an assembly is written back to its
geometry. An instance of a piece with no points renders a small dashed placeholder
at `(x, y)` and is still selectable and movable, so an empty piece can be placed
before it is drawn.

No migration from 0.3. `normalizeDocument` refuses any schema other than 0.4
through the existing `UnsupportedPatternSchemaError` path; `BACKWARD_COMPATIBILITY.md`
records the development-stage exemption (D6). Stored `pattern_versions` rows are
immutable and become unreadable; that is accepted because old projects are
recreated.

## 📝 API Contracts

Commands are the only mutation path. New commands use `command.id` as the id of
the object they create, matching `add_point` and `create_piece`.

| Command                        | Params                                                                         | Rules and undo                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_assembly`              | `{ name?: string }`                                                            | Creates an empty assembly with `id = command.id`, appends its tab. Inverse: `delete_assembly`.                                                                                      |
| `update_assembly`              | `{ id, name }`                                                                 | Trimmed, non-empty, ≤ 80 characters. Inverse carries the previous name.                                                                                                            |
| `delete_assembly`              | `{ id }`                                                                       | Removes the assembly and its tab. Instances die with it; pieces are untouched. Inverse needs the snapshot (no serialisable inverse).                                                |
| `add_instance`                 | `{ assembly, piece, x, y, rotation?, mirrored? }`                              | Assembly and piece must exist; finite coordinates; finite rotation. Instance id = `command.id`; appends to that assembly only. Inverse: `remove_instance`.                          |
| `remove_instance`              | `{ assembly, instance }`                                                       | Removes one instance; inverse restores it with the stored placement.                                                                                                                |
| `update_instance`              | `{ assembly, instance, x?, y?, rotation?, mirrored? }`                         | At least one field; finite numbers. Inverse carries the previous fields and is a single command for both drag and inspector edits.                                                  |
| `reorder_tabs`                 | `{ tabs: TabRef[] }`                                                           | Must be a permutation of the document's current refs: same length, no duplicates, every ref known. Inverse carries the previous order.                                              |
| `set_piece_default_allowance`  | `{ piece, mode: 'inherit' } \| { piece, mode: 'none' } \| { piece, mode: 'preset', width, kind? }` | Width finite and > 0 for `preset`. `inherit` removes `piece.defaults`; `none` stores `{ allowance: null }`. Inverse restores the previous override.                                  |
| `update_piece` (extended)      | `{ id, name?, quantity?, notes?, fabric?, color? }`                            | `notes` ≤ 500; `fabric` ≤ 120; `color` matches `#rrggbb` or is `null` to clear. Empty text clears.                                                                                  |
| `create_piece` (reshaped)      | `{ name?, quantity?, color?, defaults? }`                                      | The deprecated `edges`/`allowance` arguments are removed: a piece is always created empty and looped later. Appends a tab.                                                         |
| `delete_piece` (cascade)       | `{ id }`                                                                       | Also removes the piece's instances from every assembly and its tab, in the same command.                                                                                            |
| `move_piece` (retired)         | —                                                                              | Removed from the union and the command spec; arranging is the assembly's job.                                                                                                       |

`spec_version` bumps to **0.15.0**; `config/geometry.php`,
`docs/domain/command-spec.md` and `docs/domain/command-spec.json` change together,
and the command spec documents the removal of `create_piece`'s deprecated
arguments and `move_piece`. `docs/architecture/command-core.md` gains a short
"tab bookkeeping is atomic" note. No HTTP route or request shape changes.

Export contract: `toSvgPiece(document, piece, options)` in
`packages/geometry/src/export.ts`. It serialises the piece's cut, stitch, fold and
optional construction layers plus its `sewcraft:piece` metadata comment, with the
viewBox taken from the piece's cut bounds plus padding. `options.stitch` and
`options.fold` keep their meaning; `construction` renders the piece's construction
entities. The document-wide `toSvg`, the legacy no-pieces branch and the
`seamAllowance` option are removed, and `docs/architecture/export.md` is rewritten
around the piece contract. The package version bumps for the API change.

## 📝 UI/UX

The prototype is the reference for spacing, states and interaction; the sections
below pin the behaviour the screenshots cannot show.

**Tab bar.** A full-width bar along the bottom of the workspace, spanning the
canvas and the sidebar. A `+` button sits at the left, separated from a
horizontally scrolling tab list. Each piece tab shows an 8 px colour dot and the
piece name; each assembly tab shows the assembly glyph and its name; the active tab
gets the primary 2 px top edge and the background surface. Names fall back to
`Piece N` / `Assembly N` by creation index when empty. Tabs are real buttons with
`role="tab"`, `aria-selected`, a roving tabindex and Arrow/Home/End navigation;
Enter or Space activates. Activating a tab is view state only — it is never a
journal entry, and it cancels an armed constraint, corner-round or text gesture and
clears the selection.

**`+` menu.** A `menu` opening above the button: **New piece**, **New assembly**,
then a disabled **New drawing** with an `aria-disabled` button and a "Soon" chip.
New piece creates an empty piece with the next palette colour and switches to it;
New assembly creates an empty assembly and switches to it. In both cases the new
tab is scrolled into view and focused. The menu closes on Escape, on outside click
and after an action. In a read-only document both actions
are disabled.

**Piece tab.** The canvas shows only that piece, fitted on activation. The ribbon
is the existing sketch ribbon; the sidebar's Pieces drawer is replaced by a
**Piece** drawer containing the existing card (loop status, measurements, per-edge
allowances) plus name, quantity, default allowance, notes, fabric and colour. A
new **Pattern** drawer (collapsed by default) holds the document default allowance
that used to live in the Pieces list. The empty state for a new piece reads
"Empty piece — start with a line, a rectangle or a point." Switching tabs is the
only way to change the edited piece; the cross-piece error and the drawer's Move
mode are removed.

**Assembly tab.** A dedicated canvas renders every instance of that assembly: the
cut loop filled with the piece colour at low opacity, the allowance band slightly
stronger, the cut line in the foreground colour, the stitch/fold lines dashed and
the piece's V notches in the mark colour.
Only cut, stitch, fold, notches and the allowance band render — no construction,
annotation, text, dimension or handle geometry. A persistent muted label under
each instance
shows the piece name (`· mirrored` when flipped); the selected instance's label
turns primary and the instance gets a dashed selection box with corner handles.
Click selects; a plain drag moves the selected instance with a live preview and
commits one `update_instance` on release; arrow keys nudge by 1 mm (Shift: 10 mm)
coalesced into one journal entry; Delete removes the instance. **Add piece** opens
a picker of the pattern's pieces and places the chosen piece at the current view
centre, selected, with rotation 0 and mirror off. Empty assemblies show a centred
"Add a piece to start" state. Broken or empty pieces render their placeholder and
still move.

The assembly ribbon is intentionally minimal: Select, Add piece, Undo, Redo,
Delete, Fit, Mirror, Rotate 90° and a disabled Export (with the hint "Switch to a
piece to export"). Constraint and sketch tools are absent. The sidebar shows
**Selection** (the instance's X, Y, angle in degrees — converted from the stored
radians — and a mirror toggle, plus
**Open piece tab**), **Piece** (the selected piece's parameters — the same fields
as the piece drawer, so `notes`, `fabric`, `color` and the allowance default are
editable here) and **Assembly** (name and instance count). Editing a parameter
updates the piece and every instance of it. Selecting an instance whose piece was
deleted is impossible; the selection clears with the instance.

**Export.** The Export action serialises the active piece and is disabled on an
assembly tab and when the active piece's loop does not resolve. The filename stays
`pattern-<project id>.svg`; a future change can name the piece.

**Undo, save and read-only.** The journal stays document-wide. Dragging an
instance, nudging, reordering tabs and every parameter edit are undoable; switching
tabs is not. After undo/redo the store reconciles the active tab: if its object
disappeared, the tab at the same index (or the last one) becomes active and the
selection clears. The save bar, autosave and version conflict flow are unchanged.
A read-only (unsupported-schema) document shows whatever tabs its stored shape has
— usually none — and every mutating control, drag, menu action and reorder is
disabled.

**Narrow widths.** No new mobile layout: the existing collapsible sidebar keeps its
persisted state, and the tab bar scrolls horizontally. The prototype's narrow state
only demonstrates the scrolling tab bar.

## 📝 Edge Cases & Failure Scenarios

- **Deleting a placed piece.** The confirmation names the assemblies and instance
  count ("Front panel is placed 3 times in 2 assemblies. Remove it and its
  instances?"). Confirming dispatches one `delete_piece`; cancelling does nothing.
- **Undo after a delete.** The journal's `before` snapshot restores the piece, its
  instances and its tab; the store's active tab resolves to an existing tab. The
  selection stays empty rather than guessing a restored instance.
- **Undo removes the active tab.** Pick the tab at the same index, else the last,
  else no tab; the canvas shows the no-tabs empty state.
- **A tab whose object is missing.** Only reachable from a hand-edited document;
  normalisation fixes the order on load, and `reorder_tabs` rejects unknown ids.
- **An empty or broken piece in an assembly.** The instance renders a dashed
  placeholder at its anchor and remains selectable; the assembly's fit ignores its
  empty bounds.
- **A piece with one point.** The anchor is that point's coordinates, so rotation
  and mirror are stable.
- **Two instances of one piece.** Both update when the piece is edited; deleting
  one leaves the other. Deleting the piece removes both.
- **A piece in several assemblies.** Each assembly keeps its own instance records;
  nothing is copied.
- **Editing a piece's loop while an assembly is open.** Re-enter the assembly via
  its tab; derived loops are recomputed on read, so there is no stale cache.
- **Empty pattern.** No pieces and no assemblies: the canvas shows "Create a piece
  to start" with a New piece action, the tab bar shows only `+`, export is
  disabled.
- **Read-only document.** Existing tabs (if any) switch, but `+`, reorder, drags
  and inspector fields are disabled; no command is dispatched.
- **A drag interrupted by Escape.** The preview clears and no `update_instance` is
  dispatched; the instance stays where it was.
- **Changing a per-piece allowance default.** Existing edges keep their allowance
  values; only edges added to the loop afterwards inherit the new preset.
- **Removing a piece that owns the selected dimension/entity.** The existing
  cascade runs unchanged; the assembly inspector's selection clears if its
  instance vanished.

## 📝 Risks & Impact Review

- **Stored schema is a hard break (`risk-high` for the implementation).** 0.4
  refuses 0.3, so every stored project becomes unreadable and stored versions
  cannot be restored by this build. Accepted by the sole maintainer (D6); recorded
  in `BACKWARD_COMPATIBILITY.md`. There is no rollback short of keeping an older
  build.
- **Export contract.** `toSvg` disappears from the package's public API, and the
  all-pieces SVG is no longer produced. Any consumer that expected a sheet of every
  piece must move to `toSvgPiece` per piece. `docs/architecture/export.md` is the
  authority and must change in the same PR.
- **Command surface.** Eight new commands, one removed and one reshaped, with a
  `spec_version` bump and a three-way doc sync. Missing the sync is a review
  blocker per `CODE_REVIEW.md`.
- **Transform convention.** Anchor, mirror-before-rotate and rotation direction are
  contract-level geometry decisions; they must be documented in
  `docs/architecture/geometry-core.md` and covered by tests with asymmetric
  fixtures so a later change cannot silently flip a piece. Changing the convention
  after this ships means rewriting every stored instance.
- **Tab order in the document.** Presentation state in the pattern document is
  unusual, but D9 requires it to persist and be undoable. The cost is that
  reordering enters the journal and every save carries the order; the benefit is
  that it travels with the file and is testable.
- **Coverage and surface area.** The change adds a large UI surface (tab bar, menu,
  assembly canvas, inspector) against a 100 % gate. Phasing below keeps each phase
  testable and reviewable on its own.
- **No cross-piece geometry.** The assembly cannot express seams between pieces or
  measurements across them (D3). The drawing workflow and cross-piece constraints
  are separate specs; the instance model leaves room for them but does not build
  them.

## 📋 Phasing

- **Phase 1 — Tabs, piece isolation and per-piece parameters.** Schema 0.4,
  `tabs`, `assemblies: []`, the tab bar and `+` menu with New assembly disabled,
  active-piece-only canvas, the Piece/Pattern drawers, per-piece parameters and
  active-piece export. This ships the tab experience without assemblies and keeps
  the app fully usable.
- **Phase 2 — Assemblies.** Assembly and instance commands, placement math, the
  assembly canvas, selection and drag, the Add piece picker, the assembly
  inspector and the assembly ribbon. New assembly becomes enabled.
- **Phase 3 — Order, undo and polish.** Drag/keyboard tab reordering and its
  command, active-tab reconciliation across undo, read-only and empty states,
  delete cascade confirmation, accessibility, docs and the full gate.

Each phase leaves the app working and is independently reviewable; the schema is
final in Phase 1 so Phases 2–3 add no second break.

## 📋 Implementation Plan

### Phase 1 — Tabs, piece isolation and per-piece parameters

1. **Schema and normalisation.** In `types.ts` add `assemblies`, `tabs`,
  `Assembly`, `AssemblyInstance`, `TabRef`, the new `Piece` fields and
  `PATTERN_SCHEMA = 0.4`; update `normalizeDocument` to reconcile tabs and default
  `assemblies`. Unit-test unknown schemas, missing/stale/duplicate tabs and
  missing attachments.
2. **Piece commands.** Reshape `create_piece`, extend `update_piece`, add
  `set_piece_default_allowance`, append/remove tabs in `create_piece`/
  `delete_piece` and resolve the per-piece default in `set_piece_loop`. Test every
  validation branch and the effective-default precedence.
3. **Tab commands and order.** Add `reorder_tabs` with permutation validation,
  inverse and tests. Update `config/geometry.php` to `spec_version 0.15.0`,
  `docs/domain/command-spec.md`, `docs/domain/command-spec.json` and
  `docs/architecture/command-core.md` in the same step.
4. **Pure tab helpers.** Add `frontend/src/lib/tabs.ts` (label fallbacks, palette
  selection, tab reconciliation, persisted-key helper) with unit tests; no Vue.
5. **Store and load.** Replace `activePieceId` with `activeTab` + computed
  `activePieceId`, add `setActiveTab`, restore the per-pattern tab in `load`, and
  reconcile after `undo`/`redo`. Test load fallbacks, an empty document and a
  disappearing tab.
6. **Tab bar.** Build `EditorTabs.vue` with the `+` menu (New assembly disabled
  until Phase 2), active state, scrolling and accessible semantics; wire rename,
  delete and focus. `EditorTabs` renders only the stored order; reordering arrives
  in Phase 3. Component tests for the three menu items, the disabled drawing item,
  keyboard activation and the empty bar.
7. **Active-piece canvas.** Add `documentForPiece` (geometry) — entities,
  constraints, corner rounds and pieces filtered to the active piece, with empty
  `assemblies`/`tabs` — and pass its result to `PatternCanvas`; fit on tab
  activation. Delete the `onCrossPiece` error,
  cross-piece hit-testing and the `move_piece`/Move-mode wiring from
  `EditorView.vue`, `PiecePanel.vue` and `PatternCanvas.vue`; update their tests.
  The ribbon's New piece action moves into the `+` menu and `create_piece` is
  removed from the ribbon.
8. **Piece and Pattern drawers.** Turn the Pieces drawer into the active piece's
  inspector and add the new fields plus a collapsed Pattern drawer holding the
  document default. Test each field's command payload, invalid values snapping
  back, and read-only disabling.
9. **Active-piece export.** Replace `toSvg` with `toSvgPiece`, update the canvas
  download, disable export for a missing loop and on assembly tabs, and rewrite
  `docs/architecture/export.md`. Test layers, options, bounds, broken loops and
  the removed legacy path.

### Phase 2 — Assemblies

10. **Assembly and instance commands.** Add the six assembly/instance commands
  (`create_assembly`, `update_assembly`, `delete_assembly`, `add_instance`,
  `remove_instance`, `update_instance`) with validation, inverses, tab bookkeeping
  and `delete_piece` cascading;
  update the command spec three-way sync for the additions. Test every rejection
  (unknown assembly/piece, non-finite coordinates, empty patch, duplicate id) and
  the cascade.
11. **Placement math.** Add `assembly.ts` with `pieceAnchor`, the transform,
  transformed loops and `assemblyBounds`, plus `pieceBounds` in `document.ts`.
  Test stitch-loop and fallback anchors, mirror-before-rotate with asymmetric
  point fixtures, radians, empty pieces and bounds.
12. **Assembly canvas.** Build `AssemblyCanvas.vue` (instance rendering, colour
  fill, labels, selection, drag preview/commit, nudge, delete, fit, Add piece
  picker, empty/broken placeholders) and `documentForAssembly`. Component tests
  for each state and interaction.
13. **Assembly inspector and ribbon.** Build `AssemblyPanel.vue` (transform fields,
  mirror toggle, open-piece action, piece parameter reuse, assembly name/count) and
  the assembly ribbon group; enable New assembly in the menu and the disabled
  export. Test edits reaching the right command and the tab switch.
14. **Docs and compatibility.** Update `docs/architecture/data-model.md`,
  `geometry-core.md`, `export.md`, `docs/domain/glossary.md` and
  `BACKWARD_COMPATIBILITY.md` (0.4 exemption); bump the geometry package version.
  Verify no existing consumer references `document.pieces[0]` as "the piece".

### Phase 3 — Order, undo and polish

15. **Reorder and persistence.** Implement drag reorder in `EditorTabs.vue` as one
  `reorder_tabs` dispatch on drop, Alt+Shift+Left/Right for the keyboard, and
  persist/reconcile the active tab across reloads. Test a full permutation, a
  rejected stale ref and undo restoring the previous order.
16. **Reconciliation and states.** Cover undo deleting the active tab, undo
  restoring a deleted piece's instances, Escape cancelling a drag, read-only
  behaviour, the no-tabs empty state and the delete confirmation. Add the
  component tests the edge-case list implies.
17. **Gate and review.** Run `npm run format`, `typecheck`, `lint`, `format:check`,
  `npm run test:coverage` (100 %), `npm run build` and the backend Pest/coverage
  commands; capture screenshots of both tabs for the PR; request a fresh-context
  scope review against this spec.

## ✅ Acceptance criteria

- [ ] The workspace has a bottom tab bar with a `+` menu: every piece and assembly
      has a tab, tabs scroll, drag reorder persists in the document, and reordering
      is undoable.
- [ ] The `+` menu creates a new piece and a new assembly and switches to it; New
      drawing is visible, labelled as coming soon and disabled.
- [ ] A piece tab renders only that piece, fitted, with the full sketch ribbon and
      the active piece's inspector; the cross-piece "switch to the owning piece"
      error and the Move mode no longer exist.
- [ ] Per-piece name, quantity, default allowance, notes, fabric and colour are
      editable in the piece inspector and stored in the document; an allowance
      default applies to future loop edges and never rewrites existing allowances.
- [ ] An assembly tab places instances, supports add/remove, drag, arrow nudge,
      rotate and mirror, and shows the piece colour, allowance band and stitch and
      fold lines; no sketch tools are available there.
- [ ] Editing an instance's piece parameters updates every instance of that piece;
      editing the piece's geometry updates every instance on return to the
      assembly.
- [ ] Deleting a placed piece warns, then removes its instances and tab in one
      command; undo restores all of them.
- [ ] Export downloads only the active piece, is disabled on an assembly tab and
      for a piece without a resolvable loop, and the SVG viewBox is the piece's cut
      bounds.
- [ ] Schema `sewcraft.pattern/0.4` is the only accepted document; 0.3 documents
      show the unsupported-format dialog; `BACKWARD_COMPATIBILITY.md` records the
      break.
- [ ] `config/geometry.php` and both command-spec files are in sync at
      `spec_version 0.15.0`, documenting the eight additions, the reshaped
      `create_piece`, the extended `update_piece` and the retired `move_piece`.
- [ ] `docs/architecture/data-model.md`, `geometry-core.md`, `export.md` and
      `command-core.md` describe the 0.4 shape, the anchor/transform convention and
      the piece export.
- [ ] `npm run format`, `typecheck`, `lint`, `format:check`, `test:coverage`,
      `build` and the backend Pest/coverage commands pass, with statements,
      branches, functions and lines at 100 %.

## Out of scope

- The **drawing** workflow (technical sheets, tables, title blocks, packing). The
  `+` menu only reserves its place; nothing is added to the schema or the type
  union.
- Cross-piece geometry, constraints, seam measurement and assembly-level
  annotations (D3).
- Exporting an assembly or a sheet of pieces; export stays per piece (D12).
- Nested assemblies, sub-assemblies, assembly-level quantities or bills of
  materials.
- Duplicating a piece as a new piece, pattern grading, and multiple fabrics per
  piece.
- A mobile redesign; the existing collapsible sidebar and scrolling tab bar are the
  whole narrow-width story.

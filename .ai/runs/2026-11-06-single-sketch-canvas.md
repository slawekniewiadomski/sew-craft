# Single sketch canvas for multiple independent pieces

Source doc: `.ai/specs/briefs/2026-11-06-single-sketch-canvas.md`

## Goal

One Sketch view shows every piece at once, at a stored per-piece position, with an
explicit editing target, so a maker can draw on piece B while piece A is on screen.
Pieces keep independent geometry and independent coordinates; named variables stay
the only cross-piece arithmetic channel. Piece tabs and assemblies are untouched.

## Scope

- `Piece.placement` in the pattern document, a `place_piece` command, schema `0.8`.
- `documentForSketch` producing the shared-space view by translating each piece's
  points at render time; entity coordinates stay piece-local and are never baked.
- Sketch view alongside the existing tab bar: target picker, click-to-retarget,
  Arrange mode for moving whole pieces.
- No changes to assemblies, export, tabs model, or constraint scope.

## Non-goals

- Cross-piece constraints, dimensions or measured chains.
- Removing piece or assembly tabs; changing assembly behaviour.
- Editing geometry while Arrange mode is on; moving geometry moves a piece.
- Auto-layout as a mode; only the one-time legacy migration assigns positions.
- Any change to export beyond acting on the target piece.

## Resolved unknowns (from the brief)

| Question | Answer |
| --- | --- |
| Need | Edit several pieces at once, not reference-only. |
| Placement | Persistent, per piece, in the pattern document, undoable, full save history. |
| Geometry vs placement | Entity coordinates stay piece-local; placement is a render/hit-test offset only. |
| Whole-piece move | Only in Arrange mode; new command `place_piece`. |
| Target | Explicit picker in the sketch toolbar; clicking a piece retargets it. |
| Cross-piece math | Variables only; pieces solve independently. |
| Selection | Stays within one piece. |
| Tabs | Kept; sketch is a view alongside them. |

## Implementation Plan

### Phase 1: Geometry model, placement and the shared-space view

1.1 Add `Piece.placement`, the `place_piece` command (validation, no-op, inverse),
    and the `0.8` schema with `0.7` accepted; export through `index.ts`.
1.2 Add `documentForSketch` plus placement helpers that translate each piece's
    points by its placement at read time, and auto-place a new piece to the right
    of the existing bounds.
1.3 Migrate legacy documents: assign deterministic packed placements on load so
    existing projects do not open with every piece stacked at the origin.

### Phase 2: Editor sketch view

2.1 Editor store: sketch view state, sketch target piece, effective active piece,
    persistence and reconciliation when a piece disappears.
2.2 Editor view: render the sketch document, localise coordinate-bearing commands
    (`add_point`, `move_point`) back into the target piece's space.
2.3 Sketch entry in the tab bar, target picker in the sketch toolbar, Arrange mode
    toggle.
2.4 Retarget on click and on a cross-piece drafting attempt; Arrange drag emits
    `place_piece` through the existing `moveMode` / `move-piece` canvas path.

### Phase 3: Docs and verification

3.1 Update `docs/architecture/data-model.md`, `docs/domain/command-spec.md`,
    `docs/domain/command-spec.json`, and `config/geometry.php` for `place_piece`.
3.2 Full validation gate, coverage top-up, and a final diff review.

## Risks

- Translation at render time touches hit-testing, snapping and every overlay; a
  missed consumer would show a piece in the wrong place or write a wrong coordinate.
- `moveMode` was dormant; the canvas path is untested in the current editor.
- Legacy projects have no placement, so the migration must be deterministic and
  must not rewrite coordinates.
- True-scale pieces of very different size were never validated; piece tabs stay as
  the escape hatch.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Geometry model, placement and the shared-space view

- [ ] 1.1 Add `Piece.placement`, `place_piece` command and schema 0.8
- [ ] 1.2 Add `documentForSketch`, placement helpers and new-piece auto-placement
- [ ] 1.3 Migrate legacy documents with packed placements

### Phase 2: Editor sketch view

- [ ] 2.1 Editor store sketch view state and effective target piece
- [ ] 2.2 Editor view sketch document and command localisation
- [ ] 2.3 Sketch entry, target picker and Arrange mode UI
- [ ] 2.4 Click retargeting and Arrange drag wiring

### Phase 3: Docs and verification

- [ ] 3.1 Update data model and command spec docs
- [ ] 3.2 Full validation gate and coverage top-up

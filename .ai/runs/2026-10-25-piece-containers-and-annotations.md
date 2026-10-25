# Execution plan — piece containers, annotation geometry and annotation text

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-25 from
PR #88's spec (`.ai/specs/2026-10-25-piece-containers-and-annotations.md`).
**PR:** #88 · **Branch:** `spec/piece-containers-and-annotations` · **Base:** `develop`
**Operator brief:** implement the spec on this same branch; do not open a second
PR; never merge. The spec is the plan of record — this file only tracks progress.

## 🎯 Goal

A piece becomes the container for its geometry: every entity and constraint
names its piece, geometry carries a cut/construction/annotation role, a piece can
be created empty and captures its cut loop automatically when one closes, and a
new text entity labels a pattern with alignment, rotation, size and an optional
leader. Schema `sewcraft.pattern/0.3`; export is deliberately unchanged.

## Scope

- `packages/geometry`: roles, text layout, ownership and same-piece validation,
  loop lifecycle (`set_piece_loop`), `move_piece`, `set_role`, text CRUD,
  cascade deletes, 0.3-only migration, selection and export adaptation.
- `frontend`: `activePieceId`, piece-scoped tool commands, text tool, automatic
  loop capture, cross-piece guard, role/annotation/text canvas layers, move mode,
  arrow-key nudging, piece card and properties-panel editors.
- `config/geometry.php`, `docs/domain/*`, `docs/architecture/*`,
  `BACKWARD_COMPATIBILITY.md`, `AGENTS.md`, spec status.

## Non-goals

- Export of annotations or text (D11) — the SVG contract stays as-is.
- Holes, multiple loops, cross-piece references (D1, D9).
- A bundled IBM Plex Mono file; the token falls back to platform monospace.

## Assumptions

- `spec-ready` on PR #88 is the maintainer's approval of D1–D15.
- The implementation ships on this branch, per the operator brief and
  `AGENTS.md`'s one-combined-PR feature route.
- Deprecated document fields (`construction`, `seams`) stay readable for one
  release so stored 0.3-era fixtures and older clients fail softly; new commands
  only write `role`/`piece`, and the 0.2 migration is removed.

## Risks

- **Schema break.** 0.2 documents are refused with a typed error and the
  unsupported-format dialog; recorded as a development-stage exemption.
- **Sweeping test churn.** A shared owner helper keeps geometry fixtures small;
  the full gate is run after every phase.
- **Auto-capture surprise.** Capture only when exactly one simple closed chain
  exists; Clear and Set remain available.
- **Coverage.** Every new branch gets a test; no thresholds are lowered.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Document model

- [x] 1.1 Schema 0.3 types: role, ownership, text entity, constraint piece, legacy deprecations
- [x] 1.2 `roles.ts` helpers and their tests
- [x] 1.3 `text.ts` layout/leader helpers and their tests
- [x] 1.4 Adapt document, piece, selection, export and offset to roles and text
- [x] 1.5 0.3-only migration with a typed unsupported-schema error
- [x] 1.6 Command surface: piece/role params, same-piece validation, text commands, legacy aliases
- [x] 1.7 Geometry fixtures and tests updated; package exports verified

### Phase 2: Piece lifecycle commands

- [x] 2.1 `create_piece` empty and `set_piece_loop` with allowance preset
- [x] 2.2 `delete_entity` loop repair and `delete_piece` cascade
- [x] 2.3 `move_piece` and `set_role`
- [x] 2.4 `add_text` / `update_text` validation and inverses

### Phase 3: Data layer

- [x] 3.1 `activePieceId` in the editor store
- [x] 3.2 Tool builders pass the active piece; missing-piece guard
- [x] 3.3 Text tool and automatic loop capture
- [x] 3.4 Cross-piece pick and snap guard

### Phase 4: Canvas

- [x] 4.1 Role styling, annotation and text layers with test ids
- [x] 4.2 Move mode preview, arrow-key nudging and coalescing

### Phase 5: Panels and ribbon

- [x] 5.1 Piece card: incomplete/broken loop, Set/Clear, Move toggle, active highlight
- [x] 5.2 Ribbon: New piece and Text tool
- [x] 5.3 Properties panel: role select and text editor
- [x] 5.4 Unsupported-schema dialog copy

### Phase 6: Consolidation

- [x] 6.1 Command spec trio at 0.13.0 and the migration section
- [x] 6.2 Glossary, architecture docs, compatibility exemption and AGENTS update
- [x] 6.3 Full validation gate and authoritative review pass

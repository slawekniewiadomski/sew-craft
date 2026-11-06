# Single sketch canvas for multiple independent pieces

- Date: 2026-11-06
- Category: feature
- Priority signal: medium — no observed cost today, but it changes the core editing surface; driven by direction, not an incident.
- Risk signal: high — canvas coordinate model, per-piece placement in the pattern document, schema bump, and 100 % coverage across geometry, frontend and backend.
- Routing: Next: om-auto-write-spec "Single sketch canvas where multiple independent pieces are visible and editable together — brief: .ai/specs/briefs/2026-11-06-single-sketch-canvas.md"

## Problem

Pieces are edited one at a time: each piece tab shows only that piece, fitted. Cross-piece reasoning therefore happens from memory, even though the numbers already cross pieces — document variables (including measured variables bound to a chain of edges on one piece) are shared, and a dimension on piece B can be driven by a measurement taken on piece A. The maker drafting a multi-panel garment wants to draw on B while A is on screen, at the same zoom and in one spatial arrangement, without sharing geometry between the pieces.

Evidence is a stated preference, not a recorded task failure: the maintainer's 2026-10-25 exploration chose per-piece tabs and explicitly retired the single-canvas editing model. This brief does **not** reverse that for piece tabs (D3, D4, D12 stand); it adds a shared spatial view alongside them. Record that framing in the spec so a later reader does not treat it as churn.

## Agreed direction

Add one **Sketch** canvas that shows every piece at once, editable, with an explicit editing target. Pieces keep their own coordinate space and independent geometry; nothing is copied or shared. Placement is per-piece document data. Piece tabs and assembly tabs remain, so navigation to a small or off-screen piece and the assembly panel's "Open piece tab" path keep working. Assemblies are untouched.

Rejected: raw drawing coordinates only (overlap is unresolvable); view-only auto layout (arrangement would not survive a reload); per-piece fitted panes side by side (does not allow drawing on both in one space); ghost overlay of other pieces (view-only, same limitation); last-clicked targeting without an explicit control; snap-inherited ownership; any cross-piece constraint or dimension references; removing piece tabs in this change.

## Resolved unknowns

| Question | Answer (from the conversation) |
| -------- | ------------------------------ |
| What is the need? | Editing several pieces at once, not just seeing others for reference. |
| Where does a piece sit on the shared canvas? | A persistent per-piece position, dragged to arrange, stored in the pattern document and undoable. |
| Where is placement stored? | The pattern document as normal document data, with full save history; autosave pruning keeps versions bounded. Arrange nudges dirtying the pattern is accepted. |
| Does placing a piece move its geometry? | No. Entity coordinates stay piece-local; placement is a render/hit-test transform applied on top and is never baked into coordinates. Moving geometry never changes placement. |
| How is a whole piece moved? | An Arrange mode toggle; outside it, drags edit geometry. Arrange is the only way to move a piece. |
| Which piece receives new geometry? | An explicit target picker in the ribbon. Clicking a piece's geometry also retargets it, and the picker highlight follows. Piece-level tools (loop, allowance, marks, export) act on the target. |
| Can constraints cross pieces? | No. Constraints, dimensions and measured chains stay within one piece; pieces solve independently. Named variables are the only cross-piece arithmetic channel. |
| What does selection do across pieces? | Selection stays within one piece: a marquee or shift-click started in piece A stays in A. |
| Do piece tabs go away? | No. The Sketch canvas is added alongside piece tabs and assemblies; assemblies are deferred and unchanged. |
| What about very different piece sizes? | Untested. Because piece tabs stay, "open the piece tab" remains the escape hatch; the spec must still make the target piece easy to find (zoom-to-target) and should validate the true-scale assumption before committing. |
| How do existing documents open? | Not a user decision: pieces without placement get an assigned position (packed) on first read, persisted on the next save. The spec settles the migration and the schema version bump. |

## Non-goals

- No cross-piece geometry sharing, constraints, dimensions or measured chains.
- No changes to assemblies, instances, quantity, mirroring or assembly export.
- No removal of piece tabs or assembly tabs.
- No auto-layout mode; arrangement is manual and persistent.
- No change to export behaviour beyond acting on the target piece.
- No multi-piece math tooling; a multi-piece selection is not a feature.
- No moving geometry in Arrange mode, and no baking placement into coordinates.

## Affected areas (if known)

- `packages/geometry/src/types.ts` — `Piece` gains a placement; pattern schema version bump (currently `sewcraft.pattern/0.7`).
- `packages/geometry/src/commands.ts` — a placement command (undoable), cross-piece guards unchanged.
- `frontend/src/views/EditorView.vue` — Sketch tab, target picker, Arrange mode, per-piece rendering instead of `documentForPiece`.
- `frontend/src/components/PatternCanvas.vue` — many pieces in one view, placement transform for render and hit-testing, target gating; dead `moveMode` / `cross-piece` props can be retired.
- `frontend/src/lib/tabs.ts`, `EditorTabs.vue`, `EditorRibbon.vue`, `frontend/src/stores/editor.ts` — tab kind, active target, arrange state.
- `docs/architecture/data-model.md`, `docs/domain/command-spec.md`, `docs/architecture/command-core.md` — placement field and command.

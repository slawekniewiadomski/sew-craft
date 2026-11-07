# Split `EditorView` by domain

Status: **in progress** — phase 1 landed with the spec (#133), phase 2 follows.
Refs #132

## 📝 TLDR

`frontend/src/views/EditorView.vue` is 2,745 lines and owns every editor
concern: project loading and saving, autosave, settings, measured variables,
assembly instances, sketch commands, dimensions, constraints, keyboard shortcuts
and the whole page template. The component is correct and well tested, but it is
the one file a new contributor must read end to end. This spec moves cohesive
domains into `frontend/src/composables/` in phases, leaving the view as wiring:
state that the template binds, and delegation to the domain composables. No
behaviour, command, API or schema changes.

## 📝 Problem Statement

- **Who needs it:** the maintainer adding an editor feature. Every session starts
  by scrolling a 2,745-line file and untangling which `ref` belongs to which
  domain.
- **What happens today:** one `script setup` holds ~120 declarations and ~90
  functions. The persistence block alone is ~290 lines (`loadProject`,
  `applySnapshot`, `persist`, `save`, conflicts, upgrade, unload guards); the
  measured-variable block is ~250; sketch commands are ~300.
- **Evidence it matters:** the previous refactors (#126, #129, #130, #131, #132)
  repeatedly extracted components and shared pickers, but the view's script kept
  growing. Line count by area is in the phases below.
- **Constraints:** behaviour and the existing `EditorView.*` suites stay
  unchanged; every new composable keeps the 100 % coverage gate; the command
  layer stays the only mutation path.

## 📝 Proposed Solution

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **Domain composables, view stays as wiring** | Each domain owns its refs and handlers behind one `use*` call; the view keeps the template props/emits. Small, testable, behaviour-preserving steps. Cost: a composable boundary must pass the store and a few shared refs in. | **Recommended** |
| B | **Region components (`EditorWorkspace`, `EditorInspector`, `EditorOverlays`)** | Groups the template, but most of the 2,745 lines are script; switching to a component would thread ~40 props and ~40 emits and still leave the logic in the view. | Deferred — worth doing after the script is split |
| C | **Global store for editor UI state** | Removes prop drilling, but introduces a second state store beside the command journal, which AGENTS.md forbids. | Rejected |
| D | Leave it | No risk now, compounding cost on every editor feature. | Rejected |

### Phases

Each phase is one commit and one reviewable unit. Phases run in order; later
ones assume the earlier boundaries exist.

1. **Project session & persistence** → `composables/use-project-session.ts` (landed)
   (~290 lines). `loadState`, `loadError`, `project`, settings open/saving/error,
   `pendingUpgrade`, `conflict`, `dialogOpen`, `saveBarState`, the autosave
   scheduler, `loadProject`, `applySnapshot`, `persist`, `save`, conflict and
   upgrade actions, and the unload/visibility/route guards.
2. **Measured variables & editing** → `composables/use-measured-edit.ts` (this PR)
   (~250 lines). Highlight, selection chain, start/end/cancel, edge toggling and
   the measured chips.
3. **Constraints & corner rounds** → `composables/use-tool-prompts.ts` (~200).
   Active constraint, picks, prompt/value derivations and the apply/exit paths.
4. **Assembly instances** → `composables/use-assembly-editing.ts` (~160).
   Instance selection, nudge timer, move/add/remove/transform/update.
5. **Sketch & drafting commands** → `composables/use-sketch-commands.ts` (~300).
   Point/line/arc/circle/rectangle/text/notch/centre-line/dimension commands.
6. **Pieces & allowances** → `composables/use-piece-editing.ts` (~200).
   Piece update/default/allowance/corner-allowance/removal and role changes.
7. **Template regions** → `components/editor/EditorWorkspace.vue`,
   `EditorInspector.vue`, `EditorOverlays.vue`. Only after phases 1–6 shrink the
   script; the view should then be a thin shell.

### Phase 1 contract

```ts
useProjectSession({
  projectId: () => props.id,
  editor,                       // the Pinia editor store
  pattern: () => pattern.value, // current document
  reportError: (message) => { error.value = message },
})
// → loadState, loadError, project, settingsOpen, settingsSaving, settingsError,
//   pendingUpgrade, conflict, dialogOpen, saveBarState, autosave,
//   loadProject, persist, save, reloadFromConflict, overwrite,
//   openReadOnlyDocument, cancelUpgrade
```

The composable owns the lifecycle listeners it needs (`beforeunload`,
`visibilitychange`, `pagehide`, route leave). The view keeps the `keydown`
shortcut listener and the instance-nudge timer cleanup.

## 📝 Edge Cases & Failure Scenarios

- **A save conflict while hidden** stays a pause, not a modal: the origin check
  moves with `persist`.
- **Missing project on save (404)** still switches the page to the error state.
- **Unload flush** still skips payloads over the keepalive budget.
- **Tests mount the view**, so a composable that forgets to register a listener
  fails the existing persistence suite rather than passing silently.
- **Coverage**: the composable is exercised through the view suites; any helper
  that only tests can reach is moved to `lib/` instead.

## 📝 Verification

- `npm run test:coverage` — 100 % statements, branches, functions and lines.
- The `EditorView.persistence` and `EditorView.settings` suites pass unchanged.
- `npm run lint`, `npm run typecheck`, `npm run format:check`.

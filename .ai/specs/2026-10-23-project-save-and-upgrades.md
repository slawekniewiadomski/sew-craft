# Project save, version checkpoints and document upgrades

Status: implemented — PR #65
Refs #62
Builds on: `001-project-crud-persistence.md` (projects only), `docs/architecture/data-model.md`,
`docs/architecture/api.md` (planned pattern endpoints), `packages/geometry/src/migration.ts`

## 📝 TLDR

The editor lives entirely in memory today: opening `/projects/:id/edit` shows an empty
document, a reload loses the work, and there is no way to get it back. This spec adds the
missing persistence loop — **load** a project's pattern on open, an **explicit Save**
(button and <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd>) that writes the working copy and appends a
checkpoint, an **unsaved-changes guard**, and a **document upgrade prompt** when a project
was written by an older build. One pattern per project in v1. The write path is a
**document snapshot** (`PUT /projects/{id}/pattern`), not server-side command replay,
because the only command interpreter is the TypeScript geometry package.

Three product calls were open during design and follow the recommendations
below; `spec-ready` was applied without a different answer.

## 📝 Problem Statement

- **Who needs it:** the maker drafting a pattern, and the agent that drives the same
  editor. Both need work to survive a reload, a deploy or a closed tab.
- **What happens today:**
  - The API persists project metadata only. `ProjectController` exposes index/store/show/
    update/destroy; `patterns` and `pattern_versions` exist in the schema with `Pattern`
    and `PatternVersion` models, a `PatternFactory`, and no route, controller, resource or
    test. `app/Http/Resources` holds only `ProjectResource`.
  - `frontend/src/api/projects.ts` can list, create and delete projects. It has no
    pattern call.
  - `useEditorStore` starts at `createEmptyDocument()` and `EditorView` never loads the
    project: its `id` prop is used only for the SVG download filename. There is no Save
    action, no dirty flag, no navigation guard and no `beforeunload` handler.
  - `@sewcraft/geometry` can normalise an older document (`normalizeDocument`) and can
    serialise the current one, but nothing calls either with persisted data.
- **Evidence it matters:** #62 asks for exactly this ("I want to be able to save project")
  and for an "update" action when the data version changes. The architecture already
  promises the endpoints (`docs/architecture/api.md`) and the storage columns
  (`docs/architecture/data-model.md`); only the implementation is missing. `ROADMAP.md`
  lists persistence in the MVP loop.
- **Constraints:** commands stay the only *in-session* mutation path; the API stays
  stateless and `/api`-versioned; geometry stays in `@sewcraft/geometry`; PostgreSQL holds
  the document as JSON; the 100 % coverage gate applies to every new branch.

## 📝 Proposed Solution

### Vocabulary

| Term | Meaning |
| ---- | ------- |
| **Working copy** | `patterns.geometry` — the document the editor loads and saves. Mutable by save. |
| **Checkpoint** | One `pattern_versions` row — an immutable snapshot of a committed document. |
| **Document schema** | The `schema` string inside the document (`sewcraft.pattern/0.2`). Gates the upgrade prompt. |
| **Upgrade** | Running `normalizeDocument` on an older document and saving the result. One-way. |
| **Dirty** | The editor document is not the one last loaded or saved. |
| **Conflict** | Another writer saved after this editor loaded; detected by an expected-version token. |

### Options considered

| # | Option | Trade-offs | Verdict |
| - | ------ | ---------- | ------- |
| A | **Explicit Save writes a snapshot** (`PUT /projects/{id}/pattern`) and appends a checkpoint; load restores the working copy | Simple, works offline-tolerant (client retries), matches the table shape, and one request per save. Cost: last-write-wins unless a version token is checked; the server stores what the client sends and cannot re-derive it | **Recommended** |
| B | **Autosave the working copy** on a debounce, with an explicit checkpoint action for history | Nothing is ever lost, no Save button to forget. Cost: every keystroke can write, conflict windows are constant, and "did it save?" still needs a visible status. Adds debounce, retry and offline semantics to v1 | Follow-up — after A's write path exists |
| C | **Server-side command replay** (`POST /projects/{id}/commands`): the server applies each command and appends a version | Matches the current `api.md` wording and the command-only architecture end to end. Cost: requires a second command interpreter in PHP, because `executeCommand` exists only in TypeScript. Two implementations of the solver/command semantics will diverge; the solver is not ported | Rejected for v1 — a PHP geometry port is its own project, and the document snapshot is what the column stores anyway |
| D | **Do nothing** — keep the in-memory editor | No work. Cost: the app cannot be used for a real pattern; #62 stays open and every later feature (pieces, allowances, export from a saved project) has nothing to persist against | Rejected |

Option A does not weaken the command rule: the client still applies every mutation as a
command, and Save writes the resulting document. The server validates the document's
envelope and size, not its geometry.

### Behaviour

1. **Open.** `/projects/:id/edit` fetches the project's pattern. If the project has no
   pattern yet, the editor loads an empty document and shows "New pattern — not saved yet".
   A missing project is a load error with a link back to Projects.
2. **Dirty tracking.** The document is immutable, so the store compares object identity:
   `document.value !== savedDocument`. Undo back to the saved state restores that exact
   object (`JournalEntry.before` is the snapshot), so the editor correctly becomes clean
   again without deep comparison.
3. **Save.** The Save button and <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> send the current document
   with the checkpoint number this editor last saw. The button is disabled while a save is
   in flight and when the document is clean. Read-only mode (see 8) has no Save.
4. **Checkpoint.** A successful save appends one `pattern_versions` row and returns its
   number; the editor stores it as the new expected version. An unchanged document does not
   append a second identical checkpoint.
5. **Status.** The editor bar always states one of: "New pattern", "Unsaved changes",
   "Saving…", "Saved 14:32", "Save failed — retry". Failure keeps the document and the
   dirty flag; nothing is discarded.
6. **Conflict.** If another writer saved since this editor loaded, the server answers
   `409` with the current version. The editor shows a dialog: **Reload** (discard local
   edits and load the stored document) or **Overwrite** (save again with no expected
   version, which appends the local document as the next checkpoint). Reload is the
   default and has focus.
7. **Leave guard.** Navigating away while dirty asks for confirmation; closing the tab
   triggers the browser's `beforeunload` prompt. There is no silent discard.
8. **Upgrade.** A loaded document whose `schema` is older than `PATTERN_SCHEMA` is **not**
   opened for editing directly. A modal names both schema versions and offers:
   - **Update and open** — run `normalizeDocument`, open the migrated document, and save it
     at once with the old schema attached so the server archives the pre-upgrade working
     copy as a checkpoint before replacing it. Editing starts only after that save
     succeeds.
   - **Open read-only** — render the normalised document, disable every command and Save,
     keep export available, show a "Read-only (older format)" pill.
   - **Cancel** — return to Projects. Nothing is written, so an older build still reads
     the project.
9. **Newer or unknown schema.** A `schema` the client does not know (a newer build, or a
   hand-edited value) is never migrated. The modal says "This project was saved by a newer
   version of SewCraft" and offers only Cancel and read-only whenever the client can render
   it. `normalizeDocument` currently treats any non-current schema as 0.1; the load path
   must gate it on a known-schema list instead.
10. **Scope of a save.** Save persists the pattern document. Project name and description
    are not edited in the editor today and are not part of this command; renaming stays on
    the projects surface.

### Why the snapshot is not a bypass

The command core owns *authoring* semantics: validation, inverse, undo, solver runs. The
server cannot verify any of that without the TypeScript engine, so it treats the document
as opaque JSON with a small envelope check (`schema`, `units`, size). This is the same
trust boundary the SPA already has in a single-user, self-hosted deployment, and it is
recorded as an explicit departure from the current `api.md` sentence about applying
commands server-side (see Resolved assumptions R1).

## 📝 Architecture

| Module | Change |
| ------ | ------ |
| `routes/api.php` | `GET`/`PUT /projects/{project}/pattern` |
| `app/Http/Controllers/Api/ProjectPatternController.php` | New: show, update. Validate + delegate only |
| `app/Http/Requests/SavePatternRequest.php` | Envelope + size validation, `expected_version`, `expected_schema` |
| `app/Services/PatternPersistence.php` | Transaction: lock the pattern, 409 check, archive-before-upgrade, write working copy, append checkpoint |
| `app/Http/Resources/PatternResource.php` | `id`, `project_id`, `name`, `document`, `version`, `saved_at` |
| `app/Models/Project.php` | `patterns()` already exists; add a `currentPattern()` helper? No — the controller orders by id |
| `frontend/src/api/projects.ts` | `getPattern`, `savePattern`; a typed `ApiError` carrying status and body |
| `frontend/src/stores/editor.ts` | `isDirty`, `savedVersion`, `lastSavedAt`, `saveState`, `readOnly`, `markLoaded`, `markSaved`, `setReadOnly` |
| `frontend/src/components/EditorSaveBar.vue` | New: project/pattern name, status text, Save button, read-only pill |
| `frontend/src/components/UpgradeDocumentDialog.vue` | New: older/newer schema modal with Update / read-only / Cancel |
| `frontend/src/components/SaveConflictDialog.vue` | New: Reload / Overwrite |
| `frontend/src/views/EditorView.vue` | Load on mount, save wiring, upgrade gate, dialogs, route and tab guards |
| `docs/architecture/api.md`, `docs/architecture/data-model.md` | Endpoint contract, checkpoint rule, snapshot decision |

No new geometry code, no new command, no document schema change. The command spec
version (`config('geometry.spec_version')`, currently `0.10.0`) does **not** move: it
versions commands, not HTTP endpoints or the document envelope.

## 📝 Data Model

No new tables or columns.

| Store | Content |
| ----- | ------- |
| `patterns.geometry` | The working copy; `null` until the first save |
| `pattern_versions` | Append-only checkpoints, unique on `(pattern_id, version)` |

Rules:

1. **One pattern per project in v1.** `project->patterns()->orderBy('id')->first()`. The
   first save creates the row with `name = project.name`. A later spec can expose a
   pattern picker without changing this contract.
2. **Version numbering.** The next version is `max(version) + 1` for that pattern inside a
   transaction with `lockForUpdate()` on the pattern row. `0` means "no checkpoint yet".
3. **What a checkpoint stores.** The document written by that save. A save whose serialised
   document equals the stored working copy is a no-op: the working-copy timestamp moves
   only when the content changed.
4. **Archive before upgrade.** When a save carries `expected_schema` and it differs from
   the incoming document's `schema`, the server first appends the *existing working copy*
   as a checkpoint (with its old schema), then writes the migrated document and appends it
   as the next checkpoint. The pre-upgrade state is therefore never lost even though the
   migration is one-way.
5. **Deletion.** `projects` → `patterns` and `patterns` → `pattern_versions` already cascade.
   Deleting a project removes its history with it.

## 📝 API Contracts

### `GET /api/projects/{project}/pattern`

- `200` — the project exists:
  ```jsonc
  {
    "data": {
      "id": 7,                 // pattern id, null when never saved
      "project_id": 1,
      "name": "Summer dress",
      "document": { "schema": "sewcraft.pattern/0.2", "units": "mm", "...": "..." },
      "version": 12,           // latest checkpoint, 0 when none
      "saved_at": "2026-10-23T15:41:12Z" // null when never saved
    }
  }
  ```
  `document` is `null` (not a 404) when the pattern has no geometry yet, so the client can
  distinguish "new project" from "missing project".
- `404` — the project does not exist.

### `PUT /api/projects/{project}/pattern`

Request:

```jsonc
{
  "document": { "schema": "sewcraft.pattern/0.2", "units": "mm", "...": "..." },
  "expected_version": 12,     // integer, or null to force (create/overwrite)
  "expected_schema": "sewcraft.pattern/0.1" // optional: archive the old working copy first
}
```

Validation:

| Rule | Failure |
| ---- | ------- |
| `document` is an object with a string `schema` and `units === "mm"` | `422` with `errors.document` |
| Serialised `document` ≤ 2 MB | `422` with `errors.document` |
| `expected_version` present and an integer ≥ 0, or `null` | `422` |
| `expected_schema`, when present, is a string | `422` |

Success `200`:

```jsonc
{ "data": { "id": 7, "version": 13, "saved_at": "2026-10-23T16:02:44Z", "created": false } }
```

`created` is `true` when the save created the pattern row. A save whose content equals the
stored working copy returns the current version with `created: false` and appends nothing.

Conflict `409`:

```jsonc
{
  "message": "The project was saved by someone else.",
  "current_version": 14,
  "saved_at": "2026-10-23T16:05:00Z"
}
```

`422` and `404` keep the shapes documented in `docs/architecture/api.md`.

### Out of scope

- Reading or restoring checkpoints (`GET /patterns/{id}/versions`), diffing and pruning.
- `POST /projects/{id}/commands` (option C).
- Autosave, offline queue and retry backoff (option B).
- Multi-tab live sync / broadcast.

## 📝 UI/UX

The editor gains one compact bar between the app header and the ribbon:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Summer dress · Pattern        [Read-only (older format)]   Saved 14:32   │
│                                                             [ Save ]      │
├──────────────────────────────────────────────────────────────────────────┤
│ [Select] [Round corner] | [Point] [Line] ...    (existing ribbon)       │
└──────────────────────────────────────────────────────────────────────────┘
```

- Status text uses the sidebar type scale: `text-xs` muted for "Saved", `text-destructive`
  for a failure, `text-2xs` for the timestamp.
- Save is a `Button` (`size="sm"`) with `data-testid="save-project"`; disabled when clean,
  saving, or read-only. Tooltip: "Save project (Ctrl+S)".
- The dirty marker is both the status text and a dot on the Save button; colour alone is
  never the only signal.
- Keyboard: <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> saves; it is ignored while a dialog is open.

Upgrade modal:

```
┌ Save format upgrade ──────────────────────────────────────┐
│ This project was saved in an older format.                │
│   saved:  sewcraft.pattern/0.1                            │
│   editor: sewcraft.pattern/0.2                            │
│ Updating rewrites the project and keeps the old version   │
│ as a checkpoint.                                          │
│                                   [ Cancel ] [ Read-only ] │
│                                              [ Update and open ] │
└───────────────────────────────────────────────────────────┘
```

Conflict dialog:

```
┌ Project changed elsewhere ────────────────────────────────┐
│ Another tab saved this project at 16:05.                   │
│ Reloading discards your unsaved edits.                     │
│                              [ Overwrite ] [ Reload ]      │
└───────────────────────────────────────────────────────────┘
```

### Accessibility

- The status line is a polite live region (`role="status"`); "Save failed" is assertive.
- Dialogs use the existing shadcn-vue dialog primitives, trap focus, restore focus on close
  and have accessible names. "Reload" is the default action in the conflict dialog.
- The read-only pill is text, not colour alone, and the editor exposes
  `aria-readonly="true"` on the canvas region.
- Keyboard users can reach every action; no save or upgrade path depends on pointer input.

## 📝 Edge Cases & Failure Scenarios

| Case | Handling |
| ---- | -------- |
| Project has no pattern | Empty document, "New pattern — not saved yet"; the first save creates the row |
| Empty document saved | Allowed; a checkpoint of an empty document is legitimate |
| Save while a save is in flight | Button disabled; keyboard shortcut ignored |
| Save fails (network/5xx) | Document kept, dirty stays true, status "Save failed — retry", one retry button |
| Two tabs, second saves | First save gets `409`; Reload or Overwrite; no silent overwrite |
| Undo back to the last saved state | Dirty clears (identity comparison) |
| Project deleted while open | Save returns `404`; status explains and offers back to Projects |
| Older document, user cancels | Nothing written; project remains readable by the older build |
| Older document, upgrade save fails | Editor stays read-only on the *unmigrated* state; nothing half-written |
| Unknown/newer schema | No migration offer; read-only or cancel; `normalizeDocument` never guesses |
| Malformed stored JSON | Load error state naming the project, no editor crash, no overwrite offered |
| Oversized document | `422`; message names the 2 MB limit; editor keeps the document |
| Concurrent first save | Transaction + lock creates one pattern; the loser gets the winner's version or `409` |
| Version number race | `lockForUpdate` + unique constraint; a constraint failure becomes `409`, not a 500 |

## 📝 Risks & Impact Review

| Risk | Level | Mitigation |
| ---- | ----- | ---------- |
| Data loss from an overwrite | Medium | Every successful save appends a checkpoint; the pre-upgrade copy is archived; conflicts are explicit |
| The one-way migration cannot be undone in the working copy | Medium | Archive-before-upgrade; the old checkpoint keeps the exact bytes |
| Two command interpreters diverge (if option C is chosen later) | High | Not built now; the snapshot path is the documented v1 decision |
| `PatternVersion` numbering drift under concurrency | Low | Row lock, unique `(pattern_id, version)`, `409` mapping |
| Read-only mode leaks a mutation path | Low | Commands, undo/redo, delete and Save are all disabled behind one store flag; tests assert it |
| Coverage gate slows the feature | Low | Phase tests are enumerated before wiring; every new branch has a case |
| Existing editor tests break on the async load | Medium | `EditorView` gets an explicit loading state; tests mount with a resolved stub |

## ❓ Open Questions

These are blocking product decisions. They are asked on #62 and stay open until the issue
author answers; the design above follows the recommendation in each row.

| # | Question | Why it blocks | Recommendation |
| - | -------- | ------------- | -------------- |
| Q1 | **When does a save happen?** Explicit Save only, autosave only, or both? | It decides the bar, the guard, the conflict window and the write frequency. Autosave needs debounce/retry/offline semantics that explicit Save does not. | **Explicit Save in v1**, with autosave + checkpoint distinction as a follow-up (option B). |
| Q2 | **What does a save checkpoint?** Every successful save, only a deliberate "Save version" action, or nothing until a history UI exists? | It decides whether `pattern_versions` grows per click and whether the upgrade can archive the old copy. | **Every successful save** appends one checkpoint, deduped when unchanged; no pruning until a history surface exists. |
| Q3 | **What happens when the user declines an upgrade?** Read-only, cancel the open, or edit in memory without saving? | Each is a different promise to the user, and only read-only keeps the project safe for older builds while allowing export. | **Read-only** with export enabled; Cancel returns to Projects. |

## ✅ Resolved assumptions (autonomous defaults)

| # | Assumption | Why | Status |
| - | ---------- | --- | ------ |
| R1 | The write path is a document snapshot (`PUT`), not server-side command replay | The only command interpreter is TypeScript; a PHP port would be a second implementation and a much larger project | ⚠ Recorded as a departure from the current `api.md` sentence |
| R2 | One pattern per project in v1 (lowest id; created lazily) | The editor edits one document and the UI has no pattern concept yet; the schema stays multi-pattern | ✅ Reversible |
| R3 | A checkpoint is the document written by that save; unchanged saves append nothing | Keeps history meaningful and small without pruning | ✅ Reversible |
| R4 | Upgrades are explicit; no silent `normalizeDocument` on load | The issue asks for an "update" action; silent migration removes the user's choice and breaks rollback | ✅ Follows Q3's recommendation |
| R5 | Archive-before-upgrade writes the old working copy as a checkpoint | The migration is one-way; this is the only automatic preservation point | ✅ Reversible |
| R6 | Save lives in a compact editor bar; <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> is the shortcut | The editor has no project surface today; a persistent status is needed for trust | ✅ Reversible |
| R7 | Conflicts use an expected-version token with `409` and a Reload/Overwrite dialog | Single-user does not mean single tab; silent last-write-wins is the one failure users cannot forgive | ✅ Reversible |
| R8 | Project name/description are not part of Save | They are edited on the projects surface; mixing them would make every pattern save a metadata write | ✅ Reversible |
| R9 | Documents are capped at 2 MB | Guards the JSON column and the request; far above a real pattern | ✅ Reversible |
| R10 | The command spec version does not move | No command changes; only HTTP endpoints and the document envelope | ✅ |

## 📋 Phasing

- **Phase 1 — Persistence API.** Routes, controller, request, service, resource, Pest
  tests. Ships GET/PUT with checkpoints, conflict and archive-before-upgrade before any UI
  depends on it.
- **Phase 2 — Client API and store.** `getPattern`/`savePattern`, typed `ApiError`, dirty/
  save/read-only state, unit tests.
- **Phase 3 — Editor load and save bar.** Load on open, empty/new/error states, Save button,
  shortcut, status, in-flight guard.
- **Phase 4 — Guards and recovery.** Leave guard, `beforeunload`, conflict dialog, failure
  retry, 404 handling.
- **Phase 5 — Upgrade flow.** Detection, modal, update-and-open with archive, read-only
  mode, unknown-schema guard, tests.
- **Phase 6 — Docs and gate.** `api.md`, `data-model.md`, coverage, full validation gate.

## 📋 Implementation Plan

| Step | Description | Tests |
| ---- | ----------- | ----- |
| 1 | Migrations: none. Add `PatternResource`, `SavePatternRequest` | Pest unit |
| 2 | `ProjectPatternController` show/update + routes | `tests/Feature/ProjectPatternTest.php` |
| 3 | `PatternPersistence` service: create-on-first-save, version append, 409, archive, lock | Feature: version increments, unchanged save no-op, concurrent save `409` |
| 4 | Validation: envelope, units, 2 MB cap | Feature: 422 shapes |
| 5 | `projectsApi.getPattern`/`savePattern`, `ApiError` | `frontend/src/api/projects.test.ts` |
| 6 | Editor store: `isDirty` identity, `saveState`, `readOnly`, `markLoaded`/`markSaved` | `frontend/src/stores/editor.test.ts` |
| 7 | `EditorSaveBar` + accessibility | `EditorSaveBar.test.ts` |
| 8 | `EditorView`: load on mount, loading/error/new states, save, shortcut | `EditorView.test.ts` |
| 9 | Leave guard + `beforeunload` | `EditorView.test.ts` |
| 10 | Conflict dialog + overwrite path | `EditorView.test.ts`, feature test for force save |
| 11 | Upgrade detection + dialog + read-only mode + unknown schema | `UpgradeDocumentDialog.test.ts`, `EditorView.test.ts`, geometry known-schema test |
| 12 | Docs: `api.md`, `data-model.md` | Review |
| 13 | Full gate (`npm run format`, typecheck, lint, format:check, test:coverage, build, Pest 100 %) | All |

## ✅ Acceptance criteria

- [ ] Opening a project loads its saved document; a project with no pattern opens empty
      with a "not saved yet" state.
- [ ] Save writes the document, appends exactly one checkpoint per changed save, and returns
      the new version.
- [ ] `<Cmd/Ctrl>+S` saves; the button is disabled while clean, saving or read-only.
- [ ] The editor shows unsaved/saving/saved/failed states, and a failed save keeps the work.
- [ ] Leaving with unsaved changes prompts; closing the tab triggers `beforeunload`.
- [ ] A second tab's save produces a `409`, and Reload/Overwrite both work; overwrite is
      explicit and checked.
- [ ] An older document shows the upgrade modal; "Update and open" migrates, opens and
      archives the old working copy as a checkpoint before writing.
- [ ] Declining the upgrade opens read-only with export available and no mutation path.
- [ ] A newer/unknown schema is never migrated and never silently replaced.
- [ ] Pest and Vitest suites pass at 100 % statements, branches, functions and lines.
- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm run build` pass.
- [ ] `docs/architecture/api.md` and `data-model.md` describe the endpoint and checkpoint
      rules above.

## Checks

Design checks only — this is a design-only PR. No application code was written or run, so
no behaviour is claimed:

- Read the persistence schema, models, factory, controller, routes and SPA API/store/view.
- Read `docs/architecture/api.md`, `data-model.md`, `overview.md` and `standards.md`.
- Compared the write-path options against the TypeScript-only command interpreter.
- Validated the plan against the repository's 100 % coverage and doc-sync rules.

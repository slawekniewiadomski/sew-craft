# Project save, version checkpoints and document upgrades

Goal: implement `.ai/specs/2026-10-23-project-save-and-upgrades.md` on
`spec/project-save-and-upgrades` (PR #65) and complete the same PR — the spec is
the plan. Refs #62.

Product calls follow the spec's recommendations because `spec-ready` was applied
after review without a different answer on the issue:

- Q1 — explicit Save (button + Cmd/Ctrl+S); autosave is a follow-up.
- Q2 — every changed save appends one checkpoint, deduped when unchanged.
- Q3 — declining an upgrade opens the project read-only; Cancel returns to
  Projects.

## Non-goals

- Autosave, an offline queue, retry backoff, multi-tab live sync.
- Reading, restoring, diffing or pruning checkpoints.
- `POST /projects/{id}/commands` (a PHP command interpreter).
- A document-schema change or a command-spec bump.

## Assumptions

- One pattern per project in v1 (lowest id, created lazily).
- The server stores the document as opaque JSON with an envelope check.
- An unknown/newer schema is never migrated or replaced silently.
- Docker (Pest) and npm (Vitest) are the validation entry points.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Persistence API

- [ ] 1.1 Add route, controller, request, resource and service for GET/PUT pattern
- [ ] 1.2 Add Pest coverage for checkpoints, conflicts and archive-before-upgrade

### Phase 2: Client API and store

- [ ] 2.1 Add `getPattern`/`savePattern` and a typed `ApiError`
- [ ] 2.2 Add dirty/save/read-only state and known-schema guard

### Phase 3: Editor load and save bar

- [ ] 3.1 Load the stored document on open with empty, loading and error states
- [ ] 3.2 Add the save bar, status, Save button and Cmd/Ctrl+S

### Phase 4: Guards and recovery

- [ ] 4.1 Add the leave guard, `beforeunload`, failure retry and 404 handling
- [ ] 4.2 Add the conflict dialog with Reload and explicit Overwrite

### Phase 5: Upgrade flow

- [ ] 5.1 Add upgrade detection, modal and update-and-open with archive
- [ ] 5.2 Add read-only mode and the unknown-schema guard

### Phase 6: Docs and gate

- [ ] 6.1 Update `docs/architecture/api.md` and `data-model.md`
- [ ] 6.2 Run the full validation gate and the code-review pass

# Project settings modal

Status: **implemented** — the decisions below were taken with the maintainer
before implementation, so the spec and the code land on the same branch.

Builds on: `2026-10-26-top-bars-reduction.md` (the editor's single top bar),
`2026-10-23-default-piece-seam-allowance.md` (the document-stored default).

## 📝 TLDR

Project settings move behind one modal opened from a button beside the project
name. The modal edits the project name, the project description and the default
document seam allowance. The project name becomes the editor's identity (today
the top bar shows the pattern name), and the duplicate "Document default"
control leaves the Pattern sidebar section.

## 📝 Problem Statement

The project row has `name` and `description`, but once a project is created there
is no surface that edits them: `ProjectController::update` exists and the API
client never calls it. The editor's top bar showed `Pattern.name`, a separate
value the user could not rename either.

The default seam allowance is buried in the Pattern sidebar drawer, next to
per-pattern information, while it is really a project-wide preference. A maker
who wants to change the project's identity or its default allowance has to know
two different places, and one of them cannot be reached at all.

## 📝 Decisions

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Which name does the top bar show? | `Project.name` everywhere. The redundant `patterns.name` column and the `name` field of the pattern response are removed. |
| Q2 | How does the modal commit? | One Save button. Name/description go through `PUT /api/projects/{id}`; the allowance is a `set_default_allowance` command, so it is undoable and saved with the document. Cancel discards the draft. |
| Q3 | What happens to the sidebar control? | Removed. The modal is its only home. |
| Q4 | Where is the modal reachable? | The editor top bar and each row in the Projects list. The Projects list has no document loaded, so its modal shows name and description only. |

## 📝 Proposed Solution

- `EditorTopBar.vue` gains a settings button next to the name
  (`data-testid="project-settings"`), disabled until the project loads.
- `ProjectSettingsDialog.vue` is a draft-edit modal: name (required, max 255),
  description (optional multiline), and — when a document is available — the
  default allowance kind and width. Save is disabled while unchanged, invalid or
  saving; failures show inline and keep the draft.
- The editor loads the project row with `GET /api/projects/{id}` alongside the
  pattern, shows `Project.name`, and applies a changed allowance as one
  `set_default_allowance` command. Changing the allowance marks the document
  dirty, so autosave persists it.
- `ProjectsView.vue` gets a Settings button per row and the same modal without
  the allowance section; the store updates its cached row after a save.
- API client gains `projectsApi.get` and `projectsApi.update`; the store gains
  `updateProject`.
- `patterns.name` is dropped by a reversible migration, and
  `GET /api/projects/{id}/pattern` no longer returns `name`. The project row is
  the only place a name lives.

## 📝 Edge cases

- Empty or whitespace-only name: Save disabled, inline message.
- Description cleared: sent as `null`.
- The allowance section is disabled for a read-only (older-schema) document;
  name and description stay editable.
- Opening the modal pauses autosave and editor shortcuts, like the conflict and
  upgrade dialogs. Closing restores them.
- A project deleted while the editor is open keeps today's behaviour: the load
  or save fails with "This project no longer exists".
- Renaming a project changes the one name everywhere: top bar, API consumers and
  the unreadable-document error. No stored pattern copy can drift.

## 📋 Implementation Plan

1. API client + store: `get`, `update`, `updateProject`, with tests.
2. `ProjectSettingsDialog.vue` with draft, validation, focus trap and tests.
3. `EditorTopBar.vue` settings button, with tests.
4. `EditorView.vue`: load the project, show its name, wire the modal, remove the
   sidebar default control and the now-empty Pattern drawer, with tests.
5. `ProjectsView.vue`: per-row settings, with tests.
6. Backend: drop `patterns.name` and its response field; update the data-model,
   API and glossary docs.
7. Docs: this spec, plus no command or stored-document schema change.

## 📋 Acceptance criteria

- [x] The editor top bar shows the project name and a Settings button beside it.
- [x] The modal edits name, description and default allowance and saves with one
      button; Cancel discards.
- [x] A changed allowance is undoable and marks the document dirty.
- [x] The sidebar no longer offers the default allowance control.
- [x] The Projects list can edit name and description of any project.
- [x] Validation, read-only and failure states are covered by tests.

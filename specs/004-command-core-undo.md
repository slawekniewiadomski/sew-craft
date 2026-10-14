# 004 — Command core & undo/redo

Status: done (client command core & undo/redo; batched persistence remains under 009)
Depends on: 002, 003

## Goal

All pattern edits flow through a command bus; undo/redo and persistence work by
replaying/inverting the command journal.

## Context

Read `docs/architecture/command-core.md` and
`docs/domain/command-spec.md`. This is the keystone feature.

## Inputs

Geometry model (002), solver (003), command spec (`config/geometry.php`).

## Deliverables

- `applyCommand(document, command): PatternDocument` (pure) in
  `@sewcraft/geometry`, handling every v0.1 command with validation.
- Frontend `useCommandBus` composable/store: dispatch, journal, undo, redo.
- Batched persistence to `POST /api/projects/{id}/commands` (see 009).
- Tests: apply each command, inverse commands undo correctly, invalid commands
  rejected without mutation.

## Acceptance criteria

- [x] No UI code mutates the document directly.
- [x] Undo restores the exact prior document; redo reapplies.
- [x] Replaying the journal on the initial document reproduces the current one.
- [x] Non-converged solves roll the command back.

## Out of scope

- Collaboration/OT, server-side command execution, agent/MCP.

## Checks

```bash
npm test
npm run lint
docker compose exec app php artisan test
```

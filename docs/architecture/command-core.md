# Command Core

Every mutation of a pattern — from any source (UI, API, tests, future agent) — is
a serializable **command**. This is the central architectural rule.

## Envelope

```jsonc
{
  "id": "01J...", // ULID, client-generated, unique
  "type": "add_point", // command name (see command spec)
  "params": { "x": 0, "y": 0, "construction": true },
  "issuedAt": "2026-10-14T11:00:00Z",
}
```

`id` makes commands idempotent: re-applying the same command is a no-op.

## Lifecycle

```
UI event ─▶ command ─▶ validate ─▶ apply to PatternState ─▶ solve ─▶ render
                                   └▶ append to journal (undo/redo, sync)
```

1. The frontend builds a command and sends it to the command bus.
2. `applyCommand(document, command)` validates params and returns a new document
   plus its inverse (pure). Invalid commands throw before any mutation.
3. `executeCommand(document, command)` applies the command, then solves.
4. If the solver does not converge the change is rolled back.
5. The command, its inverse and the pre-command snapshot are appended to the
   journal and queued for persistence.
6. Batched commands are POSTed to the API, which stores them and appends a
   `pattern_version`.

## Applying a command

`applyCommand(document, command)` in `@sewcraft/geometry` is the only mutation
primitive. It is pure and returns:

```ts
interface CommandApplication {
  document: PatternDocument; // a new document; the input is never mutated
  inverse: Command | null; // the command that undoes this one, when one exists
}
```

- **Derived id.** An `add_*` command creates its entity/constraint with
  `id = command.id`.
- **Idempotent.** Re-applying a command whose product already exists returns the
  document unchanged with `inverse: null`; `delete_entity` and
  `remove_constraint` are likewise no-ops on a missing target.
- **Validation before mutation.** Bad params or unknown references throw
  `CommandValidationError`; because the function is pure, a rejected command
  cannot leave a partial document behind.
- **`inverse: null`** for commands that are not a single command to restore:
  `delete_entity` (restoring its cascade-removed constraints) and `solve`.

`add_constraint` and `remove_constraint` are mutual inverses: removing a
constraint rebuilds the `add_constraint` that recreates it with the same id.

## Solving

`solveDocument(document, options?)` runs the solver over every point and returns
`{ document, result }`, writing the solved coordinates back into a **new**
document. When the solver does not converge it returns the input document
unchanged and `result.converged === false`.

`executeCommand(document, command, options?)` is `applyCommand` followed by
`solveDocument`. If the solve does not converge it throws
`CommandExecutionError`; since neither step mutates its input, the caller simply
discards the result and the command has rolled back.

## Undo / redo

The frontend journal stores one entry per committed command:

```ts
interface JournalEntry {
  command: Command; // redo replays this
  inverse: Command | null; // the command-level undo, when one exists
  before: PatternDocument; // the exact prior document
}
```

- **Undo restores `before`.** Snapshotting the prior document is what makes undo
  exact: re-applying an inverse command and re-solving can land the solver on a
  different (though constraint-equivalent) set of coordinates. The snapshot is
  also the only way back for non-invertible commands (`inverse: null`).
- **Redo re-runs `command`** from the restored snapshot.
- **`inverse`** is kept because it is the serializable expression of the undo —
  what a peer or server without snapshots would apply (see
  `specs/009-command-spec-api.md`) — and is covered by the `applyCommand` tests.

Dispatching a new command clears the redo stack. The journal is the source of
truth for both undo/redo and replay.

## Replay and determinism

Applying the same ordered command list to the same starting document must always
produce the same result. Randomness, clock reads and environment lookups are
forbidden inside `applyCommand`/`solve`.

## Agent access

Because commands are the only mutation path, an agent interface is just another
client that emits commands — via `POST /api/projects/{id}/commands` or, later, an
MCP server. See `specs/009-command-spec-api.md`.

## Source of truth

The full command list and param shapes live in `config/geometry.php` and are
documented in `docs/domain/command-spec.md` (+ machine-readable
`docs/domain/command-spec.json`). **Keep them in sync** — the API exposes the
config at `GET /api/commands`.

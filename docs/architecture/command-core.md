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
2. The bus validates params against `config/geometry.php` / the command spec.
3. `applyCommand(document, command)` in `@sewcraft/geometry` returns a new
   document (pure). Invalid commands are rejected before mutation.
4. The solver runs; if it does not converge the change is rolled back.
5. The command is appended to a journal and queued for persistence.
6. Batched commands are POSTed to the API, which stores them and appends a
   `pattern_version`.

## Undo / redo

Undo applies the **inverse** of a command (declared in the command spec where
possible). Two strategies, in order of preference:

1. **Inverse commands** for all reversible commands (`add_*` ↔ `delete_entity`).
2. **Snapshot checkpoints** for compound or destructive operations.

The journal is the source of truth for both undo/redo and replay.

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

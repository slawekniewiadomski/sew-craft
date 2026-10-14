# ADR-0002: Commands are the only mutation path

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Patterns are edited interactively, must support undo/redo, will be exported, and
we want AI agents to be able to drive editing. SolidCraft demonstrates the value of
a single command surface shared by UI, scripts and agents.

## Decision

Every change to a pattern is a serializable command `{ id, type, params }`. The UI,
API, tests and agents all emit the same commands. Direct mutation of the pattern
document outside the command layer is forbidden.

## Consequences

- Undo/redo, replay, collaboration and agent control all reduce to command logs.
- Determinism is required: no clock/random/IO inside command application.
- Requires discipline and a maintained command spec.

## Alternatives considered

- Plain REST CRUD on a geometry blob: simplest, but loses undo/replay and makes
  agent control ad hoc.

# ADR-0003: Framework-agnostic `@sewcraft/geometry` package

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The hard, correctness-critical code is the geometry model and constraint solver.
Burying it in Vue components or in PHP makes it hard to test and impossible to
reuse (CLI, agents, exports, server-side validation).

## Decision

Put the geometry model, solver and (later) export serializers in a standalone
TypeScript package `packages/geometry` that has **no** dependency on Vue, the DOM,
or Laravel. Consumed as an npm workspace.

## Consequences

- Pure functions, easy unit tests (Vitest), reusable everywhere.
- The API stays thin; it validates and persists but does not do math.
- Two languages in the project (TS for geometry, PHP for API). Accepted.

## Alternatives considered

- Geometry in PHP for server-side authority: slower iteration, poor reuse in the
  browser, no shared code with exports.
- Geometry inside the Vue app: untestable and coupled.

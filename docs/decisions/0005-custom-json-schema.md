# ADR-0005: Custom JSON schema for pattern data

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Patterns could be stored in an established format (e.g. Seamly2D `.val`/`.smis`) or
in our own format. Interop matters eventually, but early speed and agent
friendliness favour a format we control.

## Decision

Define our own versioned JSON `PatternDocument` (`schema: "sewcraft.pattern/0.1"`)
and store it in a JSON column. Add importers/exporters to other formats later.

## Consequences

- Clean fit for the command core, API and agents; easy to version.
- No immediate interop with existing pattern software (deferred to the roadmap).
- We must maintain a schema and migration path as the model evolves.

## Alternatives considered

- **Seamly2D-compatible core:** immediate ecosystem access, but their format is
  large, under-documented and constrains our model.

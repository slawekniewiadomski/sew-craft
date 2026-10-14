# ADR-0006: Single-user self-hosted, no auth initially

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The primary use case is a self-hosted tool for a single user (the developer). A
future SaaS is desirable but not the first milestone. Auth is a distraction early.

## Decision

Ship v0.1 with no authentication. Keep the API stateless and free of
user-scoped assumptions so Sanctum + `user_id` can be added additively later.

## Consequences

- Faster MVP; one less subsystem.
- The app is not safe to expose publicly until auth lands.
- Controllers must not assume a user, but must not prevent adding one.

## Revisit when

Multi-user/SaaS or public exposure is specced.

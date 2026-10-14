# ADR-0001: Separate Vue SPA + Laravel JSON API

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The editor is canvas-heavy and highly interactive. We also want a future SaaS and
possible mobile/native or agent clients, and we want the API to be usable without
the UI.

## Decision

Build the frontend as a standalone Vue 3 SPA (`frontend/`) that talks to a
stateless Laravel JSON API under `/api`. No Inertia, no server-rendered Blade.

## Consequences

- Clear separation: API and UI can be tested, deployed and scaled independently.
- Slightly more boilerplate (CORS, auth tokens) than Inertia.
- The API must stay stateless and version-tolerant.

## Alternatives considered

- **Inertia.js:** less boilerplate for CRUD, but couples UI to Laravel and is
  awkward for a large canvas editor and non-browser clients.
- **Livewire:** server round-trips per interaction; wrong fit for an editor.

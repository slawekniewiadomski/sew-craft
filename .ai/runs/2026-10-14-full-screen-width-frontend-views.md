# Execution plan: full-screen-width frontend views

Issue: #3
Source doc: .ai/specs/2026-10-14-full-screen-width-frontend-views.md
Status: in-progress

## 🎯 Goal

Make every routed view in the SPA span the full viewport width by removing the
`max-w-5xl`/`mx-auto` cap from the three regions of the app shell
(`frontend/src/App.vue`), keeping the existing `px-4` gutter.

## 📋 Scope

Frontend-only, single file: the header `<nav>` (line 8), `<main>` (line 16) and
footer `<div>` (line 21) of `frontend/src/App.vue`. Class-only change; no new
component, dependency, route, API or schema surface. `App.test.ts` asserts text,
not classes, so it is unaffected and no new unit test is required (a class-only
change adds no branch).

## Non-goals

- No redesign of view-internal layouts, cards, lists, forms or the editor SVG.
- No backend/API/command-spec/geometry changes.
- No shared `Container` component (no second consumer yet).

## Implementation Plan

### Phase 1: Widen the app shell

- [ ] 1.1 Remove the cap from the header `<nav>` (`frontend/src/App.vue:8`).
- [ ] 1.2 Remove the cap from `<main>` (`frontend/src/App.vue:16`).
- [ ] 1.3 Remove the cap from the footer `<div>` (`frontend/src/App.vue:21`).
- [ ] 1.4 Run the full validation gate and confirm it stays green.

## Risks

Low. Reversible class-string change confined to one shell file; rollback is a
`git revert`. No protected contract surface.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Widen the app shell

- [ ] 1.1 Remove the cap from the header `<nav>` (`frontend/src/App.vue:8`).
- [ ] 1.2 Remove the cap from `<main>` (`frontend/src/App.vue:16`).
- [ ] 1.3 Remove the cap from the footer `<div>` (`frontend/src/App.vue:21`).
- [ ] 1.4 Run the full validation gate and confirm it stays green.

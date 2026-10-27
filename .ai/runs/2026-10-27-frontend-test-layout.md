# Run: frontend test layout (PR #100, FR #98)

## Goal

Implement `.ai/specs/2026-10-27-frontend-test-layout.md` on the spec PR's own
branch: move every frontend Vitest file out of `frontend/src` into
`frontend/tests/<same path>`, switch the moved tests to the `@/` alias, and
update the documented convention. Frontend-only.

## Why this plan exists

PR #100 was opened by `om-auto-write-spec` as a draft, spec-only PR. The owner
applied `spec-ready` on 2026-10-27T08:35Z, which answers the spec's Q1 in favour
of option A (`frontend/tests/`, mirroring `frontend/src/`). Per the repository's
issue-driven workflow (`AGENTS.md`), an approved spec continues into
implementation on the same branch — one combined PR, no separate implementation
PR. The PR body carried no `Tracking plan:` line, so this plan reconstructs one
from the spec's Phasing / Implementation Plan sections and issue #98.

## Decisions

- **Q1** (where `tests/` lives): `frontend/tests/`, mirroring `frontend/src/`.
  Recommended option A; the owner's `spec-ready` confirms the layout.
- **Q2–Q6**: the spec's resolved defaults apply unchanged — keep `*.test.ts`
  names, use the `@/` alias, frontend only, no new lint/CI guard, no mockups.

## Non-goals

- No geometry (`packages/geometry/src`) or `integration/` test move.
- No renames to `*.spec.ts`, no snapshot or fixture relocation (none exist).
- No lint rule or CI guard forbidding `src/**/*.test.ts`.
- No runtime, API, schema, dependency or backend change.

## Assumptions

- Baseline recorded before any change: **73 test files, 1238 tests, 0 failing**
  (`npx vitest run` from `frontend/`).
- `test.include` keeps both globs until the last slice has moved, so no test
  silently stops being collected mid-migration.
- Coverage stays scoped to `src/**/*.{ts,vue}`, so the 100 % thresholds need no
  change; the file/test count is the acceptance signal, not coverage alone.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundation and the lib slice

- [x] 1.1 Record the baseline (73 files / 1238 tests) and land this run plan — 000d899
- [x] 1.2 Widen discovery: temporary `test.include` union plus `tests` in tsconfig — a8c189e
- [x] 1.3 Move the 31 `src/lib` tests to `tests/lib` with `@/lib/...` imports — 4590540
- [x] 1.4 Verify the lib slice: 73 files, typecheck, 100 % coverage — gate green on 4590540

### Phase 2: Remaining slices

- [ ] 2.1 Move the light slices (api, router, stores, composables, assets, App.test.ts)
- [ ] 2.2 Move views and components (components, components/sidebar, components/ui)

### Phase 3: Finalise

- [ ] 3.1 Narrow `test.include` to `tests/**` and assert nothing remains in `src`
- [ ] 3.2 Update `docs/architecture/standards.md` and `AGENTS.md` for the new layout
- [ ] 3.3 Full validation gate plus the `om-auto-review-pr 100 --autofix` pass
- [ ] 3.4 Retitle the PR, normalize labels, flip it to ready, post the outcome comment

## Validation

`npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run test:coverage`, `npm run build`, plus the backend Pest/Pint gate from
`.ai/agentic.config.json`.

## Review

- `om-auto-review-pr 100 --autofix` after the gate, as the single code-review
  pass for this PR.

## Evidence

- Spec: `.ai/specs/2026-10-27-frontend-test-layout.md`
- Issue: FR #98
- Baseline: 73 test files / 1238 tests (`frontend/`, before any change).

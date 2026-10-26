# Run: top bars reduction (PR #97, FR #95)

## Goal

Implement `.ai/specs/2026-10-26-top-bars-reduction.md` on the spec PR's own
branch: merge the editor's two top bars into one 40 px row and move the sidebar
collapse/expand toggle to the right end of the tools ribbon. Frontend-only.

## Why this plan exists

PR #97 was opened by `om-auto-write-spec` as a draft, spec-only PR and carries
`spec-ready`; no implementation PR exists. Per the repository's issue-driven
workflow (`AGENTS.md`), an approved spec PR continues into implementation on the
same branch. The PR body carried no `Tracking plan:` line, so this plan was
reconstructed from the PR's diff, the spec's Phasing / Implementation Plan
sections, and issue #95 — see the `📋 adoption plan` comment on the PR.

## Decisions

- **Q1** (bar scope): editor-only. `/projects` keeps its current header. This is
  the spec's recommended option and the smallest change.
- **Q2** (save status below 640 px): a 6 px status dot with a native `title`
  tooltip, while the live region keeps the full wording for screen readers.

## Non-goals

- No `/projects` header redesign (Q1 default).
- No pattern schema, API, command, geometry or backend change.
- No new save path: `Ctrl/Cmd+S`, autosave, conflict dialogs and the route guard
  stay exactly as they are.
- No tab-bar changes and no second collapse control.

## Assumptions

- The spec's `Resolved assumptions` R1–R10 apply as written.
- `develop` at `8916c50` (sidebar rail tabs merged) is the implementation base.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Unified top bar

- [ ] 1.1 Extract `AppBrandNav` and hide the app header on the editor route
- [ ] 1.2 Build `EditorTopBar` from `EditorSaveBar` (brand nav, identity, save region, loading/error placeholders)
- [ ] 1.3 Render the top bar in every editor state and update App/EditorView tests

### Phase 2: Ribbon-owned collapse control

- [ ] 2.1 Add the ribbon toggle and remove the sidebar's collapse/expand controls
- [ ] 2.2 Wire `EditorView` and cover the single-toggle behaviour
- [ ] 2.3 Amend the superseded specs (`013-editor-workspace-shell`, `2026-10-25-sidebar-panel-tabs`)
- [ ] 2.4 Run the full validation gate at 100 % coverage

## Validation

`npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run test:coverage`, `npm run build`, plus the backend Pest/Pint gate from
`.ai/agentic.config.json`.

## Evidence

- Spec: `.ai/specs/2026-10-26-top-bars-reduction.md`
- Issue: FR #95

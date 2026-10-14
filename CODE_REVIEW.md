# Code review rules — SewCraft

The repo-local review rules `om-code-review` (and therefore `om-auto-review-pr`)
applies in addition to its built-in checklist. Derived from the conventions in
`docs/architecture/standards.md`, the contracts under `docs/architecture/*`, and
the pipeline configured in `.ai/agentic.config.json`. Keep it short and concrete;
update it when a convention changes.

## Review priorities

1. **Correctness.** The change does what the spec's acceptance criteria say, and
   its tests prove it. Geometry/solver math must cover edge cases (tolerance,
   degenerate input, reconstruction), not just the happy path.
2. **Contracts.** A change to a documented contract must update its authoritative
   doc and every file kept in sync with it. See `BACKWARD_COMPATIBILITY.md` for
   the protected surfaces and `docs/architecture/standards.md` for the
   "contract doc wins" precedence table.
3. **Architecture.** Commands are the only mutation path; `@sewcraft/geometry`
   stays pure (no Vue, DOM, network, Laravel) and exports only through
   `src/index.ts`; controllers validate and delegate, never hold business logic.
4. **Security.** No secrets in code, tests, logs, or committed files. Validate and
   bound every external input at the boundary. Keep the API stateless.
5. **Quality.** TypeScript strict, no `any`, `import type` for type-only imports,
   no dead or unreachable code kept alive for coverage.

## Repo-specific checks

- **Units and coordinates.** All geometry is millimetres (float), radians for
  angles; display units are a frontend concern. Flag a unit conversion that leaks
  across the model/UI boundary.
- **Command three-way sync.** Adding or reshaping a command requires updating
  `config/geometry.php`, `docs/domain/command-spec.md` and
  `docs/domain/command-spec.json` together, plus a `spec_version` bump for a
  breaking change.
- **Command naming.** `type` is `verb_noun` snake_case; param names are snake_case
  and reference the role (`start`, `end`, `point`), not the type (`start_id`).
- **API shape.** Paths are plural kebab-case nouns under `/api`; JSON is
  snake_case everywhere (no camelCase translation layer); single resources wrap in
  `{"data": ...}`; errors are `422 {message, errors}` / `404` / `204`, with
  ISO-8601 UTC timestamps. Evolve additively; bump `spec_version` only for
  breaking changes.
- **Backend style.** PSR-12 via Pint (`vendor/bin/pint --test`); no business logic
  in controllers; migrations use `json`, not `jsonb`, while the SQLite test
  connection stays unchanged.
- **Frontend layout.** kebab-case `.ts`, PascalCase `.vue`, `use-*.ts` composables,
  `<name>.ts` Pinia stores; views in `views/`, primitives in `components/`,
  shadcn-vue primitives in `components/ui/` added via the CLI with `cn()` for class
  merging.
- **Coverage is a hard gate at 100%** (statements, branches, functions, lines) for
  `packages/geometry/src`, `frontend/src` (minus `main.ts` / `*.d.ts`) and backend
  `app/`. Every new branch needs a test that exercises it; do not lower a
  threshold. Prefer deleting unreachable code over ignoring it; a genuinely
  impossible branch takes an explicit ignore comment with a justification.
- **Validation gate.** The full command list lives in `.ai/agentic.config.json`
  and `SDLC.md`; a PR is not reviewable until it is green.

## Severity guidance

- **Blocker** — incorrect behavior, a broken or unmet contract, a security hole,
  a missing test for a new branch that drops coverage below 100%, or a failed
  required check. Blocks approval.
- **Major** — a likely defect, an architectural violation, or an incompletely
  synced contract that risks drift. Should be fixed before merge.
- **Minor** — style, naming, or clarity that a tool does not enforce. Non-blocking;
  record it rather than bouncing the PR for it.

When a change touches a `risk-high` surface (auth, data scoping, schema
migrations, shared contracts), require the extra evidence listed in `SDLC.md`
before approving.

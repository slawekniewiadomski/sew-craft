# Run: variables & expressions (spec #104)

## Goal

Implement `.ai/specs/014-variables-and-expressions.md` and
`docs/decisions/0010-variables-and-expressions.md`: document-level variables with
units, `$`-token formulas, `Param` unions on every pattern parameter, three
variable commands, and a Variables sidebar table. Geometry package, frontend and
the command-spec contract; no backend domain change.

## Why this plan exists

PR #104 carries the ADR and the spec and is marked `spec-ready` + `skip-qa`, so it
stays design-only. Per `om-auto-implement-spec` and `AGENTS.md`, the
implementation ships on its own PR that references #104, branched from `develop`
once #104 has merged. This plan turns the spec's five phases into atomic commits
with a verification gate after each, so the PR is reviewable step by step and
resumable.

## Decisions carried in

- Pattern parameters only: dimension `value`, corner-round `radius`,
  `Allowance.width`, `AllowancePreset.width`. Positions stay literal.
- `Param = number | { expr, lastKnown }` on each field, no side map.
- `Variable = { slug, name, unit, value, comment? }`; `slug` is bare
  (`bust_cm`), formulas write `$bust_cm`.
- Units `mm | cm`, full dimension algebra, every parameter resolves to mm.
- Writes must resolve and record `lastKnown`; deletes break dependents.
- Schema `0.4` → `0.5`, with 0.4 still accepted on read. Command spec `0.17.0`.

## Non-goals

- No units beyond mm and cm, no `min`/`max`/`abs`, no measurement sets or grading
  (spec 012).
- No variables in positions, rotations, text or labels.
- No `reference` to a variable; formulas and references stay separate links.
- No new npm dependency, no `eval`/`new Function`, no exponent notation.
- No backend domain/business logic; only the command-spec config and its test.

## Assumptions

- Start point: `develop` after #104 merges. If it has not merged, branch from
  `spec/variables-and-expressions` and rebase onto `develop` before opening the PR.
- 100 % coverage stays mandatory for `packages/geometry/src`, `frontend/src` and
  `app/`; every new branch in the evaluator needs a test, none is ignored.
- The reference implementation for a resolution chain already exists:
  `resolveConstraintValue` (`packages/geometry/src/dimension.ts:300-345`) and
  `captureBrokenDependents` (`packages/geometry/src/commands.ts:1113`).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles.

### Phase 0: Baseline

- [ ] 0.1 Record the baseline (frontend, geometry and Pest file/test counts) and
      land this run plan
- [ ] 0.2 Branch `feat/variables-expressions` from `develop`, reference #104 in
      the PR body

### Phase 1: Evaluator (pure, no document change)

- [ ] 1.1 `expression.ts`: tokenizer for numbers, unit suffixes, `$` tokens,
      operators and parens; unit tests for every accepted and rejected lexeme
- [ ] 1.2 Parser: precedence, unary signs, 64-level depth bound, balanced parens;
      error offsets in the message
- [ ] 1.3 Quantity evaluation: length exponents, cm→mm conversion on `+`/`-`,
      exponent algebra on `*`/`/`, ratio results, finite checks
- [ ] 1.4 Gate: `npm test -w @sewcraft/geometry`, 100 % on `expression.ts`

### Phase 2: Model and readers

- [ ] 2.1 `types.ts`: `Unit`, `Variable`, `Param`, `variables?` on
      `PatternDocument`, `PATTERN_SCHEMA` → `sewcraft.pattern/0.5`; field types on
      the four parameter sites
- [ ] 2.2 `migration.ts`/`defaults.ts`: accept `0.4` on read, normalize an absent
      `variables` to absent, keep 0.5 refused by older builds; 0.4 fixture test
- [ ] 2.3 `resolveVariable` (cycles, unknown token, unit scaling) and
      `resolveParam` (length required) with tests
- [ ] 2.4 Route every reader through `resolveParam`: `dimension.ts`
      `resolveConstraintValue`, `piece.ts` allowance/loop widths, `flatten.ts`,
      `export.ts`; grep audit for `.radius`/`.width` reads
- [ ] 2.5 `dimensionState` treats an unresolved formula as `broken`, so the canvas
      keeps its existing label contract
- [ ] 2.6 Gate: geometry suite green, 100 % coverage, no reader left on a raw field

### Phase 3: Commands and contract

- [ ] 3.1 `set_variable` with slug minting, name uniqueness, comment normalizing,
      formula validation and `lastKnown` capture
- [ ] 3.2 `update_variable`: rename keeps the slug; unit change converts a literal
      and only re-labels a formula; `comment: null` clears
- [ ] 3.3 `remove_variable` + `captureBrokenDependents` extended to expression
      parameters; inverse restores and re-links
- [ ] 3.4 Accept `Param` on `update_constraint`, `add_corner_round`,
      `set_corner_round_radius`, `add_seam_allowance`, `set_seam_allowance`,
      `set_piece_allowance`, `set_default_allowance`,
      `set_piece_default_allowance`; reject formula + `reference` together
- [ ] 3.5 Sync `docs/domain/command-spec.md`, `docs/domain/command-spec.json` and
      `config/geometry.php` to `0.17.0`; update `tests/Feature/CommandSpecTest.php`
      expectations for the new commands and the `Param` strings
- [ ] 3.6 Gate: `docker compose exec app php artisan test --coverage --min=100`,
      geometry suite green

### Phase 4: Editor UI

- [ ] 4.1 `PanelId 'variables'` + rail entry and count in
      `frontend/src/lib/editor-panels.ts`, plus a panel slot in `EditorView.vue`
- [ ] 4.2 `VariablesPanel.vue`: the name / value / unit / type / comment table,
      inline edits, `+ New`, row delete, empty state
- [ ] 4.3 Formula-aware value input shared by the panel and the inspectors: `=`
      prefix, live resolved millimetres, inline offset errors, create-from-token
      affordance
- [ ] 4.4 Variable picker showing `Name · $token` and inserting the token
- [ ] 4.5 Broken-parameter flag in the inspector after a variable delete
- [ ] 4.6 Gate: `npm run test:coverage` (100 %), `npm run lint`,
      `npm run format:check`, `npm run typecheck`

### Phase 5: Evidence and delivery

- [ ] 5.1 Integration test through the real API: create variables, set a formula
      dimension, assert the solved geometry; export SVG and compare with a
      literal-only twin
- [ ] 5.2 Browser pass of the panel and a formula dimension at 320 px and 240 px,
      with screenshots attached to the PR
- [ ] 5.3 Full gate: `npm run format`, `typecheck`, `lint`, `format:check`,
      `test:coverage`, `build`, Pest `--coverage --min=100`, Pint
- [ ] 5.4 Review loop, labels, ready PR referencing #104 — no merge

## Risks to watch

- **Reader debt.** A raw `.radius`/`.width` read left behind silently bypasses a
  formula. Mitigation: step 2.4 ends with a grep audit recorded in the PR body.
- **Contract drift.** Four files describe commands; step 3.5 is one checklist line
  per command.
- **Grammar size.** Dimension algebra multiplies the error paths; the evaluator is
  written first and alone (phase 1) so 100 % coverage is provable before anything
  depends on it.
- **Schema.** A 0.4 fixture must load unchanged; an older build must refuse 0.5.

## Validation

`npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run test:coverage`, `npm run build`, plus the backend Pest/Pint gate from
`.ai/agentic.config.json`.

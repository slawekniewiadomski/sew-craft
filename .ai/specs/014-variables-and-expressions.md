# 014 — Variables & expressions

Status: ready for implementation — every open question is resolved below
See: [`docs/decisions/0010-variables-and-expressions.md`](../../docs/decisions/0010-variables-and-expressions.md)
Depends on: 004 (command core) and the merged referenced-dimension work
(`.ai/specs/2026-10-20-referenced-dimensions.md`), whose broken-reference
semantics this mirrors
Command spec: `0.17.0` (current `config/geometry.php` says `0.16.0`)
Pattern schema: `0.4` → `0.5`

## 📝 TLDR

A drafter names a measurement once (`Bust (cm) = 88`) and writes
`v_bust/4 + 2` wherever a length, radius or allowance is set. Variables live in
the pattern document, formulas use a stable slug rather than the display name, and
every parameter field becomes `number | { expr, lastKnown }`. A formula is
resolved on read by a small deterministic evaluator in `@sewcraft/geometry`; the
solver, `flatten` and export keep their shapes, because a formula is substituted
before any of them runs. A write must resolve; a parameter breaks only when a
variable it names is deleted, and then it keeps its last number, exactly like a
dangling dimension `reference`.

## 📝 Problem Statement

- **Who needs it:** the solo maker drafting a pattern from body measurements. A
  bodice is `bust/4 + ease` at the waist, `bust/4 + 4` at the armhole, and a
  sleeve cap is `armhole/3`. Today that arithmetic is done in the maker's head and
  typed as literals into every dimension; changing the bust means re-deriving
  eight dimensions by hand and hoping none was missed.
- **What exists today:**
  - `DistanceConstraint` (`packages/geometry/src/types.ts:141`) is driving
    (`value`), driven (absent), or a one-hop copy (`reference` + `lastKnownValue`).
    `resolveSetValue` (`dimension.ts:335`) walks a reference chain and
    `captureBrokenDependents` (`commands.ts:1113`) keeps a dangling dependent
    honest. That is the whole parameter story: no arithmetic, no names.
  - Every other parameter is a plain literal: `CornerRound.radius`
    (`types.ts:391`), `Allowance.width` (`types.ts:231`) and
    `AllowancePreset.width` (`types.ts:238`).
  - There is no place in the document to put a value that is not a number:
    `PatternDocument` has `entities`, `constraints`, `pieces`, `assemblies`,
    `tabs`, `defaults` and nothing else.
- **Constraint:** commands stay the only mutation path, `@sewcraft/geometry` stays
  pure and dependency-free, and every existing numeric document must keep loading
  and solving unchanged.

## 📝 Proposed Solution

1. `PatternDocument.variables?: Variable[]` — `{ slug, name, value }`, document
   level, shared by every piece.
2. Parameter fields become `Param = number | { expr: string; lastKnown: number }`.
   Affected: `DistanceConstraint.value`, `CornerRound.radius`, `Allowance.width`,
   `AllowancePreset.width` (which covers `PatternDefaults.allowance` and
   `PieceDefaults.allowance`).
3. `packages/geometry/src/expression.ts` — tokenizer, parser, evaluator, cycle
   detection, plus `resolveParam(document, param)` and
   `resolveVariable(document, slug, visited)`.
4. Single resolution seam per reader: `resolveConstraintValue` returns the
   resolved number, `piece.ts`/`flatten.ts` call `resolveParam` where they read a
   radius or width, and `resolveDimensionValue` keeps its signature so the canvas
   label code does not change.
5. Commands `set_variable`, `update_variable`, `remove_variable`; every command
   that already takes a width or radius accepts `Param` instead of `number`, and
   `update_constraint` accepts `value: Param | null`.

## 📝 Data Model

```ts
/** A named value in the document, referenced by formulas through its slug. */
export interface Variable {
  /** Stable machine identifier in formulas: `v_` + slug of the name at creation. */
  slug: string;
  /** Free-form display name, trimmed, 1–60 characters, unique case-insensitively. */
  name: string;
  /** Literal millimetres, or a formula over other variables. */
  value: Param;
}

/** A parameter: a literal millimetres value, or a formula with its last result. */
export type Param = number | { expr: string; lastKnown: number };
```

- `variables` is optional so a 0.4 document loads and resolves to "no variables".
- `slug` grammar: `^v_[a-z0-9_]{1,40}$`. Minted at creation from `name`:
  ASCII-fold, lowercase, any run of non-alphanumerics → `_`, trim leading and
  trailing `_`, prefix `v_`, truncate to 40 characters after the prefix, then
  de-duplicate with `_2`, `_3`… Slugs never change after creation, including on
  rename and on delete-and-recreate of a different variable.
- `name` must be unique case-insensitively, or `set_variable` is rejected. Slugs
  are always unique by construction.
- `lastKnown` is written by every command that stores an expression, and is never
  recomputed on read; it is the value the parameter keeps if its formula later
  breaks.
- Rejected as variables: `slugs` that would collide with a JS keyword are
  impossible because of the `v_` prefix, so the grammar needs no keyword list.

## 📝 Expression Language

Grammar (recursive descent, precedence climbing):

```
expr    := term (('+' | '-') term)*
term    := factor (('*' | '/') factor)*
factor  := ('+' | '-') factor | primary
primary := number | slug | '(' expr ')'
number  := [0-9]+ ('.' [0-9]+)?        // no exponent, no sign (unary minus is a node)
slug    := 'v_' [a-z0-9_]+
```

- Whitespace is insignificant. Anything else — `,`, `%`, `^`, `**`, identifiers
  without the `v_` prefix, a trailing operator, unbalanced parentheses — is a
  `CommandValidationError` naming the offset.
- Evaluation is left-associative IEEE-754 double arithmetic in millimetres.
- `/` by zero yields a non-finite result, which is rejected at write time, so a
  stored `lastKnown` is always finite.
- Recursion depth is bounded at 64 nested parentheses or unary signs, so a
  hand-crafted document cannot exhaust the stack.
- Variable values use the same grammar, so `v_ease = v_bust/10` is legal. A slug
  repeating in its own chain (`a → b → a`) is a **cycle**: rejected at write time
  by walking the chain with a `visited` set, the same shape `resolveConstraintValue`
  uses.
- Result range: finite, and positive where the field requires it (`radius > 0`,
  `width > 0`). A formula may legitimately be negative only where a negative
  literal is already legal — which today is nowhere, since every parameter is a
  length.

## 📝 API Contracts

New commands (all in `packages/geometry/src/commands.ts` `Command` union,
`config/geometry.php`, `docs/domain/command-spec.md` and
`docs/domain/command-spec.json`, kept in sync):

### `set_variable`

- params: `slug: string`, `value: number | { expr }` — or `name` with `value` to
  mint a slug
- Validates the slug grammar, name uniqueness, and the formula (parses, slugs
  exist, no cycle, finite, positive). Stores `{ expr, lastKnown }` for a formula.
- Re-applying with a byte-identical slug is an update no-op.
- inverse: `remove_variable` for a fresh slug, otherwise the previous `value`.

### `update_variable`

- params: `slug: string`, and any of `name`, `value`
- Rename changes `name` only; the slug survives so formulas keep resolving.
- inverse: the previous `name`/`value`.

### `remove_variable`

- params: `slug: string`
- Removes the variable and leaves every dependent parameter intact with its
  `lastKnown` value, mirroring `captureBrokenDependents`. Dependents are never
  deleted or rewritten as literals, so restoring the variable with the same slug
  re-links them.
- inverse: `set_variable` with the removed value (and the same slug).

### Parameter-accepting command changes

| Command                                             | Field            | Change            |
| --------------------------------------------------- | ---------------- | ----------------- |
| `update_constraint`                                 | `value`          | `Param \| null`   |
| `add_corner_round`, `set_corner_round_radius`       | `radius`         | `Param`           |
| `add_seam_allowance`, `set_seam_allowance`          | `width`          | `Param`           |
| `set_piece_allowance`                               | `width`          | `Param`           |
| `set_default_allowance`, `set_piece_default_allowance` | `width`       | `Param`           |

- A formula on `DistanceConstraint.value` keeps `reference` mutually exclusive, as
  today. `value: null` still means driven.
- Formula and reference are different links: a formula parameter shows no
  relationship arrow, and `reference` cannot point at a variable yet.
- Every command above validates and records `lastKnown` at write time.
- Read-time failure is impossible for a stored parameter unless a variable was
  deleted; `resolveParam` then returns `lastKnown`, so no downstream reader gains
  a null case it did not already have.

## 📝 UI/UX

- **Variables panel** — a new `PanelId` `'variables'`, rail glyph `constraints` at
  first (a dedicated glyph can come later), available in `piece` mode only (see
  `frontend/src/lib/editor-panels.ts`). Rows: display name (editable inline), the
  formula or value, and the resolved number. Add, rename, delete. Empty state
  explains what a variable is with one example.
- **Formula entry** — the dimension value box (and radius/allowance inputs)
  becomes a text input. Typing a number behaves exactly as today. Typing anything
  containing an operator, a letter or `(` switches the field to formula mode on
  commit; `=` as the first character forces it. A variable picker next to the
  field inserts a slug at the caret.
- **Live result** — under a formula field, the resolved millimetres at the
  existing 1 µm display precision. Errors render inline and block the commit,
  naming the offset: `unknown variable v_bst at 4`.
- **Unknown slug** — an inline error plus a one-click "create variable
  `v_bust`" that mints a variable named after the slug (the user renames it in the
  panel). No silent auto-creation on blur.
- **Label** — canvas and SVG export show the resolved number only, at the existing
  precision (`number.ts`). The formula shows in the inspector, and in the panel.
- **Broken parameter after a delete** — the dimension or allowance keeps showing
  its last number, flagged in the inspector as "variable deleted" with a link to
  the panel; nothing blocks the sketch from solving.

## 📝 Edge Cases & Failure Scenarios

- **Delete a variable with ten dependents:** all ten keep `lastKnown`, one solve
  runs, no geometry moves.
- **Recreate the same slug:** dependents re-link automatically and jump to the new
  value, because the formula was never rewritten. This is intended, and documented
  in the panel copy.
- **Rename:** no formula changes; only the panel label moves.
- **Duplicate name:** rejected (case-insensitive), with the existing variable
  named in the error.
- **Cycle:** rejected at write time; a hand-edited document containing one is
  rejected on the command that touches it and resolves to `lastKnown` on read if
  it arrives through a load.
- **Non-finite:** `1/0`, and a huge product overflowing, rejected at write with
  the field named.
- **Formula on `DistanceConstraint.value` plus `reference`** in one command:
  rejected, exactly like `value` + `reference` today.
- **Deleting an entity that owns a formula parameter:** unchanged — cascade rules
  apply to the entity, and the formula dies with its parameter.
- **Undo:** journal snapshots cover the variable collection; `remove_variable`'s
  inverse restores it and dependents re-link.
- **Older build reading a 0.5 document:** refused by `KNOWN_PATTERN_SCHEMAS`, not
  silently mis-read.
- **0.4 document in a 0.5 build:** loads; `variables` is absent and resolutions
  are identical to today.

## 📝 Risks & Impact Review

- **Reader breadth.** The union touches every place a radius or width is read.
  Mitigation: one `resolveParam` helper, no direct field reads left behind, and a
  grep-level review in the PR.
- **Schema drift.** Four documents describe the contract (`command-spec.md`,
  `command-spec.json`, `config/geometry.php`, types). Mitigation: one checklist
  line per command in the PR body.
- **Silent behaviour change on save.** A formula parameter round-trips as an
  object, not a number; every export path must resolve, not read the field.
  Mitigation: integration test comparing an exported SVG with a literal-only
  document of identical geometry.
- **Coverage.** The grammar's failure branches are the bulk of new tests; the spec
  keeps the grammar deliberately small so 100% stays achievable rather than waived.
- **Not covered:** measurement sets, grading, unit conversion, variables in
  positions, variables in text labels.

## ❓ Open Questions (resolved)

1. **Scope** → pattern parameters only: dimension values, corner-round radius,
   allowance widths, document and piece allowance presets. Positions and
   presentation stay literal.
2. **Storage** → union at each field, `number | { expr, lastKnown }`.
3. **Nesting** → variables may reference other variables.
4. **Name rules** → free-form display names, referenced in formulas by a stable
   slug minted at creation.
5. **Delete semantics** → dependents stay, broken, with `lastKnown`.
6. **UI surface** → a Variables sidebar panel plus formula fields in the existing
   inspectors.
7. **Entry** → type the formula in the value box; a picker inserts slugs.
8. **Label display** → resolved number only, in canvas and export.
9. **Precision** → full double internally; rounding is presentation only.

## ✅ Acceptance criteria

- [ ] Editing a variable updates every dependent dimension, radius and allowance
      in one solve.
- [ ] Renaming a variable changes no formula and moves no geometry.
- [ ] A cyclic, unknown-slug or non-finite formula is rejected at write time with
      a named offset; nothing half-applied.
- [ ] Deleting a referenced variable leaves dependents showing their last number,
      and the sketch still solves.
- [ ] Recreating the same slug re-links the dependents.
- [ ] A literal-only document exports byte-identical SVG before and after the
      change; a formula document exports geometry identical to its literal twin.
- [ ] A `sewcraft.pattern/0.4` fixture loads and solves unchanged.
- [ ] `npm run test:coverage` stays at 100% for statements, branches, functions
      and lines, backend stays at 100%, and Pint/ESLint/Prettier/typecheck pass.

## 📋 Phasing

1. **Evaluator** — `expression.ts` plus tests: grammar, precedence, unary signs,
   depth bound, unknown slug, cycle, non-finite. No document change yet.
2. **Model** — `Variable`, `Param`, schema `0.5`, `resolveParam`, `resolveVariable`,
   reader migration, 0.4 load test.
3. **Commands** — `set_variable`, `update_variable`, `remove_variable`, the
   parameter unions, inverses, `captureBrokenDependents` extension, spec JSON +
   `config/geometry.php` at `0.17.0`.
4. **UI** — Variables panel, formula inputs with live result and inline errors,
   broken-parameter flag.
5. **Evidence** — integration test through the real API and a browser pass on the
   panel and a formula dimension.

## 📋 Implementation Plan

- `packages/geometry/src/expression.ts` — tokenizer, parser, `evaluate`,
  `resolveVariable`, `resolveParam`, exported types; unit tests beside it.
- `packages/geometry/src/types.ts` — `Variable`, `Param`, `variables?` on
  `PatternDocument`, field type changes, `PATTERN_SCHEMA` → `0.5`.
- `packages/geometry/src/dimension.ts` — `resolveConstraintValue` resolves a
  `Param`; `dimensionState` treats an unresolved formula as broken.
- `packages/geometry/src/piece.ts`, `flatten.ts`, `export.ts` — resolve radius and
  width through `resolveParam` (grep for `.width` and `.radius` reads).
- `packages/geometry/src/commands.ts` — three variable commands, parameter
  validation, inverse wiring, `captureBrokenDependents` extension.
- `packages/geometry/src/migration.ts` + `defaults.ts` — accept `0.4` on read,
  normalize a missing `variables` to absent.
- `config/geometry.php`, `docs/domain/command-spec.md`,
  `docs/domain/command-spec.json` — new commands and `0.17.0`.
- `frontend/src/lib/editor-panels.ts`, `components/sidebar/VariablesPanel.vue`,
  `EditorView.vue` panel slot, `EntityPropertiesPanel.vue` and the dimension
  inspector — formula inputs, picker, live result, broken flag.
- `frontend/tests/**` mirroring each new module path for path; `integration/` for
  the end-to-end case.

## Checks

```bash
npm test && npm run test:coverage && npm run lint && npm run format:check && npm run typecheck
docker compose exec app php artisan test
```

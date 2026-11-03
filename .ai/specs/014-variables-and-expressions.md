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
`v_bust_cm/4 + 2cm` wherever a length, radius or allowance is set. Variables live
in the pattern document with their own unit (mm or cm), formulas use a stable slug
rather than the display name, and every parameter field becomes
`number | { expr, lastKnown }`. The evaluator does dimension algebra, so adding a
length to a plain number is an error rather than a silent millimetre assumption,
and every parameter resolves to a length in mm. Resolution happens on read in
`@sewcraft/geometry`; the solver, `flatten` and export keep their shapes, because
a formula is substituted before any of them runs. A write must resolve; a
parameter breaks only when a variable it names is deleted, and then it keeps its
last number, exactly like a dangling dimension `reference`.

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

1. `PatternDocument.variables?: Variable[]` — `{ slug, name, unit, value, comment? }`,
   document level, shared by every piece.
2. Parameter fields become `Param = number | { expr: string; lastKnown: number }`.
   Affected: `DistanceConstraint.value`, `CornerRound.radius`, `Allowance.width`,
   `AllowancePreset.width` (which covers `PatternDefaults.allowance` and
   `PieceDefaults.allowance`).
3. `packages/geometry/src/expression.ts` — tokenizer, unit-aware parser, evaluator
   returning a millimetre quantity with a length exponent, cycle detection, plus
   `resolveParam(document, param)` and `resolveVariable(document, slug, visited)`.
4. Single resolution seam per reader: `resolveConstraintValue` returns the
   resolved number, `piece.ts`/`flatten.ts` call `resolveParam` where they read a
   radius or width, and `resolveDimensionValue` keeps its signature so the canvas
   label code does not change.
5. Commands `set_variable`, `update_variable`, `remove_variable`; every command
   that already takes a width or radius accepts `Param` instead of `number`, and
   `update_constraint` accepts `value: Param | null`.

## 📝 Data Model

```ts
/** A length unit a variable is written and read in. Canonical storage is mm. */
export type Unit = 'mm' | 'cm';

/** A named value in the document, referenced by formulas through its slug. */
export interface Variable {
  /** Stable machine identifier in formulas: `v_` + slug of the name at creation. */
  slug: string;
  /** Free-form display name, trimmed, 1–60 characters, unique case-insensitively. */
  name: string;
  /** The unit a literal `value` is written in, and the unit the table shows. */
  unit: Unit;
  /** A literal in `unit`, or a formula over other variables and unit literals. */
  value: Param;
  /** Optional free text, trimmed, 0–120 characters; absent or empty means none. */
  comment?: string;
}

/** A parameter: a literal millimetres value, or a formula with its last result. */
export type Param = number | { expr: string; lastKnown: number };
```

- `variables` is optional so a 0.4 document loads and resolves to "no variables".
- `unit` is required on every variable, defaulting to `mm` on creation. A literal
  `value` is read in that unit (`{ unit: 'cm', value: 88 }` is 880 mm); a formula
  value ignores the literal unit and its declared unit is the unit the table
  displays, so switching cm → mm converts the shown number, not the geometry.
- A variable whose formula evaluates to a ratio shows no unit and is marked
  `Ratio` in the type column; it cannot be used where a length is required.
- `slug` grammar: `^v_[a-z0-9_]{1,40}$`. Minted at creation from `name`:
  ASCII-fold, lowercase, any run of non-alphanumerics → `_`, trim leading and
  trailing `_`, prefix `v_`, truncate to 40 characters after the prefix, then
  de-duplicate with `_2`, `_3`… Slugs never change after creation, including on
  rename and on delete-and-recreate of a different variable.
- `name` must be unique case-insensitively, or `set_variable` is rejected. Slugs
  are always unique by construction.
- `comment` is optional and carries no uniqueness or resolution rule; an empty
  string normalizes to absent, and the panel truncates it with a tooltip.
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
primary := number unit? | slug | '(' expr ')'
number  := [0-9]+ ('.' [0-9]+)?        // no exponent, no sign (unary minus is a node)
unit    := 'mm' | 'cm'                  // case-insensitive, space optional
slug    := 'v_' [a-z0-9_]+
```

- Whitespace is insignificant. Anything else — `,`, `%`, `^`, `**`, `in`, an
  identifier without the `v_` prefix, a trailing operator, unbalanced
  parentheses — is a `CommandValidationError` naming the offset.
- **Quantities.** Every sub-expression evaluates to a value in canonical
  millimetres plus an integer length exponent: `0` is a ratio, `1` a length, `2`
  an area. A suffixed literal (`5cm` = 50) and a variable both carry exponent 1;
  a bare literal is exponent 0.
- **Dimension rules.** `+` and `-` require equal exponents and convert cm to mm
  first (`v_bust_cm/4 + 2cm` is legal, `v_bust_cm/4 + 2` is not: a length plus a
  plain number). `*` and `/` add and subtract exponents. Unary `-` keeps the
  exponent.
- A variable's value may be a length or a ratio; anything else
  (`v_a * v_b`, an area) is rejected. A parameter always requires a length, so
  `update_constraint { value: { expr: 'v_bust_cm/v_waist' } }` is rejected with
  "expected a length, got a ratio".
- Evaluation is left-associative IEEE-754 double arithmetic, in millimetres.
- `/` by zero yields a non-finite result, which is rejected at write time, so a
  stored `lastKnown` is always finite.
- Recursion depth is bounded at 64 nested parentheses or unary signs, so a
  hand-crafted document cannot exhaust the stack.
- Variable values use the same grammar, so `v_ease = v_bust_cm/10` is legal. A
  slug repeating in its own chain (`a → b → a`) is a **cycle**: rejected at write
  time by walking the chain with a `visited` set, the same shape
  `resolveConstraintValue` uses.
- Result range: finite, and positive where the field requires it (`radius > 0`,
  `width > 0`). A formula may legitimately be negative only where a negative
  literal is already legal — which today is nowhere, since every parameter is a
  length.

## 📝 API Contracts

New commands (all in `packages/geometry/src/commands.ts` `Command` union,
`config/geometry.php`, `docs/domain/command-spec.md` and
`docs/domain/command-spec.json`, kept in sync):

### `set_variable`

- params: `slug: string`, `value: number | { expr }`, `unit?: 'mm' | 'cm'`
  (default `mm`), `comment?: string` — or `name` with `value` to mint a slug
- Validates the slug grammar, name uniqueness, the comment length, and the formula
  (parses, slugs exist, no cycle, dimensions agree, result is a length or ratio,
  finite, positive). Stores `{ expr, lastKnown }` for a formula.
- Re-applying with a byte-identical slug is an update no-op.
- inverse: `remove_variable` for a fresh slug, otherwise the previous
  `value`/`unit`.

### `update_variable`

- params: `slug: string`, and any of `name`, `unit`, `value`, `comment`
- Rename changes `name` only; the slug survives so formulas keep resolving.
  `comment: null` clears it.
- A `unit` change **converts** a literal value to the new unit so the measurement
  is preserved (`88 cm` → `880 mm`); a formula value keeps its formula and only
  its display unit changes. Dependents never move because of a unit switch.
- inverse: the previous `name`/`unit`/`value`/`comment`.

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
  `frontend/src/lib/editor-panels.ts`). One plain table, no cards:

  | Name       | Value            | Unit | Type    | Comment          |
  | ---------- | ---------------- | ---- | ------- | ---------------- |
  | Bust (cm)  | 88               | cm   | Number  | Body measurement |
  | Ease       | `v_bust_cm/10`   | mm   | Formula | Design ease      |
  | Fit ratio  | `v_ease/v_bust`  | —    | Ratio   | Used for grading |

  - `Name`, `Unit` and `Comment` are inline-editable cells; `Value` is the same
    formula-aware input the inspectors use; `Type` is derived, never stored:
    `Number` for a literal, `Formula` for `{ expr }`, `Ratio` when the formula's
    dimension is dimensionless (and then `Unit` shows `—`).
  - `Unit` is a two-option select (`mm`, `cm`). Changing it converts a literal
    value so the measurement is preserved; a formula keeps its text and only the
    displayed unit changes. This is the only cell that can move a dependent
    number without moving the geometry, so it commits on change, not on blur.
  - The value cell shows the formula text, so the table reads as the source of
    truth; a formula's resolved millimetres appear on hover/focus and in the
    inspector, not as a column.
  - Columns are sized name 1fr, value 84px, unit 48px, type 56px, comment 1fr.
    At the 320 px default the comment truncates first; at the 240 px minimum the
    comment collapses to an icon with a tooltip and `Type` collapses to its
    marker (ƒ for formula, ∅ for ratio).
  - Row actions: delete on the row (an icon shown on hover and focus), and a
    `+ New` button in the section heading. There is no separate detail pane.
  - Empty state (via `SidebarEmpty`) names the idea with one example:
    "Name a measurement once — `Bust (cm) = 88`, then use `v_bust_cm/4 + 2cm` in a
    dimension."
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
- **Dimension mismatch:** `v_bust_cm/4 + 2` (length + plain number) and
  `v_bust_cm + 3mm` (both lengths, legal) are decided by the exponent rule;
  `v_bust_cm * v_waist` is an area and is rejected as a variable value with
  "expected a length or ratio, got mm²".
- **Ratio where a length belongs:** a ratio variable inside a dimension formula is
  rejected with "expected a length, got a ratio"; a ratio inside another variable's
  formula is fine.
- **Unit switch:** changing `Bust (cm)` from `cm` to `mm` rewrites its literal
  `88` → `880` and moves nothing; a formula-valued variable keeps its formula and
  only the displayed unit changes.
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
- **Not covered:** measurement sets, grading, units beyond mm and cm, functions
  (`min`, `max`, `abs`), variables in positions, variables in text labels.

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
10. **Unit semantics** → full dimension algebra: suffixed literals and variables
    carry a length, addition needs equal dimensions, parameters resolve to mm.
11. **Unit set** → `mm` and `cm` only; imperial waits for the measurement library.

## ✅ Acceptance criteria

- [ ] Editing a variable updates every dependent dimension, radius and allowance
      in one solve.
- [ ] A variable's name, value, unit, type and comment round-trip through save
      and reload, and the panel table stays readable at the 240 px minimum width.
- [ ] `88 cm` and `880 mm` resolve to the same millimetres, `5cm + 2mm` is 52, and
      switching a literal variable's unit preserves the measurement.
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

1. **Evaluator** — `expression.ts` plus tests: grammar, unit suffixes, dimension
   algebra, precedence, unary signs, depth bound, unknown slug, cycle, non-finite.
   No document change yet.
2. **Model** — `Variable`, `Unit`, `Param`, schema `0.5`, `resolveParam`,
   `resolveVariable`, reader migration, 0.4 load test.
3. **Commands** — `set_variable`, `update_variable`, `remove_variable` including
   the unit conversion on switch, the parameter unions, inverses,
   `captureBrokenDependents` extension, spec JSON + `config/geometry.php` at
   `0.17.0`.
4. **UI** — Variables panel table (name, value, unit, type, comment), formula
   inputs with live result and inline errors, broken-parameter flag.
5. **Evidence** — integration test through the real API and a browser pass on the
   panel and a formula dimension.

## 📋 Implementation Plan

- `packages/geometry/src/expression.ts` — tokenizer with unit suffixes, parser,
  quantity evaluation with length exponents, `resolveVariable`, `resolveParam`,
  exported types; unit tests beside it.
- `packages/geometry/src/types.ts` — `Variable`, `Unit`, `Param`, `variables?` on
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

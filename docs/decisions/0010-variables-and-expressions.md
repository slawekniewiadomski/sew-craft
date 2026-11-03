# ADR-0010: Named variables and expressions in pattern documents

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

A dimension today carries a literal millimetres `value` (driving), no value
(driven), or a `reference` to another `distance` constraint.

That last one was the first parameterisation step: a referenced dimension
resolves its source chain on every read, stores no literal, and keeps a
`lastKnownValue` so a broken chain can still show a number. It solves "this edge
is the same as that edge" and nothing more — no arithmetic, no shared named
constants, no way to express `90 + 5` or to change a bodice length in one place.

Drafters think in named measurements (bust, waist, ease) and in formulas over
them (`bust / 4 + 2`). Spec 012 (measurements & sizing) defers that work and
explicitly asks for an ADR before any code. This is that ADR; the sizing/grading
half of 012 stays deferred.

## Decision

1. **Variables live in the pattern document**, as `variables?: Variable[]` with
   `{ slug, name, unit, value, comment? }`, shared by every piece. No separate DB
   table and no API surface beyond the command layer yet, so a document always
   describes itself and save/export stay self-contained.
2. **Expressions are available on pattern parameters**, not on every number: a
   dimension's driving value, a corner-round radius, an allowance width, and the
   document and piece allowance presets. Positions and presentation (point
   `x`/`y`, assembly instance `x`/`y`/`rotation`, dimension `offset`, text
   placement, piece `quantity`) stay literal numbers.
3. **Each parameter field is a union:** `Param = number | { expr, lastKnown }`.
   Plain numbers keep working everywhere, every reader resolves through one
   helper, and the formula lives on the parameter it drives rather than in a side
   map keyed by entity and field name that can silently desync.
4. **Formulas use a stable machine slug, not the display name.** A variable's
   `name` is free-form (`Bust (cm)`); its `slug` is minted once at creation
   (`v_bust_cm`) and never changes, so renaming is a pure rename and never
   re-parses a formula. The UI shows names in the panel, slugs inside formulas,
   and the picker inserts the slug.
5. **Variables may be defined with expressions too**, so `v_ease = v_bust/10` and
   `v_bodice = v_bust/4 + v_ease` work. Cycles are possible for the first time
   and are detected per evaluation, not per document.
6. **A variable declares its unit — mm or cm — and the evaluator does dimension
   algebra.** A bare numeric literal is dimensionless; a suffixed one (`5cm`,
   `2 mm`) carries a length; a variable is a length. Addition needs equal
   dimensions with automatic cm↔mm conversion, multiplication and division
   combine them, and every parameter resolves to a length in mm. A formula may
   produce a dimensionless ratio, which is a legal variable but not a legal
   parameter. Units change entry and display, never the solver's millimetres.
7. **Evaluation lives in `@sewcraft/geometry`** as a small deterministic
   tokenizer + recursive-descent evaluator. No `eval`, no dependency, no
   `Function` constructor, no surprises beyond IEEE doubles. Rounding is
   presentation only; full precision reaches the solver and export.
8. **A write must resolve, a read must not fail.** Every command storing an
   expression validates it (parses, slugs exist, no cycle, dimensions agree,
   finite, positive where the field requires it) and records `lastKnown`. A
   parameter only breaks later, when a variable it names is deleted: it then keeps
   its last resolved number, exactly as a dangling `reference` keeps
   `lastKnownValue`, and the document keeps solving.
9. **Everything mutates through commands** — `set_variable`, `update_variable`,
   `remove_variable`, and every existing parameter command accepting `Param` — so
   undo, autosave and the agent interface need no special cases.
10. **Schema bump** to `sewcraft.pattern/0.5`. The addition is a superset of 0.4
    (absent `variables`, plain numbers still valid), so 0.4 documents load
    unchanged; the disk format moves so a 0.5 document is not silently opened by
    an older build.

## Consequences

- One place to change a measurement instead of an edit per parameter.
- Readers change, the solver does not: this is a read-time substitution, not a
  new equation kind, so `flatten`, export and the solver keep their shapes.
- Every write path that takes a width or radius gains validation it did not need
  before; that is the main cost of the union.
- Cycles become representable in stored data and must be detected per evaluation.
- Units bring dimension checking into every write: a mismatched formula is
  rejected with a readable reason, so the document never stores a length the
  solver would read as an area. This is the main new source of validation code.
- Ratios are possible and useful (`v_ease_ratio = v_ease/v_bust`), but they are
  legal only as variables, not as distances, radii or allowances.
- Formulas are an automation surface only in the arithmetic sense: no name in the
  grammar resolves to anything but a quantity, and a slug is a lookup key, not a
  property access.
- Coverage stays at 100%: the grammar has a small, enumerable set of failure
  modes, each with a test.
- Measurement sets and grading (spec 012) still need their own decision; a
  variable is the seam they will plug into.

## Alternatives considered

- **Named numbers only, no parser.** Cheaper and enough for simple layout work,
  but the first real use (`bust / 4 + 2`) forces a second, breaking schema change.
- **Expressions with functions** (`min`, `max`, `abs`). Still deferred: the
  grammar is a few hundred lines and each function is a new coverage surface.
- **Label-only units, no conversion.** Cheapest, but `Bust (cm) = 88` would mean
  88 mm while reading as centimetres, which is a trap in a drafting tool.
- **Convert at the edges only, no dimension algebra.** Values convert to mm at
  entry and formulas are dimensionless, which silently accepts `v_bust_cm *
v_waist` and lets the maker build a length out of two lengths.
- **Reuse an OSS expression library** (mathjs, expr-eval). Rejected: the package
  must stay dependency-light and the supported grammar is a few hundred lines.
- **Expressions on literally every number**, including point coordinates and
  placement. Rejected as v1: it makes layout animatable by formula, multiplies
  the read paths that must resolve, and buys nothing drafting needs first.
- **A side map `expressions: Record<entityId.field, string>`.** Tiny diff in
  existing code, but the path strings are implicit, unvalidated, and easy to
  desync from the entity they describe.
- **Referencing variables by display name.** Free-form names then need quoting in
  the grammar and every rename risks re-parsing a formula into a different
  meaning.
- **Variables per piece.** Real patterns share constants across pieces (waist is
  waist); per-piece scoping invites duplication and blocks grading.
- **Store variables outside the document.** Makes sizing-set swaps cheap but
  splits the pattern from its parameters, breaking self-contained save/export and
  offline editing.

## Revisit when

Patterns need shared measurement sets across projects, grading by size, or units
beyond mm and cm (`in`, `ft`, and paper sizes) — that is where variables either
grow into spec 012 or move out of the document into a project-level measurement
library. Also revisit if formula-driven placement becomes a real drafting need
rather than a curiosity.

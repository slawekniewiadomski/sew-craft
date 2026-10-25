# Execution plan — direction constraints on rounded-corner lines

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-25 from
PR #93's spec (`.ai/specs/2026-10-25-rounded-corner-line-constraints.md`).
**PR:** #93 · **Branch:** `spec/rounded-corner-line-constraints` · **Base:** `develop`
**Operator brief:** implement the spec on this same branch; do not open a second
PR; never merge. The spec is the plan of record — this file only tracks progress.

## 🎯 Goal

A line end trimmed by a corner round still names the sharp corner as its authored
anchor. Direction constraints (`point_on_line`, `horizontal`, `vertical`) store
those support anchors, so the Point tool and the constraint ribbon work on a
rounded line, and a constraint created before a round stays listed afterwards.
`distance` and `equal` keep the visible endpoints and stay rejected on rounded
lines.

## Scope

- `packages/geometry`: `lineEndpointAnchor` and `lineSupportAnchors` in
  `corner-round.ts`, the two private copies delegated to them, version 0.14.0.
- `frontend`: Point-tool builder, constraint ribbon and inspector use the
  helper; direction constraints match either the endpoint pair or the support
  pair.
- Docs and specs: `geometry-core.md`, the point-on-line amendment, this spec's
  status and acceptance criteria.

## Non-goals

- No command, schema, solver or HTTP change; the stored document shape is
  unchanged.
- `equal` and two-point `distance` on rounded lines stay out of scope.
- No marker-placement or inspector-layout change.
- No mockup or screenshot: the gesture already exists and now succeeds.

## Assumptions

- `spec-ready` on PR #93 is the maintainer's approval of the autonomous defaults
  (R1–R7 in the spec).
- The implementation ships on this branch, per the operator brief and
  `AGENTS.md`'s one-combined-PR route, overriding the design-only hand-off in
  the skill body.
- `lineSupportAnchors`' null guard is exercised through the ribbon and the
  inspector; the Point-tool builder keeps `lineEndpoints` for projection, whose
  guards make a second pair guard unreachable, so no dead branch is added there.

## Risks

- **Stored reference semantics (medium).** Constraints built from a rounded line
  now name the sharp corner instead of the tangent; rollback is restoring raw
  endpoint ids, with no migration. Risk raised from `risk-low` to `risk-medium`
  to match the spec's own rating.
- **Inspector matching (low).** The support pair is line-specific, and the exact
  endpoint match still wins.
- **Coverage.** Every new branch is tested: plain, one-end and both-end mappings,
  the null guards, both creation paths and the inspector pair match.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The rule and its callers

- [x] 1.1 `lineEndpointAnchor` and `lineSupportAnchors` with unit tests and a collinearity assertion — 5863ba6
- [x] 1.2 Delegate `originalAnchor` and the frontend `anchorOf`, bump geometry to 0.14.0 — 5863ba6
- [x] 1.3 Command-level regression: a pre-round constraint survives removal, undo and a radius change — 5863ba6

### Phase 2: Create the constraints

- [x] 2.1 Point-tool builder stores the support anchors while projecting onto the trimmed segment — b01642c
- [x] 2.2 Constraint ribbon maps `point_on_line`, `horizontal` and `vertical` to the support anchors — b01642c
- [x] 2.3 Unit and editor tests for the rounded click and the length-relation carve-out — b01642c

### Phase 3: Keep the inspector honest

- [x] 3.1 Inspector matches direction constraints against either pair — 431277a
- [x] 3.2 Document the helpers and the reference rule; mark the spec implemented — 431277a
- [x] 3.3 Full validation gate and authoritative review (approved, one minor fixed) — 17e2050

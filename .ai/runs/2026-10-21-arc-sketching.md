# Execution plan — implement the arc sketching spec on PR #55 (adopted from PR #55)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-21 because PR #55 carried only a design spec and no execution plan.
**PR:** #55 · **Branch:** `spec/arc-sketching` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Ship the `arc` entity, the additive `add_arc` command, the Arc tool and its derived
read-only properties on this branch, so a user can sketch a true circular arc
through three points and the pattern renders and exports it as one SVG `A` command.

## Scope

- `@sewcraft/geometry`: `ArcEntity`, `arc.ts` circular maths, `add_arc`, bounds,
  cut edges, selection, SVG export and seam-allowance polyline flattening.
- Command contract: `config/geometry.php`, command-spec docs, data-model and
  geometry-core docs.
- Frontend: the shared `drafting.ts` endpoint resolver, the Arc tool and ribbon
  glyph, `arc-tool.ts`, the three-click canvas state machine with chord/arc preview
  and collinear hint, focused commit, and read-only derived properties.
- Tests at the repository's 100 % coverage gate.

## Non-goals

- Circle sketching (#52) — separate spec and PR; shared endpoint resolution only.
- Radius editing, radius/diameter dimensions, tangency and centre-based arcs.
- Any schema-string, HTTP route or database migration change.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal and every phase | `.ai/specs/2026-10-21-arc-sketching.md` (Phases 1–4 and Implementation Plan) | high |
| Entity shape and gesture are settled | spec's Q1/Q2 recommendations plus the human `spec-ready` label on the PR | high |
| Validation gate | `.ai/agentic.config.json` `validation.commands` | high |
| Test and coverage rules | `AGENTS.md` (100 % statements/branches/functions/lines) | high |

## Assumptions

- The `spec-ready` label means Q1 (three-point arc) and Q2 (separate `arc` kind) are
  approved as recommended.
- `spec_version` goes `0.7.0 → 0.8.0`; if circle PR #54 merges first, this branch
  needs one mechanical rebase to `0.9.0`, as the spec says.
- The preview and the collinearity guard share the geometry package's maths, so the
  canvas never reimplements the circumcircle.
- Seam allowances stay allowed on arcs (they flatten to a polyline); circles remain
  rejected.

## Risks

- A new entity kind reaches many exhaustive consumer switches; TypeScript plus tests
  guard each one.
- The sweep sign and the `largeArc`/`sweep` flags are easy to get silently wrong;
  tests cover all four quadrants, both directions, the ±π seam and a long arc.
- Bounds must include the arc's cardinal points inside the sweep, not only its
  three points.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Design spec for arc sketching

### Phase 2: Geometry core

- [x] 2.1 Add `ArcEntity`, `arc.ts` maths and `entityPoints` with tests — 21101dd
- [x] 2.2 Add `add_arc` validation, idempotence and inverse with tests — 21101dd
- [x] 2.3 Extend `bounds`, `cutEdges` and `entitiesInRect`, and flatten arcs in `edgePolyline`, with tests — 21101dd
- [x] 2.4 Render arcs in SVG as one `A` command with tests — 21101dd

### Phase 3: Command contract

- [ ] 3.1 Add the command to `config/geometry.php`, bump `spec_version`, sync docs and backend test

### Phase 4: Canvas interaction

- [ ] 4.1 Extract `drafting.ts` from `line-tool.ts` and add the Arc tool, ribbon item and glyph
- [ ] 4.2 Add `arc-tool.ts` endpoint resolution and grouped command batch with tests
- [ ] 4.3 Wire the three-click canvas gesture, chord/arc preview, collinear hint, hit target and component tests

### Phase 5: Properties and verification

- [ ] 5.1 Add the arc properties measurements and "Arc" noun with tests
- [ ] 5.2 Wire `EditorView.onAddArc` through `dispatchGroup` with view tests
- [ ] 5.3 Run the full validation gate and `om-auto-review-pr --autofix`
- [ ] 5.4 Retitle the PR, normalize labels, flip to ready and release the lock

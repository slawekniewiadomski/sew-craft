# Execution plan — implement the circle sketching spec on PR #54 (adopted from PR #54)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-21 because PR #54 carried only a design spec and no execution plan.
**PR:** #54 · **Branch:** `spec/circle-sketching` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

Ship the `circle` entity, the additive `add_circle` command, the Circle tool and its
properties on this branch, so a user can sketch a true circle and the pattern
renders and exports it as one SVG circle.

## Scope

- `@sewcraft/geometry`: `CircleEntity`, `circle.ts` maths, `add_circle`, bounds,
  cut edges, selection, SVG export and the seam-allowance rejection.
- Command contract: `config/geometry.php`, command-spec docs, data-model doc.
- Frontend: Circle tool and ribbon glyph, `circle-tool.ts` gesture helper, canvas
  preview/hit target, focused commit, properties radius field.
- Tests at the repository's 100 % coverage gate.

## Non-goals

- Arc sketching (#53) — separate spec and PR.
- Seam allowances on circles; radius dimensions as a new constraint type.
- Any schema-string, HTTP route or database migration change.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal and every phase | `.ai/specs/2026-10-21-circle-sketching.md` (Phases 1–4 and Implementation Plan) | high |
| Entity family and gesture are settled | spec's Q1/Q2 recommendations plus the human `spec-ready` label on the PR | high |
| Validation gate | `.ai/agentic.config.json` `validation.commands` | high |
| Test and coverage rules | `AGENTS.md` (100 % statements/branches/functions/lines) | high |

## Assumptions

- The `spec-ready` label means Q1 (`circle` kind) and Q2 (centre→radius) are approved
  as recommended.
- `spec_version` goes `0.7.0 → 0.8.0`; if arc PR #55 merges first, this branch needs
  one mechanical rebase to the next minor, as the spec says.
- The radius field edits a driving centre↔rim dimension when one exists, otherwise
  one `move_point` of the rim.

## Risks

- A new entity kind reaches many exhaustive consumer switches; TypeScript plus tests
  guard each one.
- Bounds must use the circle's cardinal extents, not only its two points.
- The goal is taken from a written spec, not inferred from a vague PR.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Design spec for circle sketching — 4153a19

### Phase 2: Geometry core

- [x] 2.1 Add `CircleEntity`, `circle.ts` helpers, `entityPoints` and tests — 5f746b8
- [x] 2.2 Add `add_circle` validation, idempotence and inverse with tests — 5f746b8
- [x] 2.3 Extend `bounds`, `cutEdges` and `entitiesInRect` with tests — 5f746b8
- [x] 2.4 Render circles in SVG and guard offset/seam allowance with tests — 5f746b8

### Phase 3: Command contract

- [x] 3.1 Add the command to `config/geometry.php`, bump `spec_version`, sync docs and backend test — 0286a6b

### Phase 4: Canvas interaction

- [x] 4.1 Add the Circle tool, ribbon item and glyph — 54b3d6e
- [x] 4.2 Add `circle-tool.ts` endpoint resolution and grouped command batch with tests — 54b3d6e
- [x] 4.3 Wire the canvas gesture, dashed preview, hit target and component tests — 54b3d6e

### Phase 5: Properties and verification

- [x] 5.1 Add the circle properties geometry, "Circle" noun and radius editing with tests — b1cbdc8
- [x] 5.2 Wire `EditorView.onAddCircle` through `dispatchGroup` with view tests — b1cbdc8
- [x] 5.3 Run the full validation gate and `om-auto-review-pr --autofix` — 3a07284
- [x] 5.4 Retitle the PR, normalize labels, flip to ready and release the lock — 25bdd18

# Execution plan — gray committed driven dimension labels (adopted from PR #40)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-20 because PR #40 carried no execution plan.
**PR:** #40 · **Branch:** `spec/driven-dimension-color` · **Base:** `develop`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by editing this file or commenting on the PR.

## 🎯 Goal

A committed driven dimension label renders in the theme's muted gray while a set
label stays foreground black, so the two states are distinguishable at a glance
on a busy canvas (#38), implemented on this branch and shipped with tests,
glossary wording and a green validation gate.

## Scope

- `frontend/src/components/PatternCanvas.vue` — label text fill bound to
  `driven && !preview`.
- `frontend/src/components/PatternCanvas.test.ts` — render assertions for the
  three states (driven committed, set, driven preview).
- `docs/domain/glossary.md` — the Driven dimension row records the muted-gray
  rendering.
- `.ai/specs/2026-10-20-driven-dimension-color.md` — Q1 answered, status flipped
  from `proposed` to `implemented`.

## Non-goals

- Option B (sidebar consistency): the Dimensions drawer and Properties inspector
  keep their current value text. Q1's recommended answer is option A.
- A dedicated `--dimension-driven` token (spec option C), a restyled dimension
  line (option E), and any change to `packages/geometry`, the API, the command
  contract, persistence or the SVG exporter.
- New visual-regression tooling; the rendering contract is a class binding.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| The work is a canvas-only label color change | Spec `.ai/specs/2026-10-20-driven-dimension-color.md` (Proposed Solution, Files, Phasing) | high |
| Q1 resolves to option A (canvas label only) | Spec Open Questions row Q1 recommended answer; `spec-ready` on the PR marks the design approved | high |
| Labels stay foreground in the inline editor and preview | Spec Resolved assumptions A4 and A5 | high |
| The change is presentation-only | Spec Data Model / API Contracts / Compatibility; `isDrivenDimension` already exists | high |
| Tests belong in the existing Vitest suite | Spec assumption A7 and `AGENTS.md` 100% coverage gate | high |
| Driven/set/dimension model already shipped | Branch base contains `formatDimensionLabel` and `isDrivenDimension`; the driven/set spec PR #36 is merged | high |

## Assumptions

- **Q1 = A.** The spec's recommended answer is applied because the PR is
  `spec-ready` and the recommendation is the narrowest, most reversible reading.
  Extending gray to the sidebar stays a follow-up; say so on #38 if the intent
  was option B.
- **The spec is the plan.** Its Phase 1 implementation plan steps are adopted
  verbatim as the execution steps; Phase 2 is skipped because it is conditional
  on Q1 = B, and Phase 3's contrast check is recorded rather than re-derived
  (the token value is unchanged).
- **The PR becomes the implementation PR.** Per `AGENTS.md`, a `feature` issue
  ships spec and implementation on one combined PR; this branch continues as
  that PR rather than opening a second one.

## Risks

- Gray can read as disabled. Mitigated by keeping parentheses, the stateful
  accessible name and the sidebar `Driven`/`Set` badges; the preview and the
  inline editor stay foreground.
- `muted-foreground` clears WCAG AA only narrowly (~4.7:1 on the white label);
  the implementation must not substitute a lighter gray.
- The goal was reconstructed from the spec rather than stated in the PR body.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Spec, current-state captures and canvas mockup committed — 8939a1b

### Phase 2: Implement the canvas label

- [x] 2.1 Bind `fill-muted-foreground` on a committed driven dimension label — 1964af6
- [x] 2.2 Extend the PatternCanvas render tests for driven, set and preview labels — 1964af6
- [x] 2.3 Record the muted-gray rendering in the domain glossary — 1964af6
- [x] 2.4 Answer Q1 (option A) in the spec and mark it implemented — 1964af6

### Phase 3: Verification and handoff

- [ ] 3.1 Run the full validation gate
- [ ] 3.2 Run `om-auto-review-pr 40 --autofix` and resolve findings
- [ ] 3.3 Retitle the PR, normalize labels, promote it to ready and report

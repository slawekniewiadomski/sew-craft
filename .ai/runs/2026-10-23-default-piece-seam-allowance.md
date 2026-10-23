# Execution plan — default piece seam allowance (adopted from PR #67)

**Origin:** adopted — reconstructed by `om-auto-continue-pr` on 2026-10-23 because
PR #67 is a design-only spec PR that the maintainer marked `spec-ready`, which
continues implementation on the same branch.
**PR:** #67 · **Branch:** `spec/default-piece-seam-allowance` · **Base:** `develop`
**Spec:** `.ai/specs/2026-10-23-default-piece-seam-allowance.md`
**Author:** @slawekniewiadomski — this plan interprets their intent; correct it by
editing this file or commenting on the PR.

## 🎯 Goal

Make a **10 mm seam** the project default for new pieces: store an optional
default allowance in the pattern document, copy it onto every edge of a new
piece, add an **All edges** bulk control to the piece card, and leave existing
pieces untouched.

## Scope

- `packages/geometry/src/types.ts`: `AllowancePreset`, `PatternDefaults`,
  `PatternDocument.defaults?`.
- `packages/geometry/src/defaults.ts` (new): `DEFAULT_ALLOWANCE_PRESET`,
  `effectiveDefaultAllowance`, `normalizeDefaults`.
- `packages/geometry/src/document.ts`, `migration.ts`: the empty document starts
  with the preset; `normalizeDocument` fills it on both load paths.
- `packages/geometry/src/commands.ts`: `set_default_allowance`; `create_piece`
  gains `allowance?: 'default' | 'none' | { width, kind? }` (absent means none).
- `config/geometry.php`, `docs/domain/command-spec.{md,json}`: the new command,
  the extended param and `spec_version` `0.11.0`.
- `frontend/src/lib/allowance-defaults.ts` (new) plus the Pieces drawer default
  row, the Create piece payload/hint and the piece card's All edges row.
- `docs/architecture/data-model.md`, `BACKWARD_COMPATIBILITY.md`.
- No HTTP route, table or schema-string change; existing pieces are never
  rewritten.

## Non-goals

- No live inheritance (Q1 option B) and no tri-state allowance resolver.
- No `projects.default_seam_allowance` column or API field (Q2 option B).
- No persisted piece-level allowance (Q3 option C).
- No "apply to all pieces" bulk action (R7).
- No mockup images committed (R10); no second PR is opened.

## Decisions

Q1–Q3 are unanswered on issue #64; the maintainer applied `spec-ready`, which
the repository's issue-driven workflow defines as the signal to implement. The
spec's recommended answers are taken as accepted:

- **Q1 = A (snapshot):** only pieces created afterwards get a changed default.
- **Q2 = A (`PatternDocument.defaults.allowance`):** travels with the document.
- **Q3 = A (All edges bulk control):** a group of existing
  `set_piece_allowance` commands; nothing new stored.

## Evidence

| Conclusion | Drawn from | Confidence |
|---|---|---|
| Goal is a 10 mm default copied onto new pieces | Issue #64, spec TLDR and Proposed Solution | high |
| Snapshot semantics, document-stored, bulk UI | Spec Open Questions recommendations; `spec-ready` applied by the maintainer; PR #61/#66 applied the same rule | high |
| Additive optional field, no schema-string bump | Spec Data Model, R3 and `BACKWARD_COMPATIBILITY.md` surface 5 | high |
| `create_piece` absent param keeps today's behaviour | Spec R4 and API Contracts | high |
| Existing code sites | `commands.ts` `applyCreatePiece`, `document.ts` `createEmptyDocument`, `migration.ts` `normalizeDocument`, `PiecePanel.vue`, `EditorView.vue` | high |

## Assumptions

- `normalizeDefaults` materialises the built-in preset when `defaults` is absent,
  so a loaded document always resolves a default; it preserves object identity
  for a current document that already carries a valid `defaults`.
- The `set_default_allowance` inverse restores the previous *effective* preset
  (or `remove: true` when it was `null`); the document may gain an explicit
  `defaults` where it had implied the built-in one, which is semantically equal.
- `uniformAllowance` treats "every edge has no allowance" as a uniform `none`
  row rather than a mixed state.
- The #63 rounded-corner interaction is verified after that PR merges; this
  branch cannot exercise it without bundling an unrelated feature.

## Risks

- **Product:** a default can add an allowance to an edge meant for a fold. The
  drawer hint, the Create piece hint and per-edge removal are the mitigations
  the spec names.
- **Coverage:** the resolver, normaliser and command guards are branch-heavy;
  each guard gets a test before the UI lands.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Already landed on this PR (reconstructed)

- [x] 1.1 Design spec for the document-stored default allowance — 0641b4b
- [x] 1.2 Merge `origin/develop` (#65 persistence) into the branch — 5f398c5

### Phase 2: Model and normalisation

- [ ] 2.1 `AllowancePreset`, `PatternDefaults`, `PatternDocument.defaults`, with type tests
- [ ] 2.2 `defaults.ts`: built-in preset, `effectiveDefaultAllowance`, `normalizeDefaults`, with tests
- [ ] 2.3 `createEmptyDocument` starts with the preset; both `normalizeDocument` paths normalise it, with old-fixture tests

### Phase 3: Commands

- [ ] 3.1 `set_default_allowance`: validation, apply, no-op and inverse, with tests
- [ ] 3.2 `create_piece` `allowance` param: default, none, explicit and absent, with tests
- [ ] 3.3 Command-spec three-way sync and `spec_version` `0.11.0`, with the PHP spec test
- [ ] 3.4 `docs/architecture/data-model.md` and `BACKWARD_COMPATIBILITY.md` record the field

### Phase 4: Editor UI

- [ ] 4.1 `allowance-defaults.ts`: `defaultAllowanceSummary` and `uniformAllowance`, with tests
- [ ] 4.2 Pieces drawer default-allowance row and create hint, with tests
- [ ] 4.3 Create piece sends `allowance: 'default'`, with tests
- [ ] 4.4 Piece card All edges row and the grouped apply, with tests

### Phase 5: Verification

- [ ] 5.1 Full validation gate green (format, typecheck, lint, format:check, coverage, build, Pest 100 %, Pint)
- [ ] 5.2 `om-auto-review-pr` pass with findings addressed
- [ ] 5.3 Retitle the PR, flip to ready, normalize labels and report

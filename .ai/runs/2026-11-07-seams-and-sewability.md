# Run: seam matching and the sewability check

Source doc: `.ai/specs/2026-11-07-seams-and-sewability.md`
Prototype: `.ai/specs/assets/seams-and-sewability/mockup-01-seams.html` (states
`sewing` and `#check`)

## Goal

A maker records which runs of which placed pieces are sewn together, and which
edges are finished instead, and the assembly tab reports whether the pattern is
sewable: every edge sewn once or finished, every seam's sides within 5 mm unless
eased, every reference resolvable. Seams live on the assembly, are derived from
`Piece.edges` at read time, and never block save, export or the editor.

## Why this plan exists

The spec is settled (Q1–Q3 answered) but nothing is built. This plan turns its
three phases into atomic, individually verifiable steps on one branch so the PR
is reviewable in order and resumable at any step. The pure geometry layer lands
first and alone, so the 100 % coverage gate is provable before the UI depends on
it, and the contract files are synced in the same phase as the commands.

## Scope

- Geometry: `SeamSide`/`SeamMatch`/`FinishedEdge` types, `seams.ts` resolution and
  report, per-edge accessors in `piece.ts` and `assembly.ts`.
- Commands: `add_seam_match`, `update_seam_match`, `remove_seam_match`,
  `set_edge_finished`, cascades in `remove_instance`/`delete_piece`/
  `delete_assembly`, and the `split_line` repair.
- Contract: schema `0.8` → `0.9`, command spec `0.21.0` → `0.22.0`, three-way sync.
- Frontend: per-edge canvas picking, Sew mode and prompt bar, Check/Seams/Finished
  panel, the assembly tab error pill, the `Seams` display layer.
- Docs: geometry-core, data-model, glossary, backward compatibility.

## Non-goals

- No 3D preview or drape simulation; the seam record is only its future input.
- No mid-edge seam spans, no ease distribution along a seam; `split_line` is the
  v1 escape.
- No automatic seam detection, no seam-allowance trimming, no seam export.
- No garment-connectivity check (redundant with "no unmatched edge").
- No per-seam tolerance, no seam notes, no sewing order.
- No backend domain change; `patterns.geometry` stays opaque JSON.
- No auth, deployment or CI changes.

## Decisions carried in

- A seam has 2+ sides ordered by layer; a side is a run of consecutive loop edges
  on one instance; `reversed` is stored but unused by the check.
- Finished kinds are the closed enum `hem · binding · fold · opening`.
- `SEAM_LENGTH_TOLERANCE = 5` mm is a package constant; `eased` is the per-seam
  escape and downgrades a length mismatch to a warning.
- Allowance mismatch and a sewn double-fold edge are warnings; "sewable" means no
  errors.
- `split_line` repairs seam runs in place; every other break is reported.
- The report is advisory: nothing blocks save, autosave, versioning or export.

## Assumptions

- Spec and implementation ship on one branch and one PR, spec first, per
  `AGENTS.md`'s feature flow. `om-auto-create-pr` is the engine if the work runs
  unattended.
- `packages/geometry/src/seams.ts` (model and report) is separate from
  `packages/geometry/src/commands/seams.ts` (commands), mirroring
  `assembly.ts` / `commands/assemblies.ts`.
- New geometry tests live in `packages/geometry/src/__tests__/`; frontend tests
  mirror `frontend/src` under `frontend/tests/`.
- `config/geometry.php` reads `docs/domain/command-spec.json`; it needs no edit,
  only the JSON bump.
- 100 % statements/branches/functions/lines stay mandatory in
  `packages/geometry/src`, `frontend/src` and `app/`; no threshold is lowered and
  no branch is ignored without a written justification.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles.

### Phase 0: Baseline and branch

- [ ] 0.1 Record the baseline: geometry and frontend suite file/test counts, the
      Pest gate result, and the current versions (schema `0.8`, spec `0.21.0`) in
      the PR body
- [ ] 0.2 Branch `feat/seams-and-sewability` from `develop`; land the spec,
      prototype, screenshots and this plan as the first commit

### Phase 1: Model and per-edge geometry

- [ ] 1.1 `types.ts`: `SeamSide`, `SeamMatch`, `FINISH_KINDS`/`FinishKind`,
      `FinishedEdge`, optional `Assembly.seams`/`finishedEdges`,
      `PATTERN_SCHEMA` → `sewcraft.pattern/0.9`; export the new names from
      `index.ts`
- [ ] 1.2 `migration.ts`: add `sewcraft.pattern/0.8` to `KNOWN_PATTERN_SCHEMAS`
      with the additive comment; fixture test that a 0.8 document with assemblies
      loads with the schema stamped and both arrays absent
- [ ] 1.3 `piece.ts`: `pieceEdgeSegments(document, piece)` returning one stitch
      polyline per `Piece.edges` entry in authored order, corner-round bridges
      excluded, `null` when `pieceLoop` fails; build on the existing walk rather
      than duplicating offset math
- [ ] 1.4 `assembly.ts`: `instanceEdgeSegments(document, piece, instance)`
      mapping those polylines through `instancePlacement` and `placePoint`;
      `null` propagation
- [ ] 1.5 Gate: `npm test -w @sewcraft/geometry`, 100 % on the touched modules;
      cases for a straight edge, an arc, a walk-reversed edge, a rounded-corner
      bridge, a mirrored and a rotated instance, and a broken loop

### Phase 2: Resolution and report

- [ ] 2.1 `seams.ts`: `resolveSeamSide` returning `{ instance, points, reversed,
      length }` in assembly space; the polyline follows the stitch loop across
      the run, including any corner-round bridge between consecutive edges
- [ ] 2.2 `validateSeam` / `validateSeamSide`: assembly exists, 2+ sides, every
      instance belongs to it, every edge belongs to the instance's piece loop,
      consecutive runs with at most one wrap, no repeated edge, no edge already
      sewn or finished (ignoring the seam being updated)
- [ ] 2.3 `sewabilityReport` coverage pass: `unmatched_edge`, `edge_used_twice`,
      `missing_reference` (unknown instance/piece/edge and an unresolvable loop),
      `edgeCount`/`seamCount`/`finishedCount`
- [ ] 2.4 `sewabilityReport` comparison pass: `length_mismatch` with the eased
      downgrade, `allowance_mismatch` from the cut-distance extremes,
      `folded_edge_sewn`; errors before warnings, stable document order
- [ ] 2.5 Gate: `seams.test.ts` covers one case per kind, exactly-at-tolerance and
      one-past, the eased downgrade, a run across a rounded corner (bridge in the
      length), an empty assembly and a hand-edited duplicate; 100 % on `seams.ts`

### Phase 3: Commands and contract

- [ ] 3.1 `commands/seams.ts`: `add_seam_match` with the shared validator,
      duplicate-id no-op and `remove_seam_match` inverse
- [ ] 3.2 `update_seam_match`: `eased` and/or full `sides`, previous values as
      the inverse, at least one field required
- [ ] 3.3 `remove_seam_match`: unknown seam is a no-op, the inverse recreates the
      record exactly
- [ ] 3.4 `set_edge_finished`: `kind` or `null`, validation against seams,
      inverse restores the previous kind or clears it
- [ ] 3.5 Plumbing: `commands/types.ts` params and union, `commands/index.ts`
      dispatch, package exports; test that a dispatch exists for every command
- [ ] 3.6 Cascades: `remove_instance` drops whole seams and finished edges
      (`inverse: null` only when it dropped something), `delete_piece` and
      `delete_assembly` take theirs along; tests with two instances of one piece
      and two assemblies
- [ ] 3.7 `split_line` repair: replace the split edge with `[lineId, command.id]`
      in place in every assembly seam run, leaving legacy `document.seams` and
      finished edges alone; test a run of two, a side starting at the split edge,
      and a double split
- [ ] 3.8 Contract sync: `command-spec.json` (`$id`, `schema`, `spec_version`
      `0.22.0`, four commands with params and inverses), `command-spec.md`
      (`## Commands (v0.22)`, four `###` sections, shared validation rules,
      migration paragraph), `CommandSpecTest.php` assertions; confirm
      `config/geometry.php` needs no edit
- [ ] 3.9 Gate: geometry suite green, 100 % on `commands/seams.ts` and the touched
      commands, the Pest `--coverage --min=100` gate and Pint pass

### Phase 4: Canvas and the sewing gesture

- [ ] 4.1 `display-settings.ts`: `assembly.seams` default `true`, per-field parse
      fallback for stored payloads written before it existed; tests
- [ ] 4.2 `AssemblyCanvas.vue`: one stitch path per loop edge with a stable
      `data-testid`; the seam report, seams and finished edges computed from the
      existing `document` (assembly slice) prop; new props for pending picks,
      hovered edge and the selected seam; pointer→SVG hit-testing through
      `instanceEdgeSegments` at the canvas's screen-space tolerance; emit
      `pick-edge`
- [ ] 4.3 `seam-picks.ts`: pure draft state machine (extend a side, start a side,
      remove a pick, flip the last side, clear, commit payload), tested in
      `frontend/tests/lib/seam-picks.test.ts`
- [ ] 4.4 `SeamPromptBar.vue`: chips with layer number, instance label, edge count
      and length, running delta, Eased, New side, Flip, Sew, Cancel,
      `role="status"` announcements; component tests
- [ ] 4.5 Ribbon plumbing: `'sew'` in `RibbonAction`, `RibbonIconName` and
      `ACTION_ICONS`, the `ASSEMBLY_RIBBON_GROUPS` entry, and an `activeAction`
      prop on `EditorRibbon` so it renders pressed; tests
- [ ] 4.6 `EditorView.vue`: Sew mode state, Escape and tab-change reset, read-only
      disable, dispatch one `add_seam_match`, select the committed seam; tests
- [ ] 4.7 Overlays: matched/finished/unmatched colours, guide arcs for the
      selected seam, hover readout; component tests for each state
- [ ] 4.8 Gate: `npm run test:coverage` 100 %, `npm run lint`, `npm run
      typecheck`, `npm run format:check`

### Phase 5: Check surface

- [ ] 5.1 `AssemblyPanel.vue` Check section: verdict, issue rows with
      click-to-select, footer with tolerance and totals, empty state, and the
      `unmatched_edge` **Mark finished** menu
- [ ] 5.2 Seams section: rows with lengths, the `Eased` chip and toggle
      (`update_seam_match`), a broken seam's Remove action, selection sync with
      the canvas
- [ ] 5.3 Finished section: rows grouped by kind with a kind menu
      (`set_edge_finished`) and a clear action
- [ ] 5.4 `EditorTabs.vue`: error-count pill computed once per document from the
      full document, accessible name, tests for errors, warnings only and a piece
      tab left bare
- [ ] 5.5 States and accessibility: empty assembly, unresolvable piece, broken
      seam, read-only, keyboard reach through the panel, live announcements
- [ ] 5.6 Gate: frontend coverage 100 %, full unit suites, lint, typecheck,
      format:check

### Phase 6: Docs, evidence and delivery

- [ ] 6.1 Docs: `geometry-core.md` (seam resolution and report contract),
      `data-model.md` (the two assembly arrays), `glossary.md` (seam match,
      finished edge, sewability check), `BACKWARD_COMPATIBILITY.md` (additive 0.9,
      older builds refuse it)
- [ ] 6.2 Integration: `integration/tests/seams.spec.ts` saving and reloading a
      0.9 geometry with seams and finished edges through the real API, plus a UI
      pass that sews two edges and reads the verdict
- [ ] 6.3 Browser evidence: the sewing and check states at 1440 px and a narrow
      width, screenshots attached to the PR
- [ ] 6.4 Full gate: `npm run format`, `typecheck`, `lint`, `format:check`,
      `test:coverage`, `build`, the Pest `--coverage --min=100` command, Pint;
      tick the spec's acceptance boxes and set its status to implemented
- [ ] 6.5 Ready PR referencing the spec, with the plan's boxes ticked and the
      evidence attached; do not merge

## Risks to watch

- **`split_line` repair position.** A side may start at the split edge or wrap
  around the loop; the new half must be inserted immediately after the original.
  Test the three placements explicitly and keep the repair away from the legacy
  `document.seams` array.
- **Report must never throw.** Unknown instances, unknown edges, a one-sided seam
  and a broken loop are all reachable from a hand-edited document. Return issues,
  never exceptions; the command layer is where validation rejects.
- **Cascade completeness.** After `remove_instance` no seam may keep a dangling
  side and no finished edge may survive. `inverse: null` is correct only when the
  cascade dropped something, because undo restores the journal snapshot.
- **Picking versus panning.** The assembly canvas already drags instances and pans
  on middle/background. Edge picking must run on click without starting a drag,
  and must not fire at the end of a pan.
- **Tolerance is screen-space.** Convert the pixel radius through the current
  viewBox, or picking becomes impossible at high zoom and greedy at low zoom.
- **Recursive report cost.** The tab pill resolves every assembly on each
  document change. Compute it once per document in `EditorTabs`, not per tab row.
- **Coverage surface.** Six issue kinds, two severities, four commands, four
  cascades and a picking state machine. The report lands before the UI so the gate
  is provable in isolation.
- **Ease discoverability.** A correctly drafted sleeve trips the length error
  first; both the prompt bar and the Seams row must expose the `Eased` toggle, or
  the feature feels broken on real garments.
- **Display-setting drift.** A stored payload without `seams` must default to
  visible, or existing projects lose the overlay after upgrade.

## Validation

`npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run test:coverage`, `npm run build`, `npm run test:integration`, plus the
backend Pest `--coverage --min=100` and Pint commands from
`.ai/agentic.config.json`.

Fast loops while developing:

```bash
npm test -w @sewcraft/geometry
npm run test:changed -w @sewcraft/frontend
```

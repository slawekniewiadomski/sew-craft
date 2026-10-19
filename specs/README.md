# Specs

Each spec is a self-contained unit of work for one agent session. Pick **one**,
implement it, run the checks it lists, and update the docs it points to. Do not
bundle unrelated specs. Follow the conventions in
[`docs/architecture/standards.md`](../docs/architecture/standards.md).

## Template

```markdown
# NNN — Title

Status: todo | in progress | done
Depends on: —

## Goal

One sentence: the user-visible outcome.

## Context

Why this is needed and any architecture docs to read first.

## Inputs

Existing code/contracts this builds on.

## Deliverables

- Concrete artifacts (files, endpoints, commands).

## Acceptance criteria

- [ ] Testable, specific conditions.

## Out of scope

- Explicit non-goals to prevent scope creep.

## Checks

Exact commands to run.

## Files

Likely files to touch.
```

## Index

| Spec                                                                  | Status      |
| --------------------------------------------------------------------- | ----------- |
| [001 Project CRUD & persistence](./001-project-crud-persistence.md)   | done        |
| [002 Geometry core primitives](./002-geometry-core-primitives.md)     | partial     |
| [003 Constraint solver core](./003-constraint-solver-core.md)         | done        |
| [004 Command core & undo/redo](./004-command-core-undo.md)            | todo        |
| [005 Canvas editor interactions](./005-canvas-editor-interactions.md) | todo        |
| [006 Construction geometry](./006-construction-geometry.md)           | todo        |
| [007 Seam allowance](./007-seam-allowance.md)                         | todo        |
| [008 SVG export](./008-svg-export.md)                                 | todo        |
| [009 Command spec API](./009-command-spec-api.md)                     | partial     |
| [010 PDF tiled export](./010-pdf-tiled-export.md)                     | stub        |
| [011 DXF export](./011-dxf-export.md)                                 | stub        |
| [012 Measurements & sizing](./012-measurements-sizing.md)             | stub        |
| [013 Editor workspace shell](./013-editor-workspace-shell.md)         | in progress |
| [014 Linear dimensions](./014-linear-dimensions.md)                   | done        |

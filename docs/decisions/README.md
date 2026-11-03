# Architecture Decision Records

Short records of decisions that are expensive to reverse. Format: Context →
Decision → Consequences → Alternatives. Add a new ADR rather than editing a
settled one; mark superseded ADRs as such.

| ADR                                         | Decision                                         |
| ------------------------------------------- | ------------------------------------------------ |
| [0001](./0001-spa-api-split.md)             | Separate Vue SPA + Laravel JSON API              |
| [0002](./0002-command-core.md)              | Commands are the only mutation path              |
| [0003](./0003-geometry-package.md)          | Framework-agnostic `@sewcraft/geometry` package  |
| [0004](./0004-constraint-solver.md)         | Custom TypeScript constraint solver              |
| [0005](./0005-custom-json-schema.md)        | Custom JSON schema for pattern data              |
| [0006](./0006-single-user-no-auth.md)       | Single-user self-hosted, no auth initially       |
| [0007](./0007-export-strategy.md)           | Export priority SVG → PDF → DXF, reuse OSS       |
| [0008](./0008-backend-stack.md)             | Laravel + PostgreSQL + Docker, PHP 8.4           |
| [0009](./0009-editor-workspace-layout.md)   | Editor ribbon + resizable drawer sidebar         |
| [0010](./0010-variables-and-expressions.md) | Document-level variables + expression dimensions |

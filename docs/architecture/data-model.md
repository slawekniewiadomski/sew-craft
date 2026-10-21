# Data Model

Persistence is PostgreSQL. Geometry is stored as JSON so the schema stays stable
while the entity model evolves. The canonical geometry document is versioned.

## Tables

### `projects`

| Column                      | Type       | Notes    |
| --------------------------- | ---------- | -------- |
| `id`                        | bigint PK  |          |
| `name`                      | string     | required |
| `description`               | text, null |          |
| `created_at` / `updated_at` | timestamp  |          |

A project is the top-level container a user opens and exports.

### `patterns`

| Column                      | Type                    | Notes                                 |
| --------------------------- | ----------------------- | ------------------------------------- |
| `id`                        | bigint PK               |                                       |
| `project_id`                | FK → projects (cascade) |                                       |
| `name`                      | string                  |                                       |
| `geometry`                  | json, null              | current `PatternDocument` (see below) |
| `created_at` / `updated_at` | timestamp               |                                       |

The `geometry` column holds the working copy. It is a snapshot, not the source of
truth history — that is `pattern_versions`.

### `pattern_versions`

| Column       | Type                    | Notes                    |
| ------------ | ----------------------- | ------------------------ |
| `id`         | bigint PK               |                          |
| `pattern_id` | FK → patterns (cascade) |                          |
| `version`    | unsigned int            | monotonic per pattern    |
| `geometry`   | json                    | frozen `PatternDocument` |
| `created_at` | timestamp               |                          |

Unique on `(pattern_id, version)`. Appended when a command batch is committed.

### `exports`

| Column                      | Type                    | Notes                           |
| --------------------------- | ----------------------- | ------------------------------- |
| `id`                        | bigint PK               |                                 |
| `pattern_id`                | FK → patterns (cascade) |                                 |
| `format`                    | string                  | `svg` \| `pdf` \| `dxf`         |
| `disk`                      | string                  | Laravel filesystem disk         |
| `path`                      | string                  | stored artifact path            |
| `status`                    | string                  | `pending` \| `done` \| `failed` |
| `created_at` / `updated_at` | timestamp               |                                 |

## `PatternDocument`

The JSON stored in `patterns.geometry`. Schema version is explicit so migrations
can be written when it changes.

```jsonc
{
  "schema": "sewcraft.pattern/0.1",
  "units": "mm",
  "entities": [
    { "id": "p1", "kind": "point", "x": 0, "y": 0, "construction": true, "fixed": true },
    { "id": "p2", "kind": "point", "x": 120, "y": 0, "construction": false, "fixed": false },
    { "id": "l1", "kind": "line", "start": "p1", "end": "p2", "construction": false },
  ],
  "constraints": [
    { "id": "c1", "type": "horizontal", "a": "p1", "b": "p2" },
    {
      "id": "c2",
      "type": "distance",
      "a": "p1",
      "b": "p2",
      "value": 120, // omitted makes the dimension driven (measurement only)
      "orientation": "horizontal", // aligned (default) | horizontal | vertical
      "offset": 20, // dimension line offset in mm; presentation only
    },
    {
      "id": "c3",
      "type": "distance",
      "a": "p2",
      "b": "p3",
      "reference": "c2", // effective value is resolved through c2
    },
  ],
  "seams": [{ "id": "s1", "edge": "l1", "width": 10 }],
}
```

A `distance` constraint without `value` or `reference` is a **driven** dimension:
it reports the live measurement and adds no solver equation. A `reference` links
one dimension to another; the effective value is derived, so the constraint
stores no duplicate `value`. When the source disappears, the dependent keeps its
`reference`, stores the last resolved number in `lastKnownValue` and renders as
**broken** until the user re-links it. At most one of `value` and `reference` is
present. The schema stays `sewcraft.pattern/0.1`; the fields are additive, so
older documents load unchanged. See `docs/architecture/geometry-core.md` for
entity semantics and `docs/domain/command-spec.json` for the machine-readable
command schema.

## Notes

- Use `json` (not `jsonb`) for now so the in-memory SQLite test connection works
  unchanged. Revisit if we need indexing into geometry.
- No `user_id` yet; single-user self-hosted. Add it together with Sanctum when
  multi-user arrives.

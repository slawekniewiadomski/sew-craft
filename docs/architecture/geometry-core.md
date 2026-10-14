# Geometry Core (`@sewcraft/geometry`)

Framework-agnostic TypeScript package owning the pattern model, the constraint
solver and (later) export serializers. No Vue, no DOM, no network, no Laravel.

## Units and precision

- All lengths are **millimetres**, stored as IEEE-754 doubles.
- Angles are **radians**, counter-clockwise positive.
- Solver tolerance defaults to `1e-9`; UI snapping is a frontend concern.
- Comparisons use an epsilon, never `===` on floats.

## Coordinate system

Right-handed 2D, `+x` right, `+y` **down** (screen convention) so SVG needs no
flip. Pattern drafting origin is per-piece; a global origin is not assumed.

## Entities

| Kind    | References  | Notes                            |
| ------- | ----------- | -------------------------------- |
| `point` | —           | the only solver variable in v0.1 |
| `line`  | two points  | straight segment / edge          |
| `curve` | four points | cubic Bézier (p0, p1, p2, p3)    |

Every entity has an `id` (string) and a `construction: boolean`. Construction
geometry is drawn as a guide and is **never** part of a cut edge or export.

### Points

```ts
interface PointEntity {
  id: string;
  kind: 'point';
  x: number;
  y: number;
  construction: boolean;
  fixed: boolean; // excluded from the solver variable vector
}
```

`fixed` points act as anchors. At least one fixed point is needed for a
non-translating solution.

## Later entities (specced, not built)

- `piece` — a closed profile referencing an ordered list of edges, with
  direction and seam allowance.
- `dart` — first-class construction element.
- `grainline`, `notch`, `label` — annotations attached to pieces.

## Public API

```ts
import { solve, distance, type PointEntity, type Constraint } from '@sewcraft/geometry';

const result = solve(points, constraints);
result.converged; // boolean
result.coordinates; // Map<EntityId, Vec2>
```

Keep the public surface small and typed. New exports go through `src/index.ts`.

## Rendering

The geometry package does **not** render. The frontend maps entities to SVG
(`path`, `line`, `polygon`) and controls styling, hit-testing and viewport.
Exports (SVG/PDF/DXF) will be serializers that consume the same document.

# Export

Patterns are exported from the canonical geometry document. All export code lives
in `packages/geometry` (serializers) and may run in the browser or a Node worker;
Laravel only orchestrates jobs and stores artifacts (`exports` table).

Priority order (see ADR-0007): **SVG → PDF → DXF**.

## Units and scale

Exports must be **true to scale in millimetres**. Never assume pixels. Each
serializer receives the document (mm) and outputs a format with an explicit unit
or scale.

## SVG (v0.1)

The editor already renders SVG, so SVG export reuses the same mapping:

- one `<path>`/`<g>` per piece, cut edges as strokes with `fill="none"`,
- construction lines in a separate `<g data-layer="construction">` with a muted
  stroke, optionally omitted,
- seam allowance drawn as its own offset path (dashed or a distinct layer),
- `width`/`height` set in `mm` and a `viewBox` in mm coordinates,
- metadata comment with `schema` version and timestamp.

No third-party dependency needed; build the string from the model.

### Serializer interface

`toSvg(document, options)` lives in `@sewcraft/geometry` and returns the SVG as a
string. It is pure (no DOM, no network) and uses one user unit per millimetre, so
the result measures 1:1 at 100%.

```ts
import { toSvg } from '@sewcraft/geometry';

toSvg(document, {
  construction: false, // include the construction layer (default off)
  seamAllowance: [], // precomputed offset outlines (see below)
  padding: 10, // whitespace in mm around the drawing
});
```

The output has a `viewBox` in pattern coordinates plus `width`/`height` in `mm`,
and an XML comment carrying the pattern `schema` and a generation timestamp.
Layers are emitted as `<g data-layer="...">` groups: `cut` always (every
non-construction line/curve), `construction` when requested and non-empty, and
`seam-allowance` when outlines are supplied.

Seam-allowance geometry is **not** computed here: the offset algorithm is spec
007's, and 008 defines the layer as an extension point. Callers pass precomputed
outlines as `{ edge, path }`, which the serializer draws in the allowance layer.

## PDF (later)

Target: printable, tiled pattern sheets for A4/Letter.

- Approach: render tile-sized vector pages and tile with overlap + registration
  marks and a page index.
- Prefer a maintained library over hand-rolling PDF: `pdf-lib` (pure JS, browser +
  Node) or `svg-to-pdfkit`. Evaluate in the spec before committing.
- A final "overview" page shows the full pattern with a grid and seam lines.
- Respect a user-selected paper size and margin; keep 1:1 scale on every tile.

## DXF (later)

Industry interchange format for patterns.

- Prefer a mature library: `@tarikjabiri/dxf` (JS) or `dxf-writer`.
- Map entities: lines/curves → `LWPOLYLINE`/`SPLINE`; layers for cut edges, seam
  allowance, construction, grainline and notches.
- Keep units in mm (`$INSUNITS = 4`).

## Storage

Exports are written through Laravel's filesystem (`exports.disk`/`exports.path`)
and streamed to the client. Large exports (PDF tiling, DXF with many pieces) run
in a queued job; the API returns an export id and the client polls/downloads.

## Testing

- SVG: snapshot/structural tests (element count, mm bounds, layer separation).
- PDF/DXF: assert page count, units, and open the artifact in a reference tool
  where possible. Round-trip DXF through a parser if one is adopted.

See `specs/008-svg-export.md`, `specs/010-pdf-tiled-export.md` and
`specs/011-dxf-export.md`.

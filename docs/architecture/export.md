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

The editor already renders SVG, so SVG export reuses the same mapping. Layer
meaning depends on whether the document has pieces:

**With pieces** (the current path):

- `cut` (always): one closed `<path>` per piece, the **cut loop** — the stitch
  loop offset outward per edge by its allowance and joined at every corner. This
  is what you cut, not what you sew. Each path carries `data-piece="<id>"`, and
  `data-warning="self-intersection"` when the offset loop crosses itself.
- `stitch` (on by default, `stitch: false` omits it): the piece boundary as
  drawn, one closed thin path per piece.
- `fold` (on by default, `fold: false` omits it): one dashed closed path per
  double-fold allowance, at the finished width inside the cut line. A `seam` or
  `single` allowance emits no fold line.
- `construction` (off by default): the guide layer, as before.
- `seam-allowance`: only the legacy per-edge outlines passed in `seamAllowance`
  for edges outside any piece. A piece's allowances never take this path.
- `width`/`height` in `mm`, and a `viewBox` from the union of the pieces' **cut**
  bounds plus `padding`, so allowance geometry is never clipped.
- one metadata comment per piece: `<!-- sewcraft:piece id="…" name="…"
finished="WxH" cut="WxH" quantity="N" -->` (mm), plus the document comment with
  `schema` and timestamp.

The presence of pieces decides the contract, not whether they resolve. A piece
whose loop is broken (a deleted point or edge) emits no cut, stitch, fold or
metadata and contributes no bounds; when no piece resolves, the `cut` layer is
empty and the `viewBox` is `0 0 0 0`. It never falls back to exporting every
entity as a cut line.

**Without pieces** (legacy contract, unchanged):

- `cut` is every non-construction line, curve, circle and arc; the `viewBox` comes
  from `bounds(document)`; `stitch` and `fold` emit nothing; legacy seam-allowance
  outlines stay in their own `seam-allowance` layer.

No third-party dependency needed; build the string from the model.

### Serializer interface

`toSvg(document, options)` lives in `@sewcraft/geometry` and returns the SVG as a
string. It is pure (no DOM, no network) and uses one user unit per millimetre, so
the result measures 1:1 at 100%.

```ts
import { toSvg } from '@sewcraft/geometry';

toSvg(document, {
  construction: false, // include the construction layer (default off)
  stitch: true, // include piece stitch loops (default on)
  fold: true, // include double-fold fold lines (default on)
  seamAllowance: [], // legacy offset outlines for edges outside a piece
  padding: 10, // whitespace in mm around the drawing
});
```

The output has a `viewBox` in pattern coordinates plus `width`/`height` in `mm`,
and an XML comment carrying the pattern `schema` and a generation timestamp.
Layers are emitted as `<g data-layer="...">` groups; a group is omitted when it
would be empty.

Piece geometry is **not** computed here either: `pieceCutLoop`, `pieceLoop`,
`pieceFoldLines`, `pieceMetrics` and `pieceCutBounds` in `piece.ts` derive it, and
the serializer only renders the result. Legacy allowance outlines stay an
extension point, passed in as `{ edge, path }`.

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

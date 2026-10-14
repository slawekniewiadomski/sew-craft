# ADR-0007: Export strategy — SVG → PDF → DXF, reuse OSS

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Users need printable and interoperable patterns. Formats discussed: SVG, PDF
(tiled for home printing), DXF (pattern software/plotters), PNG, PLT. Writing
format parsers/writers from scratch is expensive and error-prone.

## Decision

Build exports in priority order **SVG → PDF → DXF** (PNG later if needed), and
prefer mature open-source libraries for formats (`pdf-lib`/`svg-to-pdfkit` for
PDF; `@tarikjabiri/dxf`/`dxf-writer` for DXF) rather than hand-rolling. Export
code lives in `packages/geometry`; Laravel orchestrates and stores jobs.

## Consequences

- SVG is nearly free (the editor already renders it) and true-to-scale.
- PDF tiling gives real printable patterns; DXF gives pro interop.
- We take on third-party dependencies and must vet their maintenance/licence.

## Alternatives considered

- **DXF first:** valuable for interop but higher effort before users can print.
- **PDF first:** printable, but requires a rendering pipeline before the model is
  even stable.

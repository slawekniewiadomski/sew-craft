# ADR-0011: 3D preview rendering and solver placement

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The seam record now describes what is sewn to what, so the assembly can be shown
as the object it becomes. The preview is deliberately a **dummy**: a pouch should
read as a rounded pouch, a garment as a stuffed silhouette. There is no gravity,
collision, self-collision, time integration or body collider.

Two decisions had to be made before a spec:

1. **Where the preview renders.** The locked stack says “Geometry rendering: SVG
   (no canvas library)”. The feasibility brief recommended a lazy-loaded three.js
   viewport. A WebGL dependency would add ~150 KB, a renderer-specific test
   surface that jsdom cannot exercise, and a second rendering model beside the
   2D SVG canvas.
2. **Where the simulation lives.** It is geometry, not Vue: triangulation, seam
   correspondence and relaxation are pure functions over the document.

## Decision

1. **The preview renders as SVG.** The mesh is projected orthographically and
   drawn as flat-shaded `<polygon>` elements sorted back to front (painter’s
   algorithm). There is no WebGL context and no canvas library. The preview uses
   the app’s existing theme colours, so it matches light and dark themes.
2. **The shape models are pure TypeScript in `@sewcraft/geometry`.** `drape.ts`
   takes the document and an assembly, builds a welded panel mesh and raises it
   on a deterministic height field; `exploded.ts` lays the cut parts out as a
   seam-linked stack. The Vue layer only projects and paints both.
3. **The preview is derived and read-only.** No command writes it, no document
   field stores it, and save/autosave/versioning/export never read it. The
   camera, mode, inflate amount and wireframe toggle are ephemeral view state.
   The default **exploded** mode is a solver-free diagram of flat cut parts and
   their seam links (`explodedAssembly`), so the assembly is legible even where
   the folded shell is still approximate; the sewn height field is the second
   mode.
4. **A triangle budget bounds the SVG surface.** Above
   `PREVIEW_TRIANGLE_LIMIT` (6 000) the preview keeps the largest connected shell
   and reports that it simplified the view. If real patterns outgrow SVG, a later
   ADR may add a WebGL renderer behind the same `DrapeResult` interface; the
   solver does not change.

## Consequences

- No new runtime dependency, lockfile entry or CI browser capability.
- The projection, shading and hit-free orbit are ordinary DOM and fully testable
  in jsdom, which keeps the 100 % coverage gate honest.
- Shading is flat and low-frequency; there are no textures, shadows, smooth
  normals or anti-aliased mesh edges beyond the SVG renderer.
- Large, highly detailed patterns are simplified rather than rendered at full
  fidelity. That is acceptable for a “dummy” preview and is visible to the user.
- The seam record’s stored layer order, direction and ease were designed for this
  consumer; they are read here, never re-derived from how the maker clicked.

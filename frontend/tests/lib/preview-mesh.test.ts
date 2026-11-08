import type { PreviewMesh } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREVIEW_VIEW,
  PANEL_COLORS,
  clampPreviewPitch,
  projectExploded,
  projectMesh,
} from '@/lib/preview-mesh';

const mesh = (overrides: Partial<PreviewMesh> = {}): PreviewMesh => ({
  positions: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 0, y: 10, z: 0 },
    { x: 10, y: 10, z: 10 },
  ],
  triangles: [
    { a: 0, b: 1, c: 2, panel: 0 },
    { a: 1, b: 3, c: 2, panel: 1 },
  ],
  panels: [
    { instance: 'i1', piece: 'p1', color: '#ff0000' },
    { instance: 'i2', piece: 'p2', color: null },
  ],
  openBoundaries: [],
  simplified: false,
  sewnSupported: true,
  skipped: [],
  ...overrides,
});

describe('clampPreviewPitch', () => {
  it('keeps the view inside the poles', () => {
    expect(clampPreviewPitch(0.5)).toBe(0.5);
    expect(clampPreviewPitch(3)).toBeCloseTo(Math.PI / 2.4);
    expect(clampPreviewPitch(-3)).toBeCloseTo(-Math.PI / 2.4);
  });
});

describe('projectMesh', () => {
  it('projects an orthographic front view and sorts back to front', () => {
    const projection = projectMesh(mesh(), { yaw: 0, pitch: 0 });

    expect(projection.polygons).toHaveLength(2);
    expect(projection.polygons[0]!.points).toContain('0.000,0.000');
    expect(projection.polygons[0]!.points).toContain('10.000,0.000');
    expect(projection.polygons[0]!.points).toContain('0.000,10.000');
    expect(projection.polygons[0]!.depth).toBe(0);
    expect(projection.polygons[1]!.depth).toBeGreaterThan(0);
  });

  it('keeps document order for triangles at the same depth', () => {
    const projection = projectMesh(
      mesh({
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
          { x: 0, y: 10, z: 0 },
          { x: 10, y: 10, z: 0 },
        ],
        triangles: [
          { a: 0, b: 1, c: 2, panel: 0 },
          { a: 1, b: 3, c: 2, panel: 1 },
        ],
      }),
      { yaw: 0, pitch: 0 },
    );

    expect(projection.polygons.map((polygon) => polygon.panel)).toEqual([0, 1]);
  });

  it('shades a face with its panel colour and falls back for no colour', () => {
    const projection = projectMesh(mesh(), { yaw: 0, pitch: 0 });

    expect(projection.polygons[0]!.fill).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(projection.polygons[0]!.fill).not.toBe('rgb(0, 0, 0)');
    expect(projection.polygons[1]!.fill).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it('ignores an invalid stored colour', () => {
    const projection = projectMesh(
      mesh({
        panels: [{ instance: 'i1', piece: 'p1', color: 'not-a-colour' }],
        triangles: [{ a: 0, b: 1, c: 2, panel: 0 }],
      }),
      { yaw: 0, pitch: 0 },
    );

    expect(projection.polygons[0]!.fill).toMatch(/^rgb\(/);
  });

  it('uses a flat neutral term for a degenerate face', () => {
    const projection = projectMesh(
      mesh({
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        triangles: [{ a: 0, b: 1, c: 2, panel: 0 }],
      }),
      { yaw: 0, pitch: 0 },
    );

    expect(projection.polygons[0]!.fill).toMatch(/^rgb\(/);
  });

  it('rotates with yaw and clamps the pitch', () => {
    const yawed = projectMesh(mesh(), { yaw: Math.PI / 2, pitch: 0 });
    // x -> -y and y -> x: (10, 0) lands at (0, 10) and (0, 10) at (-10, 0).
    const coords = yawed.polygons[0]!.points.split(' ').map((point) =>
      point.split(',').map((value) => Math.round(Number(value))),
    );
    expect(coords).toEqual(
      expect.arrayContaining([
        [0, 0],
        [0, 10],
        [-10, 0],
      ]),
    );

    const pitched = projectMesh(mesh(), { yaw: 0, pitch: 10 });
    expect(pitched.bounds.height).toBeGreaterThan(0);
  });

  it('fits the bounds with a margin around the projected points', () => {
    const projection = projectMesh(mesh(), { yaw: 0, pitch: 0 });

    expect(projection.bounds.minX).toBeCloseTo(-0.8);
    expect(projection.bounds.minY).toBeCloseTo(-0.8);
    expect(projection.bounds.width).toBeCloseTo(11.6);
    expect(projection.bounds.height).toBeCloseTo(11.6);
  });

  it('falls back to the neutral colour for an invalid exploded colour', () => {
    const view = {
      panels: [
        {
          instance: 'i1',
          piece: 'p1',
          label: 'Panel',
          color: 'not-a-colour',
          boundary: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 10, z: 0 },
            { x: 0, y: 10, z: 0 },
          ],
          center: { x: 5, y: 5, z: 0 },
        },
      ],
      seams: [],
      skipped: [],
    };
    const projection = projectExploded(view, { yaw: 0, pitch: 0 });
    expect(projection.panels[0]!.color).toBe(PANEL_COLORS[0]);

    const neutral = projectExploded(
      { ...view, panels: [{ ...view.panels[0]!, color: null }] },
      { yaw: 0, pitch: 0 },
    );
    expect(neutral.panels[0]!.color).toBe(PANEL_COLORS[0]);

    const two = projectExploded(
      {
        ...view,
        panels: [
          { ...view.panels[0]!, color: null },
          { ...view.panels[0]!, color: null },
        ],
      },
      { yaw: 0, pitch: 0 },
    );
    expect(new Set(two.panels.map((panel) => panel.color)).size).toBe(2);

    const kept = projectExploded(
      { ...view, panels: [{ ...view.panels[0]!, color: '#ff0000' }] },
      { yaw: 0, pitch: 0 },
    );
    expect(kept.panels[0]!.color).toBe('#ff0000');
  });

  it('exposes a default three-quarter view', () => {
    expect(DEFAULT_PREVIEW_VIEW.yaw).toBeLessThan(0);
    expect(DEFAULT_PREVIEW_VIEW.pitch).toBeLessThan(0);
  });
});

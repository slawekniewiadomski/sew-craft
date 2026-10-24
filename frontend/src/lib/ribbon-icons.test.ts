import { describe, expect, it } from 'vitest';

import { CONSTRAINT_ICONS } from './constraint-view';
import { RIBBON_ICONS, ribbonIcon, type RibbonIconName } from './ribbon-icons';

describe('RIBBON_ICONS', () => {
  it('registers one 12 × 12 descriptor for every ribbon glyph', () => {
    expect(Object.keys(RIBBON_ICONS).sort()).toEqual([
      'angle',
      'arc',
      'chevron-down',
      'circle',
      'coincident',
      'constraints',
      'curve',
      'cut-dimension',
      'delete',
      'dimension',
      'distance',
      'download',
      'equal',
      'eye',
      'fit',
      'horizontal',
      'line',
      'piece',
      'point',
      'point_on_line',
      'rectangle',
      'rectangle-aligned',
      'rectangle-center',
      'redo',
      'round-corner',
      'select',
      'undo',
      'vertical',
    ]);
    for (const icon of Object.values(RIBBON_ICONS)) {
      expect(Array.isArray(icon.paths)).toBe(true);
    }
  });

  it('reuses the constraint glyphs drawn on the canvas', () => {
    for (const [type, icon] of Object.entries(CONSTRAINT_ICONS)) {
      expect(RIBBON_ICONS[type as RibbonIconName]).toBe(icon);
    }
  });

  it('authors the tool and action glyphs in the same box', () => {
    expect(RIBBON_ICONS.select.paths).toHaveLength(1);
    expect(RIBBON_ICONS.point).toEqual({ paths: [], dots: [{ cx: 6, cy: 6, r: 1.9 }] });
    expect(RIBBON_ICONS.line.paths).toEqual(['M2.5 9.5 L9.5 2.5']);
    expect(RIBBON_ICONS.dimension.paths).toHaveLength(5);
    expect(RIBBON_ICONS['cut-dimension'].paths).toHaveLength(5);
    expect(RIBBON_ICONS['cut-dimension'].paths).not.toEqual(RIBBON_ICONS.dimension.paths);
    expect(RIBBON_ICONS.download.paths).toHaveLength(3);
    expect(RIBBON_ICONS.rectangle.paths).toHaveLength(1);
    expect(RIBBON_ICONS['rectangle-center'].dots).toHaveLength(1);
    expect(RIBBON_ICONS['rectangle-aligned'].paths).toHaveLength(1);
  });

  it('resolves a glyph by name', () => {
    expect(ribbonIcon('select')).toBe(RIBBON_ICONS.select);
    expect(ribbonIcon('horizontal')).toBe(CONSTRAINT_ICONS.horizontal);
  });
});

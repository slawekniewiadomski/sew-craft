import { describe, expect, it } from 'vitest';

import { CONSTRAINT_ICONS } from './constraint-view';
import { RIBBON_ICONS, ribbonIcon, type RibbonIconName } from './ribbon-icons';

describe('RIBBON_ICONS', () => {
  it('registers one 12 × 12 descriptor for every ribbon glyph', () => {
    expect(Object.keys(RIBBON_ICONS).sort()).toEqual([
      'allowance',
      'angle',
      'arc',
      'coincident',
      'curve',
      'delete',
      'dimension',
      'distance',
      'download',
      'equal',
      'fit',
      'horizontal',
      'line',
      'point',
      'point_on_line',
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
    expect(RIBBON_ICONS.allowance.paths).toHaveLength(4);
    expect(RIBBON_ICONS.download.paths).toHaveLength(3);
  });

  it('resolves a glyph by name', () => {
    expect(ribbonIcon('select')).toBe(RIBBON_ICONS.select);
    expect(ribbonIcon('horizontal')).toBe(CONSTRAINT_ICONS.horizontal);
  });
});

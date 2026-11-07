import { describe, expect, it } from 'vitest';

import { CONSTRAINT_ICONS } from '@/lib/constraint-view';
import { RIBBON_ICONS, ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';

describe('RIBBON_ICONS', () => {
  it('registers one 24 × 24 descriptor for every ribbon glyph', () => {
    expect(Object.keys(RIBBON_ICONS).sort()).toEqual([
      'angle',
      'arc',
      'centre-line',
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
      'midpoint',
      'mirror',
      'notch',
      'piece',
      'piece-add',
      'point',
      'point_on_line',
      'rectangle',
      'rectangle-aligned',
      'rectangle-center',
      'redo',
      'rotate',
      'round-corner',
      'select',
      'sew',
      'split',
      'text',
      'text-leader',
      'undo',
      'variables',
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
    expect(RIBBON_ICONS.point).toEqual({ paths: [], dots: [{ cx: 12, cy: 12, r: 3.8 }] });
    expect(RIBBON_ICONS.line.paths).toEqual(['M5 19 L19 5']);
    expect(RIBBON_ICONS.dimension.paths).toHaveLength(5);
    expect(RIBBON_ICONS['cut-dimension'].paths).toHaveLength(5);
    expect(RIBBON_ICONS['cut-dimension'].paths).not.toEqual(RIBBON_ICONS.dimension.paths);
    expect(RIBBON_ICONS.download.paths).toHaveLength(3);
    expect(RIBBON_ICONS.rectangle.paths).toHaveLength(1);
    expect(RIBBON_ICONS['piece-add'].paths).toHaveLength(RIBBON_ICONS.piece.paths.length + 2);
    expect(RIBBON_ICONS['piece-add'].paths.slice(0, 3)).toEqual(RIBBON_ICONS.piece.paths);
    expect(RIBBON_ICONS['rectangle-center'].dots).toHaveLength(1);
    expect(RIBBON_ICONS['rectangle-aligned'].paths).toHaveLength(1);
    expect(RIBBON_ICONS.split.paths).toHaveLength(3);
    expect(RIBBON_ICONS.split.dots).toHaveLength(1);
    expect(RIBBON_ICONS.variables.paths).toHaveLength(4);
    expect(RIBBON_ICONS.variables).not.toEqual(RIBBON_ICONS.constraints);
  });

  it('resolves a glyph by name', () => {
    expect(ribbonIcon('select')).toBe(RIBBON_ICONS.select);
    expect(ribbonIcon('horizontal')).toBe(CONSTRAINT_ICONS.horizontal);
  });
});

import { describe, expect, it } from 'vitest';

import { RIBBON_GROUPS } from './editor-ribbon';

describe('RIBBON_GROUPS', () => {
  it('groups controls into tools, sketching, constraints and export', () => {
    expect(RIBBON_GROUPS.map((group) => group.id)).toEqual([
      'tools',
      'sketching',
      'constraints',
      'export',
    ]);
    expect(RIBBON_GROUPS.map((group) => group.label)).toEqual([
      'Tools',
      'Sketching',
      'Constraints',
      'Export',
    ]);
  });

  it('puts select, the round corner tool and the history/canvas actions in the tools group', () => {
    expect(RIBBON_GROUPS[0]!.items).toEqual([
      { kind: 'tool', id: 'tool-select', label: 'Select', icon: 'select', tool: 'select' },
      {
        kind: 'tool',
        id: 'tool-round_corner',
        label: 'Round corner',
        icon: 'round-corner',
        tool: 'round_corner',
      },
      { kind: 'action', id: 'undo', label: 'Undo', icon: 'undo', action: 'undo' },
      { kind: 'action', id: 'redo', label: 'Redo', icon: 'redo', action: 'redo' },
      { kind: 'action', id: 'delete', label: 'Delete', icon: 'delete', action: 'delete' },
      { kind: 'action', id: 'fit', label: 'Fit', icon: 'fit', action: 'fit' },
    ]);
  });

  it('exposes the sketching tools with distinct icons', () => {
    expect(RIBBON_GROUPS[1]!.items).toEqual([
      { kind: 'tool', id: 'tool-add_point', label: 'Point', icon: 'point', tool: 'add_point' },
      { kind: 'tool', id: 'tool-add_line', label: 'Line', icon: 'line', tool: 'add_line' },
      { kind: 'tool', id: 'tool-add_curve', label: 'Curve', icon: 'curve', tool: 'add_curve' },
      { kind: 'tool', id: 'tool-add_arc', label: 'Arc', icon: 'arc', tool: 'add_arc' },
      {
        kind: 'tool',
        id: 'tool-dimension',
        label: 'Dimension',
        icon: 'dimension',
        tool: 'dimension',
      },
      {
        kind: 'tool',
        id: 'tool-add_allowance',
        label: 'Seam allowance',
        icon: 'allowance',
        tool: 'add_allowance',
      },
    ]);
  });

  it('exposes every constraint type as an icon button', () => {
    const constraints = RIBBON_GROUPS[2]!.items;
    expect(constraints.map((item) => item.id)).toEqual([
      'constraint-coincident',
      'constraint-horizontal',
      'constraint-vertical',
      'constraint-point_on_line',
      'constraint-distance',
      'constraint-angle',
      'constraint-equal',
    ]);
    expect(constraints.every((item) => item.kind === 'constraint')).toBe(true);
    expect(constraints[1]).toMatchObject({
      kind: 'constraint',
      label: 'Horizontal',
      icon: 'horizontal',
      constraint: 'horizontal',
    });
  });

  it('exposes the SVG export action on its own', () => {
    expect(RIBBON_GROUPS[3]!.items).toEqual([
      {
        kind: 'action',
        id: 'download-svg',
        label: 'Download SVG',
        icon: 'download',
        action: 'download_svg',
      },
    ]);
  });
});

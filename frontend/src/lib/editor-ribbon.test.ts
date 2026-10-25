import { describe, expect, it } from 'vitest';

import { RIBBON_GROUPS, type RibbonToolGroupItem } from './editor-ribbon';

describe('RIBBON_GROUPS', () => {
  it('groups controls into tools, features, annotation, sketching, constraints and export', () => {
    expect(RIBBON_GROUPS.map((group) => group.id)).toEqual([
      'tools',
      'features',
      'annotation',
      'sketching',
      'constraints',
      'export',
    ]);
    expect(RIBBON_GROUPS.map((group) => group.label)).toEqual([
      'Tools',
      'Features',
      'Annotation',
      'Sketching',
      'Constraints',
      'Export',
    ]);
  });

  it('puts select and the history/canvas actions in the tools group', () => {
    expect(RIBBON_GROUPS[0]!.items).toEqual([
      { kind: 'tool', id: 'tool-select', label: 'Select', icon: 'select', tool: 'select' },
      {
        kind: 'action',
        id: 'create-piece',
        label: 'New piece',
        icon: 'piece',
        action: 'create_piece',
      },
      {
        kind: 'action',
        id: 'set-cut-loop',
        label: 'Set cut loop',
        icon: 'piece',
        action: 'set_cut_loop',
      },
      { kind: 'action', id: 'undo', label: 'Undo', icon: 'undo', action: 'undo' },
      { kind: 'action', id: 'redo', label: 'Redo', icon: 'redo', action: 'redo' },
      { kind: 'action', id: 'delete', label: 'Delete', icon: 'delete', action: 'delete' },
      { kind: 'action', id: 'fit', label: 'Fit', icon: 'fit', action: 'fit' },
    ]);
  });

  it('keeps the round corner tool in its own features group', () => {
    expect(RIBBON_GROUPS[1]!.items).toEqual([
      {
        kind: 'tool',
        id: 'tool-round_corner',
        label: 'Round corner',
        icon: 'round-corner',
        tool: 'round_corner',
      },
    ]);
  });

  it('offers annotation text in its own group', () => {
    expect(RIBBON_GROUPS[2]!.items).toEqual([
      { kind: 'tool', id: 'tool-add_text', label: 'Text', icon: 'text', tool: 'add_text' },
    ]);
  });

  it('exposes the sketching tools with distinct icons', () => {
    expect(RIBBON_GROUPS[3]!.items).toEqual([
      { kind: 'tool', id: 'tool-add_point', label: 'Point', icon: 'point', tool: 'add_point' },
      { kind: 'tool', id: 'tool-add_line', label: 'Line', icon: 'line', tool: 'add_line' },
      { kind: 'tool', id: 'tool-add_curve', label: 'Curve', icon: 'curve', tool: 'add_curve' },
      { kind: 'tool', id: 'tool-add_arc', label: 'Arc', icon: 'arc', tool: 'add_arc' },
      { kind: 'tool', id: 'tool-add_circle', label: 'Circle', icon: 'circle', tool: 'add_circle' },
      {
        kind: 'tool-group',
        id: 'tool-rectangle',
        label: 'Rectangle',
        primary: {
          kind: 'tool',
          id: 'tool-add_rectangle',
          label: 'Rectangle',
          icon: 'rectangle',
          tool: 'add_rectangle',
        },
        items: [
          {
            kind: 'tool',
            id: 'tool-add_rectangle',
            label: 'Rectangle',
            icon: 'rectangle',
            tool: 'add_rectangle',
          },
          {
            kind: 'tool',
            id: 'tool-add_center_rectangle',
            label: 'Centre rectangle',
            icon: 'rectangle-center',
            tool: 'add_center_rectangle',
          },
          {
            kind: 'tool',
            id: 'tool-add_3point_rectangle',
            label: '3-point rectangle',
            icon: 'rectangle-aligned',
            tool: 'add_3point_rectangle',
          },
        ],
      },
      {
        kind: 'tool',
        id: 'tool-dimension',
        label: 'Dimension',
        icon: 'dimension',
        tool: 'dimension',
      },
      {
        kind: 'tool',
        id: 'tool-cut_dimension',
        label: 'Cut dimension',
        icon: 'cut-dimension',
        tool: 'cut_dimension',
      },
    ]);
  });

  it('offers the three rectangle gestures as one group, diagonal first', () => {
    const group = RIBBON_GROUPS[3]!.items.find(
      (item): item is RibbonToolGroupItem => item.kind === 'tool-group',
    )!;

    expect(group.id).toBe('tool-rectangle');
    expect(group.label).toBe('Rectangle');
    expect(group.primary.tool).toBe('add_rectangle');
    expect(group.items.map((item) => item.tool)).toEqual([
      'add_rectangle',
      'add_center_rectangle',
      'add_3point_rectangle',
    ]);
  });

  it('exposes every constraint type as an icon button', () => {
    const constraints = RIBBON_GROUPS[4]!.items;
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
    expect(RIBBON_GROUPS[5]!.items).toEqual([
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

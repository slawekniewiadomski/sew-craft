import { describe, expect, it } from 'vitest';

import { RIBBON_GROUPS } from './editor-ribbon';

describe('RIBBON_GROUPS', () => {
  it('groups tools, constraints, history, edit and canvas actions', () => {
    expect(RIBBON_GROUPS.map((group) => group.id)).toEqual([
      'tools',
      'constraints',
      'history',
      'edit',
      'canvas',
    ]);
    expect(RIBBON_GROUPS.map((group) => group.label)).toEqual([
      'Tools',
      'Constraints',
      'History',
      'Edit',
      'Canvas',
    ]);
  });

  it('exposes each tool as a button keyed by its testid', () => {
    const tools = RIBBON_GROUPS[0]!.items;
    expect(tools).toEqual([
      { kind: 'tool', id: 'tool-select', label: 'Select', tool: 'select' },
      { kind: 'tool', id: 'tool-add_point', label: 'Point', tool: 'add_point' },
      { kind: 'tool', id: 'tool-add_line', label: 'Line', tool: 'add_line' },
      { kind: 'tool', id: 'tool-add_curve', label: 'Curve', tool: 'add_curve' },
    ]);
  });

  it('exposes every constraint type as a button', () => {
    const constraints = RIBBON_GROUPS[1]!.items;
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
      constraint: 'horizontal',
    });
  });

  it('exposes undo, redo, delete, fit and download actions', () => {
    const actions = RIBBON_GROUPS.flatMap((group) => group.items).map((item) =>
      item.kind === 'action' ? item.action : null,
    );
    expect(actions).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'undo',
      'redo',
      'delete',
      'fit',
      'download_svg',
    ]);
  });
});

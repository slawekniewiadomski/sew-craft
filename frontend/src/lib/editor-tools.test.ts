import { describe, expect, it } from 'vitest';

import { EDITOR_TOOLS } from './editor-tools';

describe('EDITOR_TOOLS', () => {
  it('lists the thirteen editor tools in order', () => {
    expect(EDITOR_TOOLS.map((tool) => tool.id)).toEqual([
      'select',
      'add_point',
      'add_line',
      'add_curve',
      'add_arc',
      'add_circle',
    'add_text',
      'add_rectangle',
      'add_center_rectangle',
      'add_3point_rectangle',
      'round_corner',
      'dimension',
      'cut_dimension',
    ]);
  });
});

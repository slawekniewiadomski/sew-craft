import { describe, expect, it } from 'vitest';

import { EDITOR_TOOLS } from './editor-tools';

describe('EDITOR_TOOLS', () => {
  it('lists the nine editor tools in order', () => {
    expect(EDITOR_TOOLS.map((tool) => tool.id)).toEqual([
      'select',
      'add_point',
      'add_line',
      'add_curve',
      'add_arc',
      'add_circle',
      'round_corner',
      'dimension',
      'cut_dimension',
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { EDITOR_TOOLS } from '@/lib/editor-tools';

describe('EDITOR_TOOLS', () => {
  it('lists the editor tools in order', () => {
    expect(EDITOR_TOOLS.map((tool) => tool.id)).toEqual([
      'select',
      'add_point',
      'add_line',
      'add_curve',
      'add_arc',
      'add_circle',
      'add_text',
      'add_text_leader',
      'add_rectangle',
      'add_center_rectangle',
      'add_3point_rectangle',
      'round_corner',
      'split_line',
      'notch',
      'centre_line',
      'dimension',
      'cut_dimension',
    ]);
  });
});

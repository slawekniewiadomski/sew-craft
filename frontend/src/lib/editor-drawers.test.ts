import { describe, expect, it } from 'vitest';

import { EDITOR_DRAWERS, initialDrawerState } from './editor-drawers';

describe('EDITOR_DRAWERS', () => {
  it('lists every drawer with its default and rail glyph', () => {
    expect(EDITOR_DRAWERS).toEqual([
      { id: 'properties', label: 'Properties', defaultOpen: true, icon: 'select' },
      { id: 'pieces', label: 'Pieces', defaultOpen: true, icon: 'piece' },
      { id: 'outline', label: 'Outline', defaultOpen: true, icon: 'line' },
      { id: 'dimensions', label: 'Dimensions', defaultOpen: false, icon: 'dimension' },
      { id: 'constraints', label: 'Constraints', defaultOpen: false, icon: 'constraints' },
      { id: 'view', label: 'View', defaultOpen: false, icon: 'eye' },
    ]);
  });
});

describe('initialDrawerState', () => {
  it('opens properties, pieces and outline and collapses dimensions, constraints and view', () => {
    expect(initialDrawerState()).toEqual({
      properties: true,
      pieces: true,
      outline: true,
      dimensions: false,
      constraints: false,
      view: false,
    });
  });
});

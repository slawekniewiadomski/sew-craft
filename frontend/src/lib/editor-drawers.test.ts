import { describe, expect, it } from 'vitest';

import { EDITOR_DRAWERS, initialDrawerState } from './editor-drawers';

describe('EDITOR_DRAWERS', () => {
  it('lists the properties, pieces, outline, dimensions, constraints and view drawers with their defaults', () => {
    expect(EDITOR_DRAWERS).toEqual([
      { id: 'properties', label: 'Properties', defaultOpen: true },
      { id: 'pieces', label: 'Pieces', defaultOpen: true },
      { id: 'outline', label: 'Outline', defaultOpen: true },
      { id: 'dimensions', label: 'Dimensions', defaultOpen: false },
      { id: 'constraints', label: 'Constraints', defaultOpen: false },
      { id: 'view', label: 'View', defaultOpen: false },
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

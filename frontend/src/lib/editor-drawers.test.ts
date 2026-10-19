import { describe, expect, it } from 'vitest';

import { EDITOR_DRAWERS, initialDrawerState } from './editor-drawers';

describe('EDITOR_DRAWERS', () => {
  it('lists the properties, outline, constraints and view drawers with their defaults', () => {
    expect(EDITOR_DRAWERS).toEqual([
      { id: 'properties', label: 'Properties', defaultOpen: true },
      { id: 'outline', label: 'Outline', defaultOpen: true },
      { id: 'constraints', label: 'Constraints', defaultOpen: false },
      { id: 'view', label: 'View', defaultOpen: false },
    ]);
  });
});

describe('initialDrawerState', () => {
  it('opens properties and outline and collapses constraints and view', () => {
    expect(initialDrawerState()).toEqual({
      properties: true,
      outline: true,
      constraints: false,
      view: false,
    });
  });
});

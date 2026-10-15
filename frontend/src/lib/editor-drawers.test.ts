import { describe, expect, it } from 'vitest';

import { EDITOR_DRAWERS, initialDrawerState } from './editor-drawers';

describe('EDITOR_DRAWERS', () => {
  it('lists the properties, outline and view drawers with their defaults', () => {
    expect(EDITOR_DRAWERS).toEqual([
      { id: 'properties', label: 'Properties', defaultOpen: true },
      { id: 'outline', label: 'Outline', defaultOpen: true },
      { id: 'view', label: 'View', defaultOpen: false },
    ]);
  });
});

describe('initialDrawerState', () => {
  it('opens properties and outline and collapses view', () => {
    expect(initialDrawerState()).toEqual({ properties: true, outline: true, view: false });
  });
});

import { describe, expect, it } from 'vitest';

import {
  EDITOR_PANELS,
  defaultPanelFor,
  panelsFor,
  parsePanel,
  persistedPanelKey,
  readPersistedPanel,
  writePersistedPanel,
} from './editor-panels';

describe('EDITOR_PANELS', () => {
  it('lists every section with its rail glyph', () => {
    expect(EDITOR_PANELS).toEqual([
      { id: 'properties', label: 'Properties', icon: 'select' },
      { id: 'pieces', label: 'Piece', icon: 'piece' },
      { id: 'pattern', label: 'Pattern', icon: 'eye' },
      { id: 'assembly', label: 'Assembly', icon: 'piece' },
      { id: 'outline', label: 'Outline', icon: 'line' },
      { id: 'dimensions', label: 'Dimensions', icon: 'dimension' },
      { id: 'constraints', label: 'Constraints', icon: 'constraints' },
    ]);
  });
});

describe('panelsFor', () => {
  it('shows the sketch sections on a piece tab and only Assembly on an assembly tab', () => {
    expect(panelsFor('piece').map((panel) => panel.id)).toEqual([
      'properties',
      'pieces',
      'pattern',
      'outline',
      'dimensions',
      'constraints',
    ]);
    expect(panelsFor('assembly').map((panel) => panel.id)).toEqual(['assembly']);
  });

  it('defaults to the entity inspector on a piece and the assembly card on an assembly', () => {
    expect(defaultPanelFor('piece')).toBe('properties');
    expect(defaultPanelFor('assembly')).toBe('assembly');
  });
});

describe('parsePanel', () => {
  it('keeps a section the mode offers', () => {
    expect(parsePanel('outline', 'piece')).toBe('outline');
  });

  it('falls back for a missing, unknown or wrong-mode section', () => {
    expect(parsePanel(null, 'piece')).toBe('properties');
    expect(parsePanel('missing', 'piece')).toBe('properties');
    expect(parsePanel('assembly', 'piece')).toBe('properties');
    expect(parsePanel('outline', 'assembly')).toBe('assembly');
  });
});

describe('persisted panel', () => {
  it('keys the section by mode and project', () => {
    expect(persistedPanelKey('42', 'piece')).toBe('sewcraft:sidebar:panel:piece:42');
    expect(persistedPanelKey('42', 'assembly')).toBe('sewcraft:sidebar:panel:assembly:42');
  });

  it('reads the stored section and falls back when absent', () => {
    const store = new Map<string, string>([['sewcraft:sidebar:panel:piece:7', 'dimensions']]);
    const storage = { getItem: (key: string) => store.get(key) ?? null };

    expect(readPersistedPanel(storage, '7', 'piece')).toBe('dimensions');
    expect(readPersistedPanel(storage, '8', 'piece')).toBe('properties');
    expect(readPersistedPanel(storage, '7', 'assembly')).toBe('assembly');
  });

  it('falls back when storage refuses to read', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readPersistedPanel(storage, '7', 'piece')).toBe('properties');
  });

  it('writes the section and ignores a storage refusal', () => {
    const store = new Map<string, string>();
    writePersistedPanel(
      {
        setItem: (key, value) => {
          store.set(key, value);
        },
      },
      '7',
      'piece',
      'outline',
    );
    expect(store.get('sewcraft:sidebar:panel:piece:7')).toBe('outline');

    expect(() =>
      writePersistedPanel(
        {
          setItem: () => {
            throw new Error('blocked');
          },
        },
        '7',
        'piece',
        'outline',
      ),
    ).not.toThrow();
  });
});

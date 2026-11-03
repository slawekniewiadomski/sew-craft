import { describe, expect, it } from 'vitest';

import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';

import {
  PIECE_COLORS,
  assemblyTab,
  encodeTab,
  moveTab,
  nextPieceColor,
  parseTab,
  persistedTabKey,
  pieceTab,
  readPersistedTab,
  reconcileTab,
  sameTab,
  tabColor,
  tabExists,
  tabIndex,
  tabKey,
  tabLabel,
  writePersistedTab,
} from '@/lib/tabs';

const documentOf = (overrides: Partial<PatternDocument> = {}): PatternDocument => ({
  ...createEmptyDocument(),
  pieces: [
    { id: 'p1', name: 'Front', edges: [], allowances: [], color: '#2563eb' },
    { id: 'p2', name: '   ', edges: [], allowances: [] },
  ],
  assemblies: [
    { id: 'a1', name: 'Outer', instances: [] },
    { id: 'a2', name: '  ', instances: [] },
  ],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'piece', id: 'p2' },
    { kind: 'assembly', id: 'a1' },
    { kind: 'assembly', id: 'a2' },
  ],
  ...overrides,
});

describe('tab refs and labels', () => {
  it('keys and compares refs by kind and id', () => {
    expect(tabKey({ kind: 'piece', id: 'p1' })).toBe('piece:p1');
    expect(sameTab(pieceTab('p1'), { kind: 'piece', id: 'p1' })).toBe(true);
    expect(sameTab(pieceTab('p1'), assemblyTab('p1'))).toBe(false);
    expect(sameTab(null, pieceTab('p1'))).toBe(false);
  });

  it('reports whether a tab still exists', () => {
    const document = documentOf();
    expect(tabExists(document, pieceTab('p1'))).toBe(true);
    expect(tabExists(document, pieceTab('gone'))).toBe(false);
  });

  it('labels a named object by its name and an unnamed one by its index', () => {
    const document = documentOf();
    expect(tabLabel(document, pieceTab('p1'))).toBe('Front');
    expect(tabLabel(document, pieceTab('p2'))).toBe('Piece 2');
    expect(tabLabel(document, assemblyTab('a1'))).toBe('Outer');
    expect(tabLabel(document, assemblyTab('a2'))).toBe('Assembly 2');
  });

  it('falls back to a bare noun for a missing object', () => {
    const document = documentOf();
    expect(tabLabel(document, pieceTab('gone'))).toBe('Piece');
    expect(tabLabel(document, assemblyTab('gone'))).toBe('Assembly');
  });

  it('reads a piece colour and never one for an assembly', () => {
    const document = documentOf();
    expect(tabColor(document, pieceTab('p1'))).toBe('#2563eb');
    expect(tabColor(document, pieceTab('p2'))).toBeNull();
    expect(tabColor(document, assemblyTab('a1'))).toBeNull();
  });

  it('cycles the palette by piece count', () => {
    expect(PIECE_COLORS).toHaveLength(6);
    expect(nextPieceColor(createEmptyDocument())).toBe(PIECE_COLORS[0]);
    expect(
      nextPieceColor({
        ...createEmptyDocument(),
        pieces: new Array(6)
          .fill(null)
          .map((_, index) => ({ id: `p${index}`, edges: [], allowances: [] })),
      }),
    ).toBe(PIECE_COLORS[0]);
  });
});

describe('persisted active tab', () => {
  const storage = (): Pick<Storage, 'getItem' | 'setItem'> & { value: string } => {
    const store = {
      value: '',
      getItem(): string {
        return store.value;
      },
      setItem(_key: string, next: string): void {
        store.value = next;
      },
    };
    return store;
  };

  it('keys the preference per pattern', () => {
    expect(persistedTabKey('42')).toBe('sewcraft:active-tab:42');
  });

  it('round-trips a tab and clears it with an empty value', () => {
    const store = storage();
    writePersistedTab(store, '42', assemblyTab('a1'));
    expect(store.value).toBe('assembly:a1');
    expect(readPersistedTab(store, '42')).toEqual(assemblyTab('a1'));

    writePersistedTab(store, '42', null);
    expect(readPersistedTab(store, '42')).toBeNull();
  });

  it('encodes and parses defensively', () => {
    expect(encodeTab(null)).toBeNull();
    expect(encodeTab(pieceTab('p1'))).toBe('piece:p1');
    expect(parseTab(null)).toBeNull();
    expect(parseTab('')).toBeNull();
    expect(parseTab('piece')).toBeNull();
    expect(parseTab('piece:')).toBeNull();
    expect(parseTab('drawing:p1')).toBeNull();
    expect(parseTab('piece:p1:extra')).toEqual({ kind: 'piece', id: 'p1:extra' });
  });

  it('clears a preference for a pattern that has none', () => {
    const store = storage();
    expect(readPersistedTab(store, '42')).toBeNull();
  });
});

describe('reconcileTab', () => {
  it('keeps a tab that still exists', () => {
    const document = documentOf();
    expect(reconcileTab(document, assemblyTab('a1'))).toEqual(assemblyTab('a1'));
  });

  it('takes the tab at the previous index, or the last one', () => {
    const document = documentOf();
    expect(reconcileTab(document, assemblyTab('gone'), 2)).toEqual(assemblyTab('a1'));
    expect(reconcileTab(document, assemblyTab('gone'), 9)).toEqual(assemblyTab('a2'));
    expect(reconcileTab(document, null, -1)).toEqual(pieceTab('p1'));
  });

  it('falls back to the first tab or none', () => {
    expect(reconcileTab(documentOf(), null)).toEqual(pieceTab('p1'));
    expect(reconcileTab(createEmptyDocument(), null)).toBeNull();
  });
});

describe('tab order helpers', () => {
  it('finds a tab index', () => {
    const document = documentOf();
    expect(tabIndex(document, assemblyTab('a1'))).toBe(2);
    expect(tabIndex(document, null)).toBe(-1);
    expect(tabIndex(document, pieceTab('gone'))).toBe(-1);
  });

  it('moves a tab and clamps the target', () => {
    const document = documentOf();
    expect(moveTab(document, 0, 2).map(tabKey)).toEqual([
      'piece:p2',
      'assembly:a1',
      'piece:p1',
      'assembly:a2',
    ]);
    expect(moveTab(document, 3, -5).map(tabKey)).toEqual([
      'assembly:a2',
      'piece:p1',
      'piece:p2',
      'assembly:a1',
    ]);
    expect(moveTab(document, 1, 1)).toEqual(document.tabs);
    expect(moveTab(document, 9, 0)).toEqual(document.tabs);
  });
});

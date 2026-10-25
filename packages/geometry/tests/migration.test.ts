import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  isKnownPatternSchema,
  KNOWN_PATTERN_SCHEMAS,
  normalizeDocument,
  UnsupportedPatternSchemaError,
  type LegacyPatternDocument,
  type Piece,
} from '../src/index.js';

const builtIn = { allowance: { width: 10, kind: 'seam' as const } };

describe('normalizeDocument', () => {
  it('returns a current document untouched', () => {
    const piece: Piece = { id: 'p', edges: ['a'], allowances: [] };
    const current = {
      ...createEmptyDocument(),
      pieces: [piece],
      tabs: [{ kind: 'piece' as const, id: 'p' }],
    };

    expect(normalizeDocument(current)).toBe(current);
  });

  it('defaults a missing assembly list and tab order', () => {
    const current = { ...createEmptyDocument() } as LegacyPatternDocument;
    delete current.assemblies;
    delete current.tabs;

    const migrated = normalizeDocument(current);

    expect(migrated.assemblies).toEqual([]);
    expect(migrated.tabs).toEqual([]);
  });

  it('appends missing objects in pieces-then-assemblies order', () => {
    const current = {
      ...createEmptyDocument(),
      pieces: [
        { id: 'p1', edges: [], allowances: [] },
        { id: 'p2', edges: [], allowances: [] },
      ],
      assemblies: [
        { id: 'a1', name: 'A', instances: [] },
        { id: 'a2', name: 'B', instances: [] },
      ],
      tabs: [{ kind: 'assembly' as const, id: 'a1' }],
    };

    expect(normalizeDocument(current).tabs).toEqual([
      { kind: 'assembly', id: 'a1' },
      { kind: 'piece', id: 'p1' },
      { kind: 'piece', id: 'p2' },
      { kind: 'assembly', id: 'a2' },
    ]);
  });

  it('drops duplicate and stale tabs and keeps a valid order', () => {
    const current = {
      ...createEmptyDocument(),
      pieces: [{ id: 'p1', edges: [], allowances: [] }],
      assemblies: [{ id: 'a1', name: 'A', instances: [] }],
      tabs: [
        { kind: 'assembly' as const, id: 'a1' },
        { kind: 'assembly' as const, id: 'a1' },
        { kind: 'assembly' as const, id: 'gone' },
        { kind: 'piece' as const, id: 'p1' },
      ],
    };

    expect(normalizeDocument(current).tabs).toEqual([
      { kind: 'assembly', id: 'a1' },
      { kind: 'piece', id: 'p1' },
    ]);
  });

  it('accepts a valid non-default tab order without rebuilding it', () => {
    const tabs = [
      { kind: 'assembly' as const, id: 'a1' },
      { kind: 'piece' as const, id: 'p1' },
    ];
    const current = {
      ...createEmptyDocument(),
      pieces: [{ id: 'p1', edges: [], allowances: [] }],
      assemblies: [{ id: 'a1', name: 'A', instances: [] }],
      tabs,
    };

    expect(normalizeDocument(current).tabs).toBe(tabs);
  });

  it('adds a piece list to a current document written without one', () => {
    const current = { ...createEmptyDocument() } as LegacyPatternDocument;
    delete current.pieces;

    const migrated = normalizeDocument(current);

    expect(migrated.schema).toBe('sewcraft.pattern/0.4');
    expect(migrated.pieces).toEqual([]);
  });

  it('refuses a 0.3 document instead of migrating it', () => {
    const legacy = {
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.3',
    } as LegacyPatternDocument;

    expect(() => normalizeDocument(legacy)).toThrow(UnsupportedPatternSchemaError);
  });

  it('refuses a 0.2 document instead of migrating it', () => {
    const legacy = {
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.2',
    } as LegacyPatternDocument;

    expect(() => normalizeDocument(legacy)).toThrow(UnsupportedPatternSchemaError);
  });

  it('refuses a 0.1 document instead of migrating it', () => {
    const legacy = {
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.1',
    } as LegacyPatternDocument;

    expect(() => normalizeDocument(legacy)).toThrow(UnsupportedPatternSchemaError);
  });

  it('names the refused schema on the error', () => {
    const legacy = {
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.2',
    } as LegacyPatternDocument;

    try {
      normalizeDocument(legacy);
      expect.unreachable('normalizeDocument should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedPatternSchemaError);
      expect((error as UnsupportedPatternSchemaError).schema).toBe('sewcraft.pattern/0.2');
      expect((error as Error).name).toBe('UnsupportedPatternSchemaError');
    }
  });

  it('is idempotent', () => {
    const once = normalizeDocument(createEmptyDocument());
    const twice = normalizeDocument(once);

    expect(twice).toBe(once);
  });
});

describe('known pattern schemas', () => {
  it('lists only the current schema', () => {
    expect(KNOWN_PATTERN_SCHEMAS).toEqual(['sewcraft.pattern/0.4']);
  });

  it('accepts the schema this build understands', () => {
    expect(isKnownPatternSchema('sewcraft.pattern/0.4')).toBe(true);
  });

  it('refuses a legacy, newer or hand-edited schema', () => {
    expect(isKnownPatternSchema('sewcraft.pattern/0.1')).toBe(false);
    expect(isKnownPatternSchema('sewcraft.pattern/0.2')).toBe(false);
    expect(isKnownPatternSchema('sewcraft.pattern/0.3')).toBe(false);
    expect(isKnownPatternSchema('sewcraft.pattern/0.5')).toBe(false);
    expect(isKnownPatternSchema('')).toBe(false);
  });
});

describe('default allowance normalisation', () => {
  it('adds the built-in default to a current document without one', () => {
    const piece: Piece = {
      id: 'p',
      edges: ['a'],
      allowances: [{ edge: 'a', width: 15 }],
    };
    const current = { ...createEmptyDocument(), pieces: [piece] };
    delete current.defaults;

    const migrated = normalizeDocument(current);

    expect(migrated).not.toBe(current);
    expect(migrated.defaults).toEqual(builtIn);
    expect(migrated.pieces).toEqual([piece]);
    expect(migrated.pieces[0]!.allowances).toEqual([{ edge: 'a', width: 15 }]);
  });

  it('keeps an explicit null default', () => {
    const current = { ...createEmptyDocument(), defaults: { allowance: null } };
    expect(normalizeDocument(current)).toBe(current);
  });

  it('repairs an invalid stored preset', () => {
    const current = { ...createEmptyDocument(), defaults: { allowance: { width: 0 } } };
    expect(normalizeDocument(current).defaults).toEqual(builtIn);
  });
});

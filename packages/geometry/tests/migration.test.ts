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
    const current = { ...createEmptyDocument(), pieces: [piece] };

    expect(normalizeDocument(current)).toBe(current);
  });

  it('adds a piece list to a current document written without one', () => {
    const current = { ...createEmptyDocument() } as LegacyPatternDocument;
    delete current.pieces;

    const migrated = normalizeDocument(current);

    expect(migrated.schema).toBe('sewcraft.pattern/0.3');
    expect(migrated.pieces).toEqual([]);
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
    expect(KNOWN_PATTERN_SCHEMAS).toEqual(['sewcraft.pattern/0.3']);
  });

  it('accepts the schema this build understands', () => {
    expect(isKnownPatternSchema('sewcraft.pattern/0.3')).toBe(true);
  });

  it('refuses a legacy, newer or hand-edited schema', () => {
    expect(isKnownPatternSchema('sewcraft.pattern/0.1')).toBe(false);
    expect(isKnownPatternSchema('sewcraft.pattern/0.2')).toBe(false);
    expect(isKnownPatternSchema('sewcraft.pattern/0.4')).toBe(false);
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

import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  DEFAULT_ALLOWANCE_PRESET,
  effectiveDefaultAllowance,
  normalizeDefaults,
  type AllowanceKind,
  type PatternDefaults,
  type PatternDocument,
} from '../src/index.js';

const documentOf = (defaults?: PatternDefaults): PatternDocument => {
  const document = createEmptyDocument();
  if (defaults === undefined) {
    delete document.defaults;
    return document;
  }
  return { ...document, defaults };
};

describe('DEFAULT_ALLOWANCE_PRESET', () => {
  it('is a 10 mm seam', () => {
    expect(DEFAULT_ALLOWANCE_PRESET).toEqual({ width: 10, kind: 'seam' });
  });
});

describe('effectiveDefaultAllowance', () => {
  it('resolves the built-in preset when the document has no defaults', () => {
    expect(effectiveDefaultAllowance(documentOf())).toEqual({ width: 10, kind: 'seam' });
  });

  it('returns the stored preset', () => {
    expect(
      effectiveDefaultAllowance(documentOf({ allowance: { width: 15, kind: 'double' } })),
    ).toEqual({ width: 15, kind: 'double' });
  });

  it('returns null when the project default is off', () => {
    expect(effectiveDefaultAllowance(documentOf({ allowance: null }))).toBeNull();
  });
});

describe('normalizeDefaults', () => {
  it('materialises the built-in preset on a document without defaults', () => {
    const document = documentOf();
    const normalized = normalizeDefaults(document);

    expect(normalized).not.toBe(document);
    expect(normalized.defaults).toEqual({ allowance: { width: 10, kind: 'seam' } });
    expect(document.defaults).toBeUndefined();
  });

  it('keeps a valid stored preset and the caller object', () => {
    const document = documentOf({ allowance: { width: 12, kind: 'single' } });
    expect(normalizeDefaults(document)).toBe(document);
  });

  it('keeps null as "no default"', () => {
    const document = documentOf({ allowance: null });
    expect(normalizeDefaults(document)).toBe(document);
  });

  it('accepts a preset without an explicit kind', () => {
    const document = documentOf({ allowance: { width: 8 } });
    expect(normalizeDefaults(document)).toBe(document);
  });

  it('falls back to the built-in preset for an unknown kind', () => {
    const document = documentOf({
      allowance: { width: 10, kind: 'welded' as unknown as AllowanceKind },
    });

    expect(normalizeDefaults(document).defaults).toEqual({
      allowance: { width: 10, kind: 'seam' },
    });
  });

  it('falls back for a non-finite, zero or negative width', () => {
    for (const width of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
      const document = documentOf({ allowance: { width } });
      expect(normalizeDefaults(document).defaults).toEqual({
        allowance: { width: 10, kind: 'seam' },
      });
    }
  });

  it('falls back when a hand-edited defaults object has no allowance', () => {
    const document = { ...createEmptyDocument(), defaults: {} as PatternDefaults };
    expect(normalizeDefaults(document).defaults).toEqual({
      allowance: { width: 10, kind: 'seam' },
    });
  });

  it('is idempotent', () => {
    const once = normalizeDefaults(documentOf());
    expect(normalizeDefaults(once)).toBe(once);
  });
});

describe('createEmptyDocument defaults', () => {
  it('starts with the built-in preset', () => {
    expect(createEmptyDocument().defaults).toEqual({
      allowance: { width: 10, kind: 'seam' },
    });
  });
});

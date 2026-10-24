import { createEmptyDocument, type Piece, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { defaultAllowanceSummary, uniformAllowance } from './allowance-defaults';

const documentOf = (defaults?: PatternDocument['defaults']): PatternDocument => {
  const document = createEmptyDocument();
  if (defaults === undefined) {
    delete document.defaults;
    return document;
  }
  return { ...document, defaults };
};

const piece = (edges: string[], allowances: Piece['allowances']): Piece => ({
  id: 'p',
  edges,
  allowances,
});

describe('defaultAllowanceSummary', () => {
  it('shows the built-in 10 mm seam when the document has no default', () => {
    expect(defaultAllowanceSummary(documentOf())).toEqual({ kind: 'seam', width: 10 });
  });

  it('shows the stored preset, defaulting an omitted kind to seam', () => {
    expect(
      defaultAllowanceSummary(documentOf({ allowance: { width: 15, kind: 'double' } })),
    ).toEqual({ kind: 'double', width: 15 });
    expect(defaultAllowanceSummary(documentOf({ allowance: { width: 8 } }))).toEqual({
      kind: 'seam',
      width: 8,
    });
  });

  it('shows none when the default is off', () => {
    expect(defaultAllowanceSummary(documentOf({ allowance: null }))).toEqual({
      kind: 'none',
      width: 0,
    });
  });
});

describe('uniformAllowance', () => {
  it('returns the shared width and kind', () => {
    const panel = piece(
      ['a', 'b'],
      [
        { edge: 'a', width: 10, kind: 'seam' },
        { edge: 'b', width: 10 },
      ],
    );

    expect(uniformAllowance(panel)).toEqual({ kind: 'seam', width: 10 });
  });

  it('returns none when every edge has no allowance', () => {
    expect(uniformAllowance(piece(['a', 'b'], []))).toEqual({ kind: 'none', width: 0 });
  });

  it('returns null when an edge has no allowance and another has one', () => {
    expect(uniformAllowance(piece(['a', 'b'], [{ edge: 'a', width: 10 }]))).toBeNull();
  });

  it('returns null when the first edge has no allowance', () => {
    expect(uniformAllowance(piece(['a', 'b'], [{ edge: 'b', width: 10 }]))).toBeNull();
  });

  it('returns null when widths or kinds differ', () => {
    expect(
      uniformAllowance(
        piece(
          ['a', 'b'],
          [
            { edge: 'a', width: 10 },
            { edge: 'b', width: 12 },
          ],
        ),
      ),
    ).toBeNull();
    expect(
      uniformAllowance(
        piece(
          ['a', 'b'],
          [
            { edge: 'a', width: 10, kind: 'single' },
            { edge: 'b', width: 10, kind: 'double' },
          ],
        ),
      ),
    ).toBeNull();
  });

  it('ignores entries for edges outside the loop', () => {
    const panel = piece(['a', 'b'], [{ edge: 'ghost', width: 10 }]);
    expect(uniformAllowance(panel)).toEqual({ kind: 'none', width: 0 });
  });

  it('returns none for a loop with no edges', () => {
    expect(uniformAllowance(piece([], []))).toEqual({ kind: 'none', width: 0 });
  });
});

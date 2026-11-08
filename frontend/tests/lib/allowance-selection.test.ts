import type { PieceSummary } from '@/lib/pieces';
import { describe, expect, it } from 'vitest';

import { allowanceSelection } from '@/lib/allowance-selection';
import { type PatternDocument, createEmptyDocument } from '@sewcraft/geometry';

const document: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, fixed: false },
    { id: 'ab', kind: 'line', start: 'a', end: 'b' },
    { id: 'bc', kind: 'line', start: 'b', end: 'a' },
  ],
};

const summary: PieceSummary = {
  id: 'p1',
  name: 'Front',
  quantity: 1,
  edges: ['ab', 'bc'],
  allowances: [
    { edge: 'ab', kind: 'double', width: 10, cutDistance: 20 },
    { edge: 'bc', kind: 'seam', width: 5, cutDistance: 5 },
  ],
  corners: [
    { round: 'r1', radius: 5, cutWidth: null, inherited: 10, halves: [], state: 'inherited' },
    { round: 'r2', radius: 6, cutWidth: 8, inherited: null, halves: [], state: 'own' },
    { round: 'r3', radius: 7, cutWidth: null, inherited: null, halves: [5, 2.5], state: 'split' },
    { round: 'r4', radius: 8, cutWidth: null, inherited: null, halves: [], state: 'none' },
    { round: 'r5', radius: 9, cutWidth: null, inherited: null, halves: [], state: 'broken' },
  ],
  uniform: null,
  metrics: null,
  hasLoop: true,
  broken: false,
  entityCount: 2,
};

describe('allowanceSelection', () => {
  it('resolves selected edges against the piece summary', () => {
    const selection = allowanceSelection(document, summary, [{ kind: 'edge', edge: 'ab' }]);

    expect(selection.edges).toEqual([
      { edge: 'ab', label: 'a → b', kind: 'double', width: 10, cutDistance: 20 },
    ]);
    expect(selection.corners).toEqual([]);
    expect(selection.count).toBe(1);
    expect(selection.edgeWidthsMixed).toBe(false);
    expect(selection.cornerWidthsMixed).toBe(false);
  });

  it('flags mixed edge widths', () => {
    const selection = allowanceSelection(document, summary, [
      { kind: 'edge', edge: 'ab' },
      { kind: 'edge', edge: 'bc' },
    ]);

    expect(selection.count).toBe(2);
    expect(selection.edgeWidthsMixed).toBe(true);
  });

  it('resolves every corner state and its effective cut width', () => {
    const selection = allowanceSelection(document, summary, [
      { kind: 'round', round: 'r1' },
      { kind: 'round', round: 'r2' },
      { kind: 'round', round: 'r3' },
      { kind: 'round', round: 'r4' },
      { kind: 'round', round: 'r5' },
    ]);

    expect(selection.corners.map((row) => [row.round, row.state, row.effective])).toEqual([
      ['r1', 'inherited', 10],
      ['r2', 'own', 8],
      ['r3', 'split', 7.5],
      ['r4', 'none', null],
      ['r5', 'broken', null],
    ]);
    expect(selection.cornerWidthsMixed).toBe(true);
  });

  it('skips targets the piece no longer owns and deduplicates repeated picks', () => {
    const selection = allowanceSelection(document, summary, [
      { kind: 'edge', edge: 'ab' },
      { kind: 'edge', edge: 'ab' },
      { kind: 'edge', edge: 'missing' },
      { kind: 'round', round: 'missing' },
    ]);

    expect(selection.edges.map((row) => row.edge)).toEqual(['ab']);
    expect(selection.corners).toEqual([]);
    expect(selection.count).toBe(1);
  });

  it('returns an empty selection when nothing resolves', () => {
    const selection = allowanceSelection(document, summary, []);

    expect(selection).toMatchObject({
      edges: [],
      corners: [],
      count: 0,
      edgeWidthsMixed: false,
      cornerWidthsMixed: false,
    });
  });
});

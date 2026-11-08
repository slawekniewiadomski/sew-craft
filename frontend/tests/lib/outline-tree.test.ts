import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { outlineRowCount, outlineTree } from '@/lib/outline-tree';

/** One document covering every group, both mark kinds and the unowned buckets. */
const document: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, fixed: false, piece: 'p1' },
    { id: 'b', kind: 'point', x: 100, y: 0, fixed: false, piece: 'p1' },
    { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
    { id: 'note', kind: 'text', piece: 'p1', anchor: 'a', content: 'Grain line' },
    { id: 'notch', kind: 'mark', type: 'notch', piece: 'p1', edge: 'ab', point: 'a' },
    { id: 'axis', kind: 'mark', type: 'centre_line', piece: 'p1', start: 'a', end: 'b' },
    { id: 'loose', kind: 'point', x: 5, y: 5, fixed: false },
    { id: 'dangling', kind: 'point', x: 6, y: 6, fixed: false, piece: 'ghost' },
  ],
  constraints: [
    { id: 'width', type: 'distance', a: 'a', b: 'b', piece: 'p1', value: 100 },
    {
      id: 'broken',
      type: 'derived_distance',
      piece: 'p1',
      a: { edge: 'nope', at: 'start' },
      b: { edge: 'nope', at: 'end' },
    },
    {
      id: 'cut',
      type: 'derived_distance',
      piece: 'p1',
      a: { edge: 'ab', at: 'start' },
      b: { edge: 'ab', at: 'end' },
    },
    { id: 'level', type: 'horizontal', a: 'a', b: 'b', piece: 'p1' },
    { id: 'inferred', type: 'distance', a: 'a', b: 'b' },
    { id: 'loose-constraint', type: 'vertical', a: 'loose', b: 'dangling' },
    { id: 'ghost-dimension', type: 'distance', a: 'loose', b: 'dangling', piece: 'ghost' },
    {
      id: 'ghost-cut',
      type: 'derived_distance',
      piece: 'ghost',
      a: { edge: 'ab', at: 'start' },
      b: { edge: 'ab', at: 'end' },
    },
  ],
  pieces: [
    { id: 'p1', name: 'Front', edges: ['ab'], allowances: [] },
    { id: 'p2', edges: [], allowances: [] },
  ],
};

function rowIds(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

describe('outlineTree', () => {
  it('roots the tree at every piece, in document order, then the unowned bucket', () => {
    const tree = outlineTree(document);

    expect(tree.map((node) => node.pieceId)).toEqual(['p1', 'p2', null]);
    expect(tree.map((node) => node.label)).toEqual(['Front', 'Piece 2', 'Unassigned']);
    expect(tree.map((node) => node.count)).toEqual([11, 0, 5]);
  });

  it('groups a piece into geometry, dimensions, constraints, text and marks', () => {
    const front = outlineTree(document)[0]!;

    expect(front.groups.map((group) => group.id)).toEqual([
      'geometry',
      'dimensions',
      'constraints',
      'text',
      'marks',
    ]);
    expect(front.groups.map((group) => group.rows.length)).toEqual([3, 4, 1, 1, 2]);
  });

  it('labels every row with its type and the value that distinguishes it', () => {
    const groups = outlineTree(document)[0]!.groups;
    const geometry = groups.find((group) => group.id === 'geometry')!;
    const dimensions = groups.find((group) => group.id === 'dimensions')!;
    const constraints = groups.find((group) => group.id === 'constraints')!;
    const text = groups.find((group) => group.id === 'text')!;
    const marks = groups.find((group) => group.id === 'marks')!;

    expect(geometry.rows.find((row) => row.id === 'a')).toMatchObject({
      typeLabel: 'Point',
      label: 'a',
      icon: 'point',
      target: 'entity',
      references: [],
    });
    expect(geometry.rows.find((row) => row.id === 'ab')).toMatchObject({
      typeLabel: 'Line',
      label: 'a → b',
      icon: 'line',
    });
    expect(dimensions.rows.find((row) => row.id === 'width')).toMatchObject({
      typeLabel: 'Distance',
      label: '100 mm',
      target: 'dimension',
    });
    expect(dimensions.rows.find((row) => row.id === 'broken')).toMatchObject({ label: '—' });
    expect(dimensions.rows.find((row) => row.id === 'cut')).toMatchObject({
      typeLabel: 'Cut dimension',
      label: '—',
    });
    expect(constraints.rows[0]).toMatchObject({
      typeLabel: 'Constraint',
      label: 'Horizontal',
      target: 'references',
      references: ['a', 'b'],
    });
    expect(text.rows[0]).toMatchObject({ typeLabel: 'Text', label: 'Grain line' });
    expect(marks.rows.map((row) => row.typeLabel)).toEqual(['Notch', 'Centre line']);
  });

  it('collects an unowned or dangling entity and an unowned constraint', () => {
    const unowned = outlineTree(document)[2]!;

    expect(unowned.groups.map((group) => group.id)).toEqual([
      'geometry',
      'dimensions',
      'constraints',
    ]);
    expect(rowIds(unowned.groups[0]!.rows)).toEqual(['loose', 'dangling']);
    expect(rowIds(unowned.groups[1]!.rows)).toEqual(['ghost-dimension', 'ghost-cut']);
    expect(rowIds(unowned.groups[2]!.rows)).toEqual(['loose-constraint']);
  });

  it('keeps an empty piece and omits an empty unowned bucket', () => {
    const tree = outlineTree({
      ...createEmptyDocument(),
      pieces: [{ id: 'p1', edges: [], allowances: [] }],
    });

    expect(tree).toEqual([{ pieceId: 'p1', label: 'Piece 1', groups: [], count: 0 }]);
    expect(outlineRowCount(tree)).toBe(0);
  });

  it('counts every row across the roots', () => {
    expect(outlineRowCount(outlineTree(document))).toBe(16);
  });
});

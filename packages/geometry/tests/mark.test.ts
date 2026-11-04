import { describe, expect, it } from 'vitest';

import {
  centreLineGeometry,
  createEmptyDocument,
  markIsBroken,
  notchDepthShare,
  notchGeometry,
  pieceById,
  pieceMarks,
  pointOnEdge,
  projectOnEdge,
  type ArcEntity,
  type Entity,
  type LineEntity,
  type NotchMark,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  fixed: false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
});

const allowance = (edge: string, width = 10, kind: 'seam' | 'single' | 'double' = 'single') => ({
  edge,
  width,
  kind,
});

/**
 * A 200 mm square. The default loop runs a → b → c → d, and `reversed` swaps the
 * edge endpoints so the walk runs the other way round while the shape stays put.
 */
function square(reversed = false): PatternDocument {
  const edges = reversed
    ? [line('e1', 'b', 'a'), line('e2', 'a', 'd'), line('e3', 'd', 'c'), line('e4', 'c', 'b')]
    : [line('e1', 'a', 'b'), line('e2', 'b', 'c'), line('e3', 'c', 'd'), line('e4', 'd', 'a')];
  const piece: Piece = {
    id: 'piece-1',
    edges: ['e1', 'e2', 'e3', 'e4'],
    allowances: [allowance('e1'), allowance('e2'), allowance('e3'), allowance('e4')],
  };
  return {
    ...createEmptyDocument(),
    entities: [
      point('a', 0, 0),
      point('b', 200, 0),
      point('c', 200, 200),
      point('d', 0, 200),
      ...edges,
    ],
    pieces: [piece],
  };
}

const notch = (overrides: Partial<NotchMark> = {}): NotchMark => ({
  id: 'notch-1',
  kind: 'mark',
  type: 'notch',
  piece: 'piece-1',
  edge: 'e1',
  point: 'm',
  ...overrides,
});

const pieceOf = (document: PatternDocument): Piece => pieceById(document, 'piece-1')!;

const withMidpoint = (document: PatternDocument): PatternDocument => ({
  ...document,
  entities: [...document.entities, point('m', 100, 0)],
});

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('notch geometry', () => {
  it('opens on the cut line and points back at the stitch line', () => {
    const document = withMidpoint(square());
    const geometry = notchGeometry(document, pieceOf(document), notch());

    expect(geometry).not.toBeNull();
    // 10 mm single allowance: the mouth sits 10 mm out, the default half-depth tip 5 mm.
    expect(distance(geometry!.mouth, { x: 100, y: 0 })).toBeCloseTo(10, 9);
    expect(distance(geometry!.tip, { x: 100, y: 0 })).toBeCloseTo(5, 9);
    expect(distance(geometry!.feet[0], geometry!.mouth)).toBeCloseTo(3, 9);
    expect(distance(geometry!.feet[1], geometry!.mouth)).toBeCloseTo(3, 9);
    expect(distance(geometry!.feet[0], geometry!.feet[1])).toBeCloseTo(6, 9);
  });

  it('keeps the V outside whichever way the loop walks', () => {
    const mouth = (reversed: boolean): { x: number; y: number } => {
      const document = withMidpoint(square(reversed));
      return notchGeometry(document, pieceOf(document), notch())!.mouth;
    };

    expect(mouth(false)).toEqual({ x: 100, y: -10 });
    expect(mouth(true)).toEqual({ x: 100, y: -10 });
  });

  it('scales the depth with a double allowance and clamps the share', () => {
    const doubled: PatternDocument = {
      ...withMidpoint(square()),
      pieces: [
        {
          id: 'piece-1',
          edges: ['e1', 'e2', 'e3', 'e4'],
          allowances: [
            allowance('e1', 10, 'double'),
            allowance('e2'),
            allowance('e3'),
            allowance('e4'),
          ],
        },
      ],
    };
    const doubledGeometry = notchGeometry(doubled, pieceOf(doubled), notch())!;
    expect(distance(doubledGeometry.mouth, { x: 100, y: 0 })).toBeCloseTo(20, 9);
    expect(distance(doubledGeometry.tip, { x: 100, y: 0 })).toBeCloseTo(10, 9);

    const document = withMidpoint(square());
    const tipDepth = (depth: number | undefined): number =>
      distance(notchGeometry(document, pieceOf(document), notch({ depth }))!.tip, { x: 100, y: 0 });

    expect(tipDepth(10)).toBeCloseTo(1, 9);
    expect(tipDepth(-5)).toBeCloseTo(9.5, 9);
    expect(tipDepth(0.25)).toBeCloseTo(7.5, 9);
  });

  it('falls back to the default share for an absent or unusable depth', () => {
    expect(notchDepthShare(undefined)).toBe(0.5);
    expect(notchDepthShare(Number.NaN)).toBe(0.5);
    expect(notchDepthShare(Number.POSITIVE_INFINITY)).toBe(0.5);
    expect(notchDepthShare(0.75)).toBe(0.75);
  });

  it('resolves a notch on a curve edge', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 200, 0),
        point('c', 200, 200),
        point('p1', 220, 220),
        point('p2', 0, 220),
        point('d', 0, 200),
        point('m', 200, 100),
        line('e1', 'a', 'b'),
        line('e2', 'b', 'c'),
        {
          id: 'e3',
          kind: 'curve',
          p0: 'c',
          p1: 'p1',
          p2: 'p2',
          p3: 'd',
        } as Entity,
        line('e4', 'd', 'a'),
      ],
      pieces: [
        {
          id: 'piece-1',
          edges: ['e1', 'e2', 'e3', 'e4'],
          allowances: [allowance('e3', 10)],
        },
      ],
    };

    const geometry = notchGeometry(document, pieceOf(document), notch({ edge: 'e3', point: 'c' }));
    expect(geometry).not.toBeNull();
    expect(distance(geometry!.mouth, { x: 200, y: 200 })).toBeCloseTo(10, 9);
  });

  it('resolves a notch on an arc edge', () => {
    const arc: ArcEntity = {
      id: 'e3',
      kind: 'arc',
      start: 'c',
      through: 't',
      end: 'd',
    };
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 200, 0),
        point('c', 200, 200),
        point('t', 100, 260),
        point('d', 0, 200),
        line('e1', 'a', 'b'),
        line('e2', 'b', 'c'),
        arc,
        line('e4', 'd', 'a'),
      ],
      pieces: [
        {
          id: 'piece-1',
          edges: ['e1', 'e2', 'e3', 'e4'],
          allowances: [allowance('e3', 10)],
        },
      ],
    };

    const geometry = notchGeometry(document, pieceOf(document), notch({ edge: 'e3', point: 't' }));
    expect(geometry).not.toBeNull();
  });

  it('is broken without an allowance on its edge', () => {
    const document = withMidpoint(square());
    const bare: PatternDocument = {
      ...document,
      pieces: [{ id: 'piece-1', edges: ['e1', 'e2', 'e3', 'e4'], allowances: [] }],
    };
    expect(notchGeometry(bare, pieceOf(bare), notch())).toBeNull();
    expect(markIsBroken(bare, pieceOf(bare), notch())).toBe(true);
  });

  it('is broken when the edge left the loop or the point is gone', () => {
    const document = withMidpoint(square());
    const removedEdge: PatternDocument = {
      ...document,
      pieces: [{ ...pieceOf(document), edges: ['e2', 'e3', 'e4'] }],
    };
    expect(notchGeometry(removedEdge, pieceOf(removedEdge), notch())).toBeNull();

    expect(notchGeometry(document, pieceOf(document), notch({ point: 'gone' }))).toBeNull();
  });

  it('is broken when the point is not on the edge', () => {
    const document: PatternDocument = {
      ...square(),
      entities: [...square().entities, point('m', 100, 50)],
    };
    expect(notchGeometry(document, pieceOf(document), notch())).toBeNull();
  });

  it('is broken when the edge has no drawable geometry', () => {
    const base = withMidpoint(square());
    const document: PatternDocument = {
      ...base,
      entities: [
        ...base.entities.filter((entity) => entity.id !== 'e1'),
        { id: 'e1', kind: 'line', start: 'a', end: 'a' },
      ],
    };
    const degenerate = pieceOf(document);
    expect(notchGeometry(document, degenerate, notch())).toBeNull();

    const missing: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'e1'),
    };
    expect(notchGeometry(missing, pieceOf(missing), notch())).toBeNull();
  });

  it('is broken when the loop cannot resolve or the allowance is empty', () => {
    const document = withMidpoint(square());
    const open: PatternDocument = {
      ...document,
      pieces: [{ ...pieceOf(document), edges: ['e1'] }],
    };
    expect(notchGeometry(open, pieceOf(open), notch())).toBeNull();

    const zero: PatternDocument = {
      ...document,
      pieces: [{ ...pieceOf(document), allowances: [allowance('e1', 0)] }],
    };
    expect(notchGeometry(zero, pieceOf(zero), notch())).toBeNull();
  });
});

describe('edge projection', () => {
  it('accepts a point on the edge and rejects one beside it', () => {
    const document = withMidpoint(square());
    expect(pointOnEdge(document, 'e1', 'm')).toBe(true);
    expect(pointOnEdge(document, 'e1', 'c')).toBe(false);
    expect(pointOnEdge(document, 'e1', 'gone')).toBe(false);
    expect(pointOnEdge(document, 'e2', 'm')).toBe(false);
  });

  it('reports no projection for an edge that is not there', () => {
    const document = withMidpoint(square());
    expect(projectOnEdge(document, 'gone', { x: 0, y: 0 })).toBeNull();
  });
});

describe('centre line geometry', () => {
  it('resolves the segment between its two points', () => {
    const document = withMidpoint(square());
    const geometry = centreLineGeometry(document, {
      id: 'centre-1',
      kind: 'mark',
      type: 'centre_line',
      piece: 'piece-1',
      start: 'a',
      end: 'c',
    });
    expect(geometry).toEqual({ start: { x: 0, y: 0 }, end: { x: 200, y: 200 } });
  });

  it('is broken when either endpoint is gone', () => {
    const document = withMidpoint(square());
    const mark = {
      id: 'centre-1',
      kind: 'mark' as const,
      type: 'centre_line' as const,
      piece: 'piece-1',
      start: 'a',
      end: 'gone',
    };
    expect(centreLineGeometry(document, mark)).toBeNull();
    expect(markIsBroken(document, pieceOf(document), mark)).toBe(true);
  });
});

describe('piece marks', () => {
  it('lists only the marks of one piece', () => {
    const document: PatternDocument = {
      ...withMidpoint(square()),
      entities: [
        ...withMidpoint(square()).entities,
        notch(),
        notch({ id: 'notch-2', piece: 'other' }),
        {
          id: 'centre-1',
          kind: 'mark',
          type: 'centre_line',
          piece: 'piece-1',
          start: 'a',
          end: 'c',
        },
      ],
    };
    expect(pieceMarks(document, 'piece-1').map((mark) => mark.id)).toEqual(['notch-1', 'centre-1']);
  });
});

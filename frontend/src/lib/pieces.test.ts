import {
  createEmptyDocument,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  anchorForPoint,
  cutDimensionForPoints,
  pieceAllowanceRows,
  pieceCreationFromSelection,
  pieceLabel,
  pieceOwningEdge,
  pieceSummaries,
  pieceSummary,
} from './pieces';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
});

const line = (id: string, start: string, end: string, construction = false): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction,
});

const curve = (id: string, p0: string, p1: string, p2: string, p3: string): CurveEntity => ({
  id,
  kind: 'curve',
  p0,
  p1,
  p2,
  p3,
  construction: false,
});

const arc = (id: string, start: string, through: string, end: string): ArcEntity => ({
  id,
  kind: 'arc',
  start,
  through,
  end,
  construction: false,
});

const circle = (id: string, center: string, rim: string): CircleEntity => ({
  id,
  kind: 'circle',
  center,
  rim,
  construction: false,
});

function bareSquareDocument(): PatternDocument {
  return {
    ...createEmptyDocument(),
    entities: [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('da', 'd', 'a'),
      line('ad', 'a', 'd'),
    ],
  };
}

function squareDocument(): PatternDocument {
  return {
    ...bareSquareDocument(),
    pieces: [
      {
        id: 'p1',
        name: 'Bodice',
        quantity: 3,
        edges: ['ab', 'bc', 'cd', 'da'],
        allowances: [
          { edge: 'ab', width: 10 },
          { edge: 'bc', width: 5, kind: 'double' },
          { edge: 'cd', width: 4, kind: 'single' },
        ],
      },
    ],
  };
}

const squarePiece = (document: PatternDocument): Piece => document.pieces[0]!;

describe('pieceAllowanceRows / pieceSummary', () => {
  it('reports one row per loop edge with its kind, width and cut distance', () => {
    const rows = pieceAllowanceRows(squarePiece(squareDocument()));

    expect(rows).toEqual([
      { edge: 'ab', kind: 'seam', width: 10, cutDistance: 10 },
      { edge: 'bc', kind: 'double', width: 5, cutDistance: 10 },
      { edge: 'cd', kind: 'single', width: 4, cutDistance: 4 },
      { edge: 'da', kind: 'none', width: 0, cutDistance: 0 },
    ]);
  });

  it('summarises a named piece with its quantity, edges and metrics', () => {
    const document = squareDocument();
    const summary = pieceSummary(document, squarePiece(document));

    expect(summary).toMatchObject({
      id: 'p1',
      name: 'Bodice',
      quantity: 3,
      edges: ['ab', 'bc', 'cd', 'da'],
    });
    expect(summary.metrics).not.toBeNull();
    expect(summary.metrics?.finished.width).toBeCloseTo(100);
    expect(summary.edges).not.toBe(squarePiece(document).edges);
  });

  it('falls back to an unnamed, single-quantity piece', () => {
    const document = squareDocument();
    document.pieces = [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }];
    const summary = pieceSummary(document, document.pieces[0]!);

    expect(summary.name).toBeNull();
    expect(summary.quantity).toBe(1);
  });

  it('finds the piece that owns an edge and returns null for an unowned one', () => {
    const document = squareDocument();

    expect(pieceOwningEdge(document, 'bc')?.id).toBe('p1');
    expect(pieceOwningEdge(document, 'ad')).toBeNull();
  });
});

describe('pieceCreationFromSelection', () => {
  it('orders a shuffled closed selection into loop order', () => {
    const document = bareSquareDocument();

    expect(pieceCreationFromSelection(document, ['cd', 'ab', 'bc', 'da'])).toEqual({
      ok: true,
      edges: ['cd', 'da', 'ab', 'bc'],
    });
  });

  it('walks a loop whose edges are selected end-to-start', () => {
    const document = bareSquareDocument();

    expect(pieceCreationFromSelection(document, ['ab', 'bc', 'cd', 'ad'])).toEqual({
      ok: true,
      edges: ['ab', 'bc', 'cd', 'ad'],
    });
  });

  it('rejects fewer than three edges', () => {
    expect(pieceCreationFromSelection(bareSquareDocument(), ['ab', 'bc'])).toEqual({
      ok: false,
      message: 'Select at least three cut edges to create a piece.',
    });
  });

  it('rejects a duplicate selection', () => {
    expect(pieceCreationFromSelection(bareSquareDocument(), ['ab', 'ab', 'bc'])).toEqual({
      ok: false,
      message: 'An edge is selected more than once.',
    });
  });

  it('rejects a first edge that is not a cut line, curve or arc', () => {
    expect(pieceCreationFromSelection(bareSquareDocument(), ['a', 'ab', 'bc'])).toEqual({
      ok: false,
      message: 'Edge a is not a cut line, curve or arc.',
    });
  });

  it('reports the edge at which the chain stops connecting', () => {
    const document = bareSquareDocument();

    expect(pieceCreationFromSelection(document, ['ab', 'cd', 'da'])).toEqual({
      ok: false,
      message: 'Edge ab does not connect to another selected edge.',
    });
  });

  it('reports an open chain that does not return to its first edge', () => {
    expect(pieceCreationFromSelection(bareSquareDocument(), ['ab', 'bc', 'cd'])).toEqual({
      ok: false,
      message: 'Edge cd does not connect to edge ab.',
    });
  });

  it('skips unusable edges while looking for the next connection', () => {
    const document = bareSquareDocument();
    document.entities.push(line('bad', 'a', 'missing'));

    expect(pieceCreationFromSelection(document, ['ab', 'bad', 'bc', 'cd', 'da'])).toEqual({
      ok: false,
      message: 'Edge da does not connect to another selected edge.',
    });
  });

  it('passes a closed chain that fails piece validation through with its reason', () => {
    const document = bareSquareDocument();
    document.entities = document.entities.map((entity) =>
      entity.kind === 'line' && entity.id === 'bc' ? { ...entity, construction: true } : entity,
    );

    expect(pieceCreationFromSelection(document, ['ab', 'bc', 'cd', 'da'])).toEqual({
      ok: false,
      message: 'Edge bc is construction geometry.',
    });
  });

  it('accepts curves and arcs as loop edges', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 100, 0),
        point('c', 100, 100),
        line('ab', 'a', 'b'),
        curve('bc', 'b', 'b', 'c', 'c'),
        arc('ca', 'c', 'b', 'a'),
      ],
    };

    expect(pieceCreationFromSelection(document, ['ca', 'ab', 'bc'])).toEqual({
      ok: true,
      edges: ['ca', 'ab', 'bc'],
    });
  });

  it('rejects a first edge that is a point, a circle or has a missing endpoint', () => {
    const document = bareSquareDocument();
    document.entities.push(circle('circle', 'a', 'b'), line('bad', 'a', 'missing'));

    expect(pieceCreationFromSelection(document, ['a', 'ab', 'bc'])).toEqual({
      ok: false,
      message: 'Edge a is not a cut line, curve or arc.',
    });
    expect(pieceCreationFromSelection(document, ['circle', 'ab', 'bc'])).toEqual({
      ok: false,
      message: 'Edge circle is not a cut line, curve or arc.',
    });
    expect(pieceCreationFromSelection(document, ['bad', 'ab', 'bc'])).toEqual({
      ok: false,
      message: 'Edge bad is not a cut line, curve or arc.',
    });
    expect(pieceCreationFromSelection(document, ['ghost', 'ab', 'bc'])).toEqual({
      ok: false,
      message: 'Edge ghost is not a cut line, curve or arc.',
    });
  });
});

describe('anchorForPoint', () => {
  it('resolves the cut anchor at either end of an edge', () => {
    const document = squareDocument();
    const piece = squarePiece(document);

    expect(anchorForPoint(document, piece, 'a')).toEqual({ edge: 'ab', at: 'start' });
    expect(anchorForPoint(document, piece, 'b')).toEqual({ edge: 'ab', at: 'end' });
    expect(anchorForPoint(document, piece, 'd')).toEqual({ edge: 'cd', at: 'end' });
  });

  it('returns null for a point that is not a loop vertex', () => {
    const document = squareDocument();

    expect(anchorForPoint(document, squarePiece(document), 'missing')).toBeNull();
  });

  it('skips missing, point and circle edges and reads curve and arc endpoints', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 100, 0),
        point('c', 100, 100),
        line('ab', 'a', 'b'),
        curve('curve', 'b', 'b', 'c', 'c'),
        arc('arc', 'c', 'b', 'a'),
        circle('circle', 'a', 'b'),
      ],
    };
    const piece: Piece = {
      id: 'mixed',
      edges: ['missing', 'a', 'circle', 'curve', 'arc'],
      allowances: [],
    };

    expect(anchorForPoint(document, piece, 'b')).toEqual({ edge: 'curve', at: 'start' });
    expect(anchorForPoint(document, piece, 'c')).toEqual({ edge: 'curve', at: 'end' });
    expect(anchorForPoint(document, piece, 'a')).toEqual({ edge: 'arc', at: 'end' });
  });
});

describe('cutDimensionForPoints', () => {
  it('returns the piece and both anchors when two loop vertices belong to it', () => {
    const document = squareDocument();
    const result = cutDimensionForPoints(document, 'a', 'c');

    expect(result).toEqual({
      piece: squarePiece(document),
      a: { edge: 'ab', at: 'start' },
      b: { edge: 'bc', at: 'end' },
    });
  });

  it('returns null when the points are not both on one piece', () => {
    const document = squareDocument();

    expect(cutDimensionForPoints(document, 'a', 'missing')).toBeNull();
  });

  it('skips a piece that resolves only one end', () => {
    const document = squareDocument();
    document.pieces.unshift({ id: 'partial', edges: ['ad'], allowances: [] });

    expect(cutDimensionForPoints(document, 'a', 'c')?.piece.id).toBe('p1');
  });
});

describe('pieceSummaries / pieceLabel', () => {
  it('summarises every piece in document order', () => {
    const document = squareDocument();
    document.pieces.push({ id: 'p2', edges: ['ab', 'bc', 'da'], allowances: [] });

    const summaries = pieceSummaries(document);

    expect(summaries.map((summary) => summary.id)).toEqual(['p1', 'p2']);
    expect(summaries[0]!.edges).toEqual(['ab', 'bc', 'cd', 'da']);
    expect(summaries[1]!.name).toBeNull();
  });

  it('returns an empty list for a document without pieces', () => {
    expect(pieceSummaries({ ...squareDocument(), pieces: [] })).toEqual([]);
  });

  it('names a piece by its label or its 1-based position', () => {
    const document = squareDocument();
    document.pieces.push({ id: 'p2', edges: ['ab', 'bc', 'da'], allowances: [] });
    const [first, second] = pieceSummaries(document);

    expect(pieceLabel(first!, 0)).toBe('Bodice');
    expect(pieceLabel(second!, 1)).toBe('Piece 2');
  });
});

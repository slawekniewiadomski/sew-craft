import {
  createEmptyDocument,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type DerivedDistanceConstraint,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  anchorForEdge,
  anchorForPoint,
  canonicalCutAnchors,
  edgeEndpoints,
  edgeLabel,
  findDerivedDimension,
  pieceAllowanceRows,
  pieceCreationFromSelection,
  pieceLabel,
  pieceOwningEdge,
  pieceSizeLine,
  pieceSizeText,
  pieceSummaries,
  pieceSummary,
  piecesAtPoint,
  pieceTitleLine,
  nearestLoopHandle,
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

describe('anchorForEdge', () => {
  it('addresses a whole straight edge of the piece', () => {
    const document = squareDocument();
    const piece = squarePiece(document);

    expect(anchorForEdge(document, piece, 'ab')).toEqual({ edge: 'ab', at: 'edge' });
  });

  it('rejects a curve, an edge outside the piece and a construction line', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 100, 0),
        point('c', 100, 100),
        line('ab', 'a', 'b'),
        line('constr', 'b', 'c', true),
        curve('curve', 'a', 'b', 'c', 'a'),
      ],
    };
    const piece: Piece = { id: 'p', edges: ['ab', 'constr', 'curve'], allowances: [] };

    expect(anchorForEdge(document, piece, 'curve')).toBeNull();
    expect(anchorForEdge(document, piece, 'constr')).toBeNull();
    expect(anchorForEdge(document, piece, 'missing')).toBeNull();
  });
});

describe('canonicalCutAnchors', () => {
  it('orders two edges by piece edge order', () => {
    const piece = squarePiece(squareDocument());
    const bc = { edge: 'bc', at: 'edge' } as const;
    const da = { edge: 'da', at: 'edge' } as const;

    expect(canonicalCutAnchors(piece, bc, da)).toEqual([bc, da]);
    expect(canonicalCutAnchors(piece, da, bc)).toEqual([bc, da]);
  });

  it('normalizes a vertex and an edge to vertex-first', () => {
    const piece = squarePiece(squareDocument());
    const vertex = { edge: 'ab', at: 'start' } as const;
    const edge = { edge: 'cd', at: 'edge' } as const;

    expect(canonicalCutAnchors(piece, vertex, edge)).toEqual([vertex, edge]);
    expect(canonicalCutAnchors(piece, edge, vertex)).toEqual([vertex, edge]);
  });

  it('keeps two vertices in pick order', () => {
    const piece = squarePiece(squareDocument());
    const a = { edge: 'ab', at: 'start' } as const;
    const b = { edge: 'bc', at: 'end' } as const;

    expect(canonicalCutAnchors(piece, a, b)).toEqual([a, b]);
  });
});

describe('piecesAtPoint', () => {
  it('returns every piece that has the point on its loop, in document order', () => {
    const document = squareDocument();
    document.pieces.push({ id: 'p2', edges: ['ab', 'da'], allowances: [] });

    expect(piecesAtPoint(document, 'a').map((piece) => piece.id)).toEqual(['p1', 'p2']);
    expect(piecesAtPoint(document, 'c').map((piece) => piece.id)).toEqual(['p1']);
  });

  it('returns no piece for a point outside every loop', () => {
    expect(piecesAtPoint(squareDocument(), 'missing')).toEqual([]);
  });
});

describe('edgeEndpoints', () => {
  it('returns the two point ids a line, curve or arc joins', () => {
    const document: PatternDocument = {
      ...bareSquareDocument(),
      entities: [
        ...bareSquareDocument().entities,
        curve('curve', 'a', 'b', 'c', 'd'),
        arc('arc', 'a', 'b', 'c'),
      ],
    };

    expect(edgeEndpoints(document, 'ab')).toEqual(['a', 'b']);
    expect(edgeEndpoints(document, 'curve')).toEqual(['a', 'd']);
    expect(edgeEndpoints(document, 'arc')).toEqual(['a', 'c']);
  });

  it('returns null for a point, a circle and a missing edge', () => {
    const document: PatternDocument = {
      ...bareSquareDocument(),
      entities: [...bareSquareDocument().entities, circle('circle', 'a', 'b')],
    };

    expect(edgeEndpoints(document, 'a')).toBeNull();
    expect(edgeEndpoints(document, 'circle')).toBeNull();
    expect(edgeEndpoints(document, 'missing')).toBeNull();
  });
});

describe('findDerivedDimension', () => {
  const constraint: DerivedDistanceConstraint = {
    id: 'cut',
    type: 'derived_distance',
    piece: 'p1',
    a: { edge: 'ab', at: 'start' },
    b: { edge: 'bc', at: 'end' },
  };

  it('finds a span in either direction', () => {
    const document: PatternDocument = { ...squareDocument(), constraints: [constraint] };
    const a = { edge: 'ab', at: 'start' } as const;
    const b = { edge: 'bc', at: 'end' } as const;

    expect(findDerivedDimension(document, 'p1', a, b)).toBe(constraint);
    expect(findDerivedDimension(document, 'p1', b, a)).toBe(constraint);
  });

  it('finds an edge-anchored span in either direction', () => {
    const edgeConstraint: DerivedDistanceConstraint = {
      id: 'edge-cut',
      type: 'derived_distance',
      piece: 'p1',
      a: { edge: 'ab', at: 'edge' },
      b: { edge: 'cd', at: 'edge' },
    };
    const document: PatternDocument = { ...squareDocument(), constraints: [edgeConstraint] };

    expect(
      findDerivedDimension(document, 'p1', { edge: 'cd', at: 'edge' }, { edge: 'ab', at: 'edge' }),
    ).toBe(edgeConstraint);
    // An edge and its own vertex are a different measurement, not the same pair.
    expect(
      findDerivedDimension(document, 'p1', { edge: 'ab', at: 'edge' }, { edge: 'ab', at: 'start' }),
    ).toBeUndefined();
  });

  it('ignores another piece and a different anchor pair', () => {
    const document: PatternDocument = { ...squareDocument(), constraints: [constraint] };

    expect(
      findDerivedDimension(document, 'p2', { edge: 'ab', at: 'start' }, { edge: 'bc', at: 'end' }),
    ).toBeUndefined();
    expect(
      findDerivedDimension(
        document,
        'p1',
        { edge: 'ab', at: 'start' },
        { edge: 'cd', at: 'start' },
      ),
    ).toBeUndefined();
  });

  it('keeps a stitch and a cut anchor on one vertex apart', () => {
    const stitchConstraint: DerivedDistanceConstraint = {
      ...constraint,
      a: { edge: 'ab', at: 'start', loop: 'stitch' },
      b: { edge: 'bc', at: 'end', loop: 'stitch' },
    };
    const document: PatternDocument = { ...squareDocument(), constraints: [stitchConstraint] };

    expect(findDerivedDimension(document, 'p1', stitchConstraint.a, stitchConstraint.b)).toBe(
      stitchConstraint,
    );
    expect(
      findDerivedDimension(document, 'p1', { edge: 'ab', at: 'start' }, { edge: 'bc', at: 'end' }),
    ).toBeUndefined();
  });
});

describe('nearestLoopHandle', () => {
  const candidates = [
    { key: 'first', point: { x: 0, y: 0 } },
    { key: 'second', point: { x: 10, y: 0 } },
  ];

  it('returns the nearest candidate within the radius', () => {
    expect(nearestLoopHandle(candidates, { x: 2, y: 0 }, 8)?.key).toBe('first');
    expect(nearestLoopHandle(candidates, { x: 8, y: 0 }, 8)?.key).toBe('second');
  });

  it('keeps the first candidate on an exact distance tie', () => {
    expect(nearestLoopHandle(candidates, { x: 5, y: 0 }, 8)?.key).toBe('first');
  });

  it('includes a candidate exactly on the radius and excludes one outside it', () => {
    expect(nearestLoopHandle(candidates, { x: 0, y: 8 }, 8)?.key).toBe('first');
    expect(nearestLoopHandle(candidates, { x: 0, y: 8.01 }, 8)).toBeNull();
  });

  it('returns null when nothing is close enough', () => {
    expect(nearestLoopHandle(candidates, { x: 100, y: 100 }, 8)).toBeNull();
    expect(nearestLoopHandle([], { x: 0, y: 0 }, 8)).toBeNull();
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

describe('drawer row helpers', () => {
  it('uses the piece label as the title line', () => {
    const document = squareDocument();
    document.pieces.push({ id: 'p2', edges: ['ab', 'bc', 'da'], allowances: [] });
    const [first, second] = pieceSummaries(document);

    expect(pieceTitleLine(first!, 0)).toBe('Bodice');
    expect(pieceTitleLine(second!, 1)).toBe('Piece 2');
  });

  it('formats one size and falls back to an em dash', () => {
    expect(pieceSizeText({ width: 220, height: 210 })).toBe('220 × 210 mm');
    expect(pieceSizeText(null)).toBe('—');
    expect(pieceSizeText(undefined)).toBe('—');
  });

  it('joins the finished and cut sizes into the secondary line', () => {
    expect(
      pieceSizeLine({
        finished: { width: 220, height: 210 },
        cut: { width: 240, height: 230 },
        cutArea: 1000,
        allowanceArea: 100,
        quantity: 2,
      }),
    ).toBe('220 × 210 mm finished · 240 × 230 mm cut');
    expect(pieceSizeLine(null)).toBe('— finished · — cut');
  });

  it('labels an edge with its endpoints and falls back to its id', () => {
    const document = squareDocument();

    expect(edgeLabel(document, 'ab')).toBe('a → b');
    expect(edgeLabel(document, 'missing')).toBe('missing');
    expect(edgeLabel(document, 'k1')).toBe('k1');
  });
});

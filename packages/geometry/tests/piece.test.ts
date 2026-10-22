import { describe, expect, it } from 'vitest';

import {
  allowanceForEdge,
  allowanceDistance,
  basicPieceForLoops,
  createEmptyDocument,
  loopBounds,
  pieceById,
  pieceCutBounds,
  pieceCutLoop,
  pieceCutVertex,
  pieceEdges,
  pieceFoldLines,
  pieceForEdge,
  pieceLoop,
  pieceMetrics,
  signedArea,
  validatePiece,
  type ArcEntity,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const p = (x: number, y: number) => ({ x, y });

const point = (id: string, x: number, y: number, construction = false): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction,
  fixed: false,
});

const line = (id: string, start: string, end: string, construction = false): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction,
});

const curve = (
  id: string,
  points: [string, string, string, string],
  construction = false,
): CurveEntity => ({
  id,
  kind: 'curve',
  p0: points[0],
  p1: points[1],
  p2: points[2],
  p3: points[3],
  construction,
});

const arc = (id: string, start: string, end: string, through: string): ArcEntity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
  construction: false,
});

const documentOf = (
  entities: Entity[],
  pieces: Piece[] = [],
): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  pieces,
});

/** A 200 x 200 square, counter-clockwise, with allowances on the right, top and left. */
function referenceDocument(): { document: PatternDocument; piece: Piece } {
  const entities: Entity[] = [
    point('a', 0, 0),
    point('b', 200, 0),
    point('c', 200, 200),
    point('d', 0, 200),
    line('bottom', 'a', 'b'),
    line('right', 'b', 'c'),
    line('top', 'c', 'd'),
    line('left', 'd', 'a'),
  ];
  const piece: Piece = {
    id: 'piece-1',
    name: 'Panel',
    edges: ['bottom', 'right', 'top', 'left'],
    allowances: [
      { edge: 'right', width: 10, kind: 'single' },
      { edge: 'top', width: 10, kind: 'single' },
      { edge: 'left', width: 10, kind: 'single' },
    ],
    quantity: 2,
  };
  return { document: documentOf(entities, [piece]), piece };
}

const size = (bounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null) => ({
  width: (bounds!.max.x - bounds!.min.x),
  height: (bounds!.max.y - bounds!.min.y),
});

describe('allowance helpers', () => {
  it('doubles the finished width for a double fold and keeps it otherwise', () => {
    expect(allowanceDistance({ edge: 'e', width: 10 })).toBe(10);
    expect(allowanceDistance({ edge: 'e', width: 10, kind: 'seam' })).toBe(10);
    expect(allowanceDistance({ edge: 'e', width: 10, kind: 'single' })).toBe(10);
    expect(allowanceDistance({ edge: 'e', width: 10, kind: 'double' })).toBe(20);
  });

  it('finds the allowance for one edge', () => {
    const { piece } = referenceDocument();
    expect(allowanceForEdge(piece, 'top')?.width).toBe(10);
    expect(allowanceForEdge(piece, 'bottom')).toBeUndefined();
  });

  it('finds the piece that owns an edge, and can ignore one', () => {
    const { document, piece } = referenceDocument();
    expect(pieceForEdge(document, 'top')).toBe(piece);
    expect(pieceForEdge(document, 'top', piece.id)).toBeUndefined();
    expect(pieceForEdge(document, 'missing')).toBeUndefined();
  });

  it('finds a piece by id', () => {
    const { document, piece } = referenceDocument();
    expect(pieceById(document, piece.id)).toBe(piece);
    expect(pieceById(document, 'missing')).toBeUndefined();
  });
});

describe('pieceEdges', () => {
  it('resolves the loop edges in stored order', () => {
    const { document, piece } = referenceDocument();
    expect(pieceEdges(document, piece).map((edge) => edge.id)).toEqual([
      'bottom',
      'right',
      'top',
      'left',
    ]);
  });

  it('skips points, circles, construction edges and missing ids', () => {
    const document = documentOf([
      point('a', 0, 0),
      point('b', 1, 0),
      line('cut', 'a', 'b'),
      line('guide', 'a', 'b', true),
      { id: 'circle', kind: 'circle', center: 'a', rim: 'b', construction: false },
    ]);
    const piece: Piece = {
      id: 'p',
      edges: ['cut', 'a', 'guide', 'circle', 'missing'],
      allowances: [],
    };
    expect(pieceEdges(document, piece).map((edge) => edge.id)).toEqual(['cut']);
  });
});

describe('validatePiece', () => {
  const { document: withPiece } = referenceDocument();
  const document = documentOf(withPiece.entities);

  it('accepts one closed loop of cut edges in either direction', () => {
    expect(validatePiece(document, ['bottom', 'right', 'top', 'left'])).toEqual({ ok: true });
    expect(validatePiece(document, ['left', 'top', 'right', 'bottom'])).toEqual({ ok: true });
  });

  it('rejects fewer than three edges', () => {
    expect(validatePiece(document, ['bottom', 'right'])).toMatchObject({
      ok: false,
      message: 'A piece needs at least three edges.',
    });
  });

  it('rejects a duplicate edge', () => {
    expect(validatePiece(document, ['bottom', 'right', 'top', 'left', 'right'])).toMatchObject({
      ok: false,
      edge: 'right',
      message: 'Edge right is selected more than once.',
    });
  });

  it('rejects a missing edge', () => {
    expect(validatePiece(document, ['bottom', 'right', 'top', 'missing'])).toMatchObject({
      ok: false,
      edge: 'missing',
    });
  });

  it('rejects a point, a circle, construction geometry and an edge in another piece', () => {
    const other: Entity[] = [
      ...document.entities,
      point('guide-a', 300, 0),
      point('guide-b', 300, 100),
      line('guide', 'guide-a', 'guide-b', true),
      { id: 'circle', kind: 'circle', center: 'a', rim: 'b', construction: false },
    ];
    const withPiece = documentOf(other, [
      { id: 'other', edges: ['bottom', 'right', 'top', 'left'], allowances: [] },
    ]);

    expect(validatePiece(withPiece, ['a', 'right', 'top'])).toMatchObject({
      ok: false,
      edge: 'a',
      message: 'Edge a is a point, not a cut edge.',
    });
    expect(validatePiece(withPiece, ['circle', 'right', 'top'])).toMatchObject({
      ok: false,
      edge: 'circle',
    });
    expect(validatePiece(withPiece, ['guide', 'right', 'top'])).toMatchObject({
      ok: false,
      edge: 'guide',
    });
    expect(validatePiece(withPiece, ['bottom', 'right', 'top'])).toMatchObject({
      ok: false,
      edge: 'bottom',
      message: 'Edge bottom already belongs to another piece.',
    });
    expect(
      validatePiece(withPiece, ['bottom', 'right', 'top'], { ignorePiece: 'other' }),
    ).toMatchObject({ ok: false, edge: 'bottom' });
  });

  it('rejects a loop whose edges do not meet in order', () => {
    expect(validatePiece(document, ['bottom', 'top', 'right', 'left'])).toMatchObject({
      ok: false,
      message: 'Edge bottom does not connect to edge top.',
    });
  });

  it('rejects an edge whose geometry cannot resolve', () => {
    const broken = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 0, 10),
      point('through', 0, 5),
      line('first', 'a', 'b'),
      { id: 'arc', kind: 'arc', start: 'a', end: 'c', through: 'through', construction: false },
      line('third', 'c', 'a'),
    ]);
    // A collinear through point makes the arc degenerate.
    expect(validatePiece(broken, ['first', 'arc', 'third'])).toMatchObject({
      ok: false,
      edge: 'arc',
      message: 'Edge arc has no usable geometry.',
    });
  });

  it('rejects an edge that references a missing point', () => {
    const dangling = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 0, 10),
      line('first', 'a', 'b'),
      line('second', 'b', 'missing'),
      line('third', 'c', 'a'),
    ]);
    expect(validatePiece(dangling, ['first', 'second', 'third'])).toMatchObject({
      ok: false,
      edge: 'second',
      message: 'Edge second references a missing point.',
    });
  });
});

describe('pieceLoop and cut loop', () => {
  it('rejects a piece whose edges no longer form a loop', () => {
    const { document, piece } = referenceDocument();
    const broken: Piece = { ...piece, edges: ['bottom', 'right'] };
    expect(pieceLoop(document, broken)).toBeNull();
    expect(pieceCutLoop(document, broken)).toBeNull();
    expect(pieceFoldLines(document, broken)).toEqual([]);
    expect(pieceCutBounds(document, broken)).toBeNull();
    expect(pieceMetrics(document, broken)).toBeNull();
    expect(pieceCutVertex(document, broken, { edge: 'bottom', at: 'start' })).toBeNull();
  });

  it('reverses an edge stored against the walk', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 200, 0),
      point('c', 200, 200),
      point('d', 0, 200),
      line('bottom', 'a', 'b'),
      line('right', 'c', 'b'),
      line('top', 'c', 'd'),
      line('left', 'd', 'a'),
    ];
    const piece: Piece = { id: 'p', edges: ['bottom', 'right', 'top', 'left'], allowances: [] };
    const loop = pieceLoop(documentOf(entities), piece)!;

    expect(loop.points).toHaveLength(4);
    // A reversed edge traverses its natural start at the far end of its span.
    expect(loop.naturalStart[1]).toBe(2);
  });

  it('reverses the first edge when it alone runs against the walk', () => {
    const { document } = referenceDocument();
    const piece: Piece = {
      id: 'p',
      edges: ['left', 'top', 'right', 'bottom'],
      allowances: [],
    };
    const loop = pieceLoop(document, piece)!;

    expect(loop.points).toHaveLength(4);
    expect(signedArea(loop.points)).toBeLessThan(0);
  });

  it('rejects a walk that cannot reach the first edge again', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 10, 10),
      point('d', 0, 10),
      point('e', 20, 10),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('de', 'd', 'e'),
    ];
    const piece: Piece = { id: 'p', edges: ['ab', 'bc', 'cd', 'de'], allowances: [] };
    expect(pieceLoop(documentOf(entities), piece)).toBeNull();
  });

  it('rejects a walk with an edge that does not connect', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 10, 10),
      point('d', 0, 10),
      point('e', 20, 20),
      point('f', 30, 20),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('ca', 'c', 'a'),
      line('ef', 'e', 'f'),
    ];
    const piece: Piece = { id: 'p', edges: ['ab', 'bc', 'ca', 'ef'], allowances: [] };
    expect(pieceLoop(documentOf(entities), piece)).toBeNull();
  });
});

describe('reference rectangle', () => {
  it('cuts a 200 x 200 piece with three 10 mm allowances as 220 x 210', () => {
    const { document, piece } = referenceDocument();
    const cut = pieceCutLoop(document, piece);

    expect(cut).not.toBeNull();
    expect(cut!.selfIntersections).toEqual([]);
    expect(size(loopBounds(cut!.points))).toEqual({ width: 220, height: 210 });
    // The shared edge keeps the stitch line exactly.
    expect(Math.min(...cut!.points.map((point) => point.x))).toBe(-10);
    expect(Math.max(...cut!.points.map((point) => point.x))).toBe(210);
    expect(Math.min(...cut!.points.map((point) => point.y))).toBe(0);
    expect(Math.max(...cut!.points.map((point) => point.y))).toBe(210);
  });

  it('reports finished, cut, area and quantity metrics', () => {
    const { document, piece } = referenceDocument();
    const metrics = pieceMetrics(document, piece);

    expect(metrics).toEqual({
      finished: { width: 200, height: 200 },
      cut: { width: 220, height: 210 },
      cutArea: 46200,
      allowanceArea: 6200,
      quantity: 2,
    });
  });

  it('defaults the quantity to one and measures cut bounds', () => {
    const { document, piece } = referenceDocument();
    const withoutQuantity: Piece = { ...piece };
    delete withoutQuantity.quantity;

    expect(pieceMetrics(document, withoutQuantity)?.quantity).toBe(1);
    expect(size(pieceCutBounds(document, withoutQuantity))).toEqual({ width: 220, height: 210 });
  });

  it('doubles the cut distance for a double fold and puts the fold line on the single outline', () => {
    const { document, piece } = referenceDocument();
    const doubled: Piece = {
      ...piece,
      allowances: piece.allowances.map((allowance) => ({ ...allowance, kind: 'double' as const })),
    };

    expect(size(pieceCutBounds(document, doubled))).toEqual({ width: 240, height: 220 });

    const folds = pieceFoldLines(document, doubled);
    expect(folds).toHaveLength(1);
    expect(size(loopBounds(folds[0]!))).toEqual({ width: 220, height: 210 });

    // The fold line is exactly the single-fold cut outline.
    const single = pieceCutLoop(document, piece);
    const foldBounds = loopBounds(folds[0]!)!;
    expect(foldBounds.min).toEqual(loopBounds(single!.points)!.min);
    expect(foldBounds.max).toEqual(loopBounds(single!.points)!.max);
  });

  it('derives a fold line for a clockwise loop too', () => {
    const { document, piece } = referenceDocument();
    const clockwise: Piece = {
      ...piece,
      edges: [...piece.edges].reverse(),
      allowances: piece.allowances.map((allowance) => ({ ...allowance, kind: 'double' as const })),
    };
    const folds = pieceFoldLines(document, clockwise);

    expect(folds).toHaveLength(1);
    expect(size(loopBounds(folds[0]!))).toEqual({ width: 220, height: 210 });
  });

  it('rejects a piece whose arc collapses', () => {
    const document = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 0, 10),
      point('through', 0, 5),
      line('first', 'a', 'b'),
      { id: 'arc', kind: 'arc', start: 'a', end: 'c', through: 'through', construction: false },
      line('third', 'c', 'a'),
    ]);
    const piece: Piece = { id: 'p', edges: ['first', 'arc', 'third'], allowances: [] };

    expect(pieceLoop(document, piece)).toBeNull();
    expect(pieceCutLoop(document, piece)).toBeNull();
  });

  it('adds no fold line when no edge is a double fold', () => {
    const { document, piece } = referenceDocument();
    expect(pieceFoldLines(document, piece)).toEqual([]);
  });

  it('joins a zero-allowance edge on its original line', () => {
    const { document, piece } = referenceDocument();
    const cut = pieceCutLoop(document, piece)!;

    // The shared bottom edge stays on y = 0, so no cut point drops below it.
    expect(cut.points.every((point) => point.y >= 0)).toBe(true);
    expect(cut.points.filter((point) => point.y === 0)).toHaveLength(2);
  });

  it('produces one corner-joined loop with no gap at shared vertices', () => {
    const { document, piece } = referenceDocument();
    const cut = pieceCutLoop(document, piece)!;

    // Four miter corners, so four points, and the loop is implicitly closed.
    expect(cut.points).toHaveLength(4);
    expect(cut.vertices).toHaveLength(4);
  });

  it('anchors a cut vertex to the natural start and end of an edge', () => {
    const { document, piece } = referenceDocument();
    const start = pieceCutVertex(document, piece, { edge: 'bottom', at: 'start' });
    const end = pieceCutVertex(document, piece, { edge: 'bottom', at: 'end' });

    expect(start).toEqual(p(-10, 0));
    expect(end).toEqual(p(210, 0));
    expect(pieceCutVertex(document, piece, { edge: 'missing', at: 'start' })).toBeNull();
  });

  it('returns no cut vertex for a piece that cannot resolve', () => {
    const document = documentOf([]);
    const piece: Piece = {
      id: 'p',
      edges: ['a', 'b', 'c'],
      allowances: [],
    };
    expect(pieceCutVertex(document, piece, { edge: 'a', at: 'start' })).toBeNull();
  });
});

describe('mixed widths and error cases', () => {
  const entities: Entity[] = [
    point('a', 0, 0),
    point('b', 100, 0),
    point('c', 100, 100),
    point('d', 0, 100),
    line('bottom', 'a', 'b'),
    line('right', 'b', 'c'),
    line('top', 'c', 'd'),
    line('left', 'd', 'a'),
  ];

  it('intersects adjacent offsets of different widths without averaging', () => {
    const piece: Piece = {
      id: 'p',
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [
        { edge: 'right', width: 20 },
        { edge: 'top', width: 5 },
      ],
    };
    // Right edge moves to x = 120, top to y = 105; the miter corner is their
    // intersection, not a point halfway between the two distances.
    const cut = pieceCutLoop(documentOf(entities), piece)!;
    expect(size(loopBounds(cut.points))).toEqual({ width: 120, height: 105 });
  });

  it('bevels a corner whose miter exceeds the limit but still produces a loop', () => {
    // A very acute triangle tip: the miter at the tip is far longer than 4x the offset.
    const spike: Entity[] = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 0, 1),
      line('first', 'a', 'b'),
      line('second', 'b', 'c'),
      line('third', 'c', 'a'),
    ];
    const piece: Piece = {
      id: 'p',
      edges: ['first', 'second', 'third'],
      allowances: [
        { edge: 'first', width: 10 },
        { edge: 'second', width: 10 },
        { edge: 'third', width: 10 },
      ],
    };
    const cut = pieceCutLoop(documentOf(spike), piece);
    expect(cut).not.toBeNull();
    expect(cut!.points.length).toBeGreaterThan(3);
  });

  it('flags a self-intersecting cut loop rather than straightening it', () => {
    // A U slot narrower than twice the allowance: the two inner walls cross.
    const concave: Entity[] = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 60, 100),
      point('e', 60, 20),
      point('f', 40, 20),
      point('g', 40, 100),
      point('h', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('de', 'd', 'e'),
      line('ef', 'e', 'f'),
      line('fg', 'f', 'g'),
      line('gh', 'g', 'h'),
      line('ha', 'h', 'a'),
    ];
    const edges = ['ab', 'bc', 'cd', 'de', 'ef', 'fg', 'gh', 'ha'];
    const piece: Piece = {
      id: 'p',
      edges,
      allowances: edges.map((edge) => ({ edge, width: 15 })),
    };
    const cut = pieceCutLoop(documentOf(concave), piece);
    expect(cut).not.toBeNull();
    expect(cut!.selfIntersections.length).toBeGreaterThan(0);
  });
});

describe('curves and arcs as loop edges', () => {
  it('flattens curve edges and keeps the loop closed', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      point('c1', 30, -30),
      point('c2', 70, -30),
      curve('bottom', ['a', 'c1', 'c2', 'b']),
      line('right', 'b', 'c'),
      line('top', 'c', 'd'),
      line('left', 'd', 'a'),
    ];
    const piece: Piece = {
      id: 'p',
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [
        { edge: 'bottom', width: 5 },
        { edge: 'right', width: 5 },
        { edge: 'top', width: 5 },
        { edge: 'left', width: 5 },
      ],
    };
    const document = documentOf(entities, [piece]);
    const cut = pieceCutLoop(document, piece);

    expect(validatePiece(documentOf(entities), piece.edges)).toEqual({ ok: true });
    expect(cut).not.toBeNull();
    expect(cut!.points.length).toBeGreaterThan(4);
    expect(pieceMetrics(document, piece)).not.toBeNull();
  });

  it('flattens arc edges and keeps the loop closed', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      point('through', 50, -20),
      arc('bottom', 'a', 'b', 'through'),
      line('right', 'b', 'c'),
      line('top', 'c', 'd'),
      line('left', 'd', 'a'),
    ];
    const piece: Piece = {
      id: 'p',
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [{ edge: 'bottom', width: 5 }],
    };
    const document = documentOf(entities, [piece]);
    const cut = pieceCutLoop(document, piece);

    expect(validatePiece(documentOf(entities), piece.edges)).toEqual({ ok: true });
    expect(cut).not.toBeNull();
    expect(cut!.points.length).toBeGreaterThan(4);
    expect(pieceCutBounds(document, piece)).not.toBeNull();
  });
});

describe('loopBounds', () => {
  it('returns null for an empty loop', () => {
    expect(loopBounds([])).toBeNull();
  });
});

describe('basicPieceForLoops', () => {
  it('discovers one loop of non-construction cut edges', () => {
    const { document } = referenceDocument();
    expect(basicPieceForLoops(document)).toEqual([
      ['bottom', 'right', 'top', 'left'],
    ]);
  });

  it('walks a loop whose edges are stored in mixed directions', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 10, 10),
      point('d', 0, 10),
      line('bottom', 'a', 'b'),
      line('right', 'b', 'c'),
      line('top', 'c', 'd'),
      line('left', 'a', 'd'),
    ];

    expect(basicPieceForLoops(documentOf(entities))).toEqual([
      ['bottom', 'right', 'top', 'left'],
    ]);
  });

  it('accepts an explicit candidate set', () => {
    const { document } = referenceDocument();
    expect(basicPieceForLoops(document, ['bottom', 'right', 'top'])).toEqual([]);
  });

  it('ignores a branch where a vertex joins more than two edges', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 10, 10),
      point('d', 5, -5),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('ca', 'c', 'a'),
      line('bd', 'b', 'd'),
    ];
    expect(basicPieceForLoops(documentOf(entities))).toEqual([]);
  });

  it('ignores an open chain and a component of fewer than three edges', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      point('c', 20, 0),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
    ];
    expect(basicPieceForLoops(documentOf(entities))).toEqual([]);
  });

  it('skips explicit candidates that are not cut edges', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      line('ab', 'a', 'b'),
      line('guide', 'a', 'b', true),
      { id: 'circle', kind: 'circle', center: 'a', rim: 'b', construction: false },
    ];
    const document = documentOf(entities);

    expect(basicPieceForLoops(document, ['a', 'guide', 'circle', 'missing', 'ab'])).toEqual([]);
  });

  it('skips entities with a missing endpoint point', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 10, 0),
      line('ab', 'a', 'b'),
      line('dangling', 'a', 'missing'),
    ];
    expect(basicPieceForLoops(documentOf(entities))).toEqual([]);
  });
});

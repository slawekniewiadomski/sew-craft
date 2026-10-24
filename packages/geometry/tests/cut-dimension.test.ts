import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  cutAnchorIssue,
  derivedDimensionGeometry,
  derivedDimensionState,
  derivedDimensionValue,
  measureCutDimension,
  pieceById,
  pieceCutEdge,
  pieceCutVertex,
  resolveCutAnchor,
  resolveCutSpan,
  resolveCutSpanForAnchors,
  usesCutEdgeAnchor,
  type CurveEntity,
  type DerivedDistanceConstraint,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: false,
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

const documentOf = (entities: Entity[], pieces: Piece[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  pieces,
});

/** A 200 x 200 square with a 10 mm allowance on the right, top and left edges. */
function referenceDocument(): { document: PatternDocument; piece: Piece } {
  const piece: Piece = {
    id: 'p',
    edges: ['bottom', 'right', 'top', 'left'],
    allowances: [
      { edge: 'right', width: 10 },
      { edge: 'top', width: 10 },
      { edge: 'left', width: 10 },
    ],
  };
  const document = documentOf(
    [
      point('a', 0, 0),
      point('b', 200, 0),
      point('c', 200, 200),
      point('d', 0, 200),
      line('bottom', 'a', 'b'),
      line('right', 'b', 'c'),
      line('top', 'c', 'd'),
      line('left', 'd', 'a'),
    ],
    [piece],
  );
  return { document, piece };
}

/** A thin triangle whose corners are sharp enough for every join to bevel. */
function bevelDocument(): { document: PatternDocument; piece: Piece } {
  const piece: Piece = {
    id: 'p',
    edges: ['ab', 'bc', 'ca'],
    allowances: [
      { edge: 'ab', width: 10 },
      { edge: 'bc', width: 10 },
      { edge: 'ca', width: 10 },
    ],
  };
  const document = documentOf(
    [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 50, 3),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('ca', 'c', 'a'),
    ],
    [piece],
  );
  return { document, piece };
}

/** Two collinear bottom edges; `bcWidth` gives them equal or unequal offsets. */
function collinearDocument(bcWidth: number): { document: PatternDocument; piece: Piece } {
  const piece: Piece = {
    id: 'p',
    edges: ['ab', 'bc', 'cd', 'de', 'ea'],
    allowances: [
      { edge: 'ab', width: 10 },
      { edge: 'bc', width: bcWidth },
      { edge: 'cd', width: 10 },
      { edge: 'de', width: 10 },
      { edge: 'ea', width: 10 },
    ],
  };
  const document = documentOf(
    [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 200, 0),
      point('d', 200, 100),
      point('e', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('de', 'd', 'e'),
      line('ea', 'e', 'a'),
    ],
    [piece],
  );
  return { document, piece };
}

/** A trapezoid with no allowances, so the cut loop is the stitch loop. */
function trapezoidDocument(): { document: PatternDocument; piece: Piece } {
  const piece: Piece = {
    id: 'p',
    edges: ['bottom', 'right', 'top', 'left'],
    allowances: [],
  };
  const document = documentOf(
    [
      point('a', 0, 0),
      point('b', 200, 0),
      point('c', 150, 100),
      point('d', 50, 100),
      line('bottom', 'a', 'b'),
      line('right', 'b', 'c'),
      line('top', 'c', 'd'),
      line('left', 'd', 'a'),
    ],
    [piece],
  );
  return { document, piece };
}

const derived = (
  a: DerivedDistanceConstraint['a'],
  b: DerivedDistanceConstraint['b'],
  extra: Partial<DerivedDistanceConstraint> = {},
): DerivedDistanceConstraint => ({
  id: 'dim',
  type: 'derived_distance',
  piece: 'p',
  a,
  b,
  ...extra,
});

describe('pieceCutEdge', () => {
  it('resolves each edge’s own cut segment on a miter square', () => {
    const { document, piece } = referenceDocument();

    expect(pieceCutEdge(document, piece, 'bottom')).toEqual({
      a: { x: -10, y: 0 },
      b: { x: 210, y: 0 },
    });
    expect(pieceCutEdge(document, piece, 'right')).toEqual({
      a: { x: 210, y: 0 },
      b: { x: 210, y: 210 },
    });
    expect(pieceCutEdge(document, piece, 'top')).toEqual({
      a: { x: 210, y: 210 },
      b: { x: -10, y: 210 },
    });
    expect(pieceCutEdge(document, piece, 'left')).toEqual({
      a: { x: -10, y: 210 },
      b: { x: -10, y: 0 },
    });
  });

  it('uses the edge’s own outgoing and incoming points at a bevel join', () => {
    const { document, piece } = bevelDocument();
    const segment = pieceCutEdge(document, piece, 'ab')!;
    // `ab` runs along y = 0, so its own offset line is y = -10 at both ends.
    expect(segment.a.y).toBeCloseTo(-10, 9);
    expect(segment.b.y).toBeCloseTo(-10, 9);
    // The vertex resolver at the same natural start returns the previous edge's
    // bevel point, which must not tilt the measured edge.
    const vertexStart = pieceCutVertex(document, piece, { edge: 'ab', at: 'start' })!;
    expect(vertexStart.y).not.toBeCloseTo(-10, 3);
  });

  it('keeps a collinear 180° split on each edge’s own offset line', () => {
    const { document, piece } = collinearDocument(0);
    const segment = pieceCutEdge(document, piece, 'bc')!;

    // `ab` cuts at y = -10 and `bc` at y = 0; the join bevels because the widths
    // differ, so a vertex-based expansion would tilt `bc` up to y = -10.
    expect(segment).toEqual({ a: { x: 100, y: 0 }, b: { x: 210, y: 0 } });
    expect(pieceCutVertex(document, piece, { edge: 'bc', at: 'start' })).toEqual({
      x: 100,
      y: -10,
    });
  });

  it('follows the trimmed source line around a corner round', () => {
    const { document, piece } = referenceDocument();
    const rounded = applyCommand(document, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'right', second: 'top', radius: 20 },
    }).document;
    const roundedPiece = pieceById(rounded, piece.id)!;
    const segment = pieceCutEdge(rounded, roundedPiece, 'right')!;

    expect(segment.a.x).toBeCloseTo(210, 9);
    expect(segment.b.x).toBeCloseTo(210, 9);
    expect(segment.a.y).toBeCloseTo(0, 9);
    expect(segment.b.y).toBeCloseTo(180, 0);
  });

  it('maps a reversed loop edge to its own segment', () => {
    const piece: Piece = {
      id: 'p',
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [
        { edge: 'right', width: 10 },
        { edge: 'top', width: 10 },
        { edge: 'left', width: 10 },
      ],
    };
    const document = documentOf(
      [
        point('a', 0, 0),
        point('b', 200, 0),
        point('c', 200, 200),
        point('d', 0, 200),
        line('bottom', 'a', 'b'),
        line('right', 'c', 'b'),
        line('top', 'c', 'd'),
        line('left', 'd', 'a'),
      ],
      [piece],
    );

    expect(pieceCutEdge(document, piece, 'right')).toEqual({
      a: { x: 210, y: 0 },
      b: { x: 210, y: 210 },
    });
  });

  it('rejects a non-line source, a missing edge and an unresolvable loop', () => {
    const { document, piece } = referenceDocument();
    const curvedPiece: Piece = { id: 'p', edges: ['c1', 'bottom'], allowances: [] };
    const curved = documentOf(
      [...document.entities, curve('c1', 'a', 'b', 'c', 'd')],
      [curvedPiece],
    );

    expect(pieceCutEdge(curved, curvedPiece, 'c1')).toBeNull();
    expect(pieceCutEdge(document, piece, 'missing')).toBeNull();

    const broken: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'top'),
    };
    expect(pieceCutEdge(broken, piece, 'bottom')).toBeNull();
  });

  it('rejects a piece whose cut loop compacted away a vertex entry', () => {
    const piece: Piece = { id: 'p', edges: ['ab', 'zero', 'ba'], allowances: [] };
    const document = documentOf(
      [
        point('a', 0, 0),
        point('b', 100, 0),
        line('ab', 'a', 'b'),
        line('zero', 'b', 'b'),
        line('ba', 'b', 'a'),
      ],
      [piece],
    );

    expect(pieceCutEdge(document, piece, 'ab')).toBeNull();
  });
});

describe('resolveCutAnchor', () => {
  it('resolves a vertex anchor and an edge anchor', () => {
    const { document, piece } = referenceDocument();

    expect(resolveCutAnchor(document, piece, { edge: 'bottom', at: 'start' })).toEqual({
      kind: 'vertex',
      point: { x: -10, y: 0 },
    });
    expect(resolveCutAnchor(document, piece, { edge: 'bottom', at: 'edge' })).toEqual({
      kind: 'edge',
      segment: { a: { x: -10, y: 0 }, b: { x: 210, y: 0 } },
    });
  });

  it('returns null for an edge anchor on a non-straight edge and a broken loop', () => {
    const { document, piece } = referenceDocument();
    const curvedPiece: Piece = { id: 'p', edges: ['c1'], allowances: [] };
    const curved = documentOf([curve('c1', 'a', 'b', 'c', 'd')], [curvedPiece]);

    expect(resolveCutAnchor(curved, curvedPiece, { edge: 'c1', at: 'edge' })).toBeNull();

    const broken: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'top'),
    };
    expect(resolveCutAnchor(broken, piece, { edge: 'bottom', at: 'start' })).toBeNull();
    expect(pieceCutVertex(document, piece, { edge: 'bottom', at: 'edge' })).toBeNull();
  });
});

describe('resolveCutSpan', () => {
  it('keeps the vertex-to-vertex span as stored', () => {
    const { document } = referenceDocument();
    const constraint = derived({ edge: 'bottom', at: 'start' }, { edge: 'bottom', at: 'end' });

    expect(resolveCutSpan(document, constraint)).toEqual({
      a: { x: -10, y: 0 },
      b: { x: 210, y: 0 },
    });
    expect(measureCutDimension(document, constraint)).toBe(220);
  });

  it('measures a corner against an edge in either pick order, vertex-first', () => {
    const { document, piece } = referenceDocument();
    const vertexFirst = derived({ edge: 'bottom', at: 'start' }, { edge: 'right', at: 'edge' });
    const edgeFirst = derived({ edge: 'right', at: 'edge' }, { edge: 'bottom', at: 'start' });

    expect(resolveCutSpan(document, vertexFirst)).toEqual({
      a: { x: -10, y: 0 },
      b: { x: 210, y: 0 },
    });
    expect(resolveCutSpan(document, edgeFirst)).toEqual(resolveCutSpan(document, vertexFirst));
    expect(resolveCutSpanForAnchors(document, piece, edgeFirst.a, edgeFirst.b)).toEqual(
      resolveCutSpan(document, vertexFirst),
    );
    expect(measureCutDimension(document, edgeFirst)).toBe(220);
  });

  it('canonicalizes an edge-to-edge pair by piece edge order', () => {
    const { document } = referenceDocument();
    const bottomTop = derived({ edge: 'bottom', at: 'edge' }, { edge: 'top', at: 'edge' });
    const topBottom = derived({ edge: 'top', at: 'edge' }, { edge: 'bottom', at: 'edge' });

    expect(resolveCutSpan(document, bottomTop)).toEqual({
      a: { x: 100, y: 0 },
      b: { x: 100, y: 210 },
    });
    expect(resolveCutSpan(document, topBottom)).toEqual(resolveCutSpan(document, bottomTop));
    expect(measureCutDimension(document, topBottom)).toBe(210);
  });

  it('accepts a foot outside the drawn cut segment', () => {
    const { document } = trapezoidDocument();
    const constraint = derived({ edge: 'bottom', at: 'start' }, { edge: 'top', at: 'edge' });

    // The corner projects past the end of the short top edge, onto its cut line.
    expect(resolveCutSpan(document, constraint)).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 100 },
    });
  });

  it('still resolves a pair that drifted out of parallel', () => {
    const { document } = trapezoidDocument();
    const constraint = derived({ edge: 'bottom', at: 'edge' }, { edge: 'right', at: 'edge' });
    const span = resolveCutSpan(document, constraint)!;

    expect(span.a.x).toBeCloseTo(100, 9);
    expect(span.a.y).toBeCloseTo(0, 9);
    expect(span.b.x).toBeCloseTo(180, 9);
    expect(span.b.y).toBeCloseTo(40, 9);
  });

  it('returns null for a zero span and reports the dimension broken', () => {
    const { document } = collinearDocument(10);
    const sameLine = derived({ edge: 'ab', at: 'edge' }, { edge: 'bc', at: 'edge' });

    expect(resolveCutSpan(document, sameLine)).toBeNull();
    expect(derivedDimensionState(document, sameLine)).toBe('broken');
    expect(derivedDimensionValue(document, sameLine)).toBeNull();
    expect(derivedDimensionValue(document, { ...sameLine, lastKnownValue: 42 })).toBe(42);
    expect(derivedDimensionGeometry(document, sameLine)).toBeNull();
  });

  it('returns null when a vertex later moves onto the edge’s cut line', () => {
    const { document } = trapezoidDocument();
    const constraint = derived({ edge: 'bottom', at: 'start' }, { edge: 'top', at: 'edge' });
    expect(resolveCutSpan(document, constraint)).not.toBeNull();

    const moved = applyCommand(document, {
      id: 'move',
      type: 'move_point',
      params: { id: 'a', x: 0, y: 100 },
    }).document;

    expect(resolveCutSpan(moved, constraint)).toBeNull();
    expect(derivedDimensionState(moved, constraint)).toBe('broken');
  });

  it('forces aligned for an edge anchor and ignores a stored axis', () => {
    const { document } = referenceDocument();
    const constraint = derived(
      { edge: 'bottom', at: 'edge' },
      { edge: 'top', at: 'edge' },
      { orientation: 'vertical' },
    );

    expect(usesCutEdgeAnchor(constraint)).toBe(true);
    expect(measureCutDimension(document, constraint)).toBe(210);
    const layout = derivedDimensionGeometry(document, constraint)!;
    expect(layout.a).toEqual({ x: 100, y: 0 });
    expect(layout.b).toEqual({ x: 100, y: 210 });
    // An aligned layout puts the dimension line across the gap, not on x = const.
    expect(layout.dimensionStart.x).toBeCloseTo(layout.dimensionEnd.x, 9);
  });

  it('keeps the stored axis for a vertex-to-vertex pair', () => {
    const { document } = referenceDocument();
    const constraint = derived(
      { edge: 'bottom', at: 'start' },
      { edge: 'top', at: 'start' },
      { orientation: 'horizontal' },
    );

    expect(usesCutEdgeAnchor(constraint)).toBe(false);
    expect(measureCutDimension(document, constraint)).toBe(220);
  });
});

describe('cutAnchorIssue', () => {
  it('accepts a vertex-to-vertex and a corner-to-edge pair', () => {
    const { document, piece } = referenceDocument();

    expect(
      cutAnchorIssue(
        document,
        piece,
        { edge: 'bottom', at: 'start' },
        { edge: 'bottom', at: 'end' },
      ),
    ).toEqual({
      reason: null,
      span: { a: { x: -10, y: 0 }, b: { x: 210, y: 0 } },
    });
    expect(
      cutAnchorIssue(
        document,
        piece,
        { edge: 'bottom', at: 'start' },
        { edge: 'right', at: 'edge' },
      ),
    ).toMatchObject({ reason: null });
  });

  it('accepts parallel and anti-parallel edge pairs', () => {
    const { document, piece } = referenceDocument();

    expect(
      cutAnchorIssue(document, piece, { edge: 'bottom', at: 'edge' }, { edge: 'top', at: 'edge' })
        .reason,
    ).toBeNull();
    expect(
      cutAnchorIssue(document, piece, { edge: 'top', at: 'edge' }, { edge: 'bottom', at: 'edge' })
        .reason,
    ).toBeNull();
  });

  it('accepts edges within the 0.5° parallel tolerance', () => {
    const piece: Piece = { id: 'p', edges: ['bottom', 'right', 'top', 'left'], allowances: [] };
    const document = documentOf(
      [
        point('a', 0, 0),
        point('b', 200, 0),
        point('c', 200, 100),
        point('d', 0, 100.2),
        line('bottom', 'a', 'b'),
        line('right', 'b', 'c'),
        line('top', 'c', 'd'),
        line('left', 'd', 'a'),
      ],
      [piece],
    );

    const issue = cutAnchorIssue(
      document,
      piece,
      { edge: 'bottom', at: 'edge' },
      { edge: 'top', at: 'edge' },
    );
    expect(issue.reason).toBeNull();
    expect(issue.span).not.toBeNull();
  });

  it('reports a missing edge and an unresolvable loop as missing', () => {
    const { document, piece } = referenceDocument();

    expect(
      cutAnchorIssue(
        document,
        piece,
        { edge: 'missing', at: 'start' },
        { edge: 'bottom', at: 'end' },
      ).reason,
    ).toBe('missing');

    const broken: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'top'),
    };
    expect(
      cutAnchorIssue(broken, piece, { edge: 'bottom', at: 'start' }, { edge: 'bottom', at: 'end' })
        .reason,
    ).toBe('missing');
  });

  it('reports a curve or arc edge as not straight', () => {
    const piece: Piece = { id: 'p', edges: ['c1', 'bottom'], allowances: [] };
    const { document } = referenceDocument();
    const curved = documentOf([...document.entities, curve('c1', 'a', 'b', 'c', 'd')], [piece]);

    const issue = cutAnchorIssue(
      curved,
      piece,
      { edge: 'c1', at: 'edge' },
      { edge: 'bottom', at: 'start' },
    );
    expect(issue).toEqual({ reason: 'not-straight', span: null });
  });

  it('reports an edge outside the piece as a different piece', () => {
    const { document, piece } = referenceDocument();
    const other = line('other', 'a', 'b');

    expect(
      cutAnchorIssue(
        { ...document, entities: [...document.entities, other] },
        piece,
        { edge: 'bottom', at: 'start' },
        { edge: 'other', at: 'edge' },
      ),
    ).toEqual({ reason: 'different-piece', span: null });
  });

  it('reports the same anchor twice and a vertex on its own edge', () => {
    const { document, piece } = referenceDocument();

    expect(
      cutAnchorIssue(
        document,
        piece,
        { edge: 'bottom', at: 'start' },
        { edge: 'bottom', at: 'start' },
      ),
    ).toEqual({ reason: 'same-anchor', span: null });
    expect(
      cutAnchorIssue(
        document,
        piece,
        { edge: 'bottom', at: 'edge' },
        { edge: 'bottom', at: 'end' },
      ),
    ).toEqual({ reason: 'same-anchor', span: null });
  });

  it('reports non-parallel edges at pick time', () => {
    const { document, piece } = referenceDocument();

    expect(
      cutAnchorIssue(
        document,
        piece,
        { edge: 'bottom', at: 'edge' },
        { edge: 'right', at: 'edge' },
      ),
    ).toEqual({ reason: 'not-parallel', span: null });
  });

  it('reports a zero span', () => {
    const { document, piece } = collinearDocument(0);

    expect(
      cutAnchorIssue(document, piece, { edge: 'bc', at: 'start' }, { edge: 'ab', at: 'edge' }),
    ).toMatchObject({ reason: 'zero-span' });
  });
});

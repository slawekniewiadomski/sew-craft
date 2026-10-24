import { describe, expect, it } from 'vitest';

import {
  allPoints,
  applyCommand,
  createEmptyDocument,
  cutAnchorIssue,
  derivedDimensionValue,
  pieceById,
  pieceCutLoop,
  pieceCutVertex,
  pieceLoopVertex,
  resolvePieceAnchor,
  resolveCutSpan,
  solve,
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

const documentOf = (entities: Entity[], pieces: Piece[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  pieces,
});

/** A 200 x 200 square whose right, top and left edges carry a 10 mm allowance. */
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

/** The reference square with the right/top corner rounded at 20 mm. */
function roundedReference(): { document: PatternDocument; piece: Piece } {
  const { document } = referenceDocument();
  const rounded = applyCommand(document, {
    id: 'r1',
    type: 'add_corner_round',
    params: { first: 'right', second: 'top', radius: 20 },
  }).document;
  return { document: rounded, piece: pieceById(rounded, 'p')! };
}

describe('pieceLoopVertex', () => {
  it('resolves the stitch corner at an edge start and end', () => {
    const { document, piece } = referenceDocument();

    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'start' })).toEqual({
      x: 200,
      y: 0,
    });
    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'end' })).toEqual({
      x: 200,
      y: 200,
    });
  });

  it('stays on the drawn edge where the cut loop is offset', () => {
    const { document, piece } = referenceDocument();

    const stitch = pieceLoopVertex(document, piece, { edge: 'right', at: 'start' })!;
    const cut = pieceCutVertex(document, piece, { edge: 'right', at: 'start' })!;

    expect(stitch).toEqual({ x: 200, y: 0 });
    expect(cut.x).toBeGreaterThan(stitch.x);
  });

  it('keeps a reversed edge anchored at its own natural start', () => {
    // The loop walks b -> c but the line is stored c -> b, so it is reversed.
    const piece: Piece = {
      id: 'p',
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [{ edge: 'right', width: 10 }],
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

    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'start' })).toEqual({
      x: 200,
      y: 200,
    });
    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'end' })).toEqual({
      x: 200,
      y: 0,
    });
  });

  it('follows the trimmed tangent points of a rounded corner bridge', () => {
    const { document, piece } = roundedReference();

    const rightEnd = pieceLoopVertex(document, piece, { edge: 'right', at: 'end' })!;
    expect(rightEnd.x).toBeCloseTo(200, 6);
    expect(rightEnd.y).toBeCloseTo(180, 0);

    const topStart = pieceLoopVertex(document, piece, { edge: 'top', at: 'start' })!;
    expect(topStart.x).toBeCloseTo(180, 0);
    expect(topStart.y).toBeCloseTo(200, 6);
  });

  it('has no stitch vertex for a whole edge', () => {
    const { document, piece } = referenceDocument();

    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'edge' })).toBeNull();
  });

  it('returns null for a missing edge or an unresolvable loop', () => {
    const { document, piece } = referenceDocument();
    const dangling: Piece = { ...piece, edges: ['bottom', 'missing', 'top', 'left'] };

    expect(pieceLoopVertex(document, piece, { edge: 'missing', at: 'start' })).toBeNull();
    expect(pieceLoopVertex(document, dangling, { edge: 'bottom', at: 'start' })).toBeNull();
  });
});

describe('resolvePieceAnchor', () => {
  it('treats an omitted loop as the cut loop', () => {
    const { document, piece } = referenceDocument();

    expect(resolvePieceAnchor(document, piece, { edge: 'right', at: 'start' })).toEqual(
      resolvePieceAnchor(document, piece, { edge: 'right', at: 'start', loop: 'cut' }),
    );
    expect(resolvePieceAnchor(document, piece, { edge: 'right', at: 'start' })).toEqual({
      kind: 'vertex',
      point: pieceCutVertex(document, piece, { edge: 'right', at: 'start' }),
    });
  });

  it('resolves a stitch anchor on the seamline itself', () => {
    const { document, piece } = referenceDocument();

    expect(
      resolvePieceAnchor(document, piece, { edge: 'right', at: 'start', loop: 'stitch' }),
    ).toEqual({ kind: 'vertex', point: { x: 200, y: 0 } });
  });

  it('resolves a whole-edge anchor against the cut loop only', () => {
    const { document, piece } = referenceDocument();

    expect(resolvePieceAnchor(document, piece, { edge: 'right', at: 'edge' })?.kind).toBe('edge');
    expect(
      resolvePieceAnchor(document, piece, { edge: 'right', at: 'edge', loop: 'stitch' }),
    ).toBeNull();
    expect(
      resolvePieceAnchor(document, piece, { edge: 'missing', at: 'edge', loop: 'stitch' }),
    ).toBeNull();
  });

  it('returns null for a stitch anchor that cannot resolve', () => {
    const { document, piece } = referenceDocument();
    const dangling: Piece = { ...piece, edges: ['bottom', 'missing', 'top', 'left'] };

    expect(
      resolvePieceAnchor(document, piece, { edge: 'missing', at: 'start', loop: 'stitch' }),
    ).toBeNull();
    expect(
      resolvePieceAnchor(document, dangling, { edge: 'bottom', at: 'start', loop: 'stitch' }),
    ).toBeNull();
  });

  it('keeps both natural ends of a reversed edge on that edge', () => {
    const piece: Piece = {
      id: 'p',
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [{ edge: 'right', width: 10 }],
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

    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'start' })).toEqual({
      x: 200,
      y: 200,
    });
    expect(pieceLoopVertex(document, piece, { edge: 'right', at: 'end' })).toEqual({
      x: 200,
      y: 0,
    });
    // The cut loop agrees: its offset of the same vertex is directly outward.
    expect(pieceCutVertex(document, piece, { edge: 'right', at: 'end' })!.x).toBeCloseTo(210, 6);
    expect(pieceCutVertex(document, piece, { edge: 'right', at: 'end' })!.y).toBeCloseTo(0, 6);
  });
});

describe('stitch spans and commands', () => {
  const constraint = (
    a: { edge: string; at: 'start' | 'end'; loop?: 'stitch' | 'cut' },
    b: { edge: string; at: 'start' | 'end'; loop?: 'stitch' | 'cut' },
  ) => ({
    id: 'd1',
    type: 'derived_distance' as const,
    piece: 'p',
    a,
    b,
    orientation: 'horizontal' as const,
  });

  it('measures the stitch span where the cut span is offset', () => {
    const { document } = referenceDocument();

    const stitch = constraint(
      { edge: 'bottom', at: 'start', loop: 'stitch' },
      { edge: 'right', at: 'start', loop: 'stitch' },
    );
    const cut = constraint({ edge: 'bottom', at: 'start' }, { edge: 'right', at: 'start' });

    expect(derivedDimensionValue(document, stitch)).toBeCloseTo(200, 6);
    // The cut join at the bottom corner also picks up the left edge's allowance.
    expect(derivedDimensionValue(document, cut)).toBeCloseTo(220, 6);
  });

  it('mixes a stitch anchor with a cut anchor on one piece', () => {
    const { document } = referenceDocument();

    const mixed = constraint(
      { edge: 'bottom', at: 'start', loop: 'stitch' },
      { edge: 'right', at: 'start', loop: 'cut' },
    );

    expect(resolveCutSpan(document, mixed)).not.toBeNull();
    expect(derivedDimensionValue(document, mixed)).toBeCloseTo(210, 6);
  });

  it('treats a stitch and a cut anchor on one vertex as different anchors', () => {
    const { document, piece } = referenceDocument();

    const issue = cutAnchorIssue(
      document,
      piece,
      { edge: 'right', at: 'start', loop: 'stitch' },
      { edge: 'right', at: 'start', loop: 'cut' },
    );

    expect(issue.reason).toBeNull();
    expect(issue.span!.a).toEqual({ x: 200, y: 0 });
    expect(issue.span!.b).toEqual({ x: 210, y: 0 });
  });

  it('rejects the same anchor twice', () => {
    const { document, piece } = referenceDocument();
    const anchor = { edge: 'right', at: 'start' as const, loop: 'stitch' as const };

    expect(cutAnchorIssue(document, piece, anchor, anchor).reason).toBe('same-anchor');
  });

  it('accepts and stores a stitch anchor through the command', () => {
    const { document } = referenceDocument();

    const applied = applyCommand(document, {
      id: 'd1',
      type: 'add_derived_dimension',
      params: {
        piece: 'p',
        a: { edge: 'bottom', at: 'start', loop: 'stitch' },
        b: { edge: 'right', at: 'start', loop: 'stitch' },
        orientation: 'horizontal',
      },
    });

    const stored = applied.document.constraints.at(-1)!;
    expect(stored.type).toBe('derived_distance');
    expect(stored.type === 'derived_distance' && stored.a).toEqual({
      edge: 'bottom',
      at: 'start',
      loop: 'stitch',
    });
  });

  it('rejects a stitch anchor on a whole edge', () => {
    const { document } = referenceDocument();

    expect(() =>
      applyCommand(document, {
        id: 'd1',
        type: 'add_derived_dimension',
        params: {
          piece: 'p',
          a: { edge: 'bottom', at: 'start', loop: 'stitch' },
          b: { edge: 'right', at: 'edge', loop: 'stitch' },
        },
      }),
    ).toThrow("a stitch anchor must be 'start' or 'end', not 'edge'");
  });

  it('rejects an unknown loop value', () => {
    const { document } = referenceDocument();

    expect(() =>
      applyCommand(document, {
        id: 'd1',
        type: 'add_derived_dimension',
        params: {
          piece: 'p',
          a: { edge: 'bottom', at: 'start', loop: 'seam' as 'stitch' },
          b: { edge: 'right', at: 'start' },
        },
      }),
    ).toThrow("anchor loop seam must be 'stitch' or 'cut'");
  });

  it('adds no entity, solver variable or cut edge for a stitch anchor', () => {
    const { document } = referenceDocument();
    const applied = applyCommand(document, {
      id: 'd1',
      type: 'add_derived_dimension',
      params: {
        piece: 'p',
        a: { edge: 'bottom', at: 'start', loop: 'stitch' },
        b: { edge: 'right', at: 'start', loop: 'stitch' },
      },
    });
    const piece = pieceById(applied.document, 'p')!;

    // Nothing is minted or moved: the anchor is storage on the constraint only.
    expect(applied.document.entities).toEqual(document.entities);
    expect(applied.document.pieces).toEqual(document.pieces);
    expect(
      solve(
        allPoints(applied.document),
        applied.document.constraints,
        {},
        applied.document.entities,
      ).coordinates,
    ).toEqual(solve(allPoints(document), document.constraints, {}, document.entities).coordinates);
    expect(pieceCutLoop(applied.document, piece)).toEqual(pieceCutLoop(document, piece));
  });
});

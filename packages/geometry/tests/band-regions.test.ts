import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  bandTargetKey,
  cornerAllowanceForRound,
  cornerAllowanceState,
  createEmptyDocument,
  pieceBandRegions,
  pieceById,
  pieceCutLoop,
  pieceLoop,
  pieceMetrics,
  pointInPolygon,
  signedArea,
  type BandRegion,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type Vec2,
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

/** A 200 × 200 panel with a 10 mm allowance on three edges and none on bottom. */
function squarePiece(allowances: Piece['allowances'] = []): {
  document: PatternDocument;
  piece: Piece;
} {
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
    edges: ['bottom', 'right', 'top', 'left'],
    allowances,
  };
  return { document: { ...createEmptyDocument(), entities, pieces: [piece] }, piece };
}

/** The same panel with the top-right corner rounded by 20 mm. */
function roundedPiece(
  allowances: Piece['allowances'] = [],
  cornerAllowances?: Piece['cornerAllowances'],
): {
  document: PatternDocument;
  piece: Piece;
} {
  const base = squarePiece(allowances);
  const rounded = applyCommand(base.document, {
    id: 'round-1',
    type: 'add_corner_round',
    params: { first: 'right', second: 'top', radius: 20 },
  }).document;
  const piece = {
    ...pieceById(rounded, 'piece-1')!,
    ...(cornerAllowances === undefined ? {} : { cornerAllowances }),
  };
  return { document: { ...rounded, pieces: [piece] }, piece };
}

const tenMillimetres: Piece['allowances'] = [
  { edge: 'right', width: 10, kind: 'single' },
  { edge: 'top', width: 10, kind: 'single' },
  { edge: 'left', width: 10, kind: 'single' },
];

const area = (region: BandRegion): number => Math.abs(signedArea(region.polygon));

const targetKeys = (regions: readonly BandRegion[]): string[] =>
  regions.map((region) => bandTargetKey(region.target));

/** The centre of one boundary segment's band, or `null` where it has none. */
function segmentSample(
  loop: NonNullable<ReturnType<typeof pieceLoop>>,
  cut: NonNullable<ReturnType<typeof pieceCutLoop>>,
  segment: number,
): Vec2 | null {
  if (Math.abs(loop.distances[segment]!) <= 0) return null;
  const total = loop.points.length;
  const next = (segment + 1) % total;
  const a = loop.points[segment]!;
  const b = loop.points[next]!;
  const from = cut.points[cut.vertices[segment]!.start]!;
  const to = cut.points[cut.vertices[next]!.end - 1]!;
  return { x: (a.x + b.x + from.x + to.x) / 4, y: (a.y + b.y + from.y + to.y) / 4 };
}

/** The centre of one loop vertex's band, where the two adjacent joins meet. */
function vertexSample(
  loop: NonNullable<ReturnType<typeof pieceLoop>>,
  cut: NonNullable<ReturnType<typeof pieceCutLoop>>,
  vertex: number,
): Vec2 | null {
  const previous = (vertex + loop.points.length - 1) % loop.points.length;
  if (Math.abs(loop.distances[previous]!) <= 0) return null;
  const join = cut.points[cut.vertices[vertex]!.start]!;
  return { x: (loop.points[vertex]!.x + join.x) / 2, y: (loop.points[vertex]!.y + join.y) / 2 };
}

describe('corner allowance data', () => {
  it('reads the entry for one round and ignores nothing else', () => {
    const piece: Piece = {
      id: 'p',
      edges: [],
      allowances: [],
      cornerAllowances: [
        { round: 'r1', cutWidth: 20 },
        { round: 'r2', cutWidth: 5 },
      ],
    };

    expect(cornerAllowanceForRound(piece, 'r1')).toEqual({ round: 'r1', cutWidth: 20 });
    expect(cornerAllowanceForRound(piece, 'r3')).toBeUndefined();
    expect(cornerAllowanceForRound({ id: 'p', edges: [], allowances: [] }, 'r1')).toBeUndefined();
  });

  it('reports own, inherited, split and none', () => {
    const split: Piece = {
      ...roundedPiece().piece,
      allowances: [
        { edge: 'right', width: 10 },
        { edge: 'top', width: 5 },
      ],
    };
    const own: Piece = { ...split, cornerAllowances: [{ round: 'round-1', cutWidth: 20 }] };
    const inherited: Piece = { ...split, allowances: tenMillimetres };
    const none = roundedPiece().piece;

    expect(cornerAllowanceState(own, 'round-1', ['right', 'top'])).toBe('own');
    expect(cornerAllowanceState(inherited, 'round-1', ['right', 'top'])).toBe('inherited');
    expect(cornerAllowanceState(split, 'round-1', ['right', 'top'])).toBe('split');
    expect(cornerAllowanceState(none, 'round-1', ['right', 'top'])).toBe('none');
  });
});

describe('a corner with its own width', () => {
  it('cuts the whole crescent at that width and steps at both tangents', () => {
    const { document, piece } = roundedPiece(tenMillimetres, [{ round: 'round-1', cutWidth: 20 }]);

    const loop = pieceLoop(document, piece)!;
    const bridge = loop.distances.slice(2, 18).map(Math.abs);
    expect(bridge.every((distance) => distance === 20)).toBe(true);

    const cut = pieceCutLoop(document, piece)!;
    // The tangent vertices cut square: two points where the 10 mm edge becomes
    // the 20 mm crescent.
    expect(cut.vertices[2]!.end - cut.vertices[2]!.start).toBe(2);
    expect(cut.vertices[18]!.end - cut.vertices[18]!.start).toBe(2);
    expect(cut.selfIntersections).toEqual([]);
  });

  it('treats a zero or non-finite value as absent', () => {
    for (const cutWidth of [0, -5, Number.NaN]) {
      const { document, piece } = roundedPiece(tenMillimetres, [{ round: 'round-1', cutWidth }]);
      const loop = pieceLoop(document, piece)!;
      const bridge = loop.distances.slice(2, 18).map(Math.abs);
      expect(bridge.every((distance) => distance === 10)).toBe(true);
      expect(cornerAllowanceState(piece, 'round-1', ['right', 'top'])).toBe('inherited');
    }
  });

  it('adds allowance area without moving the finished size', () => {
    const plain = roundedPiece(tenMillimetres);
    const wide = roundedPiece(tenMillimetres, [{ round: 'round-1', cutWidth: 30 }]);

    const regions = pieceBandRegions(wide.document, wide.piece);
    const corner = regions.find((region) => region.target.kind === 'round')!;
    const plainCorner = pieceBandRegions(plain.document, plain.piece).find(
      (region) => region.target.kind === 'round',
    )!;

    expect(corner).toBeDefined();
    expect(area(corner)).toBeGreaterThan(area(plainCorner));
  });
});

describe('band regions', () => {
  it('gives a plain panel one region per edge and tiles the band', () => {
    const { document, piece } = squarePiece(tenMillimetres);
    const regions = pieceBandRegions(document, piece);
    const loop = pieceLoop(document, piece)!;
    const cut = pieceCutLoop(document, piece)!;

    // The bottom edge carries no allowance, so it has no band and no region.
    expect(targetKeys(regions)).toEqual(['edge:right', 'edge:top', 'edge:left']);
    const band = regions.reduce((sum, region) => sum + area(region), 0);
    expect(band).toBeCloseTo(pieceMetrics(document, piece)!.allowanceArea);
    for (const region of regions) expect(area(region)).toBeGreaterThan(0);

    for (let segment = 0; segment < loop.points.length; segment += 1) {
      const sample = segmentSample(loop, cut, segment);
      if (sample === null) continue;
      const owners = regions.filter((region) => pointInPolygon(region.polygon, sample));
      expect(owners).toHaveLength(1);
    }
    for (let vertex = 0; vertex < loop.points.length; vertex += 1) {
      const sample = vertexSample(loop, cut, vertex);
      if (sample === null) continue;
      const owners = regions.filter((region) => pointInPolygon(region.polygon, sample));
      expect(owners).toHaveLength(1);
    }
  });

  it('gives a rounded panel an edge region per side plus the crescent', () => {
    const { document, piece } = roundedPiece(tenMillimetres);
    const regions = pieceBandRegions(document, piece);
    const loop = pieceLoop(document, piece)!;
    const cut = pieceCutLoop(document, piece)!;

    expect(targetKeys(regions).sort()).toEqual([
      'edge:left',
      'edge:right',
      'edge:top',
      'round:round-1',
    ]);
    const band = regions.reduce((sum, region) => sum + area(region), 0);
    expect(band).toBeCloseTo(pieceMetrics(document, piece)!.allowanceArea);

    for (let segment = 0; segment < loop.points.length; segment += 1) {
      const sample = segmentSample(loop, cut, segment);
      if (sample === null) continue;
      const owners = regions.filter((region) => pointInPolygon(region.polygon, sample));
      expect(owners).toHaveLength(1);
    }
    for (let vertex = 0; vertex < loop.points.length; vertex += 1) {
      const sample = vertexSample(loop, cut, vertex);
      if (sample === null) continue;
      const owners = regions.filter((region) => pointInPolygon(region.polygon, sample));
      expect(owners).toHaveLength(1);
    }
  });

  it('hands each half of a split crescent to the edge on its side', () => {
    const { document, piece } = roundedPiece([
      { edge: 'right', width: 10 },
      { edge: 'top', width: 5 },
      { edge: 'left', width: 10 },
    ]);
    const regions = pieceBandRegions(document, piece);
    const loop = pieceLoop(document, piece)!;
    const cut = pieceCutLoop(document, piece)!;

    expect(targetKeys(regions)).not.toContain('round:round-1');
    expect(targetKeys(regions).sort()).toEqual(['edge:left', 'edge:right', 'edge:top']);
    const band = regions.reduce((sum, region) => sum + area(region), 0);
    expect(band).toBeCloseTo(pieceMetrics(document, piece)!.allowanceArea);

    const firstHalf = segmentSample(loop, cut, 6)!;
    const secondHalf = segmentSample(loop, cut, 14)!;
    expect(regions.find((region) => pointInPolygon(region.polygon, firstHalf))?.target).toEqual({
      kind: 'edge',
      edge: 'right',
    });
    expect(regions.find((region) => pointInPolygon(region.polygon, secondHalf))?.target).toEqual({
      kind: 'edge',
      edge: 'top',
    });
  });

  it('keeps a region whole when it wraps the loop start', () => {
    // The closing corner is rounded, and its split half belongs to the first
    // edge, so that edge's run spans the end and the start of the walk.
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
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [
        { edge: 'bottom', width: 5 },
        { edge: 'right', width: 10 },
        { edge: 'top', width: 10 },
        { edge: 'left', width: 10 },
      ],
    };
    const base: PatternDocument = { ...createEmptyDocument(), entities, pieces: [piece] };
    const rounded = applyCommand(base, {
      id: 'round-1',
      type: 'add_corner_round',
      params: { first: 'left', second: 'bottom', radius: 20 },
    }).document;
    const roundedPieceValue = pieceById(rounded, 'piece-1')!;
    const regions = pieceBandRegions(rounded, roundedPieceValue);
    const loop = pieceLoop(rounded, roundedPieceValue)!;
    const cut = pieceCutLoop(rounded, roundedPieceValue)!;

    expect(targetKeys(regions)).toContain('edge:bottom');
    expect(regions.filter((region) => bandTargetKey(region.target) === 'edge:bottom')).toHaveLength(
      1,
    );
    const band = regions.reduce((sum, region) => sum + area(region), 0);
    expect(band).toBeCloseTo(pieceMetrics(rounded, roundedPieceValue)!.allowanceArea);
    for (let segment = 0; segment < loop.points.length; segment += 1) {
      const sample = segmentSample(loop, cut, segment);
      if (sample === null) continue;
      expect(regions.filter((region) => pointInPolygon(region.polygon, sample))).toHaveLength(1);
    }
  });

  it('offers no regions when the cut loop self-intersects', () => {
    // A U slot narrower than twice the allowance: the inner walls cross.
    const entities: Entity[] = [
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
      id: 'u-slot',
      edges,
      allowances: edges.map((edge) => ({ edge, width: 15 })),
    };
    const document: PatternDocument = { ...createEmptyDocument(), entities, pieces: [piece] };

    expect(pieceCutLoop(document, piece)!.selfIntersections.length).toBeGreaterThan(0);
    expect(pieceBandRegions(document, piece)).toEqual([]);
  });

  it('offers no regions when the cut loop is compacted', () => {
    // A zero-length edge makes two loop points coincide, so the offset loop
    // drops one vertex and no region can be addressed against it.
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 0, 0),
      point('c', 100, 0),
      point('d', 0, 100),
      line('zero', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('da', 'd', 'a'),
    ];
    const edges = ['zero', 'bc', 'cd', 'da'];
    const piece: Piece = {
      id: 'p',
      edges,
      allowances: edges.map((edge) => ({ edge, width: 10 })),
    };
    const document: PatternDocument = { ...createEmptyDocument(), entities, pieces: [piece] };

    const loop = pieceLoop(document, piece)!;
    expect(pieceCutLoop(document, piece)!.vertices.length).toBeLessThan(loop.points.length);
    expect(pieceBandRegions(document, piece)).toEqual([]);
  });

  it('offers no regions when the piece has no loop', () => {
    const empty: Piece = { id: 'p', edges: [], allowances: [] };
    expect(pieceBandRegions({ ...createEmptyDocument(), pieces: [empty] }, empty)).toEqual([]);
  });
});

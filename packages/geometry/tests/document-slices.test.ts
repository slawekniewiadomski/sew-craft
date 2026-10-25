import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  documentForAssembly,
  documentForPiece,
  pieceBounds,
  pieceCutLoop,
  pieceLoop,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type TextEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number, piece?: string): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  ...(piece === undefined ? {} : { piece }),
  fixed: false,
});

const line = (id: string, start: string, end: string, piece?: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  ...(piece === undefined ? {} : { piece }),
});

const square = (suffix = '', piece = 'p1'): Entity[] => [
  point(`${suffix}a`, 0, 0, piece),
  point(`${suffix}b`, 100, 0, piece),
  point(`${suffix}c`, 100, 100, piece),
  point(`${suffix}d`, 0, 100, piece),
  line(`${suffix}bottom`, `${suffix}a`, `${suffix}b`, piece),
  line(`${suffix}right`, `${suffix}b`, `${suffix}c`, piece),
  line(`${suffix}top`, `${suffix}c`, `${suffix}d`, piece),
  line(`${suffix}left`, `${suffix}d`, `${suffix}a`, piece),
];

const piece = (id = 'p1', suffix = ''): Piece => ({
  id,
  edges: [`${suffix}bottom`, `${suffix}right`, `${suffix}top`, `${suffix}left`],
  allowances: [],
});

const documentOf = (pieces: Piece[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...square(), ...square('2', 'p2')],
  pieces,
  assemblies: [
    {
      id: 'a1',
      name: 'A',
      instances: [
        { id: 'i1', piece: 'p1', x: 0, y: 0 },
        { id: 'i2', piece: 'p2', x: 100, y: 0 },
      ],
    },
    { id: 'a2', name: 'B', instances: [{ id: 'i3', piece: 'gone', x: 0, y: 0 }] },
  ],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'piece', id: 'p2' },
    { kind: 'assembly', id: 'a1' },
    { kind: 'assembly', id: 'a2' },
  ],
});

describe('pieceBounds', () => {
  it('uses the stitch loop bounds', () => {
    expect(pieceBounds(documentOf([piece()]), piece())).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 100, y: 100 },
    });
  });

  it('falls back to the owned points when the loop does not resolve', () => {
    const broken: Piece = { id: 'p1', edges: ['bottom', 'right'], allowances: [] };
    const document: PatternDocument = {
      ...documentOf([broken]),
      entities: [point('a', 10, 20, 'p1'), point('b', 40, 60, 'p1'), point('c', 0, 0, 'p2')],
    };

    expect(pieceBounds(document, broken)).toEqual({
      min: { x: 10, y: 20 },
      max: { x: 40, y: 60 },
    });
  });

  it('returns null for an empty piece', () => {
    const empty: Piece = { id: 'p1', edges: [], allowances: [] };
    const document: PatternDocument = { ...documentOf([empty]), entities: [] };

    expect(pieceBounds(document, empty)).toBeNull();
  });
});

describe('documentForPiece', () => {
  it('keeps only the piece entities, constraints and rounds with no tabs', () => {
    const document: PatternDocument = {
      ...documentOf([piece(), piece('p2', '2')]),
      constraints: [
        { id: 'c1', type: 'horizontal', a: 'a', b: 'b', piece: 'p1' },
        { id: 'c2', type: 'horizontal', a: '2a', b: '2b', piece: 'p2' },
      ],
      seams: [
        { id: 's1', edge: 'bottom', width: 5 },
        { id: 's2', edge: '2bottom', width: 5 },
      ],
      cornerRounds: [
        {
          id: 'r1',
          corner: 'a',
          ends: [
            { line: 'bottom', anchor: 'b', tangent: 't1' },
            { line: 'left', anchor: 'd', tangent: 't2' },
          ],
          radius: 5,
          arc: 'arc1',
          controls: ['c1', 'c2'],
          center: 'ctr',
          cornerConstruction: false,
        },
      ],
    };

    const sliced = documentForPiece(document, 'p1');

    expect(sliced.pieces.map((entry) => entry.id)).toEqual(['p1']);
    expect(sliced.entities.every((entity) => entity.piece === 'p1')).toBe(true);
    expect(sliced.constraints.map((constraint) => constraint.id)).toEqual(['c1']);
    expect(sliced.cornerRounds).toHaveLength(1);
    expect(sliced.seams).toEqual([{ id: 's1', edge: 'bottom', width: 5 }]);
    expect(sliced.assemblies).toEqual([]);
    expect(sliced.tabs).toEqual([]);
    expect(sliced.units).toBe('mm');
  });

  it('drops a foreign constraint and a foreign round', () => {
    const document: PatternDocument = {
      ...documentOf([piece(), piece('p2', '2')]),
      constraints: [{ id: 'c2', type: 'horizontal', a: '2a', b: '2b', piece: 'p2' }],
      cornerRounds: [
        {
          id: 'r2',
          corner: '2a',
          ends: [
            { line: '2bottom', anchor: '2b', tangent: 't1' },
            { line: '2left', anchor: '2d', tangent: 't2' },
          ],
          radius: 5,
          arc: 'arc2',
          controls: ['c1', 'c2'],
          cornerConstruction: false,
        },
      ],
    };

    const sliced = documentForPiece(document, 'p1');

    expect(sliced.constraints).toEqual([]);
    expect(sliced.cornerRounds).toEqual([]);
  });

  it('keeps points referenced by a kept edge even without an owner field', () => {
    const loose: Piece = { id: 'p1', edges: ['bottom', 'right', 'top', 'left'], allowances: [] };
    const document: PatternDocument = {
      ...documentOf([loose]),
      entities: [
        point('a', 0, 0),
        point('b', 100, 0),
        point('c', 100, 100),
        point('d', 0, 100),
        point('far', 500, 500),
        line('bottom', 'a', 'b'),
        line('right', 'b', 'c'),
        line('top', 'c', 'd'),
        line('left', 'd', 'a'),
      ],
    };

    const sliced = documentForPiece(document, 'p1');

    expect(sliced.entities.map((entity) => entity.id).sort()).toEqual([
      'a',
      'b',
      'bottom',
      'c',
      'd',
      'left',
      'right',
      'top',
    ]);
  });

  it('keeps owned text, curves and circles and closes over their points', () => {
    const curve: CurveEntity = {
      id: 'bend',
      kind: 'curve',
      p0: 'a',
      p1: 't1',
      p2: 't2',
      p3: 'b',
      piece: 'p1',
    };
    const circle: CircleEntity = {
      id: 'hole',
      kind: 'circle',
      center: 't1',
      rim: 't2',
      piece: 'p1',
    };
    const arc: ArcEntity = {
      id: 'bump',
      kind: 'arc',
      start: 'a',
      through: 't1',
      end: 'b',
      piece: 'p1',
    };
    const text: TextEntity = {
      id: 'label',
      kind: 'text',
      piece: 'p1',
      anchor: 't1',
      content: 'grain',
      leader: 't2',
    };
    const plainText: TextEntity = {
      id: 'plain',
      kind: 'text',
      piece: 'p1',
      anchor: 't1',
      content: 'grain',
    };
    const document: PatternDocument = {
      ...documentOf([piece()]),
      entities: [
        ...square(),
        point('t1', 10, 10, 'p1'),
        point('t2', 20, 20, 'p1'),
        curve,
        circle,
        arc,
        text,
        plainText,
      ],
    };

    const ids = documentForPiece(document, 'p1').entities.map((entity) => entity.id);

    expect(ids).toEqual(expect.arrayContaining(['bump', 'bend', 'hole', 'label', 't1', 't2']));
  });

  it('skips a piece edge whose entity no longer exists while closing over references', () => {
    const ghosted: Piece = {
      id: 'p1',
      edges: ['bottom', 'right', 'top', 'left', 'ghost'],
      allowances: [],
    };
    const sliced = documentForPiece(documentOf([ghosted]), ghosted);

    expect(sliced.entities.map((entity) => entity.id)).not.toContain('ghost');
  });

  it('keeps a constraint without an owner when all its points stay and drops it otherwise', () => {
    const document: PatternDocument = {
      ...documentOf([piece(), piece('p2', '2')]),
      constraints: [
        { id: 'c3', type: 'coincident', a: 'a', b: 'b' },
        { id: 'c4', type: 'coincident', a: 'a', b: '2a' },
      ],
    };

    expect(documentForPiece(document, 'p1').constraints.map((constraint) => constraint.id)).toEqual(
      ['c3'],
    );
  });

  it('returns a valid empty document for an unknown piece', () => {
    const sliced = documentForPiece(documentOf([piece()]), 'missing');

    expect(sliced.pieces).toEqual([]);
    expect(sliced.entities).toEqual([]);
  });

  it('drops a corner round whose entities were all removed', () => {
    const document: PatternDocument = {
      ...documentOf([piece()]),
      cornerRounds: [
        {
          id: 'r2',
          corner: 'gone',
          ends: [
            { line: 'gone1', anchor: 'gone2', tangent: 't1' },
            { line: 'gone3', anchor: 'gone4', tangent: 't2' },
          ],
          radius: 5,
          arc: 'arc2',
          controls: ['c1', 'c2'],
          cornerConstruction: false,
        },
      ],
    };

    expect(documentForPiece(document, 'p1').cornerRounds).toEqual([]);
  });

  it('keeps a corner round by its arc when the corner point was removed', () => {
    const document: PatternDocument = {
      ...documentOf([piece()]),
      cornerRounds: [
        {
          id: 'r1',
          corner: 'gone',
          ends: [
            { line: 'gone1', anchor: 'gone2', tangent: 't1' },
            { line: 'gone3', anchor: 'gone4', tangent: 't2' },
          ],
          radius: 5,
          arc: 'right',
          controls: ['c1', 'c2'],
          cornerConstruction: false,
        },
      ],
    };

    expect(documentForPiece(document, 'p1').cornerRounds).toHaveLength(1);
  });

  it('keeps the derived entities of a round so the piece loops still resolve', () => {
    let document: PatternDocument = {
      ...documentOf([piece()]),
      entities: square(),
    };
    document = applyCommand(document, {
      id: 'loop',
      type: 'set_piece_loop',
      params: { piece: 'p1', edges: ['bottom', 'right', 'top', 'left'], allowance: 'none' },
    }).document;
    document = applyCommand(document, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'bottom', second: 'right', radius: 10 },
    }).document;

    const sliced = documentForPiece(document, 'p1');
    const round = document.cornerRounds![0]!;

    expect(sliced.entities.map((entity) => entity.id)).toEqual(
      expect.arrayContaining([
        round.corner,
        round.arc,
        round.center!,
        ...round.controls,
        ...round.ends.map((end) => end.tangent),
        ...round.ends.map((end) => end.anchor),
      ]),
    );
    expect(pieceLoop(sliced, piece())).not.toBeNull();
    expect(pieceCutLoop(sliced, piece())).not.toBeNull();
  });

  it("leaves another piece's round out of the slice", () => {
    let document: PatternDocument = {
      ...documentOf([piece(), piece('p2', '2')]),
      entities: [...square(), ...square('2', 'p2')],
    };
    for (const [id, suffix] of [
      ['p1', ''],
      ['p2', '2'],
    ] as const) {
      document = applyCommand(document, {
        id: `loop-${id}`,
        type: 'set_piece_loop',
        params: {
          piece: id,
          edges: ['bottom', 'right', 'top', 'left'].map((edge) => `${suffix}${edge}`),
          allowance: 'none',
        },
      }).document;
      document = applyCommand(document, {
        id: `round-${id}`,
        type: 'add_corner_round',
        params: { first: `${suffix}bottom`, second: `${suffix}right`, radius: 10 },
      }).document;
    }

    const sliced = documentForPiece(document, 'p1');

    expect(sliced.cornerRounds?.map((round) => round.id)).toEqual(['round-p1']);
    expect(sliced.entities.some((entity) => entity.id === 'round-p2:arc')).toBe(false);
  });
});

describe('documentForAssembly', () => {
  it('keeps the referenced pieces and the target assembly only', () => {
    const sliced = documentForAssembly(documentOf([piece(), piece('p2', '2')]), 'a1');

    expect(sliced.pieces.map((entry) => entry.id).sort()).toEqual(['p1', 'p2']);
    expect(sliced.assemblies.map((assembly) => assembly.id)).toEqual(['a1']);
    expect(sliced.tabs).toEqual([]);
    expect(sliced.constraints).toEqual([]);
  });

  it('returns an empty piece list for an unknown assembly', () => {
    const sliced = documentForAssembly(documentOf([piece()]), 'missing');

    expect(sliced.pieces).toEqual([]);
    expect(sliced.assemblies).toEqual([]);
  });

  it('ignores an instance whose piece is missing', () => {
    const sliced = documentForAssembly(documentOf([piece()]), 'a2');

    expect(sliced.pieces).toEqual([]);
    expect(sliced.assemblies.map((assembly) => assembly.id)).toEqual(['a2']);
  });
});

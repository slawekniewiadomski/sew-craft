import { describe, expect, it } from 'vitest';

import {
  assemblyBounds,
  assemblyById,
  createEmptyDocument,
  instanceLoops,
  instancePlacement,
  instancesOfPiece,
  pieceAnchor,
  pieceFoldLines,
  placePoint,
  type Assembly,
  type AssemblyInstance,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number, piece = 'p1'): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  piece,
  fixed: false,
});

const line = (id: string, start: string, end: string, piece = 'p1'): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  piece,
});

const square = (): Entity[] => [
  point('a', 0, 0),
  point('b', 100, 0),
  point('c', 100, 100),
  point('d', 0, 100),
  line('bottom', 'a', 'b'),
  line('right', 'b', 'c'),
  line('top', 'c', 'd'),
  line('left', 'd', 'a'),
];

const piece = (overrides: Partial<Piece> = {}): Piece => ({
  id: 'p1',
  edges: ['bottom', 'right', 'top', 'left'],
  allowances: [],
  ...overrides,
});

const instance = (overrides: Partial<AssemblyInstance> = {}): AssemblyInstance => ({
  id: 'i1',
  piece: 'p1',
  x: 0,
  y: 0,
  ...overrides,
});

const documentOf = (pieces: Piece[] = [piece()], extra: Entity[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...square(), ...extra],
  pieces,
});

describe('pieceAnchor', () => {
  it('uses the centre of the stitch loop', () => {
    expect(pieceAnchor(documentOf(), piece())).toEqual({ x: 50, y: 50 });
  });

  it('does not move when an allowance changes', () => {
    const allowed = piece({ allowances: [{ edge: 'right', width: 20, kind: 'double' }] });

    expect(pieceAnchor(documentOf([allowed]), allowed)).toEqual({ x: 50, y: 50 });
  });

  it('falls back to the centre of the owned points when the loop does not resolve', () => {
    const broken: Piece = { id: 'p1', edges: ['bottom', 'right'], allowances: [] };

    expect(pieceAnchor(documentOf([broken]), broken)).toEqual({ x: 50, y: 50 });
  });

  it('returns null for a piece with no points', () => {
    const empty: Piece = { id: 'empty', edges: [], allowances: [] };
    const document = documentOf([empty]);

    expect(pieceAnchor(document, empty)).toBeNull();
  });
});

describe('instancePlacement and placePoint', () => {
  const placed = instance({ x: 200, y: 300, rotation: 0 });

  it('translates the anchor to the instance position', () => {
    const placement = instancePlacement(documentOf(), piece(), placed)!;

    expect(placement).toEqual({
      anchor: { x: 50, y: 50 },
      x: 200,
      y: 300,
      rotation: 0,
      mirrored: false,
    });
    expect(placePoint({ x: 50, y: 50 }, placement)).toEqual({ x: 200, y: 300 });
    expect(placePoint({ x: 60, y: 50 }, placement)).toEqual({ x: 210, y: 300 });
  });

  it('mirrors before rotating, about the anchor vertical axis', () => {
    const mirrored = instancePlacement(
      documentOf(),
      piece(),
      instance({ x: 0, y: 0, rotation: Math.PI / 2, mirrored: true }),
    )!;
    const rotatedOnly = instancePlacement(
      documentOf(),
      piece(),
      instance({ x: 0, y: 0, rotation: Math.PI / 2 }),
    )!;

    // Anchor is (50, 50): the offset (10, -10) flips to (-10, -10) before the
    // quarter turn, so the mirrored point lands at (10, -10) and not (10, 10).
    expect(placePoint({ x: 60, y: 40 }, mirrored)).toEqual({ x: 10, y: -10 });
    expect(placePoint({ x: 60, y: 40 }, rotatedOnly)).toEqual({ x: 10, y: 10 });
  });

  it('treats omitted rotation and mirror as zero and false', () => {
    const placement = instancePlacement(documentOf(), piece(), instance())!;

    expect(placement.rotation).toBe(0);
    expect(placement.mirrored).toBe(false);
  });

  it('returns null when the piece has no anchor', () => {
    const empty: Piece = { id: 'empty', edges: [], allowances: [] };
    const document = documentOf([empty]);

    expect(instancePlacement(document, empty, instance({ piece: 'empty' }))).toBeNull();
    expect(instanceLoops(document, empty, instance({ piece: 'empty' }))).toBeNull();
  });
});

describe('instanceLoops', () => {
  it('returns the cut, stitch and fold loops in assembly coordinates', () => {
    const allowed = piece({
      allowances: [
        { edge: 'right', width: 10, kind: 'double' },
        { edge: 'left', width: 10, kind: 'double' },
      ],
    });
    const loops = instanceLoops(documentOf([allowed]), allowed, instance({ x: 100, y: 100 }))!;

    expect(loops.cut).toHaveLength(4);
    expect(loops.stitch).toHaveLength(4);
    expect(loops.folds).toHaveLength(1);
    // The stitch loop is the square translated so its anchor sits at (100, 100).
    expect(loops.stitch).toEqual([
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 150 },
      { x: 50, y: 150 },
    ]);
    // The cut loop is wider because of the double folds on the left and right.
    expect(Math.min(...loops.cut.map((point) => point.x))).toBe(30);
    // Every derived point moves with the anchor: instance (100, 100) minus the
    // piece anchor (50, 50) is a (50, 50) translation.
    expect(loops.folds[0]).toEqual(
      pieceFoldLines(documentOf([allowed]), allowed)[0]!.map((point) => ({
        x: point.x + 50,
        y: point.y + 50,
      })),
    );
  });

  it('returns empty loops for a piece whose loop cannot resolve', () => {
    const broken: Piece = { id: 'p1', edges: ['bottom', 'right'], allowances: [] };
    const loops = instanceLoops(documentOf([broken]), broken, instance())!;

    expect(loops.cut).toEqual([]);
    expect(loops.stitch).toEqual([]);
    expect(loops.folds).toEqual([]);
  });
});

describe('assemblyBounds', () => {
  const assembly = (instances: AssemblyInstance[]): Assembly => ({
    id: 'a1',
    name: 'Assembly',
    instances,
  });

  it('unions the cut bounds of every instance', () => {
    const bounds = assemblyBounds(
      documentOf(),
      assembly([instance(), instance({ id: 'i2', x: 200 })]),
    )!;

    // The anchor sits at the instance position, so the first square spans
    // -50..50 and the second 150..250.
    expect(bounds.min.x).toBe(-50);
    expect(bounds.max.x).toBe(250);
    expect(bounds.min.y).toBe(-50);
    expect(bounds.max.y).toBe(50);
  });

  it('ignores an instance whose piece is missing or empty', () => {
    const empty: Piece = { id: 'empty', edges: [], allowances: [] };
    const document = documentOf([piece(), empty]);
    const bounds = assemblyBounds(
      document,
      assembly([
        instance(),
        instance({ id: 'i2', piece: 'gone' }),
        instance({ id: 'i3', piece: 'empty' }),
      ]),
    )!;

    expect(bounds).toEqual({ min: { x: -50, y: -50 }, max: { x: 50, y: 50 } });
  });

  it('skips a placed piece whose cut loop is empty after a resolved one', () => {
    const broken: Piece = { id: 'broken', edges: ['bottom', 'right'], allowances: [] };
    const document = documentOf(
      [piece(), broken],
      [point('ba', 0, 0, 'broken'), point('bb', 20, 20, 'broken')],
    );
    const bounds = assemblyBounds(
      document,
      assembly([instance(), instance({ id: 'i2', piece: 'broken', x: 500 })]),
    )!;

    expect(bounds).toEqual({ min: { x: -50, y: -50 }, max: { x: 50, y: 50 } });
  });

  it('returns null for an assembly with nothing to draw', () => {
    expect(assemblyBounds(documentOf(), assembly([]))).toBeNull();
  });
});

describe('assembly lookups', () => {
  const document: PatternDocument = {
    ...documentOf(),
    assemblies: [
      { id: 'a1', name: 'A', instances: [instance()] },
      {
        id: 'a2',
        name: 'B',
        instances: [instance({ id: 'i2' }), instance({ id: 'i3', piece: 'p2' })],
      },
    ],
  };

  it('finds an assembly by id', () => {
    expect(assemblyById(document, 'a1')?.name).toBe('A');
    expect(assemblyById(document, 'missing')).toBeUndefined();
  });

  it('lists every instance of a piece across assemblies', () => {
    expect(
      instancesOfPiece(document, 'p1').map((entry) => [entry.assembly.id, entry.instance.id]),
    ).toEqual([
      ['a1', 'i1'],
      ['a2', 'i2'],
    ]);
    expect(instancesOfPiece(document, 'p2')).toEqual([
      { assembly: document.assemblies[1], instance: document.assemblies[1]!.instances[1]! },
    ]);
  });
});

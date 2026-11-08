import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  drapeAssembly,
  type Assembly,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type SeamMatch,
} from '../src/index.js';

const point = (id: string, x: number, y: number, piece: string): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  piece,
  fixed: false,
});

const line = (id: string, start: string, end: string, piece: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  piece,
});

/** A 60 × 60 face on piece `piece`; `mirrored` makes the loop clockwise. */
function face(piece: string, mirrored = false): { entities: Entity[]; piece: Piece } {
  const x = (value: number): number => (mirrored ? -value : value);
  return {
    entities: [
      point(`${piece}a`, x(0), 0, piece),
      point(`${piece}b`, x(60), 0, piece),
      point(`${piece}c`, x(60), 60, piece),
      point(`${piece}d`, x(0), 60, piece),
      line(`${piece}ab`, `${piece}a`, `${piece}b`, piece),
      line(`${piece}bc`, `${piece}b`, `${piece}c`, piece),
      line(`${piece}cd`, `${piece}c`, `${piece}d`, piece),
      line(`${piece}da`, `${piece}d`, `${piece}a`, piece),
    ],
    piece: {
      id: piece,
      name: 'Front',
      edges: [`${piece}ab`, `${piece}bc`, `${piece}cd`, `${piece}da`],
      allowances: [],
    },
  };
}

/** A strip with four segments on each long side and one segment per end. */
function strip(piece: string, width = 240, height = 40): { entities: Entity[]; piece: Piece } {
  const step = width / 4;
  const points: [string, number, number][] = [
    ['s0', 0, 0],
    ['s1', step, 0],
    ['s2', step * 2, 0],
    ['s3', step * 3, 0],
    ['s4', width, 0],
    ['s5', width, height],
    ['s6', step * 3, height],
    ['s7', step * 2, height],
    ['s8', step, height],
    ['s9', 0, height],
  ];
  const edges: [string, string, string][] = [
    ['t0', 's0', 's1'],
    ['t1', 's1', 's2'],
    ['t2', 's2', 's3'],
    ['t3', 's3', 's4'],
    ['r', 's4', 's5'],
    ['b3', 's5', 's6'],
    ['b2', 's6', 's7'],
    ['b1', 's7', 's8'],
    ['b0', 's8', 's9'],
    ['l', 's9', 's0'],
  ];
  return {
    entities: [
      ...points.map(([id, x, y]) => point(id, x, y, piece)),
      ...edges.map(([id, start, end]) => line(id, start, end, piece)),
    ],
    piece: { id: piece, name: 'Strip', edges: edges.map(([id]) => id), allowances: [] },
  };
}

interface Gusset {
  document: PatternDocument;
  assembly: Assembly;
}

/** A gusseted pouch: two 60 × 60 faces joined by a strip. */
function gusset(
  build: (parts: { front: Entity[]; back: Entity[]; middle: Entity[] }) => {
    document?: PatternDocument;
    assembly: Assembly;
  } = ({ front, back, middle }) => ({
    document: {
      ...createEmptyDocument(),
      entities: [...front, ...back, ...middle],
      pieces: [face('p1').piece, strip('p2').piece],
    },
    assembly: defaultAssembly(),
  }),
): Gusset {
  const front = face('p1');
  const back = face('p1');
  const middle = strip('p2');
  return build({
    front: front.entities,
    back: back.entities,
    middle: middle.entities,
  }) as Gusset;
}

function defaultAssembly(pieces = { front: 'p1', back: 'p1', middle: 'p2' }): Assembly {
  const seams: SeamMatch[] = [
    {
      id: 'f0',
      sides: [
        { instance: 'i1', edges: [`${pieces.front}ab`] },
        { instance: 'i3', edges: ['t0'] },
      ],
    },
    {
      id: 'f1',
      sides: [
        { instance: 'i1', edges: [`${pieces.front}bc`] },
        { instance: 'i3', edges: ['t1'] },
      ],
    },
    {
      id: 'f2',
      sides: [
        { instance: 'i1', edges: [`${pieces.front}cd`] },
        { instance: 'i3', edges: ['t2'] },
      ],
    },
    {
      id: 'f3',
      sides: [
        { instance: 'i1', edges: [`${pieces.front}da`] },
        { instance: 'i3', edges: ['t3'] },
      ],
    },
    {
      id: 'b0',
      sides: [
        { instance: 'i2', edges: [`${pieces.back}ab`] },
        { instance: 'i3', edges: ['b0'] },
      ],
    },
    {
      id: 'b1',
      sides: [
        { instance: 'i2', edges: [`${pieces.back}bc`] },
        { instance: 'i3', edges: ['b1'] },
      ],
    },
    {
      id: 'b2',
      sides: [
        { instance: 'i2', edges: [`${pieces.back}cd`] },
        { instance: 'i3', edges: ['b2'] },
      ],
    },
    {
      id: 'b3',
      sides: [
        { instance: 'i2', edges: [`${pieces.back}da`] },
        { instance: 'i3', edges: ['b3'] },
      ],
    },
    {
      id: 'end',
      sides: [
        { instance: 'i3', edges: ['l'] },
        { instance: 'i3', edges: ['r'] },
      ],
    },
  ];
  return {
    id: 'a1',
    name: 'Gusset',
    instances: [
      { id: 'i1', piece: pieces.front, x: 0, y: 0 },
      { id: 'i2', piece: pieces.back, x: 120, y: 0 },
      { id: 'i3', piece: pieces.middle, x: 0, y: 200 },
    ],
    seams,
  };
}

/** Every triangle normal faces away from the box centre. */
function expectOutward(mesh: {
  positions: { x: number; y: number; z: number }[];
  triangles: { a: number; b: number; c: number }[];
}): void {
  const centre = mesh.positions.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  centre.x /= mesh.positions.length;
  centre.y /= mesh.positions.length;
  for (const triangle of mesh.triangles) {
    const a = mesh.positions[triangle.a]!;
    const b = mesh.positions[triangle.b]!;
    const c = mesh.positions[triangle.c]!;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const normal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    const centroid = {
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
    };
    const outward =
      normal.x * (centroid.x - centre.x) +
      normal.y * (centroid.y - centre.y) +
      normal.z * centroid.z;
    expect(outward).toBeGreaterThan(0);
  }
}

describe('gusset box', () => {
  it('builds a closed box from two faces and a strip', () => {
    const { document, assembly } = gusset();
    const mesh = drapeAssembly(document, assembly, { inflate: 1 })!;

    expect(mesh.positions).toHaveLength(8);
    expect(mesh.triangles).toHaveLength(12);
    expect(mesh.panels.map((panel) => panel.piece)).toEqual(['p1', 'p1', 'p2']);
    expect(mesh.simplified).toBe(false);
    expect(mesh.openBoundaries).toEqual([]);
    expect(Math.min(...mesh.positions.map((point) => point.z))).toBe(-20);
    expect(Math.max(...mesh.positions.map((point) => point.z))).toBe(20);
    expectOutward(mesh);
  });

  it('builds the box for a clockwise face loop', () => {
    const front = face('p1', true);
    const middle = strip('p2');
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [...front.entities, ...middle.entities],
      pieces: [front.piece, middle.piece],
    };
    const mesh = drapeAssembly(document, defaultAssembly(), { inflate: 1 })!;

    expect(mesh.positions).toHaveLength(8);
    expect(Math.max(...mesh.positions.map((point) => point.z))).toBe(20);
    expectOutward(mesh);
  });

  it('scales the depth with Inflate and survives zero', () => {
    const { document, assembly } = gusset();
    const half = drapeAssembly(document, assembly, { inflate: 0.5 })!;
    expect(Math.min(...half.positions.map((point) => point.z))).toBe(-10);
    expect(Math.max(...half.positions.map((point) => point.z))).toBe(10);

    const flat = drapeAssembly(document, assembly, { inflate: 0 })!;
    expect(Math.max(...flat.positions.map((point) => Math.abs(point.z)))).toBe(0);
  });

  it('falls back when a face has fewer than two seams', () => {
    const { document, assembly } = gusset(({ front, back, middle }) => ({
      document: {
        ...createEmptyDocument(),
        entities: [...front, ...back, ...middle],
        pieces: [face('p1').piece, strip('p2').piece],
      },
      assembly: {
        ...defaultAssembly(),
        seams: defaultAssembly().seams!.filter(
          (seam) => !seam.id.startsWith('b') || seam.id === 'b0',
        ),
      },
    }));
    const mesh = drapeAssembly(document, assembly, { inflate: 1 })!;
    expect(mesh.positions).not.toHaveLength(8);
  });

  it('falls back when the faces are not the same piece', () => {
    const front = face('p1');
    const back = face('p3');
    const middle = strip('p2');
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [...front.entities, ...back.entities, ...middle.entities],
      pieces: [front.piece, back.piece, middle.piece],
    };
    const mesh = drapeAssembly(
      document,
      defaultAssembly({ front: 'p1', back: 'p3', middle: 'p2' }),
      {
        inflate: 1,
      },
    )!;
    expect(mesh.positions).not.toHaveLength(8);
  });

  it('falls back when the strip is the same piece as the faces', () => {
    const front = face('p1');
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: front.entities,
      pieces: [front.piece],
    };
    const seam = (id: string, a: string, b: string): SeamMatch => ({
      id,
      sides: [
        { instance: 'i1', edges: [`p1${a}`] },
        { instance: 'i3', edges: [`p1${b}`] },
      ],
    });
    const back = (id: string, a: string, b: string): SeamMatch => ({
      id,
      sides: [
        { instance: 'i2', edges: [`p1${a}`] },
        { instance: 'i3', edges: [`p1${b}`] },
      ],
    });
    const assembly: Assembly = {
      id: 'a1',
      name: 'Gusset',
      instances: [
        { id: 'i1', piece: 'p1', x: 0, y: 0 },
        { id: 'i2', piece: 'p1', x: 120, y: 0 },
        { id: 'i3', piece: 'p1', x: 0, y: 200 },
      ],
      seams: [
        seam('f0', 'ab', 'ab'),
        seam('f1', 'bc', 'bc'),
        seam('f2', 'cd', 'cd'),
        seam('f3', 'da', 'da'),
        back('b0', 'ab', 'ab'),
        back('b1', 'bc', 'bc'),
        back('b2', 'cd', 'cd'),
        back('b3', 'da', 'da'),
      ],
    };
    const mesh = drapeAssembly(document, assembly, { inflate: 1 })!;
    expect(mesh.positions).not.toHaveLength(8);
  });

  it('falls back when the strip is not long and narrow', () => {
    const front = face('p1');
    const middle = strip('p2', 100, 60);
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [...front.entities, ...middle.entities],
      pieces: [front.piece, middle.piece],
    };
    const mesh = drapeAssembly(document, defaultAssembly(), { inflate: 1 })!;
    expect(mesh.positions).not.toHaveLength(8);
  });
});

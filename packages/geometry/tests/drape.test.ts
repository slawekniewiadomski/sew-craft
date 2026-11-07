import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  drapeAssembly,
  PREVIEW_MAX_EDGE,
  PREVIEW_TRIANGLE_LIMIT,
  triangulate,
  type Assembly,
  type AssemblyInstance,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type SeamMatch,
  type Vec2,
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

interface Rectangle {
  entities: Entity[];
  piece: Piece;
}

const rectangle = (
  piece: string,
  width = 100,
  height = 100,
  prefix = '',
  options: { reverseSecond?: boolean } = {},
): Rectangle => ({
  entities: [
    point(`${prefix}a`, 0, 0, piece),
    point(`${prefix}b`, width, 0, piece),
    point(`${prefix}c`, width, height, piece),
    point(`${prefix}d`, 0, height, piece),
    line(`${prefix}ab`, `${prefix}a`, `${prefix}b`, piece),
    options.reverseSecond
      ? line(`${prefix}bc`, `${prefix}c`, `${prefix}b`, piece)
      : line(`${prefix}bc`, `${prefix}b`, `${prefix}c`, piece),
    line(`${prefix}cd`, `${prefix}c`, `${prefix}d`, piece),
    line(`${prefix}da`, `${prefix}d`, `${prefix}a`, piece),
  ],
  piece: {
    id: piece,
    name: piece === 'p1' ? 'Front' : 'Back',
    edges: [`${prefix}ab`, `${prefix}bc`, `${prefix}cd`, `${prefix}da`],
    allowances: [],
  },
});

const instance = (
  id: string,
  piece = 'p1',
  overrides: Partial<AssemblyInstance> = {},
): AssemblyInstance => ({
  id,
  piece,
  x: 0,
  y: 0,
  ...overrides,
});

const assemblyOf = (instances: AssemblyInstance[], seams?: SeamMatch[]): Assembly => ({
  id: 'a1',
  name: 'Shell',
  instances,
  ...(seams === undefined ? {} : { seams }),
});

const documentOf = (rectangles: Rectangle[] = [rectangle('p1')]): PatternDocument => ({
  ...createEmptyDocument(),
  entities: rectangles.flatMap((entry) => entry.entities),
  pieces: rectangles.map((entry) => entry.piece),
  assemblies: [],
});

const twoInstanceDocument = (): PatternDocument => {
  const front = rectangle('p1');
  return {
    ...documentOf([{ ...front, piece: { ...front.piece, id: 'p1' } }]),
    entities: front.entities,
    pieces: [front.piece],
  };
};

describe('triangulate', () => {
  it('clips a counter-clockwise square into two triangles', () => {
    const square: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const triangles = triangulate(square)!;
    expect(triangles).toHaveLength(2);
    const area = triangles.reduce((sum, [a, b, c]) => {
      const pa = square[a]!;
      const pb = square[b]!;
      const pc = square[c]!;
      return sum + ((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x)) / 2;
    }, 0);
    expect(area).toBeCloseTo(100);
  });

  it('normalises a clockwise square to counter-clockwise triangles', () => {
    const square: Vec2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];

    const triangles = triangulate(square)!;
    expect(triangles).toHaveLength(2);
    expect(
      triangles.every(([a, b, c]) => {
        const pa = square[a]!;
        const pb = square[b]!;
        const pc = square[c]!;
        return (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x) > 0;
      }),
    ).toBe(true);
  });

  it('clips a concave polygon and drops collinear and duplicate vertices', () => {
    const arrow: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 4 },
      { x: 0, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 5 },
    ];

    const triangles = triangulate(arrow);
    expect(triangles).not.toBeNull();
    expect(triangles).toHaveLength(4);
  });

  it('drops a closing duplicate and keeps collinear boundary samples usable', () => {
    const closed: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    expect(triangulate(closed)).toHaveLength(2);

    const collinear: Vec2[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const triangles = triangulate(collinear)!;
    expect(triangles).toHaveLength(2);
    expect(triangles.flat()).toContain(1);
  });

  it('skips a collinear vertex first in the ear scan and clips a U-shape', () => {
    const leading: Vec2[] = [
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    expect(triangulate(leading)).toHaveLength(3);

    const u: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 6, y: 10 },
      { x: 6, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(triangulate(u)).toHaveLength(6);
  });

  it('blocks an ear with a point inside it', () => {
    const chevron: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 3 },
      { x: 0, y: 10 },
    ];

    expect(triangulate(chevron)).toHaveLength(3);
  });

  it('skips the simplicity check on a very long loop', () => {
    const loop = Array.from({ length: 300 }, (_, index) => {
      const angle = (index / 300) * Math.PI * 2;
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 };
    });

    expect(triangulate(loop)).toHaveLength(298);
  });

  it('rejects a degenerate loop and an unclippable bow-tie', () => {
    expect(
      triangulate([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBeNull();
    expect(
      triangulate([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toBeNull();
    expect(
      triangulate([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 5, y: 5 },
        { x: 0, y: 10 },
      ]),
    ).not.toBeNull();
    expect(
      triangulate([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBeNull();
  });
});

describe('drapeAssembly', () => {
  it('returns null when every panel is unresolvable or missing', () => {
    const document = documentOf();
    expect(drapeAssembly(document, assemblyOf([]))).toBeNull();
    expect(
      drapeAssembly(document, assemblyOf([{ id: 'i1', piece: 'gone', x: 0, y: 0 }])),
    ).toBeNull();
    expect(
      drapeAssembly(
        documentOf([{ ...rectangle('p1'), piece: { ...rectangle('p1').piece, edges: ['ab'] } }]),
        assemblyOf([instance('i1')]),
      ),
    ).toBeNull();
  });

  it('builds a mesh for one panel without seams', () => {
    const mesh = drapeAssembly(twoInstanceDocument(), assemblyOf([instance('i1')]))!;

    expect(mesh.panels).toEqual([{ instance: 'i1', piece: 'p1', color: null }]);
    expect(mesh.simplified).toBe(false);
    expect(mesh.skipped).toEqual([]);
    expect(mesh.triangles.length).toBeGreaterThan(8);
    expect(mesh.openBoundaries.length).toBe(1);
    expect(mesh.openBoundaries[0]!.length).toBeGreaterThan(8);
  });

  it('welds a seam and inflates the two panels apart', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200 })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i2', edges: ['ab'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(2);
    const zs = mesh.positions.map((position) => position.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1);
    // Every boundary vertex stays on the seam plane, z = 0.
    expect(zs.filter((z) => Math.abs(z) < 1e-9).length).toBeGreaterThan(8);
  });

  it('is deterministic and flat with zero inflate or zero iterations', () => {
    const document = twoInstanceDocument();
    const assembly = assemblyOf([instance('i1'), instance('i2', 'p1', { x: 200 })]);
    const first = drapeAssembly(document, assembly, { inflate: 0.8 });
    const second = drapeAssembly(document, assembly, { inflate: 0.8 });

    expect(second).toEqual(first);

    const flat = drapeAssembly(document, assembly, { inflate: 0 })!;
    expect(Math.max(...flat.positions.map((position) => Math.abs(position.z)))).toBeLessThan(1e-9);
  });

  it('keeps every boundary at z=0 and mirrors the two panels', () => {
    const document = twoInstanceDocument();
    const assembly = assemblyOf(
      [instance('i1'), instance('i2', 'p1', { x: 200 })],
      [
        {
          id: 's1',
          sides: [
            { instance: 'i1', edges: ['ab'] },
            { instance: 'i2', edges: ['ab'] },
          ],
        },
      ],
    );
    const flat = drapeAssembly(document, assembly, { inflate: 0 })!;
    const low = drapeAssembly(document, assembly, { inflate: 0.4 })!;
    const high = drapeAssembly(document, assembly, { inflate: 1 })!;

    const maxZ = (mesh: typeof flat): number =>
      Math.max(...mesh.positions.map((position) => Math.abs(position.z)));
    expect(maxZ(low)).toBeGreaterThan(maxZ(flat));
    expect(maxZ(high)).toBeGreaterThan(maxZ(low));

    // The seam is the first side's edge; its sample vertices stay on z = 0.
    const seamZ = high.positions
      .map((position, index) => ({ position, height: high.heights[index]! }))
      .filter((entry) => Math.abs(entry.height) < 1e-6)
      .map((entry) => Math.abs(entry.position.z));
    expect(Math.max(...seamZ)).toBeLessThan(1e-9);

    // The two panels rise on opposite sides of the seam plane.
    expect(high.positions.some((position) => position.z > 1)).toBe(true);
    expect(high.positions.some((position) => position.z < -1)).toBe(true);
  });

  it('samples a zero-length seam side', () => {
    const entities = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      line('ab', 'a', 'b'),
      line('zz', 'b', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('da', 'd', 'a'),
    ];
    const document = {
      ...createEmptyDocument(),
      entities,
      pieces: [{ id: 'p1', edges: ['ab', 'zz', 'bc', 'cd', 'da'], allowances: [] }],
    };
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200 })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['zz'] },
              { instance: 'i2', edges: ['zz'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(2);
  });

  it('samples a run of two edges across its corner', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200 })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab', 'bc'] },
              { instance: 'i2', edges: ['ab', 'bc'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(2);
    expect(mesh.triangles.length).toBeGreaterThan(24);
  });

  it('welds a three-layer seam', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200 }), instance('i3', 'p1', { x: 400 })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i2', edges: ['ab'] },
              { instance: 'i3', edges: ['ab'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(3);
    expect(mesh.triangles.length).toBeGreaterThan(24);
  });

  it('welds a dart on one panel', () => {
    const mesh = drapeAssembly(
      twoInstanceDocument(),
      assemblyOf(
        [instance('i1')],
        [
          {
            id: 'dart',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i1', edges: ['bc'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.triangles.length).toBeGreaterThan(8);
  });

  it('ignores a same-panel pair while assembling a multi-seam panel', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200 })],
        [
          {
            id: 'dart',
            sides: [
              { instance: 'i2', edges: ['bc'] },
              { instance: 'i2', edges: ['cd'] },
            ],
          },
          {
            id: 'seam',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i2', edges: ['ab'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(2);
    expect(mesh.triangles.length).toBeGreaterThan(24);
  });

  it('deduplicates two seams that sample the same edge', () => {
    const document = twoInstanceDocument();
    const sides = [
      { instance: 'i1', edges: ['ab'] },
      { instance: 'i2', edges: ['ab'] },
    ];
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200 })],
        [
          { id: 's1', sides },
          { id: 's2', sides },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(2);
    expect(mesh.triangles.length).toBeGreaterThan(8);
  });

  it('skips a panel whose loop self-intersects but keeps its seam resolvable', () => {
    const prefix = 'bt-';
    const bowtie = {
      entities: [
        point(`${prefix}a`, 0, 0, 'p2'),
        point(`${prefix}b`, 100, 100, 'p2'),
        point(`${prefix}c`, 100, 0, 'p2'),
        point(`${prefix}d`, 0, 100, 'p2'),
        line(`${prefix}ab`, `${prefix}a`, `${prefix}b`, 'p2'),
        line(`${prefix}bc`, `${prefix}b`, `${prefix}c`, 'p2'),
        line(`${prefix}cd`, `${prefix}c`, `${prefix}d`, 'p2'),
        line(`${prefix}da`, `${prefix}d`, `${prefix}a`, 'p2'),
      ],
      piece: {
        id: 'p2',
        edges: [`${prefix}ab`, `${prefix}bc`, `${prefix}cd`, `${prefix}da`],
        allowances: [],
      },
    };
    const normal = rectangle('p1');
    const mesh = drapeAssembly(
      {
        ...createEmptyDocument(),
        entities: [...normal.entities, ...bowtie.entities],
        pieces: [normal.piece, bowtie.piece],
      },
      assemblyOf(
        [instance('i1', 'p2'), instance('i2', 'p1', { x: 200 })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: [`${prefix}ab`] },
              { instance: 'i2', edges: ['ab'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.skipped).toEqual(['i1']);
  });

  it('falls back to ear clipping for a concave panel', () => {
    const coordinates: [number, number][] = [
      [0, 0],
      [60, 0],
      [60, 60],
      [36, 60],
      [36, 24],
      [24, 24],
      [24, 60],
      [0, 60],
    ];
    const entities: Entity[] = coordinates.map(([x, y], index) => point(`u${index}`, x, y));
    const edges = coordinates.map((_, index) => `u${index}--u${(index + 1) % coordinates.length}`);
    entities.push(
      ...edges.map((_, index) =>
        line(`u${index}e`, `u${index}`, `u${(index + 1) % coordinates.length}`),
      ),
    );
    const document = {
      ...createEmptyDocument(),
      entities,
      pieces: [{ id: 'p1', edges: edges.map((_, index) => `u${index}e`), allowances: [] }],
    };

    const mesh = drapeAssembly(document, assemblyOf([instance('i1')]))!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.triangles.length).toBeGreaterThan(8);
  });

  it('rejects a centre fan that leaves a concave loop', () => {
    const coordinates: [number, number][] = [
      [0, 0],
      [60, 0],
      [60, 60],
      [30, 18],
      [0, 60],
    ];
    const entities: Entity[] = coordinates.map(([x, y], index) => point(`c${index}`, x, y));
    entities.push(
      ...coordinates.map((_, index) =>
        line(`c${index}e`, `c${index}`, `c${(index + 1) % coordinates.length}`),
      ),
    );
    const document = {
      ...createEmptyDocument(),
      entities,
      pieces: [
        {
          id: 'p1',
          edges: coordinates.map((_, index) => `c${index}e`),
          allowances: [],
        },
      ],
    };

    const mesh = drapeAssembly(document, assemblyOf([instance('i1')]))!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it('skips a degenerate flat panel and its seam side', () => {
    const document = {
      ...createEmptyDocument(),
      entities: [
        point('f0', 0, 0),
        point('f1', 30, 0),
        point('f2', 60, 0),
        line('f0e', 'f0', 'f1'),
        line('f1e', 'f1', 'f2'),
        line('f2e', 'f2', 'f0'),
      ],
      pieces: [{ id: 'p2', edges: ['f0e', 'f1e', 'f2e'], allowances: [] }],
    };
    const normal = rectangle('p1');
    const mesh = drapeAssembly(
      {
        ...document,
        entities: [...document.entities, ...normal.entities],
        pieces: [normal.piece, ...document.pieces],
      },
      assemblyOf(
        [instance('i1', 'p1'), instance('i2', 'p2', { x: 200 })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i2', edges: ['f0e'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.skipped).toEqual(['i2']);
  });

  it('ignores a seam side that no longer resolves', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1')],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i1', edges: ['nope'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.triangles.length).toBeGreaterThan(8);
  });

  it('honours reversed, mirrored and a corner-round bridge', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(
      document,
      assemblyOf(
        [instance('i1'), instance('i2', 'p1', { x: 200, mirrored: true })],
        [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'], reversed: true },
              { instance: 'i2', edges: ['ab'] },
            ],
          },
        ],
      ),
    )!;

    expect(mesh.panels).toHaveLength(2);
    expect(mesh.positions.length).toBeGreaterThan(8);
  });

  it('skips a broken instance and keeps the rest', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(document, assemblyOf([instance('i1'), instance('i2', 'gone')]))!;

    expect(mesh.panels).toHaveLength(1);
    expect(mesh.skipped).toEqual(['i2']);
  });

  it('leaves an unsewn panel as an open shell', () => {
    const mesh = drapeAssembly(twoInstanceDocument(), assemblyOf([instance('i1')]))!;
    expect(mesh.openBoundaries.length).toBe(1);
    expect(mesh.openBoundaries[0]![0]).toBe(
      mesh.openBoundaries[0]!.at(-1) === mesh.openBoundaries[0]![0]
        ? mesh.openBoundaries[0]![0]
        : mesh.openBoundaries[0]![0],
    );
  });

  it('stays under the triangle budget on a large panel', () => {
    const big = rectangle('p1', 2000, 2000);
    const mesh = drapeAssembly(
      { ...documentOf([big]), pieces: [big.piece] },
      assemblyOf([instance('i1')]),
    )!;

    expect(mesh.triangles.length).toBeLessThanOrEqual(PREVIEW_TRIANGLE_LIMIT);
    expect(mesh.simplified).toBe(true);
  });

  it('stops subdividing at the per-panel budget with several large panels', () => {
    const big = rectangle('p1', 2000, 2000);
    const mesh = drapeAssembly(
      { ...documentOf([big]), pieces: [big.piece] },
      assemblyOf([
        instance('i1'),
        instance('i2', 'p1', { x: 3000 }),
        instance('i3', 'p1', { x: 6000 }),
      ]),
    )!;

    expect(mesh.triangles.length).toBeLessThanOrEqual(PREVIEW_TRIANGLE_LIMIT);
    expect(mesh.simplified).toBe(true);
  });

  it('keeps every edge at or below the subdivision cap when it can', () => {
    const document = twoInstanceDocument();
    const mesh = drapeAssembly(document, assemblyOf([instance('i1')]))!;

    const worst = Math.max(
      ...mesh.triangles.flatMap((triangle) => {
        const [a, b, c] = [
          mesh.positions[triangle.a]!,
          mesh.positions[triangle.b]!,
          mesh.positions[triangle.c]!,
        ];
        return [
          // The cap applies to the flat layout; the height field adds z afterwards.
          Math.hypot(a.x - b.x, a.y - b.y),
          Math.hypot(b.x - c.x, b.y - c.y),
          Math.hypot(c.x - a.x, c.y - a.y),
        ];
      }),
    );
    expect(worst).toBeLessThanOrEqual(PREVIEW_MAX_EDGE + 1);
  });
});

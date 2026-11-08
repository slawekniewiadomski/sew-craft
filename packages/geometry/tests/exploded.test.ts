import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  explodedAssembly,
  EXPLODE_GAP,
  SEAM_COLOR_COUNT,
  type Assembly,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
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

const rectangle = (
  piece: string,
  width = 60,
  height = 60,
  prefix = '',
): {
  entities: Entity[];
  piece: Piece;
} => ({
  entities: [
    point(`${prefix}a`, 0, 0, piece),
    point(`${prefix}b`, width, 0, piece),
    point(`${prefix}c`, width, height, piece),
    point(`${prefix}d`, 0, height, piece),
    line(`${prefix}ab`, `${prefix}a`, `${prefix}b`, piece),
    line(`${prefix}bc`, `${prefix}b`, `${prefix}c`, piece),
    line(`${prefix}cd`, `${prefix}c`, `${prefix}d`, piece),
    line(`${prefix}da`, `${prefix}d`, `${prefix}a`, piece),
  ],
  piece: {
    id: piece,
    name: piece === 'p1' ? 'Panel' : 'Strip',
    edges: [`${prefix}ab`, `${prefix}bc`, `${prefix}cd`, `${prefix}da`],
    allowances: [],
  },
});

const documentOf = (rectangles: { entities: Entity[]; piece: Piece }[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities: rectangles.flatMap((entry) => entry.entities),
  pieces: rectangles.map((entry) => entry.piece),
});

const seams = (edges: string[] = ['ab', 'bc', 'cd', 'da']): Assembly['seams'] =>
  edges.map((edge, index) => ({
    id: `s${index}`,
    sides: [
      { instance: 'i1', edges: [edge] },
      { instance: 'i2', edges: [edge] },
    ],
  }));

describe('explodedAssembly', () => {
  const cube = (): { document: PatternDocument; assembly: Assembly } => {
    const panel = rectangle('p1');
    return {
      document: documentOf([panel]),
      assembly: {
        id: 'a1',
        name: 'Shell',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p1', x: 120, y: 0 },
        ],
        seams: [
          ...seams()!,
          {
            id: 'run',
            sides: [
              { instance: 'i1', edges: ['ab', 'bc', 'cd'] },
              { instance: 'i2', edges: ['ab', 'bc', 'cd'] },
            ],
          },
        ],
      },
    };
  };

  it('separates instances into layers and links each seam side', () => {
    const { document, assembly } = cube();
    const view = explodedAssembly(document, assembly)!;

    expect(view.panels).toHaveLength(2);
    expect(view.panels.map((panel) => panel.label)).toEqual(['Panel 1', 'Panel 2']);
    expect(view.panels[0]!.boundary.every((point) => point.z === 0)).toBe(true);
    expect(view.panels[1]!.boundary.every((point) => point.z === EXPLODE_GAP)).toBe(true);
    expect(view.seams).toHaveLength(5);
    expect(view.seams[0]!.sides).toHaveLength(2);
    expect(view.seams[4]!.sides[0]!.points).toHaveLength(4);
    expect(view.seams[0]!.links).toHaveLength(1);
    expect(view.seams[0]!.links[0]).toHaveLength(2);
    expect(view.seams[0]!.colorIndex).toBe(0);
    expect(view.seams[3]!.colorIndex).toBe(3 % SEAM_COLOR_COUNT);
    expect(view.skipped).toEqual([]);
  });

  it('shows a third part and the seam from its strip ends', () => {
    const panel = rectangle('p1');
    const strip = rectangle('p2', 240, 40, 's');
    const document = documentOf([panel, strip]);
    const assembly: Assembly = {
      id: 'a1',
      name: 'Gusset',
      instances: [
        { id: 'i1', piece: 'p1', x: 0, y: 0 },
        { id: 'i2', piece: 'p1', x: 120, y: 0 },
        { id: 'i3', piece: 'p2', x: 0, y: 200 },
      ],
      seams: [
        ...seams().map((seam) => ({
          ...seam!,
          sides: [seam!.sides[0]!, { instance: 'i3', edges: [`s${seam!.sides[1]!.edges[0]!}`] }],
        })),
        {
          id: 'end',
          sides: [
            { instance: 'i3', edges: ['sda'] },
            { instance: 'i3', edges: ['sbc'] },
          ],
        },
      ],
    };

    const view = explodedAssembly(document, assembly)!;

    expect(view.panels).toHaveLength(3);
    expect(view.panels.map((panel) => panel.label)).toEqual(['Panel 1', 'Panel 2', 'Strip']);
    expect(view.panels[2]!.boundary.every((point) => point.z === EXPLODE_GAP * 2)).toBe(true);
    expect(view.seams).toHaveLength(5);
    expect(view.seams.at(-1)!.sides).toHaveLength(2);
  });

  it('skips an unknown piece, a broken loop and a one-sided seam', () => {
    const panel = rectangle('p1');
    const broken: Piece = { id: 'p3', edges: ['ab', 'bc'], allowances: [] };
    const document = { ...documentOf([panel]), pieces: [panel.piece, broken] };
    const assembly: Assembly = {
      id: 'a1',
      name: 'Shell',
      instances: [
        { id: 'i1', piece: 'p1', x: 0, y: 0 },
        { id: 'i2', piece: 'gone', x: 100, y: 0 },
        { id: 'i3', piece: 'p3', x: 200, y: 0 },
      ],
      seams: [
        {
          id: 'one',
          sides: [
            { instance: 'i1', edges: ['ab'] },
            { instance: 'i1', edges: ['nope'] },
          ],
        },
        {
          id: 'ghost',
          sides: [
            { instance: 'i1', edges: ['ab'] },
            { instance: 'ghost', edges: ['ab'] },
          ],
        },
      ],
    };

    const view = explodedAssembly(document, assembly)!;

    expect(view.panels.map((panel) => panel.instance)).toEqual(['i1']);
    expect(view.skipped).toEqual(['i2', 'i3']);
    expect(view.seams).toEqual([]);
  });

  it('returns null when no part resolves', () => {
    const document = documentOf([rectangle('p1')]);
    const empty: PatternDocument = { ...document, pieces: [] };

    expect(explodedAssembly(empty, { id: 'a1', name: 'Empty', instances: [] })).toBeNull();
    expect(
      explodedAssembly(empty, {
        id: 'a1',
        name: 'Empty',
        instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }],
      }),
    ).toBeNull();
  });

  it('labels a single placed part without an occurrence suffix', () => {
    const panel = rectangle('p1');
    const view = explodedAssembly(documentOf([panel]), {
      id: 'a1',
      name: 'Shell',
      instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }],
    })!;

    expect(view.panels[0]!.label).toBe('Panel');
  });

  it('falls back to a numbered label for an unnamed piece', () => {
    const panel = rectangle('p1');
    const unnamed = { ...panel.piece, name: undefined };
    const view = explodedAssembly(
      { ...documentOf([panel]), pieces: [unnamed] },
      {
        id: 'a1',
        name: 'Shell',
        instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }],
      },
    )!;

    expect(view.panels[0]!.label).toBe('Piece 1');
  });
});

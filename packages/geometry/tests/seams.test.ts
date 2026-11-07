import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  instanceEdgeSegments,
  pieceEdgeSegments,
  resolveSeamRun,
  sewabilityReport,
  validateSeam,
  validateSeamRun,
  type Assembly,
  type AssemblyInstance,
  type Entity,
  type FinishedEdge,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type SeamRun,
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

interface Rectangle {
  entities: Entity[];
  piece: Piece;
}

/** A rectangle with authored edges running a→b→c→d→a. */
function rectangle(
  pieceId: string,
  width: number,
  height: number,
  options: {
    prefix?: string;
    x?: number;
    y?: number;
    reverseOne?: boolean;
    reverseSecond?: boolean;
  } = {},
): Rectangle {
  const prefix = options.prefix ?? pieceId;
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const ids = {
    a: `${prefix}-a`,
    b: `${prefix}-b`,
    c: `${prefix}-c`,
    d: `${prefix}-d`,
    bottom: `${prefix}-bottom`,
    right: `${prefix}-right`,
    top: `${prefix}-top`,
    left: `${prefix}-left`,
  };

  return {
    entities: [
      point(ids.a, x, y, pieceId),
      point(ids.b, x + width, y, pieceId),
      point(ids.c, x + width, y + height, pieceId),
      point(ids.d, x, y + height, pieceId),
      line(ids.bottom, ids.a, ids.b, pieceId),
      options.reverseSecond
        ? line(ids.right, ids.c, ids.b, pieceId)
        : line(ids.right, ids.b, ids.c, pieceId),
      line(ids.top, ids.c, ids.d, pieceId),
      // The loop walk needs d→a, so this edge runs against the walk.
      options.reverseOne
        ? line(ids.left, ids.a, ids.d, pieceId)
        : line(ids.left, ids.d, ids.a, pieceId),
    ],
    piece: {
      id: pieceId,
      edges: [ids.bottom, ids.right, ids.top, ids.left],
      allowances: [],
    },
  };
}

function documentOf(
  rectangles: Rectangle[],
  assemblies: Assembly[] = [],
  extraEntities: Entity[] = [],
): PatternDocument {
  return {
    ...createEmptyDocument(),
    entities: [...rectangles.flatMap((rectangle) => rectangle.entities), ...extraEntities],
    pieces: rectangles.map((rectangle) => rectangle.piece),
    assemblies,
  };
}

const instance = (
  id: string,
  piece: string,
  overrides: Partial<AssemblyInstance> = {},
): AssemblyInstance => ({
  id,
  piece,
  x: 0,
  y: 0,
  ...overrides,
});

const assemblyOf = (instances: AssemblyInstance[], extra: Partial<Assembly> = {}): Assembly => ({
  id: 'asm',
  name: 'Assembly 1',
  instances,
  ...extra,
});

const square = rectangle('p1', 100, 100);

const finishedRest = (piece: Piece, instanceId: string, sewn: readonly string[]): FinishedEdge[] =>
  piece.edges
    .filter((edge) => !sewn.includes(edge))
    .map((edge) => ({ instance: instanceId, edge, kind: 'hem' }));

describe('pieceEdgeSegments', () => {
  it('returns one authored-direction polyline per loop edge', () => {
    const document = documentOf([square]);

    const segments = pieceEdgeSegments(document, square.piece)!;

    expect(segments).toHaveLength(4);
    expect(segments[0]).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(segments[3]).toEqual([
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ]);
  });

  it('restores the authored direction of an edge the loop walk reverses', () => {
    const reversed = rectangle('p1', 100, 100, { reverseOne: true });
    const document = documentOf([reversed]);

    const segments = pieceEdgeSegments(document, reversed.piece)!;

    // `left` is authored a→d but the loop walks d→a.
    expect(segments[3]).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
  });

  it('excludes a rounded corner bridge from its neighbouring edges', () => {
    const rounded = rectangle('p1', 100, 100);
    const document = applyCommand(documentOf([rounded]), {
      id: 'round',
      type: 'add_corner_round',
      params: { first: 'p1-bottom', second: 'p1-right', radius: 10 },
    }).document;

    const segments = pieceEdgeSegments(document, rounded.piece)!;

    expect(segments).toHaveLength(4);
    expect(segments[0]!.at(-1)).not.toEqual({ x: 100, y: 0 });
    expect(segments[1]![0]).not.toEqual({ x: 100, y: 0 });
  });

  it('returns null for a loop that does not resolve', () => {
    const broken: Piece = { id: 'p1', edges: ['p1-bottom', 'p1-top'], allowances: [] };

    expect(
      pieceEdgeSegments(documentOf([{ entities: square.entities, piece: broken }]), broken),
    ).toBeNull();
  });
});

describe('instanceEdgeSegments', () => {
  const document = documentOf([square]);

  it('translates every point through the instance anchor', () => {
    const segments = instanceEdgeSegments(
      document,
      square.piece,
      instance('i1', 'p1', { x: 200, y: 300 }),
    )!;

    expect(segments[0]).toEqual([
      { x: 150, y: 250 },
      { x: 250, y: 250 },
    ]);
  });

  it('rotates and mirrors before translating', () => {
    const rotated = instanceEdgeSegments(
      document,
      square.piece,
      instance('i1', 'p1', { x: 200, y: 300, rotation: Math.PI / 2 }),
    )!;
    const mirrored = instanceEdgeSegments(
      document,
      square.piece,
      instance('i1', 'p1', { x: 200, y: 300, mirrored: true }),
    )!;

    expect(rotated[0]).toEqual([
      { x: 250, y: 250 },
      { x: 250, y: 350 },
    ]);
    expect(mirrored[0]).toEqual([
      { x: 250, y: 250 },
      { x: 150, y: 250 },
    ]);
  });

  it('returns null for a broken loop', () => {
    const broken: Piece = { id: 'p1', edges: ['p1-bottom'], allowances: [] };

    expect(
      instanceEdgeSegments(
        documentOf([{ entities: square.entities, piece: broken }]),
        broken,
        instance('i1', 'p1'),
      ),
    ).toBeNull();
  });

  it('returns null when the piece has no anchor', () => {
    const empty: Piece = { id: 'empty', edges: [], allowances: [] };

    expect(instanceEdgeSegments(document, empty, instance('i1', 'empty'))).toBeNull();
  });
});

describe('resolveSeamRun', () => {
  const twoInstances = (extra: Partial<Assembly> = {}): Assembly =>
    assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], extra);

  it('resolves a single edge in assembly space', () => {
    const document = documentOf([square]);
    const resolved = resolveSeamRun(document, twoInstances(), {
      instance: 'i2',
      edges: ['p1-bottom'],
    })!;

    expect(resolved.instance).toBe('i2');
    expect(resolved.reversed).toBe(false);
    expect(resolved.length).toBeCloseTo(100);
    expect(resolved.points[0]).toEqual({ x: -50, y: 150 });
    expect(resolved.points.at(-1)).toEqual({ x: 50, y: 150 });
  });

  it('runs consecutive edges into one chain', () => {
    const document = documentOf([square]);
    const resolved = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-bottom', 'p1-right'],
    })!;

    expect(resolved.length).toBeCloseTo(200);
    expect(resolved.points).toHaveLength(3);
    expect(resolved.points.at(-1)).toEqual({ x: 50, y: 50 });
  });

  it('includes a rounded corner bridge and its arc length', () => {
    const rounded = rectangle('p1', 100, 100);
    const document = applyCommand(documentOf([rounded]), {
      id: 'round',
      type: 'add_corner_round',
      params: { first: 'p1-bottom', second: 'p1-right', radius: 10 },
    }).document;

    const resolved = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-bottom', 'p1-right'],
    })!;

    expect(resolved.length).toBeGreaterThan(195);
    // The corner arc is flattened into chords, so it is a few thousandths short.
    expect(resolved.length).toBeCloseTo(90 + 10 * (Math.PI / 2) + 90, 1);
    expect(resolved.points.length).toBeGreaterThan(3);
  });

  it('reverses the whole run when the side is reversed', () => {
    const document = documentOf([square]);
    const forward = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-bottom', 'p1-right'],
    })!;
    const reversed = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-bottom', 'p1-right'],
      reversed: true,
    })!;

    expect(reversed.length).toBeCloseTo(forward.length);
    expect(reversed.reversed).toBe(true);
    expect(reversed.points[0]).toEqual(forward.points.at(-1));
    expect(reversed.points.at(-1)).toEqual(forward.points[0]);
  });

  it('reverses a bridged edge that is authored against the run', () => {
    const rounded = rectangle('p1', 100, 100, { reverseSecond: true });
    const document = applyCommand(documentOf([rounded]), {
      id: 'round',
      type: 'add_corner_round',
      params: { first: 'p1-bottom', second: 'p1-right', radius: 10 },
    }).document;

    const resolved = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-bottom', 'p1-right'],
    })!;

    expect(resolved.length).toBeGreaterThan(195);
    expect(resolved.points.at(-1)).toEqual({ x: 50, y: 50 });
  });

  it('returns null for an unknown instance, an unknown edge or a broken loop', () => {
    const document = documentOf([square]);
    const assembly = twoInstances();

    expect(
      resolveSeamRun(document, assembly, { instance: 'nope', edges: ['p1-bottom'] }),
    ).toBeNull();
    expect(resolveSeamRun(document, assembly, { instance: 'i1', edges: ['nope'] })).toBeNull();
    expect(resolveSeamRun(document, assembly, { instance: 'i1', edges: [] })).toBeNull();
    expect(
      resolveSeamRun(document, assembly, { instance: 'i1', edges: ['p1-bottom', 'p1-top'] }),
    ).toBeNull();
  });

  it('returns null when the placed piece or its loop no longer resolves', () => {
    const broken: Piece = { id: 'p1', edges: ['p1-bottom', 'p1-top'], allowances: [] };
    const brokenDocument = documentOf([{ entities: square.entities, piece: broken }]);
    const assembly = assemblyOf([instance('i1', 'p1')]);

    expect(
      resolveSeamRun(brokenDocument, assembly, { instance: 'i1', edges: ['p1-bottom'] }),
    ).toBeNull();
    expect(
      resolveSeamRun(documentOf([square]), assemblyOf([instance('i1', 'gone')]), {
        instance: 'i1',
        edges: ['p1-bottom'],
      }),
    ).toBeNull();
  });

  it('starts a wrapping run at the first edge outer end', () => {
    const document = documentOf([square]);
    const resolved = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-left', 'p1-bottom'],
    })!;

    // left is authored d→a and the run leaves it at a, so it starts at d.
    expect(resolved.length).toBeCloseTo(200);
    expect(resolved.points[0]).toEqual({ x: -50, y: 50 });
    expect(resolved.points.at(-1)).toEqual({ x: 50, y: -50 });
  });

  it('reverses a wrapping run whose first edge is authored against it', () => {
    const reversedLeft = rectangle('p1', 100, 100, { reverseOne: true });
    const document = documentOf([reversedLeft]);

    const resolved = resolveSeamRun(document, twoInstances(), {
      instance: 'i1',
      edges: ['p1-left', 'p1-bottom'],
    })!;

    expect(resolved.length).toBeCloseTo(200);
    expect(resolved.points[0]).toEqual({ x: -50, y: 50 });
    expect(resolved.points.at(-1)).toEqual({ x: 50, y: -50 });
  });
});

describe('validateSeamRun', () => {
  const document = documentOf([square]);
  const assembly = assemblyOf([instance('i1', 'p1')]);

  it('accepts a run of loop edges', () => {
    expect(validateSeamRun(document, assembly, { instance: 'i1', edges: ['p1-bottom'] })).toEqual({
      ok: true,
    });
  });

  it('rejects an empty run, an unknown instance and a foreign edge', () => {
    expect(validateSeamRun(document, assembly, { instance: 'i1', edges: [] })).toEqual({
      ok: false,
      message: 'a seam side needs at least one edge',
    });
    expect(validateSeamRun(document, assembly, { instance: 'nope', edges: ['p1-bottom'] })).toEqual(
      {
        ok: false,
        message: 'unknown instance: nope',
      },
    );
    expect(validateSeamRun(document, assembly, { instance: 'i1', edges: ['other'] })).toEqual({
      ok: false,
      message: 'edge other is not in the loop of piece p1',
    });
  });

  it('rejects an unknown piece and an unresolvable loop', () => {
    expect(
      validateSeamRun(documentOf([square]), assemblyOf([instance('i1', 'gone')]), {
        instance: 'i1',
        edges: ['p1-bottom'],
      }),
    ).toEqual({ ok: false, message: 'instance i1 places an unknown piece' });

    const broken: Piece = { id: 'p1', edges: ['p1-bottom', 'p1-top'], allowances: [] };
    const brokenDocument = documentOf([{ entities: square.entities, piece: broken }]);
    expect(
      validateSeamRun(brokenDocument, assembly, { instance: 'i1', edges: ['p1-bottom'] }),
    ).toEqual({ ok: false, message: 'the loop of piece p1 does not resolve' });
  });
});

describe('validateSeam', () => {
  const document = documentOf([square]);
  const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })]);

  const bottom = (instanceId: string): SeamRun => ({ instance: instanceId, edges: ['p1-bottom'] });

  it('accepts two valid sides', () => {
    expect(validateSeam(document, assembly, [bottom('i1'), bottom('i2')])).toEqual({ ok: true });
  });

  it('accepts a run that wraps around the loop', () => {
    expect(
      validateSeam(document, assembly, [
        { instance: 'i1', edges: ['p1-left', 'p1-bottom'] },
        { instance: 'i2', edges: ['p1-left', 'p1-bottom'] },
      ]),
    ).toEqual({ ok: true });
  });

  it('rejects fewer than two sides and a repeated edge', () => {
    expect(validateSeam(document, assembly, [bottom('i1')])).toEqual({
      ok: false,
      message: 'a seam needs at least two sides',
    });
    expect(
      validateSeam(document, assembly, [
        { instance: 'i1', edges: ['p1-bottom', 'p1-bottom'] },
        bottom('i2'),
      ]),
    ).toEqual({ ok: false, message: 'edge p1-bottom is selected more than once' });
    expect(validateSeam(document, assembly, [bottom('i1'), bottom('i1')])).toEqual({
      ok: false,
      message: 'edge p1-bottom is selected more than once',
    });
  });

  it('rejects a non-consecutive run', () => {
    expect(
      validateSeam(document, assembly, [
        { instance: 'i1', edges: ['p1-bottom', 'p1-top'] },
        bottom('i2'),
      ]),
    ).toEqual({ ok: false, message: 'edge p1-top is not consecutive in piece p1' });
  });

  it('propagates a single-side validation failure', () => {
    expect(
      validateSeam(document, assembly, [bottom('i1'), { instance: 'nope', edges: ['p1-top'] }]),
    ).toEqual({ ok: false, message: 'unknown instance: nope' });
  });

  it('rejects an edge another seam or a finish already claims', () => {
    const sewn = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], {
      seams: [{ id: 'old', sides: [bottom('i1'), bottom('i2')] }],
      finishedEdges: [{ instance: 'i1', edge: 'p1-top', kind: 'hem' }],
    });

    expect(validateSeam(document, sewn, [bottom('i1'), bottom('i2')])).toEqual({
      ok: false,
      message: 'edge p1-bottom is already sewn or finished (seam old)',
    });
    expect(
      validateSeam(document, sewn, [
        { instance: 'i1', edges: ['p1-top'] },
        { instance: 'i2', edges: ['p1-top'] },
      ]),
    ).toEqual({ ok: false, message: 'edge p1-top is already sewn or finished (a finished edge)' });
  });

  it('ignores the seam being updated', () => {
    const sewn = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], {
      seams: [{ id: 's1', sides: [bottom('i1'), bottom('i2')] }],
    });

    expect(
      validateSeam(document, sewn, [bottom('i1'), bottom('i2')], { ignoreSeam: 's1' }),
    ).toEqual({
      ok: true,
    });
  });
});

describe('sewabilityReport', () => {
  it('is empty for an assembly with no instances', () => {
    const report = sewabilityReport(documentOf([]), assemblyOf([]));

    expect(report).toEqual({
      edgeCount: 0,
      seamCount: 0,
      finishedCount: 0,
      issues: [],
      errors: 0,
      warnings: 0,
    });
  });

  it('accepts an assembly where every edge is sewn or finished', () => {
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], {
      seams: [
        {
          id: 's1',
          sides: [
            { instance: 'i1', edges: ['p1-bottom'] },
            { instance: 'i2', edges: ['p1-bottom'] },
          ],
        },
      ],
      finishedEdges: [
        ...finishedRest(square.piece, 'i1', ['p1-bottom']),
        ...finishedRest(square.piece, 'i2', ['p1-bottom']),
      ],
    });

    const report = sewabilityReport(documentOf([square]), assembly);

    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.edgeCount).toBe(8);
    expect(report.seamCount).toBe(1);
    expect(report.finishedCount).toBe(6);
  });

  it('reports every unmatched edge in document order', () => {
    const assembly = assemblyOf([instance('i1', 'p1')]);
    const report = sewabilityReport(documentOf([square]), assembly);

    expect(report.errors).toBe(4);
    expect(report.issues.map((issue) => issue.edge)).toEqual(square.piece.edges);
    expect(report.issues.every((issue) => issue.kind === 'unmatched_edge')).toBe(true);
  });

  it('reports an edge used twice', () => {
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], {
      seams: [
        {
          id: 's1',
          sides: [
            { instance: 'i1', edges: ['p1-bottom'] },
            { instance: 'i2', edges: ['p1-bottom'] },
          ],
        },
      ],
      finishedEdges: [{ instance: 'i1', edge: 'p1-bottom', kind: 'hem' }],
    });

    const report = sewabilityReport(documentOf([square]), assembly);
    const used = report.issues.filter((issue) => issue.kind === 'edge_used_twice');

    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({ instance: 'i1', edge: 'p1-bottom', severity: 'error' });
  });

  it('reports a one-sided seam and a missing instance as missing references', () => {
    const assembly = assemblyOf([instance('i1', 'p1')], {
      seams: [
        { id: 'one', sides: [{ instance: 'i1', edges: ['p1-bottom'] }] },
        {
          id: 'ghost',
          sides: [
            { instance: 'nope', edges: ['p1-bottom'] },
            { instance: 'i1', edges: ['p1-top'] },
          ],
        },
      ],
    });

    const report = sewabilityReport(documentOf([square]), assembly);
    const missing = report.issues.filter((issue) => issue.kind === 'missing_reference');

    expect(missing).toContainEqual({ kind: 'missing_reference', severity: 'error', seam: 'one' });
    expect(missing).toContainEqual({
      kind: 'missing_reference',
      severity: 'error',
      seam: 'ghost',
      instance: 'nope',
      edge: 'p1-bottom',
    });
  });

  it('reports an empty side without an edge reference', () => {
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], {
      seams: [
        {
          id: 'empty',
          sides: [
            { instance: 'i1', edges: [] },
            { instance: 'i2', edges: ['p1-bottom'] },
          ],
        },
      ],
    });

    const report = sewabilityReport(documentOf([square]), assembly);

    expect(report.issues).toContainEqual({
      kind: 'missing_reference',
      severity: 'error',
      seam: 'empty',
      instance: 'i1',
    });
  });

  it('reports a missing piece, a broken loop and a dangling finish', () => {
    const broken: Piece = { id: 'p1', edges: ['p1-bottom', 'p1-top'], allowances: [] };
    const document = documentOf([{ entities: square.entities, piece: broken }]);
    const assembly = assemblyOf(
      [
        { id: 'i1', piece: 'p1', x: 0, y: 0 },
        { id: 'i2', piece: 'gone', x: 0, y: 0 },
      ],
      { finishedEdges: [{ instance: 'nope', edge: 'x', kind: 'hem' }] },
    );

    const report = sewabilityReport(document, assembly);
    const missing = report.issues.filter((issue) => issue.kind === 'missing_reference');

    expect(missing).toContainEqual({
      kind: 'missing_reference',
      severity: 'error',
      instance: 'i1',
    });
    expect(missing).toContainEqual({
      kind: 'missing_reference',
      severity: 'error',
      instance: 'i2',
    });
    expect(missing).toContainEqual({
      kind: 'missing_reference',
      severity: 'error',
      instance: 'nope',
      edge: 'x',
    });
  });

  it('reports the length mismatch at the tolerance boundary and past it', () => {
    const wide = rectangle('p2', 105, 100, { prefix: 'wide' });
    const document = documentOf([square, wide]);
    const side = (instanceId: string, edge: string): SeamRun => ({
      instance: instanceId,
      edges: [edge],
    });
    const atTolerance = assemblyOf([instance('i1', 'p1'), instance('i2', 'p2')], {
      seams: [{ id: 's1', sides: [side('i1', 'p1-bottom'), side('i2', 'wide-bottom')] }],
    });
    const pastTolerance = documentOf([square, rectangle('p2', 106, 100, { prefix: 'wide' })]);

    const at = sewabilityReport(document, atTolerance);
    const past = sewabilityReport(
      pastTolerance,
      assemblyOf([instance('i1', 'p1'), instance('i2', 'p2')], {
        seams: [{ id: 's1', sides: [side('i1', 'p1-bottom'), side('i2', 'wide-bottom')] }],
      }),
    );

    expect(at.issues.filter((issue) => issue.kind === 'length_mismatch')).toEqual([]);
    expect(past.issues).toContainEqual({
      kind: 'length_mismatch',
      severity: 'error',
      seam: 's1',
      instance: 'i2',
      edge: 'wide-bottom',
      instanceB: 'i1',
      edgeB: 'p1-bottom',
      valueA: 106,
      valueB: 100,
      delta: 6,
    });
  });

  it('downgrades an eased length mismatch to a warning', () => {
    const wide = rectangle('p2', 106, 100, { prefix: 'wide' });
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p2')], {
      seams: [
        {
          id: 's1',
          eased: true,
          sides: [
            { instance: 'i1', edges: ['p1-bottom'] },
            { instance: 'i2', edges: ['wide-bottom'] },
          ],
        },
      ],
    });

    const report = sewabilityReport(documentOf([square, wide]), assembly);

    expect(report.issues).toContainEqual({
      kind: 'length_mismatch',
      severity: 'warning',
      seam: 's1',
      instance: 'i2',
      edge: 'wide-bottom',
      instanceB: 'i1',
      edgeB: 'p1-bottom',
      valueA: 106,
      valueB: 100,
      delta: 6,
    });
    expect(report.warnings).toBe(1);
    expect(report.errors).toBe(6);
  });

  it('reports an allowance mismatch only when the cut distances differ', () => {
    const withAllowance = (
      rect: Rectangle,
      edge: string,
      width: number,
      kind?: 'double',
    ): Rectangle => ({
      ...rect,
      piece: {
        ...rect.piece,
        allowances: [{ edge, width, ...(kind === undefined ? {} : { kind }) }],
      },
    });
    const oneHundred = rectangle('p2', 100, 100, { prefix: 'wide' });
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p2')], {
      seams: [
        {
          id: 's1',
          sides: [
            { instance: 'i1', edges: ['p1-bottom'] },
            { instance: 'i2', edges: ['wide-bottom'] },
          ],
        },
      ],
    });

    const same = documentOf([
      withAllowance(square, 'p1-bottom', 10),
      withAllowance(oneHundred, 'wide-bottom', 10),
    ]);
    const different = documentOf([
      withAllowance(square, 'p1-bottom', 10),
      withAllowance(oneHundred, 'wide-bottom', 12),
    ]);

    expect(
      sewabilityReport(same, assembly).issues.filter((i) => i.kind === 'allowance_mismatch'),
    ).toEqual([]);
    expect(sewabilityReport(different, assembly).issues).toContainEqual({
      kind: 'allowance_mismatch',
      severity: 'warning',
      seam: 's1',
      instance: 'i2',
      edge: 'wide-bottom',
      instanceB: 'i1',
      edgeB: 'p1-bottom',
      valueA: 12,
      valueB: 10,
      delta: 2,
    });

    const swapped = documentOf([
      withAllowance(square, 'p1-bottom', 12),
      withAllowance(oneHundred, 'wide-bottom', 10),
    ]);
    expect(sewabilityReport(swapped, assembly).issues).toContainEqual({
      kind: 'allowance_mismatch',
      severity: 'warning',
      seam: 's1',
      instance: 'i1',
      edge: 'p1-bottom',
      instanceB: 'i2',
      edgeB: 'wide-bottom',
      valueA: 12,
      valueB: 10,
      delta: 2,
    });
  });

  it('warns when a double-fold edge is sewn', () => {
    const wide = rectangle('p2', 100, 100, { prefix: 'wide' });
    const document = documentOf([
      square,
      {
        ...wide,
        piece: {
          ...wide.piece,
          allowances: [{ edge: 'wide-bottom', width: 10, kind: 'double' }],
        },
      },
    ]);
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p2')], {
      seams: [
        {
          id: 's1',
          sides: [
            { instance: 'i1', edges: ['p1-bottom'] },
            { instance: 'i2', edges: ['wide-bottom'] },
          ],
        },
      ],
    });

    const report = sewabilityReport(document, assembly);

    expect(report.issues).toContainEqual({
      kind: 'folded_edge_sewn',
      severity: 'warning',
      seam: 's1',
      instance: 'i2',
      edge: 'wide-bottom',
    });
  });

  it('reports a hand-edited duplicate inside one side', () => {
    const assembly = assemblyOf([instance('i1', 'p1'), instance('i2', 'p1', { x: 0, y: 200 })], {
      seams: [
        {
          id: 's1',
          sides: [
            { instance: 'i1', edges: ['p1-bottom', 'p1-bottom'] },
            { instance: 'i2', edges: ['p1-bottom'] },
          ],
        },
      ],
    });

    const report = sewabilityReport(documentOf([square]), assembly);

    expect(report.issues).toContainEqual({
      kind: 'edge_used_twice',
      severity: 'error',
      seam: 's1',
      instance: 'i1',
      edge: 'p1-bottom',
    });
  });
});

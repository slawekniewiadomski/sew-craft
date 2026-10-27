import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  cornerRounds,
  createEmptyDocument,
  distance,
  executeCommand,
  getConstraint,
  getEntity,
  lineMidpoint,
  midpointDependencies,
  midpointIssue,
  midpointSources,
  midpointTargetFor,
  midpointTargets,
  regenerateMidpoints,
  solve,
  solveDocument,
  type Command,
  type Constraint,
  type CornerRound,
  type Entity,
  type LineEntity,
  type MidpointConstraint,
  type PatternDocument,
  type PointEntity,
} from '../src/index.js';

const point = (
  id: string,
  x: number,
  y: number,
  options: { fixed?: boolean } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: options.fixed ?? false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
});

const documentOf = (entities: Entity[], constraints: Constraint[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  constraints,
});

const lineMidpointDoc = (): PatternDocument =>
  documentOf([
    point('a', 0, 0, { fixed: true }),
    point('b', 10, 4),
    point('p', 0, 0),
    line('l', 'a', 'b'),
  ]);

const twoPointMidpoint = (): MidpointConstraint => ({
  id: 'm',
  type: 'midpoint',
  point: 'p',
  a: 'a',
  b: 'b',
});

const addPoint = (id: string, x: number, y: number): Command => ({
  id,
  type: 'add_point',
  params: { x, y },
});

const addMidpoint = (
  id: string,
  pointId: string,
  sources: [string, string] | [string, string, string],
): Command => ({
  id,
  type: 'add_constraint',
  params: { type: 'midpoint', entities: [pointId, ...sources] },
});

describe('midpoint helpers', () => {
  it('returns the visible middle of a straight line', () => {
    expect(lineMidpoint(lineMidpointDoc(), 'l')).toEqual({ x: 5, y: 2 });
  });

  it('returns null for a missing, non-line or degenerate segment', () => {
    expect(lineMidpoint(lineMidpointDoc(), 'missing')).toBeNull();
    expect(lineMidpoint(documentOf([point('a', 0, 0)]), 'a')).toBeNull();
    expect(
      lineMidpoint(documentOf([point('a', 1, 1), point('b', 1, 1), line('l', 'a', 'b')]), 'l'),
    ).toBeNull();
  });

  it('finds the relation that owns a point, optionally ignoring one', () => {
    const constraint = twoPointMidpoint();
    const document = documentOf([], [constraint]);

    expect(midpointTargetFor(document, 'p')).toEqual(constraint);
    expect(midpointTargetFor(document, 'p', 'm')).toBeUndefined();
    expect(midpointTargetFor(document, 'a')).toBeUndefined();
    expect(midpointTargets(document)).toEqual(new Set(['p']));
  });

  it('resolves both forms and rejects a missing or wrong-kind line', () => {
    const lineForm: MidpointConstraint = { id: 'm', type: 'midpoint', point: 'p', line: 'l' };

    expect(midpointSources(lineMidpointDoc(), lineForm)).toEqual({ a: 'a', b: 'b' });
    expect(midpointSources(documentOf([]), twoPointMidpoint())).toEqual({ a: 'a', b: 'b' });
    expect(midpointSources(documentOf([]), lineForm)).toBeNull();
    expect(midpointSources(documentOf([point('a', 0, 0)]), { ...lineForm, line: 'a' })).toBeNull();
  });

  it('lists only resolvable dependencies', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 4, 0), line('l', 'a', 'b')],
      [
        { id: 'm1', type: 'midpoint', point: 'p', a: 'a', b: 'b' },
        { id: 'm2', type: 'midpoint', point: 'q', line: 'l' },
        { id: 'm3', type: 'midpoint', point: 'r', line: 'missing' },
      ],
    );

    expect(midpointDependencies(document)).toEqual(
      new Map([
        ['p', { a: 'a', b: 'b' }],
        ['q', { a: 'a', b: 'b' }],
      ]),
    );
  });

  it('recomputes every target and leaves unrelated entities alone', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 8, 6), point('p', 99, 99), line('l', 'a', 'b')],
      [{ id: 'm', type: 'midpoint', point: 'p', a: 'a', b: 'b' }],
    );

    const regenerated = regenerateMidpoints(document);
    const target = regenerated.entities.find((entity) => entity.id === 'p')!;

    expect(target).toMatchObject({ x: 4, y: 3 });
    expect(regenerated.entities.find((entity) => entity.id === 'l')).toBe(
      document.entities.find((entity) => entity.id === 'l'),
    );
  });

  it('returns the same document when nothing can be regenerated', () => {
    const empty = documentOf([]);
    const dangling = documentOf(
      [point('a', 0, 0)],
      [{ id: 'm', type: 'midpoint', point: 'p', a: 'a', b: 'missing' }],
    );

    expect(regenerateMidpoints(empty)).toBe(empty);
    expect(regenerateMidpoints(dangling)).toBe(dangling);
  });
});

describe('midpoint validation', () => {
  const issue = (document: PatternDocument, constraint: MidpointConstraint): string | null => {
    const result = midpointIssue(document, constraint);
    return result;
  };

  it('accepts a resolvable relation', () => {
    expect(
      issue(lineMidpointDoc(), { id: 'm', type: 'midpoint', point: 'p', line: 'l' }),
    ).toBeNull();
    expect(
      issue(documentOf([point('a', 0, 0), point('b', 4, 2), point('p', 0, 0)]), twoPointMidpoint()),
    ).toBeNull();
  });

  it('reports a missing or non-point target', () => {
    expect(issue(lineMidpointDoc(), { ...twoPointMidpoint(), point: 'nope' })).toBe(
      'missing-target',
    );
    expect(issue(lineMidpointDoc(), { ...twoPointMidpoint(), point: 'l' })).toBe(
      'target-not-point',
    );
  });

  it('reports a target already owned by a derived relation', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
      [twoPointMidpoint()],
    );

    expect(issue(document, { ...twoPointMidpoint(), id: 'other' })).toBe('target-derived');
  });

  it('reports a target owned by a corner round', () => {
    const round = {
      id: 'r',
      corner: 'c',
      ends: [{ line: 'l', anchor: 'a', tangent: 'p' }],
      radius: 1,
      arc: 'arc',
      controls: ['c1', 'c2'],
      center: 'center',
      cornerConstruction: false,
    } as unknown as CornerRound;
    const document = {
      ...documentOf([point('p', 0, 0), point('a', 0, 0), point('b', 4, 0)]),
      cornerRounds: [round],
    };

    expect(issue(document, twoPointMidpoint())).toBe('target-derived');
  });

  it('reports missing and wrong-kind sources in both forms', () => {
    const lineForm: MidpointConstraint = { id: 'm', type: 'midpoint', point: 'p', line: 'l' };

    expect(issue(documentOf([point('p', 0, 0)]), lineForm)).toBe('missing-source');
    expect(
      issue(documentOf([point('p', 0, 0), point('a', 0, 0)]), { ...lineForm, line: 'a' }),
    ).toBe('source-not-line');
    expect(issue(documentOf([point('p', 0, 0), line('l', 'a', 'b')]), lineForm)).toBe(
      'missing-source',
    );
    expect(
      issue(documentOf([point('p', 0, 0), point('a', 0, 0), line('l', 'a', 'b')]), lineForm),
    ).toBe('missing-source');
    expect(
      issue(
        documentOf([point('p', 0, 0), point('a', 0, 0), line('x', 'a', 'a'), line('l', 'x', 'a')]),
        lineForm,
      ),
    ).toBe('source-not-point');
    expect(issue(documentOf([point('p', 0, 0)]), twoPointMidpoint())).toBe('missing-source');
    expect(
      issue(
        documentOf([point('p', 0, 0), point('a', 0, 0), point('b', 4, 0), line('x', 'a', 'b')]),
        { ...twoPointMidpoint(), a: 'x' },
      ),
    ).toBe('source-not-point');
  });

  it('reports the target used as a source', () => {
    expect(
      issue(documentOf([point('p', 0, 0), point('b', 4, 0)]), { ...twoPointMidpoint(), a: 'p' }),
    ).toBe('target-source');
    expect(
      issue(documentOf([point('p', 0, 0), point('b', 4, 0), line('l', 'p', 'b')]), {
        id: 'm',
        type: 'midpoint',
        point: 'p',
        line: 'l',
      }),
    ).toBe('target-source');
  });

  it('reports coincident sources', () => {
    expect(
      issue(documentOf([point('p', 0, 0), point('a', 1, 1), point('b', 1, 1)]), twoPointMidpoint()),
    ).toBe('degenerate');
    expect(
      issue(
        documentOf([point('p', 0, 0), point('a', 1, 1), point('b', 1, 1), line('l', 'a', 'b')]),
        { id: 'm', type: 'midpoint', point: 'p', line: 'l' },
      ),
    ).toBe('degenerate');
  });

  it('reports a chained source', () => {
    const document = documentOf(
      [point('p', 0, 0), point('a', 0, 0), point('b', 4, 0)],
      [{ id: 'first', type: 'midpoint', point: 'a', a: 'b', b: 'p' }],
    );

    expect(issue(document, { ...twoPointMidpoint(), id: 'second' })).toBe('chain');
  });
});

describe('midpoint solver', () => {
  it('derives the target from a line without making it a variable', () => {
    const document = documentOf(
      [point('a', 0, 0, { fixed: true }), point('b', 10, 4), point('p', 0, 0), line('l', 'a', 'b')],
      [{ id: 'm', type: 'midpoint', point: 'p', line: 'l' }],
    );

    const solved = solveDocument(document).document;
    const target = getEntity(solved, 'p')!;

    expect(target).toMatchObject({ x: 5, y: 2 });
  });

  it('moves the target when a source moves, leaving the other source alone', () => {
    const document = documentOf(
      [point('a', 0, 0, { fixed: true }), point('b', 10, 0), point('p', 0, 0)],
      [twoPointMidpoint()],
    );

    const moved = executeCommand(document, {
      id: 'move',
      type: 'move_point',
      params: { id: 'b', x: 20, y: 0 },
    }).document;

    expect(getEntity(moved, 'b')).toMatchObject({ x: 20, y: 0 });
    expect(getEntity(moved, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(getEntity(moved, 'p')).toMatchObject({ x: 10, y: 0 });
  });

  it('exposes the derived coordinate to other constraints', () => {
    const document = documentOf(
      [
        point('a', 0, 0, { fixed: true }),
        point('b', 10, 0, { fixed: true }),
        point('p', 0, 0),
        point('c', 5, 5),
      ],
      [twoPointMidpoint(), { id: 'd', type: 'distance', a: 'p', b: 'c', value: 2 }],
    );

    const result = solve(
      document.entities.filter((entity): entity is PointEntity => entity.kind === 'point'),
      document.constraints,
    );
    const p = result.coordinates.get('p')!;
    const c = result.coordinates.get('c')!;

    expect(p).toEqual({ x: 5, y: 0 });
    expect(distance(p, c)).toBeCloseTo(2, 6);
  });

  it('is converged when every constraint is a midpoint', () => {
    const result = solve(
      [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
      [twoPointMidpoint()],
    );

    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(0);
  });

  it('rejects dangling targets and sources', () => {
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
        [twoPointMidpoint(), { ...twoPointMidpoint(), id: 'other' }],
      ),
    ).toThrow(/already owned by another derived relation/);
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
        [{ ...twoPointMidpoint(), a: 'missing' }],
      ),
    ).toThrow(/a source does not resolve/);
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
        [{ id: 'm', type: 'midpoint', point: 'missing', a: 'a', b: 'b' }],
      ),
    ).toThrow(/target references unknown point/);
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), line('l', 'a', 'b')],
        [{ id: 'm', type: 'midpoint', point: 'l', a: 'a', b: 'b' }],
      ),
    ).toThrow(/is not a point/);
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
        [{ id: 'm', type: 'midpoint', point: 'p', a: 'p', b: 'b' }],
      ),
    ).toThrow(/cannot be one of its sources/);
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
        [{ id: 'm', type: 'midpoint', point: 'p', a: 'a', b: 'a' }],
      ),
    ).toThrow(/sources are coincident/);
  });

  it('rejects a two-point source that is not a point', () => {
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0), line('l', 'a', 'b')],
        [{ id: 'm', type: 'midpoint', point: 'p', a: 'a', b: 'l' }],
      ),
    ).toThrow(/a source is not a point/);
  });

  it('rejects a chained midpoint in a hand-edited document', () => {
    expect(() =>
      solve(
        [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)],
        [
          { id: 'first', type: 'midpoint', point: 'a', a: 'b', b: 'p' },
          { id: 'second', type: 'midpoint', point: 'p', a: 'a', b: 'b' },
        ],
      ),
    ).toThrow(/a source is already a derived midpoint/);
  });

  it('rejects a source that is not a point or line', () => {
    const entities = [point('a', 0, 0), point('b', 4, 0), point('p', 0, 0), point('q', 0, 0)];
    const constraints: Constraint[] = [
      { id: 'm', type: 'midpoint', point: 'p', a: 'a', b: 'b' },
      { id: 'bad', type: 'midpoint', point: 'q', line: 'a' },
    ];
    expect(() => solve(entities as PointEntity[], constraints)).toThrow(
      /the line source is not a straight line/,
    );
  });
});

describe('midpoint command', () => {
  it('creates a line-form relation and pins the point on the next solve', () => {
    const document = executeCommand(lineMidpointDoc(), addPoint('p', 0, 0)).document;
    const result = executeCommand(document, addMidpoint('m', 'p', ['l']));

    expect(getConstraint(result.document, 'm')).toEqual({
      id: 'm',
      type: 'midpoint',
      point: 'p',
      line: 'l',
    });
    expect(getEntity(result.document, 'p')).toMatchObject({ x: 5, y: 2 });
    expect(result.inverse).toEqual({
      id: 'm',
      type: 'remove_constraint',
      params: { id: 'm' },
    });
  });

  it('creates a two-point relation', () => {
    const document = documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]);
    const result = executeCommand(document, addMidpoint('m', 'p', ['a', 'b']));

    expect(getConstraint(result.document, 'm')).toEqual({
      id: 'm',
      type: 'midpoint',
      point: 'p',
      a: 'a',
      b: 'b',
    });
    expect(getEntity(result.document, 'p')).toMatchObject({ x: 2, y: 0 });
  });

  it('keeps the owning piece', () => {
    const document = {
      ...documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      pieces: [{ id: 'piece', edges: [], allowances: [] }],
    };
    const command: Command = {
      id: 'm',
      type: 'add_constraint',
      params: { type: 'midpoint', entities: ['p', 'a', 'b'], piece: 'piece' },
    };

    expect(getConstraint(executeCommand(document, command).document, 'm')).toMatchObject({
      piece: 'piece',
    });
  });

  it('rejects a value on a midpoint', () => {
    const document = documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]);

    expect(() =>
      executeCommand(document, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'a', 'b'], value: 3 },
      }),
    ).toThrow('midpoint takes no value');
  });

  it('rejects the wrong entity count for either form', () => {
    const document = documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]);

    expect(() =>
      executeCommand(document, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p'] },
      }),
    ).toThrow('midpoint needs 2 or 3 entities, got 1');
    expect(() =>
      executeCommand(document, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'a', 'b', 'a'] },
      }),
    ).toThrow('midpoint needs 2 or 3 entities, got 4');
  });

  it('rejects an unknown target, a derived target and a chain', () => {
    const document = documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]);

    expect(() => executeCommand(document, addMidpoint('m', 'missing', ['a', 'b']))).toThrow(
      'midpoint: the point does not resolve',
    );
    expect(() =>
      executeCommand(documentOf([point('a', 0, 0), point('b', 4, 0), line('l', 'a', 'b')]), {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['l', 'a', 'b'] },
      }),
    ).toThrow('midpoint: the target must be a point');
  });

  it('rejects a point that is already derived', () => {
    const document = executeCommand(
      documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      addMidpoint('first', 'p', ['a', 'b']),
    ).document;

    expect(() => executeCommand(document, addMidpoint('second', 'p', ['a', 'b']))).toThrow(
      'This point is already derived; pick another point.',
    );
  });

  it('rejects a corner-round-derived target', () => {
    const rounded = applyCommand(
      documentOf([
        point('c', 0, 0),
        point('a', 100, 0),
        point('b', 0, 100),
        line('l1', 'c', 'a'),
        line('l2', 'c', 'b'),
      ]),
      { id: 'r', type: 'add_corner_round', params: { first: 'l1', second: 'l2', radius: 10 } },
    ).document;
    const tangent = cornerRounds(rounded)[0]!.ends[0]!.tangent;

    expect(() => executeCommand(rounded, addMidpoint('m', tangent, ['a', 'b']))).toThrow(
      'This point is already derived; pick another point.',
    );
  });

  it('rejects a line source that is not a line and a degenerate one', () => {
    const document = documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]);

    expect(() =>
      executeCommand(document, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'a'] },
      }),
    ).toThrow('midpoint: the source must be a straight line');
    expect(() =>
      executeCommand(document, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'missing'] },
      }),
    ).toThrow('midpoint: a source does not resolve');
    expect(() =>
      executeCommand(documentOf([point('p', 0, 0), point('a', 0, 0), point('b', 4, 0)]), {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'missing', 'b'] },
      }),
    ).toThrow('midpoint: a source does not resolve');
    expect(() =>
      executeCommand(
        documentOf([
          point('p', 0, 0),
          point('a', 0, 0),
          point('b', 4, 0),
          line('x', 'a', 'b'),
          line('l', 'x', 'a'),
        ]),
        {
          id: 'm',
          type: 'add_constraint',
          params: { type: 'midpoint', entities: ['p', 'l'] },
        },
      ),
    ).toThrow('midpoint: sources must be points');
    expect(() =>
      executeCommand(
        documentOf([point('a', 0, 0), point('b', 0, 0), point('p', 0, 0)]),
        addMidpoint('m', 'p', ['a', 'b']),
      ),
    ).toThrow('midpoint: the sources must be distinct');
  });

  it('rejects a target that is a source and a chained source', () => {
    const document = documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]);

    expect(() =>
      executeCommand(document, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'p', 'b'] },
      }),
    ).toThrow('midpoint: the point cannot be one of its sources');

    const chained = executeCommand(document, addMidpoint('first', 'a', ['p', 'b'])).document;
    expect(() => executeCommand(chained, addMidpoint('second', 'p', ['a', 'b']))).toThrow(
      'midpoint: a source is already a midpoint',
    );
  });

  it('rejects a target from another piece', () => {
    const document = {
      ...documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      pieces: [
        { id: 'one', edges: [], allowances: [] },
        { id: 'two', edges: [], allowances: [] },
      ],
    };
    const owned = {
      ...document,
      entities: [
        { ...point('a', 0, 0), piece: 'one' },
        { ...point('b', 4, 0), piece: 'one' },
        { ...point('p', 0, 0), piece: 'two' },
      ],
    };

    expect(() =>
      executeCommand(owned, {
        id: 'm',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['p', 'a', 'b'], piece: 'one' },
      }),
    ).toThrow('entity p belongs to another piece');
  });

  it('returns a no-op for a relation id that already exists', () => {
    const built = executeCommand(
      documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      addMidpoint('m', 'p', ['a', 'b']),
    ).document;

    const applied = applyCommand(built, addMidpoint('m', 'p', ['a', 'b']));

    expect(applied.document).toBe(built);
    expect(applied.inverse).toBeNull();
  });

  it('rejects moving the derived point with a clear message', () => {
    const document = executeCommand(
      documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      addMidpoint('m', 'p', ['a', 'b']),
    ).document;

    expect(() =>
      executeCommand(document, { id: 'move', type: 'move_point', params: { id: 'p', x: 1, y: 1 } }),
    ).toThrow('This point is fixed at the midpoint; move its source line or points instead.');
  });

  it('frees the point when the relation is removed and restores it on undo', () => {
    const built = executeCommand(
      documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      addMidpoint('m', 'p', ['a', 'b']),
    ).document;
    const removed = executeCommand(built, {
      id: 'remove',
      type: 'remove_constraint',
      params: { id: 'm' },
    });
    const freed = getEntity(removed.document, 'p')!;

    expect(removed.document.constraints).toHaveLength(0);
    expect(freed).toMatchObject({ x: 2, y: 0 });

    const moved = executeCommand(removed.document, {
      id: 'move',
      type: 'move_point',
      params: { id: 'p', x: 3, y: 3 },
    }).document;
    expect(getEntity(moved, 'p')).toMatchObject({ x: 3, y: 3 });

    expect(removed.inverse).toEqual({
      id: 'm',
      type: 'add_constraint',
      params: { type: 'midpoint', entities: ['p', 'a', 'b'] },
    });
  });

  it('recreates a line-form relation from the removal inverse', () => {
    const built = executeCommand(lineMidpointDoc(), addMidpoint('m', 'p', ['l'])).document;
    const removed = executeCommand(built, {
      id: 'remove',
      type: 'remove_constraint',
      params: { id: 'm' },
    });

    expect(removed.inverse).toEqual({
      id: 'm',
      type: 'add_constraint',
      params: { type: 'midpoint', entities: ['p', 'l'] },
    });
  });

  it('cascades when the source line or the target is deleted', () => {
    const built = executeCommand(
      documentOf([point('a', 0, 0), point('b', 10, 0), point('p', 0, 0), line('l', 'a', 'b')]),
      addMidpoint('m', 'p', ['l']),
    ).document;

    const withoutLine = executeCommand(built, {
      id: 'delete',
      type: 'delete_entity',
      params: { id: 'l' },
    }).document;
    expect(withoutLine.constraints).toHaveLength(0);
    expect(getEntity(withoutLine, 'p')).toMatchObject({ x: 5, y: 0 });

    const withoutTarget = executeCommand(built, {
      id: 'delete',
      type: 'delete_entity',
      params: { id: 'p' },
    }).document;
    expect(withoutTarget.constraints).toHaveLength(0);
  });

  it('rejects updating a midpoint', () => {
    const built = executeCommand(
      documentOf([point('a', 0, 0), point('b', 4, 0), point('p', 0, 0)]),
      addMidpoint('m', 'p', ['a', 'b']),
    ).document;

    expect(() =>
      executeCommand(built, {
        id: 'update',
        type: 'update_constraint',
        params: { id: 'm', value: 3 },
      }),
    ).toThrow('constraint m is a midpoint, expected distance or angle');
  });

  it('follows a corner-round trim and its removal', () => {
    const rounded = executeCommand(
      documentOf([
        point('c', 0, 0),
        point('a', 100, 0),
        point('b', 0, 100),
        line('l1', 'c', 'a'),
        line('l2', 'c', 'b'),
      ]),
      { id: 'r', type: 'add_corner_round', params: { first: 'l1', second: 'l2', radius: 10 } },
    ).document;
    const trimmed = executeCommand(rounded, addPoint('p', 0, 0)).document;
    const built = executeCommand(trimmed, addMidpoint('m', 'p', ['l1'])).document;

    expect(getEntity(built, 'p')!.x).toBeCloseTo(55, 6);

    const restored = executeCommand(built, {
      id: 'remove-round',
      type: 'remove_corner_round',
      params: { id: 'r' },
    }).document;
    expect(getEntity(restored, 'p')!.x).toBeCloseTo(50, 6);

    const reraised = executeCommand(restored, {
      id: 'r2',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l2', radius: 20 },
    }).document;
    expect(getEntity(reraised, 'p')!.x).toBeCloseTo(60, 6);
  });
});

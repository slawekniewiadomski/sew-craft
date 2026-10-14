import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  CommandExecutionError,
  CommandValidationError,
  createEmptyDocument,
  executeCommand,
  getConstraint,
  getEntity,
  solveDocument,
  type Command,
  type Constraint,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '../src/index.js';

const point = (
  id: string,
  x: number,
  y: number,
  options: { construction?: boolean; fixed?: boolean } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: options.construction ?? false,
  fixed: options.fixed ?? false,
});

const documentOf = (entities: Entity[], constraints: Constraint[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  constraints,
});

const addPointCommand = (id: string, x: number, y: number, construction = false): Command => ({
  id,
  type: 'add_point',
  params: { x, y, construction },
});

const addLineCommand = (id: string, start: string, end: string, construction = false): Command => ({
  id,
  type: 'add_line',
  params: { start, end, construction },
});

const addCurveCommand = (id: string, p0: string, p1: string, p2: string, p3: string): Command => ({
  id,
  type: 'add_curve',
  params: { p0, p1, p2, p3 },
});

const deleteCommand = (id: string): Command => ({ id, type: 'delete_entity', params: { id } });

const setConstructionCommand = (id: string, target: string, construction: boolean): Command => ({
  id,
  type: 'set_construction',
  params: { id: target, construction },
});

const addConstraintCommand = (
  id: string,
  type: Constraint['type'],
  entities: string[],
  value?: number,
): Command =>
  value === undefined
    ? { id, type: 'add_constraint', params: { type, entities } }
    : { id, type: 'add_constraint', params: { type, entities, value } };

const removeConstraintCommand = (id: string): Command => ({
  id,
  type: 'remove_constraint',
  params: { id },
});

const seamCommand = (id: string, piece: string, edge: string, width: number): Command => ({
  id,
  type: 'add_seam_allowance',
  params: { piece, edge, width },
});

const solveCommand = (id: string): Command => ({ id, type: 'solve', params: {} });

const unchanged = (document: PatternDocument, command: Command): void => {
  const snapshot = structuredClone(document);
  expect(() => applyCommand(document, command)).toThrow();
  expect(document).toEqual(snapshot);
};

describe('add_point', () => {
  it('creates a point whose id is the command id', () => {
    const document = createEmptyDocument();
    const applied = applyCommand(document, addPointCommand('p1', 3, 4));

    expect(applied.document.entities).toEqual([
      { id: 'p1', kind: 'point', x: 3, y: 4, construction: false, fixed: false },
    ]);
    expect(getEntity(applied.document, 'p1')?.kind).toBe('point');
  });

  it('honours the construction flag', () => {
    const applied = applyCommand(createEmptyDocument(), addPointCommand('p1', 0, 0, true));

    expect(getEntity(applied.document, 'p1')).toMatchObject({ construction: true });
  });

  it('is idempotent', () => {
    const command = addPointCommand('p1', 3, 4);
    const first = applyCommand(createEmptyDocument(), command);
    const second = applyCommand(first.document, command);

    expect(second.document).toBe(first.document);
    expect(second.inverse).toBeNull();
  });

  it('undone by its inverse', () => {
    const document = createEmptyDocument();
    const applied = applyCommand(document, addPointCommand('p1', 3, 4));

    expect(applied.inverse).toEqual(deleteCommand('p1'));
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('rejects non-finite coordinates without mutating', () => {
    unchanged(createEmptyDocument(), addPointCommand('p1', Number.NaN, 0));
  });

  it('defaults construction to false when omitted', () => {
    const command = { id: 'p1', type: 'add_point', params: { x: 1, y: 2 } } as Command;
    const applied = applyCommand(createEmptyDocument(), command);

    expect(getEntity(applied.document, 'p1')).toMatchObject({ construction: false });
  });
});

describe('add_line', () => {
  const document = documentOf([point('a', 0, 0), point('b', 10, 0)]);

  it('creates a segment between two points', () => {
    const applied = applyCommand(document, addLineCommand('l1', 'a', 'b'));

    expect(getEntity(applied.document, 'l1')).toEqual({
      id: 'l1',
      kind: 'line',
      start: 'a',
      end: 'b',
      construction: false,
    });
    expect(applied.inverse).toEqual(deleteCommand('l1'));
  });

  it('creates construction lines via add_construction_line', () => {
    const command: Command = {
      id: 'l1',
      type: 'add_construction_line',
      params: { start: 'a', end: 'b' },
    };
    const applied = applyCommand(document, command);

    expect(getEntity(applied.document, 'l1')).toMatchObject({ construction: true });
  });

  it('is idempotent', () => {
    const command = addLineCommand('l1', 'a', 'b');
    const first = applyCommand(document, command);

    expect(applyCommand(first.document, command).document).toBe(first.document);
  });

  it('rejects a reference to a missing point without mutating', () => {
    unchanged(document, addLineCommand('l1', 'a', 'missing'));
  });

  it('rejects a reference to a non-point entity without mutating', () => {
    const withLine = documentOf([
      point('a', 0, 0),
      point('b', 1, 0),
      {
        id: 'l1',
        kind: 'line',
        start: 'a',
        end: 'b',
        construction: false,
      } satisfies LineEntity,
    ]);

    unchanged(withLine, addLineCommand('l2', 'l1', 'a'));
  });

  it('undone by its inverse', () => {
    const applied = applyCommand(document, addLineCommand('l1', 'a', 'b'));

    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('defaults construction to false when omitted', () => {
    const command = { id: 'l1', type: 'add_line', params: { start: 'a', end: 'b' } } as Command;
    const applied = applyCommand(document, command);

    expect(getEntity(applied.document, 'l1')).toMatchObject({ construction: false });
  });
});

describe('set_construction', () => {
  const document = documentOf([
    point('a', 0, 0),
    point('b', 10, 0),
    { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
  ]);

  it('converts a cut edge to construction and back via its inverse', () => {
    const applied = applyCommand(document, setConstructionCommand('cmd', 'l1', true));

    expect(getEntity(applied.document, 'l1')).toMatchObject({ construction: true });
    expect(applied.inverse).toEqual(setConstructionCommand('cmd', 'l1', false));
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('converts construction geometry back into a cut edge', () => {
    const withConstruction = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: true },
    ]);

    const applied = applyCommand(withConstruction, setConstructionCommand('cmd', 'l1', false));

    expect(getEntity(applied.document, 'l1')).toMatchObject({ construction: false });
    expect(applied.inverse).toEqual(setConstructionCommand('cmd', 'l1', true));
  });

  it('toggles points as well as edges', () => {
    const applied = applyCommand(document, setConstructionCommand('cmd', 'a', true));

    expect(getEntity(applied.document, 'a')).toMatchObject({ construction: true });
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('is a no-op when the entity already has the requested value', () => {
    const applied = applyCommand(document, setConstructionCommand('cmd', 'l1', false));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('rejects an unknown entity without mutating', () => {
    unchanged(document, setConstructionCommand('cmd', 'missing', true));
  });
});

describe('add_curve', () => {
  const document = documentOf([
    point('p0', 0, 0),
    point('p1', 1, 0),
    point('p2', 2, 1),
    point('p3', 3, 1),
  ]);

  it('creates a cubic Bézier from four control points', () => {
    const applied = applyCommand(document, addCurveCommand('c1', 'p0', 'p1', 'p2', 'p3'));

    expect(getEntity(applied.document, 'c1')).toEqual({
      id: 'c1',
      kind: 'curve',
      p0: 'p0',
      p1: 'p1',
      p2: 'p2',
      p3: 'p3',
      construction: false,
    });
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('rejects repeated control points without mutating', () => {
    unchanged(document, addCurveCommand('c1', 'p0', 'p1', 'p1', 'p3'));
  });

  it('rejects an unknown control point without mutating', () => {
    unchanged(document, addCurveCommand('c1', 'p0', 'p1', 'p2', 'missing'));
  });

  it('is idempotent', () => {
    const command = addCurveCommand('c1', 'p0', 'p1', 'p2', 'p3');
    const first = applyCommand(document, command);

    expect(applyCommand(first.document, command).document).toBe(first.document);
  });
});

describe('delete_entity', () => {
  it('removes the entity and cascades to referencing constraints', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 10, 0), point('c', 0, 10)],
      [
        { id: 'ab', type: 'distance', a: 'a', b: 'b', value: 10 },
        { id: 'bc', type: 'vertical', a: 'b', b: 'c' },
      ],
    );

    const applied = applyCommand(document, deleteCommand('a'));

    expect(getEntity(applied.document, 'a')).toBeUndefined();
    expect(applied.document.constraints.map((constraint) => constraint.id)).toEqual(['bc']);
    expect(applied.inverse).toBeNull();
  });

  it('keeps constraints that do not reference the deleted entity', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 10, 0)],
      [{ id: 'ab', type: 'distance', a: 'a', b: 'b', value: 10 }],
    );

    const applied = applyCommand(document, deleteCommand('a'));

    expect(applied.document.constraints).toEqual([]);
  });

  it('is idempotent for an unknown id', () => {
    const document = createEmptyDocument();
    const applied = applyCommand(document, deleteCommand('missing'));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });
});

describe('add_constraint', () => {
  const document = documentOf([
    point('a', 0, 0),
    point('b', 10, 0),
    point('c', 10, 10),
    point('d', 0, 10),
  ]);

  it('builds a coincident constraint', () => {
    const applied = applyCommand(document, addConstraintCommand('k', 'coincident', ['a', 'b']));

    expect(getConstraint(applied.document, 'k')).toEqual({
      id: 'k',
      type: 'coincident',
      a: 'a',
      b: 'b',
    });
  });

  it('builds horizontal and vertical constraints', () => {
    const horizontal = applyCommand(document, addConstraintCommand('h', 'horizontal', ['a', 'b']));
    const vertical = applyCommand(document, addConstraintCommand('v', 'vertical', ['b', 'c']));

    expect(getConstraint(horizontal.document, 'h')).toEqual({
      id: 'h',
      type: 'horizontal',
      a: 'a',
      b: 'b',
    });
    expect(getConstraint(vertical.document, 'v')).toEqual({
      id: 'v',
      type: 'vertical',
      a: 'b',
      b: 'c',
    });
  });

  it('maps point_on_line entities in order', () => {
    const applied = applyCommand(
      document,
      addConstraintCommand('k', 'point_on_line', ['a', 'b', 'c']),
    );

    expect(getConstraint(applied.document, 'k')).toEqual({
      id: 'k',
      type: 'point_on_line',
      point: 'a',
      a: 'b',
      b: 'c',
    });
  });

  it('maps distance and angle values', () => {
    const distance = applyCommand(document, addConstraintCommand('d', 'distance', ['a', 'b'], 25));
    const angle = applyCommand(
      document,
      addConstraintCommand('g', 'angle', ['a', 'b', 'c'], Math.PI / 2),
    );

    expect(getConstraint(distance.document, 'd')).toEqual({
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 25,
    });
    expect(getConstraint(angle.document, 'g')).toEqual({
      id: 'g',
      type: 'angle',
      a: 'a',
      b: 'b',
      c: 'c',
      value: Math.PI / 2,
    });
  });

  it('maps equal entities in order', () => {
    const applied = applyCommand(
      document,
      addConstraintCommand('e', 'equal', ['a', 'b', 'c', 'd']),
    );

    expect(getConstraint(applied.document, 'e')).toEqual({
      id: 'e',
      type: 'equal',
      a1: 'a',
      a2: 'b',
      b1: 'c',
      b2: 'd',
    });
  });

  it('is idempotent', () => {
    const command = addConstraintCommand('k', 'coincident', ['a', 'b']);
    const first = applyCommand(document, command);

    expect(applyCommand(first.document, command).document).toBe(first.document);
  });

  it('rejects a wrong entity count without mutating', () => {
    unchanged(document, addConstraintCommand('k', 'equal', ['a', 'b']));
  });

  it('rejects unknown and non-point entities without mutating', () => {
    const withLine = documentOf([
      point('a', 0, 0),
      point('b', 1, 0),
      {
        id: 'l1',
        kind: 'line',
        start: 'a',
        end: 'b',
        construction: false,
      } satisfies LineEntity,
    ]);

    unchanged(document, addConstraintCommand('k', 'coincident', ['a', 'missing']));
    unchanged(withLine, addConstraintCommand('k', 'coincident', ['a', 'l1']));
  });

  it('rejects invalid distance values without mutating', () => {
    unchanged(document, addConstraintCommand('d', 'distance', ['a', 'b'], 0));
    unchanged(document, addConstraintCommand('d', 'distance', ['a', 'b'], -5));
    unchanged(document, addConstraintCommand('d', 'distance', ['a', 'b'], Number.NaN));
    unchanged(document, addConstraintCommand('d', 'distance', ['a', 'b']));
  });

  it('rejects invalid angle values without mutating', () => {
    unchanged(
      document,
      addConstraintCommand('g', 'angle', ['a', 'b', 'c'], Number.POSITIVE_INFINITY),
    );
    unchanged(document, addConstraintCommand('g', 'angle', ['a', 'b', 'c']));
  });

  it('rejects an unknown constraint type without mutating', () => {
    const command = {
      id: 'x',
      type: 'add_constraint',
      params: { type: 'bogus', entities: ['a', 'b'] },
    } as unknown as Command;

    unchanged(document, command);
  });
});

describe('remove_constraint', () => {
  it('removes the constraint and reconstructs its inverse', () => {
    const constraint: Constraint = { id: 'd', type: 'distance', a: 'a', b: 'b', value: 25 };
    const document = documentOf([point('a', 0, 0), point('b', 10, 0)], [constraint]);

    const applied = applyCommand(document, removeConstraintCommand('d'));

    expect(applied.document.constraints).toEqual([]);
    expect(applied.inverse).toEqual(addConstraintCommand('d', 'distance', ['a', 'b'], 25));
  });

  it('is idempotent for an unknown id', () => {
    const document = createEmptyDocument();
    const applied = applyCommand(document, removeConstraintCommand('missing'));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('is the mutual inverse of add_constraint', () => {
    const document = documentOf([point('a', 0, 0), point('b', 10, 0), point('c', 0, 10)]);
    const add = addConstraintCommand('k', 'angle', ['a', 'b', 'c'], Math.PI / 4);

    const added = applyCommand(document, add);
    expect(added.inverse).toEqual(removeConstraintCommand('k'));

    const removed = applyCommand(added.document, added.inverse!);
    expect(removed.document).toEqual(document);
    expect(removed.inverse).toEqual(add);

    const reAdded = applyCommand(removed.document, removed.inverse!);
    expect(reAdded.document).toEqual(added.document);
  });

  it('reconstructs a point_on_line inverse in semantic order', () => {
    const document = documentOf(
      [point('p', 0, 0), point('a', 1, 0), point('b', 2, 0)],
      [{ id: 'k', type: 'point_on_line', point: 'p', a: 'a', b: 'b' }],
    );

    const applied = applyCommand(document, removeConstraintCommand('k'));

    expect(applied.inverse).toEqual(addConstraintCommand('k', 'point_on_line', ['p', 'a', 'b']));
  });

  it('reconstructs an equal inverse in semantic order', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 1, 0), point('c', 0, 1), point('d', 1, 1)],
      [{ id: 'k', type: 'equal', a1: 'a', a2: 'b', b1: 'c', b2: 'd' }],
    );

    const applied = applyCommand(document, removeConstraintCommand('k'));

    expect(applied.inverse).toEqual(addConstraintCommand('k', 'equal', ['a', 'b', 'c', 'd']));
  });

  it('reconstructs coincident/horizontal/vertical inverses', () => {
    const document = documentOf(
      [point('a', 0, 0), point('b', 1, 0), point('c', 0, 1)],
      [
        { id: 'co', type: 'coincident', a: 'a', b: 'b' },
        { id: 'h', type: 'horizontal', a: 'a', b: 'b' },
        { id: 'v', type: 'vertical', a: 'b', b: 'c' },
      ],
    );

    expect(applyCommand(document, removeConstraintCommand('co')).inverse).toEqual(
      addConstraintCommand('co', 'coincident', ['a', 'b']),
    );
    expect(applyCommand(document, removeConstraintCommand('h')).inverse).toEqual(
      addConstraintCommand('h', 'horizontal', ['a', 'b']),
    );
    expect(applyCommand(document, removeConstraintCommand('v')).inverse).toEqual(
      addConstraintCommand('v', 'vertical', ['b', 'c']),
    );
  });
});

describe('add_seam_allowance', () => {
  const document = documentOf([point('a', 0, 0), point('b', 10, 0)], []);
  const withLine = documentOf([
    point('a', 0, 0),
    point('b', 10, 0),
    { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
  ]);

  it('rejects because the model has no pieces yet', () => {
    unchanged(withLine, seamCommand('s', 'l1', 'l1', 10));
    unchanged(withLine, seamCommand('s', 'missing-piece', 'l1', 10));
  });

  it('rejects invalid width and edge references without mutating', () => {
    unchanged(document, seamCommand('s', 'p', 'missing-edge', 10));
    unchanged(document, seamCommand('s', 'p', 'a', 10));
    unchanged(document, seamCommand('s', 'p', 'a', Number.NaN));
  });
});

describe('solve command', () => {
  it('leaves the document unchanged and has no inverse', () => {
    const document = documentOf([point('a', 0, 0)]);
    const applied = applyCommand(document, solveCommand('s'));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });
});

describe('executeCommand', () => {
  it('applies the command and writes solved coordinates back', () => {
    const document = documentOf([point('a', 0, 0, { fixed: true }), point('b', 10, 0)]);

    const result = executeCommand(document, addConstraintCommand('d', 'distance', ['a', 'b'], 100));

    expect(result.solveResult.converged).toBe(true);
    const solved = getEntity(result.document, 'b');
    expect(solved?.kind).toBe('point');
    expect(solved).toMatchObject({ y: 0 });
    expect(solved).toHaveProperty('x', expect.closeTo(100, 6));
    expect(result.inverse).toEqual(removeConstraintCommand('d'));
  });

  it('throws and leaves the document untouched when the solver does not converge', () => {
    const document = documentOf([
      point('a', 0, 0, { fixed: true }),
      point('b', 10, 0, { fixed: true }),
    ]);
    const snapshot = structuredClone(document);

    expect(() =>
      executeCommand(document, addConstraintCommand('d', 'distance', ['a', 'b'], 100)),
    ).toThrow(CommandExecutionError);
    expect(document).toEqual(snapshot);
  });

  it('throws for an invalid command without mutating', () => {
    const document = documentOf([point('a', 0, 0)]);

    expect(() => executeCommand(document, addLineCommand('l', 'a', 'missing'))).toThrow(
      CommandValidationError,
    );
    expect(document.entities).toHaveLength(1);
  });

  it('is idempotent: re-executing a command changes nothing', () => {
    const command = addPointCommand('p', 1, 2);
    const first = executeCommand(createEmptyDocument(), command);
    const second = executeCommand(first.document, command);

    expect(second.document).toEqual(first.document);
    expect(second.inverse).toBeNull();
  });

  it('replaying the same ordered commands reproduces the same document', () => {
    const commands: Command[] = [
      addPointCommand('a', 0, 0, false),
      addPointCommand('b', 60, 0),
      addPointCommand('c', 60, 40),
      addLineCommand('ab', 'a', 'b'),
      addLineCommand('bc', 'b', 'c'),
      addConstraintCommand('bottom', 'horizontal', ['a', 'b']),
      addConstraintCommand('right', 'vertical', ['b', 'c']),
      addConstraintCommand('width', 'distance', ['a', 'b'], 80),
    ];

    const run = (): PatternDocument =>
      commands.reduce(
        (document, command) => executeCommand(document, command).document,
        createEmptyDocument(),
      );

    expect(run()).toEqual(run());
  });
});

describe('solveDocument', () => {
  it('writes solved coordinates back immutably', () => {
    const document = documentOf([point('a', 0, 0, { fixed: true }), point('b', 10, 0)]);
    const constraints = [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 50 }] as const;
    const withConstraint: PatternDocument = { ...document, constraints: [...constraints] };

    const solved = solveDocument(withConstraint);

    expect(solved.result.converged).toBe(true);
    expect(getEntity(solved.document, 'b')).toHaveProperty('x', expect.closeTo(50, 6));
    expect(getEntity(withConstraint, 'b')).toMatchObject({ x: 10 });
    expect(solved.document).not.toBe(withConstraint);
  });

  it('returns the original document when it does not converge', () => {
    const document = documentOf(
      [point('a', 0, 0, { fixed: true }), point('b', 10, 0, { fixed: true })],
      [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 100 }],
    );

    const solved = solveDocument(document);

    expect(solved.result.converged).toBe(false);
    expect(solved.document).toBe(document);
  });
});

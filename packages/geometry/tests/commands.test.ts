import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  CommandExecutionError,
  CommandValidationError,
  createEmptyDocument,
  DEFAULT_DIMENSION_OFFSET,
  DEFAULT_SEAM_ALLOWANCE,
  executeCommand,
  getConstraint,
  getEntity,
  getSeam,
  MIN_BULGE,
  seamForEdge,
  solveDocument,
  type Command,
  type Constraint,
  type DimensionOrientation,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Seam,
  type SeamSide,
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

const documentOf = (
  entities: Entity[],
  constraints: Constraint[] = [],
  seams: Seam[] = [],
): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  constraints,
  seams,
});

const addPointCommand = (id: string, x: number, y: number, construction = false): Command => ({
  id,
  type: 'add_point',
  params: { x, y, construction },
});

const movePointCommand = (id: string, point: string, x: number, y: number): Command => ({
  id,
  type: 'move_point',
  params: { id: point, x, y },
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

const addArcCommand = (
  id: string,
  start: string,
  end: string,
  through: string,
  construction = false,
): Command => ({
  id,
  type: 'add_arc',
  params: { start, end, through, construction },
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

const updateConstraintCommand = (
  id: string,
  params: {
    value?: number | null;
    reference?: string | null;
    orientation?: DimensionOrientation;
    offset?: number;
  },
): Command => ({ id: 'update', type: 'update_constraint', params: { id, ...params } });

const seamCommand = (id: string, edge: string, width?: number, side?: SeamSide): Command => ({
  id,
  type: 'add_seam_allowance',
  params: {
    edge,
    ...(width === undefined ? {} : { width }),
    ...(side === undefined ? {} : { side }),
  },
});

const removeSeamCommand = (id: string): Command => ({
  id,
  type: 'remove_seam_allowance',
  params: { id },
});

const setSeamCommand = (id: string, width: number, side?: SeamSide): Command => ({
  id: 'set',
  type: 'set_seam_allowance',
  params: { id, width, ...(side === undefined ? {} : { side }) },
});

const setSeamSideCommand = (id: string, side: SeamSide): Command => ({
  id: 'set',
  type: 'set_seam_allowance',
  params: { id, side },
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

describe('move_point', () => {
  const document = documentOf([point('a', 0, 0), point('b', 10, 0)]);

  it('moves the point and returns an inverse that restores it', () => {
    const applied = applyCommand(document, movePointCommand('m', 'a', 5, 7));

    expect(getEntity(applied.document, 'a')).toMatchObject({ x: 5, y: 7 });
    expect(getEntity(applied.document, 'b')).toMatchObject({ x: 10, y: 0 });
    expect(applied.inverse).toEqual(movePointCommand('m', 'a', 0, 0));
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('does not mutate the input document', () => {
    const snapshot = structuredClone(document);
    applyCommand(document, movePointCommand('m', 'a', 5, 7));

    expect(document).toEqual(snapshot);
  });

  it('is idempotent when the point is already at the target', () => {
    const applied = applyCommand(document, movePointCommand('m', 'a', 0, 0));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('rejects an unknown point without mutating', () => {
    unchanged(document, movePointCommand('m', 'missing', 1, 1));
  });

  it('rejects a non-point entity without mutating', () => {
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

    unchanged(withLine, movePointCommand('m', 'l1', 1, 1));
  });

  it('rejects non-finite coordinates without mutating', () => {
    unchanged(document, movePointCommand('m', 'a', Number.NaN, 0));
    unchanged(document, movePointCommand('m', 'a', 0, Number.POSITIVE_INFINITY));
  });

  it('re-solves constrained points after a move', () => {
    const constrained = documentOf(
      [point('a', 0, 0, { fixed: true }), point('b', 10, 0)],
      [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 40 }],
    );

    const result = executeCommand(constrained, movePointCommand('m', 'b', 30, 25));

    expect(result.solveResult.converged).toBe(true);
    const solved = getEntity(result.document, 'b');
    if (solved?.kind !== 'point') throw new Error('expected a point');
    expect(Math.hypot(solved.x, solved.y)).toBeCloseTo(40, 6);
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

describe('add_arc', () => {
  const document = documentOf([
    point('s', -10, 0),
    point('e', 10, 0),
    point('t', 0, 10),
    point('near', 5, MIN_BULGE / 2),
    point('collinear', 5, 0),
  ]);

  it('creates an arc through three points, with the inverse removing it again', () => {
    const applied = applyCommand(document, addArcCommand('a1', 's', 'e', 't'));

    expect(getEntity(applied.document, 'a1')).toEqual({
      id: 'a1',
      kind: 'arc',
      start: 's',
      end: 'e',
      through: 't',
      construction: false,
    });
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('honours the construction flag and defaults it to false when omitted', () => {
    const guide = applyCommand(document, addArcCommand('a1', 's', 'e', 't', true));
    const plain = applyCommand(document, {
      id: 'a2',
      type: 'add_arc',
      params: { start: 's', end: 'e', through: 't' },
    });

    expect(getEntity(guide.document, 'a1')).toMatchObject({ construction: true });
    expect(getEntity(plain.document, 'a2')).toMatchObject({ construction: false });
  });

  it('rejects a repeated point, an unknown point and a non-point reference', () => {
    const withLine = documentOf([
      point('s', -10, 0),
      { id: 'l', kind: 'line', start: 's', end: 's', construction: false },
    ]);

    unchanged(document, addArcCommand('a1', 's', 's', 't'));
    unchanged(document, addArcCommand('a1', 's', 'e', 's'));
    unchanged(document, addArcCommand('a1', 's', 'e', 'missing'));
    unchanged(withLine, addArcCommand('a1', 's', 'e', 'l'));
  });

  it('rejects a through point on or within MIN_BULGE of the chord', () => {
    unchanged(document, addArcCommand('a1', 's', 'e', 'collinear'));
    unchanged(document, addArcCommand('a1', 's', 'e', 'near'));
  });

  it('rejects a corner-round derived point', () => {
    const rounded = applyCommand(
      documentOf([
        point('a', 0, 0),
        point('b', 100, 0),
        point('d', 0, 100),
        { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
        { id: 'l2', kind: 'line', start: 'a', end: 'd', construction: false },
      ]),
      { id: 'r1', type: 'add_corner_round', params: { first: 'l1', second: 'l2', radius: 10 } },
    ).document;

    unchanged(rounded, addArcCommand('a1', 'r1:a', 'b', 'd'));
  });

  it('is idempotent', () => {
    const command = addArcCommand('a1', 's', 'e', 't');
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

  it('cascades to a seam allowance attached to the deleted edge', () => {
    const document = documentOf(
      [
        point('a', 0, 0),
        point('b', 10, 0),
        { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
      ],
      [],
      [{ id: 's', edge: 'l1', width: 10 }],
    );

    const applied = applyCommand(document, deleteCommand('l1'));

    expect(applied.document.seams).toEqual([]);
    expect(getEntity(applied.document, 'l1')).toBeUndefined();
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
    unchanged(document, {
      id: 'd',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: null },
    } as unknown as Command);
  });

  it('creates a driven distance when the value is omitted', () => {
    const applied = applyCommand(document, addConstraintCommand('m', 'distance', ['a', 'b']));

    const constraint = getConstraint(applied.document, 'm');
    expect(constraint).toEqual({ id: 'm', type: 'distance', a: 'a', b: 'b' });
    expect(constraint).not.toHaveProperty('value');
    expect(applied.inverse).toEqual(removeConstraintCommand('m'));
  });

  it('creates a driven distance with explicit presentation fields', () => {
    const applied = applyCommand(document, {
      id: 'm',
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: ['a', 'b'],
        orientation: 'horizontal',
        offset: 4,
      },
    });

    expect(getConstraint(applied.document, 'm')).toEqual({
      id: 'm',
      type: 'distance',
      a: 'a',
      b: 'b',
      orientation: 'horizontal',
      offset: 4,
    });
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

  it('maps distance orientation and offset', () => {
    const command: Command = {
      id: 'd',
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: ['a', 'b'],
        value: 25,
        orientation: 'horizontal',
        offset: -4,
      },
    };

    const applied = applyCommand(document, command);

    expect(getConstraint(applied.document, 'd')).toEqual({
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 25,
      orientation: 'horizontal',
      offset: -4,
    });
    expect(applied.inverse).toEqual(removeConstraintCommand('d'));
  });

  it('rejects presentation fields on non-distance constraints', () => {
    unchanged(document, {
      id: 'k',
      type: 'add_constraint',
      params: { type: 'coincident', entities: ['a', 'b'], orientation: 'horizontal' },
    } as Command);
    unchanged(document, {
      id: 'k',
      type: 'add_constraint',
      params: { type: 'coincident', entities: ['a', 'b'], offset: 5 },
    } as Command);
  });

  it('rejects an invalid orientation or offset without mutating', () => {
    unchanged(document, {
      id: 'd',
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: ['a', 'b'],
        value: 25,
        orientation: 'diagonal',
      },
    } as unknown as Command);
    unchanged(document, {
      id: 'd',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: 25, offset: Number.NaN },
    } as Command);
  });
});

describe('update_constraint', () => {
  const constraints: Constraint[] = [
    { id: 'd', type: 'distance', a: 'a', b: 'b', value: 25, orientation: 'aligned', offset: 10 },
    { id: 'g', type: 'angle', a: 'a', b: 'b', c: 'c', value: Math.PI / 4 },
    { id: 'h', type: 'horizontal', a: 'a', b: 'b' },
  ];
  const document = documentOf(
    [point('a', 0, 0), point('b', 10, 0), point('c', 10, 10)],
    constraints,
  );

  it('updates a value, orientation and offset together', () => {
    const applied = applyCommand(
      document,
      updateConstraintCommand('d', { value: 40, orientation: 'horizontal', offset: -6 }),
    );

    expect(getConstraint(applied.document, 'd')).toEqual({
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 40,
      orientation: 'horizontal',
      offset: -6,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('d', { value: 25, orientation: 'aligned', offset: 10 }),
    );
  });

  it('materialises default presentation fields when restoring them', () => {
    const bare = documentOf(
      [point('a', 0, 0), point('b', 10, 0)],
      [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 25 }],
    );

    const applied = applyCommand(bare, updateConstraintCommand('d', { value: 40 }));

    expect(getConstraint(applied.document, 'd')).toEqual({
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 40,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('d', {
        value: 25,
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('updates presentation without changing the value', () => {
    const applied = applyCommand(
      document,
      updateConstraintCommand('d', { orientation: 'vertical', offset: 4 }),
    );

    expect(getConstraint(applied.document, 'd')).toEqual({
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 25,
      orientation: 'vertical',
      offset: 4,
    });
  });

  it('clears a set dimension to driven and restores the previous value', () => {
    const applied = applyCommand(document, updateConstraintCommand('d', { value: null }));

    expect(getConstraint(applied.document, 'd')).toEqual({
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      orientation: 'aligned',
      offset: 10,
    });
    expect(getConstraint(applied.document, 'd')).not.toHaveProperty('value');
    expect(applied.inverse).toEqual(
      updateConstraintCommand('d', { value: 25, orientation: 'aligned', offset: 10 }),
    );
  });

  it('sets a driven dimension and inverts to a cleared value', () => {
    const driven = documentOf(
      [point('a', 0, 0), point('b', 10, 0)],
      [{ id: 'm', type: 'distance', a: 'a', b: 'b' }],
    );

    const applied = applyCommand(driven, updateConstraintCommand('m', { value: 60 }));

    expect(getConstraint(applied.document, 'm')).toEqual({
      id: 'm',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 60,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('m', {
        value: null,
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('treats clearing an already-driven dimension as a no-op', () => {
    const driven = documentOf(
      [point('a', 0, 0), point('b', 10, 0)],
      [{ id: 'm', type: 'distance', a: 'a', b: 'b', orientation: 'aligned', offset: 10 }],
    );

    const applied = applyCommand(driven, updateConstraintCommand('m', { value: null }));

    expect(applied.document).toBe(driven);
    expect(applied.inverse).toBeNull();
  });

  it('restores driven state after a presentation-only edit', () => {
    const driven = documentOf(
      [point('a', 0, 0), point('b', 10, 0)],
      [{ id: 'm', type: 'distance', a: 'a', b: 'b' }],
    );

    const applied = applyCommand(
      driven,
      updateConstraintCommand('m', { orientation: 'horizontal', offset: -2 }),
    );

    expect(getConstraint(applied.document, 'm')).toEqual({
      id: 'm',
      type: 'distance',
      a: 'a',
      b: 'b',
      orientation: 'horizontal',
      offset: -2,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('m', {
        value: null,
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('rejects clearing a value on an angle without mutating', () => {
    unchanged(document, updateConstraintCommand('g', { value: null }));
  });

  it('updates an angle value and restores the previous value', () => {
    const applied = applyCommand(document, updateConstraintCommand('g', { value: Math.PI / 3 }));

    expect(getConstraint(applied.document, 'g')).toEqual({
      id: 'g',
      type: 'angle',
      a: 'a',
      b: 'b',
      c: 'c',
      value: Math.PI / 3,
    });
    expect(applied.inverse).toEqual(updateConstraintCommand('g', { value: Math.PI / 4 }));
  });

  it('is a no-op when the requested values already hold', () => {
    const applied = applyCommand(
      document,
      updateConstraintCommand('d', { value: 25, orientation: 'aligned', offset: 10 }),
    );

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('is a no-op for an unchanged angle', () => {
    const applied = applyCommand(document, updateConstraintCommand('g', { value: Math.PI / 4 }));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('rejects unknown, non-dimensional and paramless commands without mutating', () => {
    unchanged(document, updateConstraintCommand('missing', { value: 30 }));
    unchanged(document, updateConstraintCommand('h', { value: 30 }));
    unchanged(document, updateConstraintCommand('d', {}));
  });

  it('rejects invalid values and presentation fields on angles', () => {
    unchanged(document, updateConstraintCommand('d', { value: 0 }));
    unchanged(document, updateConstraintCommand('d', { value: Number.NaN }));
    unchanged(document, updateConstraintCommand('g', { value: Number.POSITIVE_INFINITY }));
    unchanged(document, updateConstraintCommand('g', { orientation: 'horizontal' }));
    unchanged(document, updateConstraintCommand('g', { offset: 4 }));
    unchanged(document, updateConstraintCommand('d', { offset: Number.NaN }));
    unchanged(document, {
      id: 'update',
      type: 'update_constraint',
      params: { id: 'd', orientation: 'diagonal' },
    } as unknown as Command);
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

  it('reconstructs a dimension inverse with its presentation fields', () => {
    const constraint: Constraint = {
      id: 'd',
      type: 'distance',
      a: 'a',
      b: 'b',
      value: 25,
      orientation: 'vertical',
      offset: -3,
    };
    const document = documentOf([point('a', 0, 0), point('b', 10, 0)], [constraint]);

    const applied = applyCommand(document, removeConstraintCommand('d'));

    expect(applied.inverse).toEqual({
      id: 'd',
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: ['a', 'b'],
        value: 25,
        orientation: 'vertical',
        offset: -3,
      },
    });
  });

  it('reconstructs a driven dimension inverse without a value', () => {
    const constraint: Constraint = {
      id: 'm',
      type: 'distance',
      a: 'a',
      b: 'b',
      orientation: 'horizontal',
      offset: 5,
    };
    const document = documentOf([point('a', 0, 0), point('b', 10, 0)], [constraint]);

    const applied = applyCommand(document, removeConstraintCommand('m'));

    expect(applied.inverse).toEqual({
      id: 'm',
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: ['a', 'b'],
        orientation: 'horizontal',
        offset: 5,
      },
    });
    expect((applied.inverse as { params: object }).params).not.toHaveProperty('value');
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
  const withLine = documentOf([
    point('a', 0, 0),
    point('b', 10, 0),
    { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
  ]);

  it('attaches a seam to an edge with the default width and left side', () => {
    const applied = applyCommand(withLine, seamCommand('s', 'l1'));

    expect(getSeam(applied.document, 's')).toEqual({
      id: 's',
      edge: 'l1',
      width: DEFAULT_SEAM_ALLOWANCE,
      side: 'left',
    });
    expect(seamForEdge(applied.document, 'l1')).toEqual(getSeam(applied.document, 's'));
    expect(applied.inverse).toEqual(removeSeamCommand('s'));
  });

  it('honours an explicit width and side', () => {
    const applied = applyCommand(withLine, seamCommand('s', 'l1', 15, 'right'));

    expect(getSeam(applied.document, 's')).toMatchObject({ width: 15, side: 'right' });
  });

  it('is idempotent', () => {
    const first = applyCommand(withLine, seamCommand('s', 'l1'));
    const second = applyCommand(first.document, seamCommand('s', 'l1'));

    expect(second.document).toBe(first.document);
    expect(second.inverse).toBeNull();
  });

  it('rejects invalid width, side, missing edges, point edges and duplicate edges', () => {
    unchanged(withLine, seamCommand('s', 'l1', Number.NaN));
    unchanged(withLine, seamCommand('s', 'l1', 0));
    unchanged(withLine, seamCommand('s', 'l1', -5));
    unchanged(withLine, seamCommand('s', 'l1', 10, 'middle' as SeamSide));
    unchanged(withLine, seamCommand('s', 'missing-edge', 10));
    unchanged(withLine, seamCommand('s', 'a', 10));

    const withSeam = applyCommand(withLine, seamCommand('s', 'l1')).document;
    unchanged(withSeam, seamCommand('other', 'l1', 10));
  });

  it('rejects construction edges', () => {
    const withGuide = documentOf([
      point('a', 0, 0),
      point('b', 10, 0),
      { id: 'g1', kind: 'line', start: 'a', end: 'b', construction: true },
    ]);

    unchanged(withGuide, seamCommand('s', 'g1', 10));
  });

  it('accepts an arc edge, which flattens to a polyline', () => {
    const withArc = documentOf([
      point('a', -10, 0),
      point('b', 0, 10),
      point('c', 10, 0),
      { id: 'a1', kind: 'arc', start: 'a', end: 'c', through: 'b', construction: false },
    ]);

    const applied = applyCommand(withArc, seamCommand('s', 'a1', 10, 'right'));

    expect(getSeam(applied.document, 's')).toEqual({
      id: 's',
      edge: 'a1',
      width: 10,
      side: 'right',
    });
  });
});

describe('remove_seam_allowance', () => {
  const withSeam = documentOf(
    [
      point('a', 0, 0),
      point('b', 10, 0),
      { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
    ],
    [],
    [{ id: 's', edge: 'l1', width: 8 }],
  );

  it('detaches a seam and is reversible', () => {
    const applied = applyCommand(withSeam, removeSeamCommand('s'));

    expect(applied.document.seams).toEqual([]);
    expect(applied.inverse).toEqual(seamCommand('s', 'l1', 8));
  });

  it('re-adds the removed side through its inverse', () => {
    const sided = documentOf(
      [
        point('a', 0, 0),
        point('b', 10, 0),
        { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
      ],
      [],
      [{ id: 's', edge: 'l1', width: 8, side: 'right' }],
    );

    const applied = applyCommand(sided, removeSeamCommand('s'));

    expect(applied.inverse).toEqual(seamCommand('s', 'l1', 8, 'right'));
    expect(applyCommand(applied.document, applied.inverse!).document.seams).toEqual(sided.seams);
  });

  it('is a no-op for an unknown seam', () => {
    const applied = applyCommand(withSeam, removeSeamCommand('missing'));

    expect(applied.document).toBe(withSeam);
    expect(applied.inverse).toBeNull();
  });
});

describe('set_seam_allowance', () => {
  const withSeams = documentOf(
    [
      point('a', 0, 0),
      point('b', 10, 0),
      { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
      { id: 'l2', kind: 'line', start: 'b', end: 'a', construction: false },
    ],
    [{ id: 'h', type: 'horizontal', a: 'a', b: 'b' }],
    [
      { id: 's1', edge: 'l1', width: 8 },
      { id: 's2', edge: 'l2', width: 12 },
    ],
  );

  it('updates only the target seam and reverses through its inverse', () => {
    const applied = applyCommand(withSeams, setSeamCommand('s1', 15));

    expect(getSeam(applied.document, 's1')).toEqual({ id: 's1', edge: 'l1', width: 15 });
    expect(getSeam(applied.document, 's2')).toEqual({ id: 's2', edge: 'l2', width: 12 });
    expect(applied.document.entities).toBe(withSeams.entities);
    expect(applied.document.constraints).toBe(withSeams.constraints);
    expect(applied.inverse).toEqual(setSeamCommand('s1', 8));
    expect(applyCommand(applied.document, applied.inverse!).document.seams).toEqual(
      withSeams.seams,
    );
  });

  it('changes only the side when the width is omitted and restores both through the inverse', () => {
    const applied = applyCommand(withSeams, setSeamSideCommand('s1', 'right'));

    expect(getSeam(applied.document, 's1')).toEqual({
      id: 's1',
      edge: 'l1',
      width: 8,
      side: 'right',
    });
    expect(applied.inverse).toEqual({
      id: 'set',
      type: 'set_seam_allowance',
      params: { id: 's1', width: 8, side: 'left' },
    });
    expect(applyCommand(applied.document, applied.inverse!).document.seams).toEqual([
      { id: 's1', edge: 'l1', width: 8, side: 'left' },
      { id: 's2', edge: 'l2', width: 12 },
    ]);
  });

  it('changes width and side in one command', () => {
    const sided = documentOf(
      [
        point('a', 0, 0),
        point('b', 10, 0),
        { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
      ],
      [],
      [{ id: 's1', edge: 'l1', width: 8, side: 'left' }],
    );

    const applied = applyCommand(sided, setSeamCommand('s1', 15, 'right'));

    expect(getSeam(applied.document, 's1')).toEqual({
      id: 's1',
      edge: 'l1',
      width: 15,
      side: 'right',
    });
    expect(applied.inverse).toEqual(setSeamCommand('s1', 8, 'left'));
    expect(applyCommand(applied.document, applied.inverse!).document.seams).toEqual(sided.seams);
  });

  it('flips twice through the inverse rather than collapsing to a no-op', () => {
    const first = applyCommand(withSeams, setSeamSideCommand('s1', 'right'));
    const second = applyCommand(first.document, first.inverse!);

    expect(getSeam(second.document, 's1')).toMatchObject({ side: 'left', width: 8 });
  });

  it('is a no-op when the width is unchanged', () => {
    const applied = applyCommand(withSeams, setSeamCommand('s1', 8));

    expect(applied.document).toBe(withSeams);
    expect(applied.inverse).toBeNull();
  });

  it('is a no-op when the requested side already applies', () => {
    const applied = applyCommand(withSeams, setSeamSideCommand('s1', 'left'));

    expect(applied.document).toBe(withSeams);
    expect(applied.inverse).toBeNull();
  });

  it('rejects an unknown side and a command with neither width nor side', () => {
    unchanged(withSeams, setSeamSideCommand('s1', 'middle' as SeamSide));
    unchanged(withSeams, { id: 'set', type: 'set_seam_allowance', params: { id: 's1' } });
  });

  it('rejects unknown seams and invalid widths without mutating', () => {
    unchanged(withSeams, setSeamCommand('missing', 10));
    unchanged(withSeams, setSeamCommand('s1', Number.NaN));
    unchanged(withSeams, setSeamCommand('s1', Number.POSITIVE_INFINITY));
    unchanged(withSeams, setSeamCommand('s1', 0));
    unchanged(withSeams, setSeamCommand('s1', -1));
  });

  it('runs through executeCommand and returns a converged result', () => {
    const result = executeCommand(withSeams, setSeamCommand('s1', 15));

    expect(result.solveResult.converged).toBe(true);
    expect(getSeam(result.document, 's1')).toMatchObject({ width: 15 });
    expect(result.inverse).toEqual(setSeamCommand('s1', 8));
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

describe('dimension references', () => {
  const points = [point('a', 0, 0), point('b', 100, 0), point('c', 100, 50), point('d', 0, 50)];

  const referenceDocument = (): PatternDocument =>
    documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120, offset: 10 },
      { id: 'dependent', type: 'distance', a: 'c', b: 'd' },
      { id: 'same-pair', type: 'distance', a: 'b', b: 'a', value: 80 },
    ]);

  const addReferenceCommand = (id: string, entities: string[], reference: string): Command => ({
    id,
    type: 'add_constraint',
    params: { type: 'distance', entities, reference },
  });

  it('adds a link, stores the resolved value and keeps no literal', () => {
    const document = referenceDocument();

    const applied = applyCommand(document, addReferenceCommand('linked', ['c', 'd'], 'source'));

    expect(getConstraint(applied.document, 'linked')).toEqual({
      id: 'linked',
      type: 'distance',
      a: 'c',
      b: 'd',
      reference: 'source',
      lastKnownValue: 120,
    });
    expect(getConstraint(applied.document, 'linked')).not.toHaveProperty('value');
    expect(applied.inverse).toEqual(removeConstraintCommand('linked'));
  });

  it('rejects a value and a reference together', () => {
    const document = referenceDocument();

    unchanged(document, {
      id: 'linked',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['c', 'd'], value: 10, reference: 'source' },
    } as Command);
  });

  it('rejects a missing, driven, broken, self or same-pair source', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      { id: 'driven', type: 'distance', a: 'c', b: 'd' },
      { id: 'broken', type: 'distance', a: 'd', b: 'a', reference: 'missing' },
      { id: 'angle', type: 'angle', a: 'a', b: 'b', c: 'c', value: 1 },
    ]);

    unchanged(document, addReferenceCommand('linked', ['c', 'd'], 'nope'));
    unchanged(document, addReferenceCommand('linked', ['c', 'd'], 'driven'));
    unchanged(document, addReferenceCommand('linked', ['c', 'd'], 'broken'));
    unchanged(document, addReferenceCommand('linked', ['c', 'd'], 'linked'));
    unchanged(document, addReferenceCommand('linked', ['b', 'a'], 'source'));
    unchanged(document, {
      id: 'linked',
      type: 'add_constraint',
      params: { type: 'coincident', entities: ['a', 'b'], reference: 'source' },
    } as Command);
  });

  it('links a set dimension and inverts to its literal', () => {
    const document = referenceDocument();

    const applied = applyCommand(
      document,
      updateConstraintCommand('dependent', { reference: 'source' }),
    );

    expect(getConstraint(applied.document, 'dependent')).toEqual({
      id: 'dependent',
      type: 'distance',
      a: 'c',
      b: 'd',
      reference: 'source',
      lastKnownValue: 120,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('dependent', {
        value: null,
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('links a set dimension and inverts to the previous literal', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      { id: 'dependent', type: 'distance', a: 'c', b: 'd', value: 40 },
    ]);

    const applied = applyCommand(
      document,
      updateConstraintCommand('dependent', { reference: 'source' }),
    );

    expect(getConstraint(applied.document, 'dependent')).toMatchObject({
      reference: 'source',
      lastKnownValue: 120,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('dependent', {
        value: 40,
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('resolves a chained source value when linking', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      { id: 'middle', type: 'distance', a: 'b', b: 'c', reference: 'source' },
      { id: 'dependent', type: 'distance', a: 'c', b: 'd' },
    ]);

    const applied = applyCommand(
      document,
      updateConstraintCommand('dependent', { reference: 'middle' }),
    );

    expect(getConstraint(applied.document, 'dependent')).toMatchObject({
      reference: 'middle',
      lastKnownValue: 120,
    });
  });

  it('rejects a cycle, a self link, a driven, broken or same-pair source', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      { id: 'middle', type: 'distance', a: 'b', b: 'c', reference: 'source' },
      { id: 'driven', type: 'distance', a: 'c', b: 'd' },
      { id: 'pair', type: 'distance', a: 'd', b: 'c', value: 30 },
      { id: 'broken', type: 'distance', a: 'd', b: 'a', reference: 'missing' },
    ]);

    // A link back into its own chain, and a link to itself.
    unchanged(document, updateConstraintCommand('source', { reference: 'middle' }));
    unchanged(document, updateConstraintCommand('source', { reference: 'source' }));
    // The same point pair cannot be measured twice.
    unchanged(document, updateConstraintCommand('driven', { reference: 'pair' }));
    // Driven, broken and missing sources are not equations.
    unchanged(document, updateConstraintCommand('source', { reference: 'driven' }));
    unchanged(document, updateConstraintCommand('source', { reference: 'broken' }));
    unchanged(document, updateConstraintCommand('source', { reference: 'nope' }));
  });

  it('rejects a combined value and reference, and a reference on an angle', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      { id: 'dependent', type: 'distance', a: 'c', b: 'd' },
      { id: 'angle', type: 'angle', a: 'a', b: 'b', c: 'c', value: 1 },
    ]);

    unchanged(document, updateConstraintCommand('dependent', { value: 10, reference: 'source' }));
    unchanged(document, updateConstraintCommand('angle', { reference: 'source' }));
  });

  it('unlinks to a literal at the resolved value and inverts to the link', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(
      document,
      updateConstraintCommand('dependent', { reference: null }),
    );

    expect(getConstraint(applied.document, 'dependent')).toEqual({
      id: 'dependent',
      type: 'distance',
      a: 'c',
      b: 'd',
      value: 120,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('dependent', {
        reference: 'source',
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('unlinks a broken dimension at its last known value and cannot invert it', () => {
    const document = documentOf(points, [
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'missing',
        lastKnownValue: 42,
      },
    ]);

    const applied = applyCommand(
      document,
      updateConstraintCommand('dependent', { reference: null }),
    );

    expect(getConstraint(applied.document, 'dependent')).toMatchObject({ value: 42 });
    expect(applied.inverse).toBeNull();
  });

  it('rejects unlinking a broken dimension with no last known value', () => {
    const document = documentOf(points, [
      { id: 'dependent', type: 'distance', a: 'c', b: 'd', reference: 'missing' },
    ]);

    unchanged(document, updateConstraintCommand('dependent', { reference: null }));
  });

  it('treats unlinking a driven dimension as a no-op', () => {
    const document = documentOf(points, [{ id: 'driven', type: 'distance', a: 'c', b: 'd' }]);

    const applied = applyCommand(document, updateConstraintCommand('driven', { reference: null }));

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('treats re-linking the same source as a no-op', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(
      document,
      updateConstraintCommand('dependent', { reference: 'source' }),
    );

    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('breaks a link when a value is typed and inverts to the link', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, updateConstraintCommand('dependent', { value: 60 }));

    expect(getConstraint(applied.document, 'dependent')).toEqual({
      id: 'dependent',
      type: 'distance',
      a: 'c',
      b: 'd',
      value: 60,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    });
    expect(applied.inverse).toEqual(
      updateConstraintCommand('dependent', {
        reference: 'source',
        orientation: 'aligned',
        offset: DEFAULT_DIMENSION_OFFSET,
      }),
    );
  });

  it('breaks a link when cleared to driven', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, updateConstraintCommand('dependent', { value: null }));

    expect(getConstraint(applied.document, 'dependent')).not.toHaveProperty('reference');
    expect(getConstraint(applied.document, 'dependent')).not.toHaveProperty('lastKnownValue');
  });

  it('cannot invert a repair from a broken link and falls back to the snapshot', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      { id: 'broken', type: 'distance', a: 'c', b: 'd', reference: 'missing', lastKnownValue: 42 },
    ]);

    const applied = applyCommand(
      document,
      updateConstraintCommand('broken', { reference: 'source' }),
    );

    expect(applied.inverse).toBeNull();
    expect(getConstraint(applied.document, 'broken')).toMatchObject({
      reference: 'source',
      lastKnownValue: 120,
    });
  });

  it('leaves dependents broken with the last value when the source is removed', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, removeConstraintCommand('source'));

    expect(getConstraint(applied.document, 'source')).toBeUndefined();
    expect(getConstraint(applied.document, 'dependent')).toEqual({
      id: 'dependent',
      type: 'distance',
      a: 'c',
      b: 'd',
      reference: 'source',
      lastKnownValue: 120,
    });
    expect(applied.inverse).toEqual({
      id: 'source',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: 120 },
    });
  });

  it('refreshes the last known value when a source is cleared to driven', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 130 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, updateConstraintCommand('source', { value: null }));

    expect(getConstraint(applied.document, 'dependent')).toMatchObject({
      reference: 'source',
      lastKnownValue: 130,
    });
  });

  it('restores a removed reference in the inverse', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, removeConstraintCommand('dependent'));

    expect(applied.inverse).toEqual({
      id: 'dependent',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['c', 'd'], reference: 'source' },
    });
  });

  it('has no inverse for removing a broken dimension', () => {
    const document = documentOf(points, [
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'missing',
        lastKnownValue: 42,
      },
    ]);

    const applied = applyCommand(document, removeConstraintCommand('dependent'));

    expect(applied.inverse).toBeNull();
  });

  it('breaks dependents when deleting a point cascades its source away', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, deleteCommand('a'));

    expect(getConstraint(applied.document, 'source')).toBeUndefined();
    expect(getConstraint(applied.document, 'dependent')).toMatchObject({
      reference: 'source',
      lastKnownValue: 120,
    });
    expect(applied.inverse).toBeNull();
  });

  it('removes a dependent whose own point is deleted', () => {
    const document = documentOf(points, [
      { id: 'source', type: 'distance', a: 'a', b: 'b', value: 120 },
      {
        id: 'dependent',
        type: 'distance',
        a: 'c',
        b: 'd',
        reference: 'source',
        lastKnownValue: 120,
      },
    ]);

    const applied = applyCommand(document, deleteCommand('c'));

    expect(getConstraint(applied.document, 'dependent')).toBeUndefined();
    expect(getConstraint(applied.document, 'source')).toBeDefined();
  });

  it('solves a linked draft and moves the dependent with its source', () => {
    const base = documentOf(
      [
        point('a', 0, 0, { fixed: true }),
        point('b', 20, 0),
        point('c', 0, 40, { fixed: true }),
        point('d', 30, 40),
      ],
      [
        { id: 'source', type: 'distance', a: 'a', b: 'b', value: 50 },
        { id: 'dependent', type: 'distance', a: 'c', b: 'd', reference: 'source' },
      ],
    );

    const solved = executeCommand(base, updateConstraintCommand('source', { value: 70 }));

    expect(solved.document.constraints).toHaveLength(2);
    expect(getEntity(solved.document, 'b')).toHaveProperty('x', expect.closeTo(70, 6));
    expect(getEntity(solved.document, 'd')).toHaveProperty('y', expect.closeTo(40, 6));
    expect(getEntity(solved.document, 'd')).toHaveProperty('x', expect.closeTo(70, 6));
  });
});

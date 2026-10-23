import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  CommandValidationError,
  cornerRounds,
  createEmptyDocument,
  executeCommand,
  getEntity,
  solveDocument,
  type Command,
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

const line = (id: string, start: string, end: string, construction = false): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction,
});

const documentOf = (...entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

const rightAngle = (): PatternDocument =>
  documentOf(
    point('c', 0, 0),
    point('a', 100, 0),
    point('b', 0, 100),
    line('l1', 'c', 'a'),
    line('l2', 'c', 'b'),
  );

const addRound = (id = 'r1', radius = 10, first = 'l1', second = 'l2'): Command => ({
  id,
  type: 'add_corner_round',
  params: { first, second, radius },
});

const rounded = (radius = 10): PatternDocument =>
  applyCommand(rightAngle(), addRound('r1', radius)).document;

const rectangle = (): PatternDocument =>
  documentOf(
    point('c1', 0, 0),
    point('c2', 100, 0),
    point('c3', 100, 100),
    point('c4', 0, 100),
    line('bottom', 'c1', 'c2'),
    line('right', 'c2', 'c3'),
    line('top', 'c3', 'c4'),
    line('left', 'c4', 'c1'),
  );

function entity(document: PatternDocument, id: string): Entity {
  return document.entities.find((candidate) => candidate.id === id)!;
}

describe('add_corner_round', () => {
  it('trims both lines, derives the arc and keeps the sharp corner', () => {
    const result = applyCommand(rightAngle(), addRound());

    expect(result.inverse).toEqual({
      id: 'r1:remove',
      type: 'remove_corner_round',
      params: { id: 'r1' },
    });

    const round = cornerRounds(result.document)[0]!;
    expect(round).toMatchObject({
      id: 'r1',
      corner: 'c',
      radius: 10,
      arc: 'r1:arc',
      controls: ['r1:c1', 'r1:c2'],
      center: 'r1:center',
      cornerConstruction: false,
    });
    expect(round.ends).toEqual([
      { line: 'l1', anchor: 'a', tangent: 'r1:a' },
      { line: 'l2', anchor: 'b', tangent: 'r1:b' },
    ]);

    expect(entity(result.document, 'l1')).toMatchObject({ start: 'r1:a', end: 'a' });
    expect(entity(result.document, 'l2')).toMatchObject({ start: 'r1:b', end: 'b' });
    expect(entity(result.document, 'c')).toMatchObject({ construction: true });
    expect(entity(result.document, 'r1:a')).toMatchObject({
      y: 0,
      construction: false,
      fixed: true,
    });
    expect((entity(result.document, 'r1:a') as PointEntity).x).toBeCloseTo(10);
    expect(entity(result.document, 'r1:b')).toMatchObject({
      construction: false,
      fixed: true,
    });
    expect((entity(result.document, 'r1:b') as PointEntity).x).toBeCloseTo(0);
    expect((entity(result.document, 'r1:b') as PointEntity).y).toBeCloseTo(10);
    expect(entity(result.document, 'r1:center')).toMatchObject({
      kind: 'point',
      x: 10,
      y: 10,
      construction: true,
      fixed: true,
    });
    expect(entity(result.document, 'r1:c1')).toMatchObject({ construction: true, fixed: true });
    expect(entity(result.document, 'r1:arc')).toMatchObject({
      kind: 'curve',
      p0: 'r1:a',
      p1: 'r1:c1',
      p2: 'r1:c2',
      p3: 'r1:b',
      construction: false,
    });
  });

  it('inherits the construction flag and restores a sharp construction corner', () => {
    const base = documentOf(
      point('c', 0, 0, { construction: true }),
      point('a', 100, 0, { construction: true }),
      point('b', 0, 100, { construction: true }),
      line('l1', 'c', 'a', true),
      line('l2', 'c', 'b', true),
    );
    const result = applyCommand(base, addRound());

    expect(entity(result.document, 'r1:a')).toMatchObject({ construction: true });
    expect(entity(result.document, 'r1:arc')).toMatchObject({ construction: true });
    expect(cornerRounds(result.document)[0]!.cornerConstruction).toBe(true);
  });

  it('is idempotent when the feature already exists', () => {
    const document = rounded();
    const again = applyCommand(document, addRound());
    expect(again.document).toBe(document);
    expect(again.inverse).toBeNull();
  });

  it('rejects unknown or non-line entities', () => {
    expect(() => applyCommand(rightAngle(), addRound('r', 10, 'missing', 'l2'))).toThrow(
      'unknown entity: missing',
    );
    expect(() => applyCommand(rightAngle(), addRound('r', 10, 'c', 'l2'))).toThrow(
      'entity c is a point, expected a line',
    );
  });

  it('rejects the same line, lines that do not meet and duplicate lines', () => {
    expect(() => applyCommand(rightAngle(), addRound('r', 10, 'l1', 'l1'))).toThrow(
      'Pick two different lines.',
    );

    const apart = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('d', 0, 50),
      point('e', 100, 50),
      line('l1', 'c', 'a'),
      line('l2', 'd', 'e'),
    );
    expect(() => applyCommand(apart, addRound('r', 10, 'l1', 'l2'))).toThrow(
      'The lines must meet at a corner.',
    );

    const duplicate = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'a'),
    );
    expect(() => applyCommand(duplicate, addRound('r', 10, 'l1', 'l2'))).toThrow(
      'Pick two different lines.',
    );
  });

  it('rejects an already rounded corner, mixed flags, a third edge and a seam', () => {
    expect(() => applyCommand(rounded(), addRound('r2', 5, 'l2', 'l1'))).toThrow(
      'This corner is already rounded.',
    );

    const roundedWithCorner = rounded();
    const extraCornerLines: PatternDocument = {
      ...roundedWithCorner,
      entities: [
        ...roundedWithCorner.entities,
        point('d', -100, 0),
        point('e', 0, -100),
        line('l3', 'c', 'd'),
        line('l4', 'c', 'e'),
      ],
    };
    expect(() => applyCommand(extraCornerLines, addRound('r2', 5, 'l3', 'l4'))).toThrow(
      'This corner is already rounded.',
    );

    const mixed = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b', true),
    );
    expect(() => applyCommand(mixed, addRound())).toThrow(
      'Both lines must be cut edges or both construction.',
    );

    const third = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      point('d', -100, 0),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
      line('l3', 'c', 'd'),
    );
    expect(() => applyCommand(third, addRound())).toThrow(
      'The corner is shared by more than two edges of this kind.',
    );
    const withGuide = documentOf(
      ...(third.entities.map((candidate) =>
        candidate.id === 'l3' ? { ...candidate, construction: true } : candidate,
      ) as Entity[]),
    );
    expect(applyCommand(withGuide, addRound()).document.cornerRounds).toHaveLength(1);

    const seamed = applyCommand(rightAngle(), {
      id: 's1',
      type: 'add_seam_allowance',
      params: { edge: 'l1' },
    }).document;
    expect(() => applyCommand(seamed, addRound())).toThrow('Remove the seam allowance first.');
  });

  it('rejects invalid, oversized and colliding geometry', () => {
    expect(() => applyCommand(rightAngle(), addRound('r', 0))).toThrow(
      'Radius must be a finite number of at least 0.001 mm.',
    );

    const spike = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 50, 0),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
    );
    expect(() => applyCommand(spike, addRound())).toThrow('The corner is too sharp for a round.');

    const straight = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', -100, 0),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
    );
    expect(() => applyCommand(straight, addRound())).toThrow(
      'The lines are straight; there is no corner to round.',
    );

    expect(() => applyCommand(rightAngle(), addRound('r', 100))).toThrow(
      /too large for these lines; the maximum is 99.999 mm/,
    );

    const collision = applyCommand(rightAngle(), {
      id: 'seed',
      type: 'add_point',
      params: { x: 1, y: 1 },
    }).document;
    // Move the seeded point onto a derived id to exercise the collision guard.
    const collisionDocument: PatternDocument = {
      ...collision,
      entities: collision.entities.map((candidate) =>
        candidate.id === 'seed' ? { ...candidate, id: 'r1:a' } : candidate,
      ),
    };
    expect(() => applyCommand(collisionDocument, addRound())).toThrow(
      'Derived entity id "r1:a" is in use.',
    );

    const centreCollision: PatternDocument = {
      ...collision,
      entities: collision.entities.map((candidate) =>
        candidate.id === 'seed' ? { ...candidate, id: 'r1:center' } : candidate,
      ),
    };
    expect(() => applyCommand(centreCollision, addRound())).toThrow(
      'Derived entity id "r1:center" is in use.',
    );
  });

  it('rejects when an opposite round makes the fit unknowable', () => {
    const base = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      point('e', 100, 100),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
      line('l3', 'a', 'e'),
    );
    const first = applyCommand(base, addRound('r1', 10, 'l1', 'l2')).document;
    const broken: PatternDocument = {
      ...first,
      cornerRounds: cornerRounds(first).map((round) => ({ ...round, radius: Number.NaN })),
    };

    expect(() => applyCommand(broken, addRound('r2', 10, 'l1', 'l3'))).toThrow(
      'The corner cannot be rounded.',
    );
  });

  it('rounds both ends of a line and all four corners of a rectangle', () => {
    let document = rectangle();
    const corners: [string, string, string][] = [
      ['bottom', 'left', 'c1'],
      ['bottom', 'right', 'c2'],
      ['right', 'top', 'c3'],
      ['top', 'left', 'c4'],
    ];

    corners.forEach(([first, second, corner], index) => {
      document = applyCommand(document, addRound(`r${index}`, 10, first, second)).document;
      expect(cornerRounds(document)).toHaveLength(index + 1);
      expect(entity(document, corner)).toMatchObject({ construction: true });
    });

    expect(cornerRounds(document)).toHaveLength(4);
    // Every side carries two rounds; the remaining straight span is 80 mm.
    for (const id of ['bottom', 'right', 'top', 'left']) {
      const side = entity(document, id) as LineEntity;
      expect(
        [side.start, side.end].filter((end) => end.includes(':a') || end.includes(':b')),
      ).toHaveLength(2);
    }
    const regenerated = solveDocument(document);
    expect(regenerated.document.cornerRounds).toHaveLength(4);
  });
});

describe('set_corner_round_radius', () => {
  it('changes the radius and regenerates the arc', () => {
    const document = rounded();
    const result = applyCommand(document, {
      id: 'set',
      type: 'set_corner_round_radius',
      params: { id: 'r1', radius: 20 },
    });

    expect(result.inverse).toEqual({
      id: 'set:restore',
      type: 'set_corner_round_radius',
      params: { id: 'r1', radius: 10 },
    });
    expect(cornerRounds(result.document)[0]!.radius).toBe(20);
    expect((entity(result.document, 'r1:a') as PointEntity).x).toBeCloseTo(20);
    expect((entity(result.document, 'r1:a') as PointEntity).y).toBeCloseTo(0);
    expect((entity(result.document, 'r1:b') as PointEntity).x).toBeCloseTo(0);
    expect((entity(result.document, 'r1:b') as PointEntity).y).toBeCloseTo(20);
  });

  it('updates one round without disturbing another on the same document', () => {
    let document = rectangle();
    document = applyCommand(document, addRound('r1', 10, 'bottom', 'left')).document;
    document = applyCommand(document, addRound('r2', 10, 'bottom', 'right')).document;

    const updated = applyCommand(document, {
      id: 'set',
      type: 'set_corner_round_radius',
      params: { id: 'r2', radius: 20 },
    }).document;

    expect(cornerRounds(updated).map((round) => [round.id, round.radius])).toEqual([
      ['r1', 10],
      ['r2', 20],
    ]);
  });

  it('is a no-op for the current radius', () => {
    const document = rounded();
    const result = applyCommand(document, {
      id: 'set',
      type: 'set_corner_round_radius',
      params: { id: 'r1', radius: 10 },
    });
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('rejects unknown rounds, invalid radii, oversized radii and degenerate corners', () => {
    const document = rounded();
    expect(() =>
      applyCommand(document, {
        id: 'set',
        type: 'set_corner_round_radius',
        params: { id: 'missing', radius: 5 },
      }),
    ).toThrow('unknown corner round: missing');
    expect(() =>
      applyCommand(document, {
        id: 'set',
        type: 'set_corner_round_radius',
        params: { id: 'r1', radius: 0 },
      }),
    ).toThrow('Radius must be a finite number of at least 0.001 mm.');
    expect(() =>
      applyCommand(document, {
        id: 'set',
        type: 'set_corner_round_radius',
        params: { id: 'r1', radius: 1000 },
      }),
    ).toThrow(/maximum is 99.999 mm/);

    const straight: PatternDocument = {
      ...document,
      entities: document.entities.map((candidate) =>
        candidate.id === 'b' ? { ...candidate, x: -100, y: 0 } : candidate,
      ),
    };
    expect(() =>
      applyCommand(straight, {
        id: 'set',
        type: 'set_corner_round_radius',
        params: { id: 'r1', radius: 20 },
      }),
    ).toThrow('The corner can no longer be rounded.');
  });
});

describe('remove_corner_round', () => {
  it('restores both lines and the sharp corner and deletes the derived geometry', () => {
    const document = rounded();
    const result = applyCommand(document, {
      id: 'remove',
      type: 'remove_corner_round',
      params: { id: 'r1' },
    });

    expect(result.inverse).toEqual({
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l2', radius: 10 },
    });
    expect(result.document.cornerRounds).toEqual([]);
    expect(entity(result.document, 'l1')).toMatchObject({ start: 'c', end: 'a' });
    expect(entity(result.document, 'l2')).toMatchObject({ start: 'c', end: 'b' });
    expect(entity(result.document, 'c')).toMatchObject({ construction: false });
    for (const id of ['r1:a', 'r1:b', 'r1:c1', 'r1:c2', 'r1:arc', 'r1:center']) {
      expect(getEntity(result.document, id)).toBeUndefined();
    }

    const restored = applyCommand(result.document, result.inverse!).document;
    expect(cornerRounds(restored).map((round) => [round.id, round.radius])).toEqual([['r1', 10]]);
    expect(getEntity(restored, 'r1:arc')).toBeDefined();
  });

  it('removes a round written before feature points without a centre', () => {
    const legacy: PatternDocument = {
      ...rounded(),
      cornerRounds: [{ ...cornerRounds(rounded())[0]!, center: undefined }],
    };

    const result = applyCommand(legacy, {
      id: 'remove',
      type: 'remove_corner_round',
      params: { id: 'r1' },
    });

    expect(result.document.cornerRounds).toEqual([]);
    expect(getEntity(result.document, 'r1:arc')).toBeUndefined();
  });

  it('is idempotent for an unknown round', () => {
    const document = rounded();
    const result = applyCommand(document, {
      id: 'remove',
      type: 'remove_corner_round',
      params: { id: 'missing' },
    });
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('keeps a round at the other end of the same line', () => {
    let document = rectangle();
    document = applyCommand(document, addRound('r1', 10, 'bottom', 'left')).document;
    document = applyCommand(document, addRound('r2', 10, 'bottom', 'right')).document;

    expect(cornerRounds(document)).toHaveLength(2);
    const result = applyCommand(document, {
      id: 'remove',
      type: 'remove_corner_round',
      params: { id: 'r1' },
    }).document;

    expect(cornerRounds(result)).toHaveLength(1);
    expect(cornerRounds(result)[0]!.id).toBe('r2');
    expect(entity(result, 'bottom')).toMatchObject({ start: 'c1' });
    expect(entity(result, 'left')).toMatchObject({ end: 'c1' });
  });

  it('cascades to constraints on the derived geometry', () => {
    const document = rounded();
    const withConstraint: PatternDocument = {
      ...document,
      constraints: [{ id: 'co', type: 'coincident', a: 'r1:a', b: 'r1:c1' }],
    };
    const result = applyCommand(withConstraint, {
      id: 'remove',
      type: 'remove_corner_round',
      params: { id: 'r1' },
    }).document;

    expect(result.constraints).toEqual([]);
  });
});

describe('corner-round cascade and guards', () => {
  it('deletes a rounded line with its round', () => {
    const result = applyCommand(rounded(), {
      id: 'del',
      type: 'delete_entity',
      params: { id: 'l1' },
    }).document;

    expect(cornerRounds(result)).toEqual([]);
    expect(getEntity(result, 'l1')).toBeUndefined();
    expect(entity(result, 'l2')).toMatchObject({ start: 'c', end: 'b' });
    expect(entity(result, 'c')).toMatchObject({ construction: false });
    expect(getEntity(result, 'r1:arc')).toBeUndefined();
  });

  it('deletes the arc, a tangent, a control point or the centre with its round', () => {
    for (const id of ['r1:arc', 'r1:a', 'r1:c1', 'r1:center']) {
      const result = applyCommand(rounded(), {
        id: `del-${id}`,
        type: 'delete_entity',
        params: { id },
      }).document;

      expect(cornerRounds(result)).toEqual([]);
      expect(getEntity(result, id)).toBeUndefined();
      expect(entity(result, 'l1')).toMatchObject({ start: 'c' });
    }
  });

  it('removes every round on a line before deleting it', () => {
    let document = rectangle();
    document = applyCommand(document, addRound('r1', 10, 'bottom', 'left')).document;
    document = applyCommand(document, addRound('r2', 10, 'bottom', 'right')).document;

    const result = applyCommand(document, {
      id: 'del',
      type: 'delete_entity',
      params: { id: 'bottom' },
    }).document;

    expect(cornerRounds(result)).toEqual([]);
    expect(getEntity(result, 'bottom')).toBeUndefined();
    expect(entity(result, 'left')).toMatchObject({ end: 'c1' });
    expect(entity(result, 'right')).toMatchObject({ start: 'c2' });
  });

  it('rejects deleting the sharp corner or an anchor of a round', () => {
    for (const id of ['c', 'a']) {
      expect(() =>
        applyCommand(rounded(), { id: 'del', type: 'delete_entity', params: { id } }),
      ).toThrow('Remove the corner round first.');
    }
  });

  it('rejects moving derived points but allows the sharp corner', () => {
    for (const id of ['r1:a', 'r1:center']) {
      expect(() =>
        applyCommand(rounded(), {
          id: 'move',
          type: 'move_point',
          params: { id, x: 5, y: 5 },
        }),
      ).toThrow('This point is derived by a corner round; edit the radius.');
    }

    const moved = executeCommand(rounded(), {
      id: 'move',
      type: 'move_point',
      params: { id: 'c', x: 10, y: 0 },
    }).document;
    expect(entity(moved, 'r1:a').kind).toBe('point');
    expect((entity(moved, 'r1:a') as PointEntity).x).toBeCloseTo(19.05, 1);
  });

  it('rejects new geometry and constraints on derived points', () => {
    const document = rounded();
    expect(() =>
      applyCommand(document, {
        id: 'line',
        type: 'add_line',
        params: { start: 'r1:a', end: 'a' },
      }),
    ).toThrow('This point is derived by a corner round; edit the radius.');
    expect(() =>
      applyCommand(document, {
        id: 'curve',
        type: 'add_curve',
        params: { p0: 'r1:a', p1: 'r1:c1', p2: 'r1:c2', p3: 'r1:b' },
      }),
    ).toThrow('This point is derived by a corner round; edit the radius.');
    expect(() =>
      applyCommand(document, {
        id: 'co',
        type: 'add_constraint',
        params: { type: 'coincident', entities: ['r1:a', 'r1:c1'] },
      }),
    ).toThrow('This point is derived by a corner round; edit the radius.');
  });

  it('rejects construction and seam changes on a round', () => {
    const document = rounded();
    for (const id of ['l1', 'c', 'r1:arc', 'r1:a']) {
      expect(() =>
        applyCommand(document, {
          id: 'construction',
          type: 'set_construction',
          params: { id, construction: true },
        }),
      ).toThrow('Remove the corner round first.');
    }

    for (const edge of ['l1', 'r1:arc']) {
      expect(() =>
        applyCommand(document, {
          id: 'seam',
          type: 'add_seam_allowance',
          params: { edge },
        }),
      ).toThrow('Remove the corner round first; a seam allowance cannot wrap the arc in v1.');
    }
  });

  it('allows construction changes on an anchor point', () => {
    const result = applyCommand(rounded(), {
      id: 'construction',
      type: 'set_construction',
      params: { id: 'a', construction: true },
    }).document;
    expect(entity(result, 'a')).toMatchObject({ construction: true });
  });

  it('leaves the document untouched when a move no longer fits', () => {
    const document = rounded();
    expect(() =>
      executeCommand(document, {
        id: 'move',
        type: 'move_point',
        params: { id: 'a', x: 5, y: 0 },
      }),
    ).toThrow(CommandValidationError);
    expect(document.entities.find((candidate) => candidate.id === 'a')).toMatchObject({ x: 100 });
  });
});

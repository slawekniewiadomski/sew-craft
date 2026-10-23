import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  CommandValidationError,
  cornerRoundGeometry,
  cornerRounds,
  cornerRoundsForEntity,
  createEmptyDocument,
  getEntity,
  incidentLines,
  isCornerRoundDerived,
  maxCornerRadius,
  normalizeCornerRounds,
  regenerateCornerRounds,
  roundBetween,
  roundBridge,
  type CornerRound,
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

const rounded = (radius = 10, base = rightAngle()): PatternDocument =>
  applyCommand(base, {
    id: 'r1',
    type: 'add_corner_round',
    params: { first: 'l1', second: 'l2', radius },
  }).document;

const roundOf = (document: PatternDocument): CornerRound => cornerRounds(document)[0]!;

const replace = (document: PatternDocument, entities: Entity[]): PatternDocument => ({
  ...document,
  entities,
});

const removeEntity = (document: PatternDocument, id: string): PatternDocument =>
  replace(
    document,
    document.entities.filter((entity) => entity.id !== id),
  );

const mapEntity = (
  document: PatternDocument,
  id: string,
  update: (entity: Entity) => Entity,
): PatternDocument =>
  replace(
    document,
    document.entities.map((entity) => (entity.id === id ? update(entity) : entity)),
  );

describe('cornerRoundGeometry', () => {
  it('derives tangent and control points for a right angle', () => {
    const result = cornerRoundGeometry(rightAngle(), 'c', 'a', 'b', 10);

    expect(result.error).toBeNull();
    expect(result.geometry!.angle).toBeCloseTo(Math.PI / 2);
    expect(result.geometry!.tangentDistance).toBeCloseTo(10);
    expect(result.geometry!.tangentA.x).toBeCloseTo(10);
    expect(result.geometry!.tangentA.y).toBeCloseTo(0);
    expect(result.geometry!.tangentB.x).toBeCloseTo(0);
    expect(result.geometry!.tangentB.y).toBeCloseTo(10);
    expect(result.geometry!.control1.x).toBeCloseTo(10 - 5.5228, 3);
    expect(result.geometry!.control1.y).toBeCloseTo(0);
    expect(result.geometry!.control2.x).toBeCloseTo(0);
    expect(result.geometry!.control2.y).toBeCloseTo(10 - 5.5228, 3);
  });

  it('uses the interior angle for acute and obtuse corners', () => {
    const acute = documentOf(point('c', 0, 0), point('a', 100, 0), point('b', 50, 86.602540378));
    const obtuse = documentOf(point('c', 0, 0), point('a', 100, 0), point('b', -50, 86.602540378));

    const acuteResult = cornerRoundGeometry(acute, 'c', 'a', 'b', 10);
    const obtuseResult = cornerRoundGeometry(obtuse, 'c', 'a', 'b', 10);

    expect(acuteResult.geometry!.angle).toBeCloseTo(Math.PI / 3);
    expect(acuteResult.geometry!.tangentDistance).toBeCloseTo(10 / Math.tan(Math.PI / 6));
    expect(obtuseResult.geometry!.angle).toBeCloseTo((2 * Math.PI) / 3);
    expect(obtuseResult.geometry!.tangentDistance).toBeCloseTo(10 / Math.tan(Math.PI / 3));
  });

  it('rejects missing points, a zero-length line and an invalid radius', () => {
    expect(cornerRoundGeometry(rightAngle(), 'zz', 'a', 'b', 10).error).toBe(
      'The corner round references a missing point.',
    );

    const zero = documentOf(point('c', 0, 0), point('a', 0, 0), point('b', 0, 100));
    expect(cornerRoundGeometry(zero, 'c', 'a', 'b', 10).error).toBe('The line has no direction.');

    expect(cornerRoundGeometry(rightAngle(), 'c', 'a', 'b', 0).error).toBe(
      'Radius must be a finite number of at least 0.001 mm.',
    );
    expect(cornerRoundGeometry(rightAngle(), 'c', 'a', 'b', Number.NaN).error).toBe(
      'Radius must be a finite number of at least 0.001 mm.',
    );
  });

  it('rejects spikes and straight corners', () => {
    const spike = documentOf(point('c', 0, 0), point('a', 100, 0), point('b', 50, 0));
    const straight = documentOf(point('c', 0, 0), point('a', 100, 0), point('b', -100, 0));

    expect(cornerRoundGeometry(spike, 'c', 'a', 'b', 10).error).toBe(
      'The corner is too sharp for a round.',
    );
    expect(cornerRoundGeometry(straight, 'c', 'a', 'b', 10).error).toBe(
      'The lines are straight; there is no corner to round.',
    );
  });
});

describe('cornerRoundsForEntity and isCornerRoundDerived', () => {
  it('finds every reference and distinguishes derived geometry', () => {
    const document = rounded();
    const round = roundOf(document);

    for (const id of [
      round.id,
      round.corner,
      round.arc,
      ...round.controls,
      ...round.ends.map((end) => end.line),
      ...round.ends.map((end) => end.anchor),
      ...round.ends.map((end) => end.tangent),
    ]) {
      expect(cornerRoundsForEntity(document, id)).toHaveLength(1);
    }
    expect(cornerRoundsForEntity(document, 'unknown')).toHaveLength(0);

    for (const id of [round.arc, ...round.controls, ...round.ends.map((end) => end.tangent)]) {
      expect(isCornerRoundDerived(document, id)).toBe(true);
    }
    for (const id of [round.corner, round.ends[0].line, round.ends[0].anchor]) {
      expect(isCornerRoundDerived(document, id)).toBe(false);
    }
  });
});

describe('maxCornerRadius', () => {
  it('is limited by the shorter line, leaving 0.001 mm', () => {
    const document = rounded();
    expect(maxCornerRadius(document, roundOf(document))).toBeCloseTo(99.999);
  });

  it('accounts for a round at the opposite end of the line', () => {
    const base = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      point('e', 100, 100),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
      line('l3', 'a', 'e'),
    );
    const first = rounded(10, base);
    const second = applyCommand(first, {
      id: 'r2',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l3', radius: 10 },
    }).document;

    expect(maxCornerRadius(second, cornerRounds(second)[1]!)).toBeCloseTo(89.999);
  });

  it('returns null for broken or degenerate corners', () => {
    const document = rounded();
    const round = roundOf(document);

    expect(maxCornerRadius(removeEntity(document, 'c'), round)).toBeNull();
    expect(maxCornerRadius(removeEntity(document, 'a'), round)).toBeNull();
    expect(maxCornerRadius(removeEntity(document, 'l1'), round)).toBeNull();

    const straight = mapEntity(document, 'b', (entity) =>
      entity.kind === 'point' ? { ...entity, x: -100, y: 0 } : entity,
    );
    expect(maxCornerRadius(straight, round)).toBeNull();
  });

  it('returns null when the opposite round is malformed', () => {
    const base = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      point('e', 100, 100),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
      line('l3', 'a', 'e'),
    );
    const first = rounded(10, base);
    const second = applyCommand(first, {
      id: 'r2',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l3', radius: 10 },
    }).document;
    const broken: PatternDocument = {
      ...second,
      cornerRounds: cornerRounds(second).map((round) =>
        round.id === 'r1' ? { ...round, radius: Number.NaN } : round,
      ),
    };
    expect(maxCornerRadius(broken, cornerRounds(broken)[1]!)).toBeNull();

    for (const missing of ['a', 'b']) {
      const noAnchor = removeEntity(second, missing);
      expect(maxCornerRadius(noAnchor, cornerRounds(noAnchor)[1]!)).toBeNull();
    }
  });

  it('returns zero when no room is left for the other end', () => {
    const base = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      point('e', 100, 100),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
      line('l3', 'a', 'e'),
    );
    const first = rounded(99.999, base);
    expect(() =>
      applyCommand(first, {
        id: 'r2',
        type: 'add_corner_round',
        params: { first: 'l1', second: 'l3', radius: 0.001 },
      }),
    ).toThrow(/maximum is 0 mm/);

    const document = rounded(99.999, base);
    const round = roundOf(document);
    const opposite = {
      ...round,
      id: 'r2',
      corner: 'a',
      ends: [
        { line: 'l1', anchor: 'c', tangent: 'r2:a' },
        { line: 'l3', anchor: 'e', tangent: 'r2:b' },
      ] as CornerRound['ends'],
    };
    const withOpposite: PatternDocument = {
      ...document,
      cornerRounds: [round, opposite],
    };

    expect(maxCornerRadius(withOpposite, opposite)).toBe(0);
  });
});

describe('regenerateCornerRounds', () => {
  it('returns the same document when there are no rounds', () => {
    const document = rightAngle();
    expect(regenerateCornerRounds(document)).toBe(document);
  });

  it('recomputes tangent and control points from the radius', () => {
    const document = rounded();
    const larger: PatternDocument = {
      ...document,
      cornerRounds: cornerRounds(document).map((round) => ({ ...round, radius: 20 })),
    };

    const regenerated = regenerateCornerRounds(larger);
    const round = roundOf(regenerated);
    const tangent = regenerated.entities.find(
      (entity) => entity.id === round.ends[0].tangent,
    ) as PointEntity;
    const control = regenerated.entities.find(
      (entity) => entity.id === round.controls[0],
    ) as PointEntity;

    expect(tangent).toMatchObject({ y: 0, fixed: true });
    expect(tangent.x).toBeCloseTo(20);
    expect(control.x).toBeCloseTo(20 - 11.0456, 3);
  });

  it('moves the derived geometry with a moved sharp corner', () => {
    const document = rounded();
    const moved = mapEntity(document, 'c', (entity) =>
      entity.kind === 'point' ? { ...entity, x: 10, y: 0 } : entity,
    );

    const regenerated = regenerateCornerRounds(moved);
    const round = roundOf(regenerated);
    const tangent = regenerated.entities.find(
      (entity) => entity.id === round.ends[0].tangent,
    ) as PointEntity;

    expect(tangent.x).toBeCloseTo(19.05, 1);
    expect(tangent.y).toBeCloseTo(0);
  });

  it('throws when the corner becomes straight or a line no longer fits', () => {
    const document = rounded();
    const straight = mapEntity(document, 'b', (entity) =>
      entity.kind === 'point' ? { ...entity, x: -100, y: 0 } : entity,
    );
    const short = mapEntity(document, 'a', (entity) =>
      entity.kind === 'point' ? { ...entity, x: 5, y: 0 } : entity,
    );

    expect(() => regenerateCornerRounds(straight)).toThrow(CommandValidationError);
    expect(() => regenerateCornerRounds(short)).toThrow(/no longer fits/);
  });

  it('throws when a feature references missing geometry', () => {
    const document = rounded();
    const round = roundOf(document);

    for (const id of [round.ends[0].anchor, round.ends[0].line, round.ends[0].tangent, round.arc]) {
      const broken = removeEntity(document, id);
      expect(() => regenerateCornerRounds(broken)).toThrow(CommandValidationError);
    }

    const missingCorner = removeEntity(document, round.corner);
    expect(() => regenerateCornerRounds(missingCorner)).toThrow(CommandValidationError);
  });
});

describe('normalizeCornerRounds', () => {
  it('leaves documents without rounds untouched', () => {
    const empty = rightAngle();
    expect(normalizeCornerRounds(empty)).toBe(empty);

    const noRounds: PatternDocument = { ...rightAngle(), cornerRounds: [] };
    expect(normalizeCornerRounds(noRounds)).toBe(noRounds);
  });

  it('keeps a valid feature unchanged', () => {
    const document = rounded();
    expect(normalizeCornerRounds(document)).toBe(document);
  });

  it('drops a duplicate round at the same corner', () => {
    const document = rounded();
    const round = roundOf(document);
    const duplicate: CornerRound = {
      ...round,
      id: 'r2',
      ends: [
        { line: 'l1', anchor: 'a', tangent: 't1' },
        { line: 'l2', anchor: 'b', tangent: 't2' },
      ],
    };
    const normalized = normalizeCornerRounds({
      ...document,
      cornerRounds: [round, duplicate],
    });

    expect(normalized.cornerRounds).toHaveLength(1);
    expect(normalized.cornerRounds![0]!.id).toBe('r1');
  });

  it('drops a feature that shares its line, has an invalid radius or broken geometry', () => {
    const document = rounded();
    const round = roundOf(document);

    const sameLine: CornerRound = {
      ...round,
      ends: [round.ends[0], { ...round.ends[1], line: round.ends[0].line }],
    };
    expect(
      normalizeCornerRounds({ ...document, cornerRounds: [sameLine] }).cornerRounds,
    ).toHaveLength(0);

    const invalidRadius: CornerRound = { ...round, radius: Number.NaN };
    expect(
      normalizeCornerRounds({ ...document, cornerRounds: [invalidRadius] }).cornerRounds,
    ).toHaveLength(0);
    expect(
      normalizeCornerRounds({ ...document, cornerRounds: [{ ...round, radius: 0 }] }).cornerRounds,
    ).toHaveLength(0);

    const straight = mapEntity(document, 'b', (entity) =>
      entity.kind === 'point' ? { ...entity, x: -100, y: 0 } : entity,
    );
    expect(normalizeCornerRounds(straight).cornerRounds).toHaveLength(0);
  });

  it('drops a feature whose derived geometry is missing or inconsistent', () => {
    const document = rounded();
    const round = roundOf(document);

    const broken = [
      removeEntity(document, round.ends[0].anchor),
      removeEntity(document, round.corner),
      removeEntity(document, round.ends[0].line),
      removeEntity(document, round.ends[0].tangent),
      removeEntity(document, round.controls[0]),
      removeEntity(document, round.arc),
      mapEntity(document, round.ends[0].tangent, (entity) => ({ ...entity, fixed: false })),
      mapEntity(document, round.ends[0].tangent, (entity) => ({ ...entity, construction: true })),
      mapEntity(document, round.controls[0], (entity) => ({ ...entity, fixed: false })),
      mapEntity(document, round.controls[0], (entity) => ({ ...entity, construction: false })),
      mapEntity(document, round.ends[0].line, (entity) =>
        entity.kind === 'line' ? { ...entity, start: round.corner } : entity,
      ),
      mapEntity(document, round.arc, (entity) =>
        entity.kind === 'curve' ? { ...entity, p0: round.controls[0] } : entity,
      ),
      mapEntity(document, round.arc, (entity) =>
        entity.kind === 'curve' ? { ...entity, p1: round.controls[1] } : entity,
      ),
      mapEntity(document, round.arc, (entity) =>
        entity.kind === 'curve' ? { ...entity, p2: round.controls[0] } : entity,
      ),
      mapEntity(document, round.arc, (entity) =>
        entity.kind === 'curve' ? { ...entity, construction: true } : entity,
      ),
      mapEntity(document, 'a', (entity) =>
        entity.kind === 'point' ? { ...entity, x: 5 } : entity,
      ),
    ];

    for (const document of broken) {
      expect(normalizeCornerRounds(document).cornerRounds).toHaveLength(0);
    }
  });
});

describe('round helpers', () => {
  it('finds the round between two lines in either order', () => {
    const document = rounded();

    expect(roundBetween(document, 'l1', 'l2')?.id).toBe('r1');
    expect(roundBetween(document, 'l2', 'l1')?.id).toBe('r1');
    expect(roundBetween(document, 'l1', 'l1')).toBeNull();
    expect(roundBetween(document, 'l1', 'missing')).toBeNull();
  });

  it('orients the bridge arc from the first line to the second', () => {
    const document = rounded();
    const round = cornerRounds(document)[0]!;
    const tangentA = getEntity(document, round.ends[0].tangent) as PointEntity;
    const tangentB = getEntity(document, round.ends[1].tangent) as PointEntity;

    const forward = roundBridge(document, 'l1', 'l2')!;
    expect(forward[0]).toEqual({ x: tangentA.x, y: tangentA.y });
    expect(forward[forward.length - 1]).toEqual({ x: tangentB.x, y: tangentB.y });

    const backward = roundBridge(document, 'l2', 'l1')!;
    expect(backward[0]).toEqual({ x: tangentB.x, y: tangentB.y });
    expect(backward[backward.length - 1]).toEqual({ x: tangentA.x, y: tangentA.y });

    expect(roundBridge(document, 'l1', 'missing')).toBeNull();
  });

  it('returns no bridge when the arc cannot be resolved', () => {
    const document = rounded();
    const withoutArc: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'r1:arc'),
    };

    expect(roundBridge(withoutArc, 'l1', 'l2')).toBeNull();
  });

  it('lists the lines incident to a point', () => {
    const document = rightAngle();

    expect(incidentLines(document, 'c').map((line) => line.id)).toEqual(['l1', 'l2']);
    expect(incidentLines(document, 'a').map((line) => line.id)).toEqual(['l1']);
    expect(incidentLines(document, 'missing')).toEqual([]);
  });
});

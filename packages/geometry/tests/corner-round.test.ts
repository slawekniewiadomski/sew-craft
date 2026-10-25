import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  CommandValidationError,
  cornerRoundGeometry,
  cross,
  distance,
  cornerRounds,
  cornerRoundsForEntity,
  createEmptyDocument,
  getEntity,
  incidentLines,
  isCornerRoundDerived,
  lineEndpointAnchor,
  lineSupportAnchors,
  maxCornerRadius,
  normalizeCornerRounds,
  regenerateCornerRounds,
  roundBetween,
  roundBridge,
  sub,
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

  it('places the radius centre one radius from both tangents', () => {
    const right = cornerRoundGeometry(rightAngle(), 'c', 'a', 'b', 10).geometry!;
    expect(right.center.x).toBeCloseTo(10);
    expect(right.center.y).toBeCloseTo(10);

    const acute = documentOf(point('c', 0, 0), point('a', 100, 0), point('b', 50, 86.602540378));
    const obtuse = documentOf(point('c', 0, 0), point('a', 100, 0), point('b', -50, 86.602540378));

    for (const probe of [
      right,
      cornerRoundGeometry(acute, 'c', 'a', 'b', 10).geometry!,
      cornerRoundGeometry(obtuse, 'c', 'a', 'b', 10).geometry!,
    ]) {
      expect(distance(probe.center, probe.tangentA)).toBeCloseTo(10, 6);
      expect(distance(probe.center, probe.tangentB)).toBeCloseTo(10, 6);
    }
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

describe('lineEndpointAnchor and lineSupportAnchors', () => {
  it('returns the endpoints themselves for a plain line', () => {
    expect(lineEndpointAnchor(rightAngle(), 'l1', 'c')).toBe('c');
    expect(lineEndpointAnchor(rightAngle(), 'l1', 'a')).toBe('a');
    expect(lineSupportAnchors(rightAngle(), 'l1')).toEqual({ start: 'c', end: 'a' });
  });

  it('maps a trimmed end to its sharp corner and keeps the other end', () => {
    const document = rounded();
    const [round] = cornerRounds(document);

    expect(lineEndpointAnchor(document, 'l1', round!.ends[0].tangent)).toBe('c');
    expect(lineEndpointAnchor(document, 'l1', 'a')).toBe('a');
    expect(lineSupportAnchors(document, 'l1')).toEqual({ start: 'c', end: 'a' });
    expect(lineSupportAnchors(document, 'l2')).toEqual({ start: 'c', end: 'b' });
  });

  it('maps both ends when a line carries a round at each end', () => {
    const base = documentOf(
      point('c', 0, 0),
      point('a', 100, 0),
      point('b', 0, 100),
      point('d', 100, 100),
      line('l1', 'c', 'a'),
      line('l2', 'c', 'b'),
      line('l3', 'a', 'd'),
    );
    const first = applyCommand(base, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l2', radius: 10 },
    }).document;
    const document = applyCommand(first, {
      id: 'r2',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l3', radius: 10 },
    }).document;

    const [startRound, endRound] = cornerRounds(document);
    const side = getEntity(document, 'l1') as LineEntity;
    expect([side.start, side.end]).toEqual([
      startRound!.ends[0].tangent,
      endRound!.ends[0].tangent,
    ]);
    expect(lineSupportAnchors(document, 'l1')).toEqual({ start: 'c', end: 'a' });
  });

  it('keeps the support anchors, the trimmed line and the sharp corner collinear', () => {
    const document = rounded();
    const round = roundOf(document);
    const corner = round.corner;

    for (const end of round.ends) {
      const anchor = lineEndpointAnchor(document, end.line, end.tangent);
      expect(anchor).toBe(corner);
      const cornerPoint = getEntity(document, corner) as PointEntity;
      const anchorPoint = getEntity(document, end.anchor) as PointEntity;
      const tangent = getEntity(document, end.tangent) as PointEntity;
      expect(Math.abs(cross(sub(tangent, cornerPoint), sub(anchorPoint, cornerPoint)))).toBeCloseTo(
        0,
        9,
      );
    }
  });

  it('returns null for a missing line or a non-point endpoint', () => {
    expect(lineSupportAnchors(rightAngle(), 'missing')).toBeNull();
    expect(lineSupportAnchors(rounded(), 'a')).toBeNull();

    const broken = documentOf(
      line('bad', 'l1', 'a'),
      line('tail', 'a', 'l1'),
      line('l1', 'c', 'a'),
      point('a', 10, 0),
    );
    expect(lineSupportAnchors(broken, 'bad')).toBeNull();
    expect(lineSupportAnchors(broken, 'tail')).toBeNull();
  });
});

describe('corner round feature points', () => {
  it('derives and persists the radius centre with the round', () => {
    const document = rounded();
    const round = roundOf(document);
    const centre = getEntity(document, round.center!);

    expect(round.center).toBe('r1:center');
    expect(centre).toMatchObject({ kind: 'point', x: 10, y: 10, construction: true, fixed: true });
    expect(isCornerRoundDerived(document, 'r1:center')).toBe(true);
    expect(cornerRoundsForEntity(document, 'r1:center')).toHaveLength(1);
  });

  it('moves the centre when the radius changes', () => {
    const document = rounded(10);
    const grown = regenerateCornerRounds({
      ...document,
      cornerRounds: [{ ...roundOf(document), radius: 20 }],
    });

    expect(getEntity(grown, 'r1:center')).toMatchObject({ x: 20, y: 20, fixed: true });
  });

  it('leaves a round written before feature points without a centre', () => {
    const document = rounded();
    const legacy: PatternDocument = {
      ...document,
      cornerRounds: [{ ...roundOf(document), center: undefined }],
    };

    const regenerated = regenerateCornerRounds(legacy);

    expect(cornerRounds(regenerated)[0]!.center).toBeUndefined();
  });

  it('does not use the centre as a piece loop vertex', () => {
    const base = documentOf(
      point('c1', 0, 0),
      point('c2', 100, 0),
      point('c3', 100, 100),
      point('c4', 0, 100),
      line('bottom', 'c1', 'c2'),
      line('right', 'c2', 'c3'),
      line('top', 'c3', 'c4'),
      line('left', 'c4', 'c1'),
    );
    const roundedBase = applyCommand(base, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'bottom', second: 'right', radius: 10 },
    }).document;
    expect(cornerRounds(roundedBase)[0]!.center).toBe('r1:center');
    const withPiece = applyCommand(
      applyCommand(roundedBase, {
        id: 'piece',
        type: 'create_piece',
        params: {},
      }).document,
      {
        id: 'loop',
        type: 'set_piece_loop',
        params: { piece: 'piece', edges: ['bottom', 'right', 'top', 'left'] },
      },
    ).document;

    expect(withPiece.pieces).toHaveLength(1);
    expect(withPiece.pieces[0]!.edges).toEqual(['bottom', 'right', 'top', 'left']);
  });
});

describe('normalizeCornerRounds feature points', () => {
  const legacy = (): PatternDocument => {
    const document = rounded();
    return {
      ...removeEntity(document, 'r1:center'),
      cornerRounds: [{ ...roundOf(document), center: undefined }],
    };
  };

  it('mints the centre once for a round written before the field existed', () => {
    const document = normalizeCornerRounds(legacy());
    const centre = getEntity(document, 'r1:center');

    expect(cornerRounds(document)[0]!.center).toBe('r1:center');
    expect(centre).toMatchObject({ kind: 'point', x: 10, y: 10, construction: true, fixed: true });
    // A second load is a no-op: nothing is missing and no coordinate moves.
    expect(normalizeCornerRounds(document)).toBe(document);
  });

  it('never rewrites a stored centre coordinate on load', () => {
    const document = rounded();
    const moved = mapEntity(document, 'r1:center', (entity) =>
      entity.kind === 'point' ? { ...entity, x: 99, y: 99 } : entity,
    );

    expect(normalizeCornerRounds(moved)).toBe(moved);
  });

  it('reuses an existing entity with the deterministic id', () => {
    const document = rounded();
    const orphaned: PatternDocument = {
      ...document,
      cornerRounds: [{ ...roundOf(document), center: undefined }],
    };
    const withEntity = mapEntity(orphaned, 'r1:center', (entity) =>
      entity.kind === 'point' ? { ...entity, x: 42, y: 42 } : entity,
    );

    const normalized = normalizeCornerRounds(withEntity);

    expect(cornerRounds(normalized)[0]!.center).toBe('r1:center');
    expect(getEntity(normalized, 'r1:center')).toMatchObject({ x: 42, y: 42 });
  });

  it('mints only the missing centre when one round already carries it', () => {
    const base = documentOf(
      point('c1', 0, 0),
      point('c2', 100, 0),
      point('c3', 100, 100),
      point('c4', 0, 100),
      line('bottom', 'c1', 'c2'),
      line('right', 'c2', 'c3'),
      line('top', 'c3', 'c4'),
      line('left', 'c4', 'c1'),
    );
    const first = applyCommand(base, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'bottom', second: 'right', radius: 10 },
    }).document;
    const both = applyCommand(first, {
      id: 'r2',
      type: 'add_corner_round',
      params: { first: 'top', second: 'left', radius: 10 },
    }).document;
    const mixed: PatternDocument = {
      ...removeEntity(both, 'r2:center'),
      cornerRounds: cornerRounds(both).map((round) =>
        round.id === 'r2' ? { ...round, center: undefined } : round,
      ),
    };

    const normalized = normalizeCornerRounds(mixed);

    expect(cornerRounds(normalized).map((round) => round.center)).toEqual([
      'r1:center',
      'r2:center',
    ]);
    expect(getEntity(normalized, 'r2:center')).toMatchObject({ kind: 'point', fixed: true });
  });

  it('mints nothing for a round that normalisation drops', () => {
    const document = removeEntity(legacy(), 'r1:arc');

    const normalized = normalizeCornerRounds(document);

    expect(cornerRounds(normalized)).toHaveLength(0);
    expect(getEntity(normalized, 'r1:center')).toBeUndefined();
  });

  it('drops a round whose persisted centre is not a fixed construction point', () => {
    const missing = removeEntity(normalizeCornerRounds(legacy()), 'r1:center');
    expect(cornerRounds(normalizeCornerRounds(missing))).toHaveLength(0);

    const loose = mapEntity(normalizeCornerRounds(legacy()), 'r1:center', (entity) =>
      entity.kind === 'point' ? { ...entity, fixed: false } : entity,
    );
    expect(cornerRounds(normalizeCornerRounds(loose))).toHaveLength(0);
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

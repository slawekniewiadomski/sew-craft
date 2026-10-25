import {
  applyCommand,
  createEmptyDocument,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  applyConstraintPick,
  CONSTRAINT_SLOTS,
  CONSTRAINT_TOOLS,
  constraintInitialValue,
  constraintParams,
  constraintPrompt,
  constraintRejection,
  constraintValueSpec,
  prunePicks,
  type ConstraintPick,
} from './constraint-tools';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: string, end: string): LineEntity {
  return { id, kind: 'line', start, end, construction: false };
}

function cv(id: string, p0: string, p1: string, p2: string, p3: string): CurveEntity {
  return { id, kind: 'curve', p0, p1, p2, p3, construction: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const document = doc([
  pt('a', 0, 0),
  pt('b', 100, 0),
  pt('c', 100, 100),
  pt('d', 0, 100),
  pt('e', 0, 0),
  pt('f', 100, 0),
  pt('tiny', 0.0004, 0),
  ln('ab', 'a', 'b'),
  ln('bc', 'b', 'c'),
  ln('cd', 'c', 'd'),
  ln('da', 'd', 'a'),
  ln('bad', 'a', 'missing'),
  cv('curve', 'a', 'b', 'c', 'd'),
]);

/** The shared fixture with the corner at `b` rounded between `ab` and `bc`. */
const roundedDocument = applyCommand(document, {
  id: 'r1',
  type: 'add_corner_round',
  params: { first: 'ab', second: 'bc', radius: 10 },
}).document;

function point(id: string): ConstraintPick {
  return { id, kind: 'point' };
}

function line(id: string): ConstraintPick {
  return { id, kind: 'line' };
}

function curve(id: string): ConstraintPick {
  return { id, kind: 'curve' };
}

function arc(id: string): ConstraintPick {
  return { id, kind: 'arc' };
}

function placement(
  type: Parameters<typeof applyConstraintPick>[0]['type'],
  picks: ConstraintPick[],
) {
  return { type, picks };
}

describe('CONSTRAINT_TOOLS', () => {
  it('maps every constraint type to a labelled ribbon button', () => {
    expect(CONSTRAINT_TOOLS).toEqual([
      { id: 'constraint-coincident', type: 'coincident', label: 'Coincident' },
      { id: 'constraint-horizontal', type: 'horizontal', label: 'Horizontal' },
      { id: 'constraint-vertical', type: 'vertical', label: 'Vertical' },
      { id: 'constraint-point_on_line', type: 'point_on_line', label: 'Point on line' },
      { id: 'constraint-distance', type: 'distance', label: 'Distance' },
      { id: 'constraint-angle', type: 'angle', label: 'Angle' },
      { id: 'constraint-equal', type: 'equal', label: 'Equal length' },
    ]);
  });
});

describe('CONSTRAINT_SLOTS', () => {
  it('describes point and segment roles per type', () => {
    expect(CONSTRAINT_SLOTS.horizontal).toEqual([{ kind: 'segment' }]);
    expect(CONSTRAINT_SLOTS.point_on_line).toEqual([{ kind: 'point' }, { kind: 'segment' }]);
    expect(CONSTRAINT_SLOTS.equal).toEqual([{ kind: 'segment' }, { kind: 'segment' }]);
  });
});

describe('applyConstraintPick', () => {
  it('accepts a line for horizontal and resolves its endpoints', () => {
    expect(applyConstraintPick(placement('horizontal', []), line('ab'), document)).toEqual({
      status: 'ready',
      picks: [line('ab')],
      params: { type: 'horizontal', entities: ['a', 'b'] },
    });
  });

  it('accepts a line for vertical', () => {
    expect(applyConstraintPick(placement('vertical', []), line('bc'), document)).toEqual({
      status: 'ready',
      picks: [line('bc')],
      params: { type: 'vertical', entities: ['b', 'c'] },
    });
  });

  it('accepts two points for a segment and waits between them', () => {
    expect(applyConstraintPick(placement('horizontal', []), point('a'), document)).toEqual({
      status: 'picking',
      picks: [point('a')],
    });
    expect(
      applyConstraintPick(placement('horizontal', [point('a')]), point('b'), document),
    ).toEqual({
      status: 'ready',
      picks: [point('a'), point('b')],
      params: { type: 'horizontal', entities: ['a', 'b'] },
    });
  });

  it('accepts two points for coincident and distance', () => {
    expect(
      applyConstraintPick(placement('coincident', [point('a')]), point('b'), document),
    ).toEqual({
      status: 'ready',
      picks: [point('a'), point('b')],
      params: { type: 'coincident', entities: ['a', 'b'] },
    });
    expect(applyConstraintPick(placement('distance', []), line('ab'), document)).toEqual({
      status: 'ready',
      picks: [line('ab')],
      params: { type: 'distance', entities: ['a', 'b'] },
    });
  });

  it('accepts point_on_line in either order', () => {
    expect(applyConstraintPick(placement('point_on_line', []), line('ab'), document)).toEqual({
      status: 'picking',
      picks: [line('ab')],
    });
    expect(
      applyConstraintPick(placement('point_on_line', [line('ab')]), point('c'), document),
    ).toEqual({
      status: 'ready',
      picks: [line('ab'), point('c')],
      params: { type: 'point_on_line', entities: ['c', 'a', 'b'] },
    });

    expect(applyConstraintPick(placement('point_on_line', []), point('c'), document)).toEqual({
      status: 'picking',
      picks: [point('c')],
    });
    expect(
      applyConstraintPick(placement('point_on_line', [point('c')]), point('d'), document),
    ).toEqual({
      status: 'picking',
      picks: [point('c'), point('d')],
    });
    expect(
      applyConstraintPick(
        placement('point_on_line', [point('c'), point('d')]),
        point('a'),
        document,
      ),
    ).toEqual({
      status: 'ready',
      picks: [point('c'), point('d'), point('a')],
      params: { type: 'point_on_line', entities: ['c', 'd', 'a'] },
    });
  });

  it('accepts three points for angle', () => {
    expect(applyConstraintPick(placement('angle', []), point('a'), document)).toEqual({
      status: 'picking',
      picks: [point('a')],
    });
    expect(applyConstraintPick(placement('angle', [point('a')]), point('b'), document)).toEqual({
      status: 'picking',
      picks: [point('a'), point('b')],
    });
    expect(
      applyConstraintPick(placement('angle', [point('a'), point('b')]), point('c'), document),
    ).toEqual({
      status: 'ready',
      picks: [point('a'), point('b'), point('c')],
      params: { type: 'angle', entities: ['a', 'b', 'c'] },
    });
  });

  it('accepts two lines or two point pairs for equal', () => {
    expect(applyConstraintPick(placement('equal', []), line('ab'), document)).toEqual({
      status: 'picking',
      picks: [line('ab')],
    });
    expect(applyConstraintPick(placement('equal', [line('ab')]), line('bc'), document)).toEqual({
      status: 'ready',
      picks: [line('ab'), line('bc')],
      params: { type: 'equal', entities: ['a', 'b', 'b', 'c'] },
    });
    expect(applyConstraintPick(placement('equal', []), point('a'), document)).toEqual({
      status: 'picking',
      picks: [point('a')],
    });
    expect(applyConstraintPick(placement('equal', [point('a')]), point('b'), document)).toEqual({
      status: 'picking',
      picks: [point('a'), point('b')],
    });
    expect(
      applyConstraintPick(placement('equal', [point('a'), point('b')]), point('c'), document),
    ).toEqual({
      status: 'picking',
      picks: [point('a'), point('b'), point('c')],
    });
    expect(
      applyConstraintPick(
        placement('equal', [point('a'), point('b'), point('c')]),
        point('d'),
        document,
      ),
    ).toEqual({
      status: 'ready',
      picks: [point('a'), point('b'), point('c'), point('d')],
      params: { type: 'equal', entities: ['a', 'b', 'c', 'd'] },
    });
  });

  it('allows adjacent equal segments to share an endpoint', () => {
    expect(
      applyConstraintPick(placement('equal', [line('ab')]), line('bc'), document),
    ).toMatchObject({ status: 'ready' });
  });

  it('rejects a curve or an arc without changing the picks', () => {
    expect(
      applyConstraintPick(placement('horizontal', [point('a')]), curve('curve'), document),
    ).toEqual({
      status: 'rejected',
      picks: [point('a')],
      reason: 'curve',
    });
    expect(
      applyConstraintPick(placement('horizontal', [point('a')]), arc('arc'), document),
    ).toEqual({
      status: 'rejected',
      picks: [point('a')],
      reason: 'curve',
    });
  });

  it('rejects a line for a point-only slot', () => {
    expect(applyConstraintPick(placement('coincident', []), line('ab'), document)).toEqual({
      status: 'rejected',
      picks: [],
      reason: 'point',
    });
    expect(
      applyConstraintPick(placement('point_on_line', [line('ab')]), line('bc'), document),
    ).toEqual({
      status: 'rejected',
      picks: [line('ab')],
      reason: 'point',
    });
  });

  it('rejects a pick when every slot is full', () => {
    expect(
      applyConstraintPick(placement('horizontal', [point('a'), point('b')]), point('c'), document),
    ).toEqual({
      status: 'rejected',
      picks: [point('a'), point('b')],
      reason: 'distinct',
    });
  });

  it('does not commit a completed degenerate tuple', () => {
    expect(
      applyConstraintPick(placement('coincident', [point('a')]), point('a'), document),
    ).toEqual({
      status: 'rejected',
      picks: [point('a')],
      reason: 'distinct',
    });
    expect(
      applyConstraintPick(placement('point_on_line', [point('a')]), line('ab'), document),
    ).toEqual({
      status: 'rejected',
      picks: [point('a')],
      reason: 'distinct',
    });
    expect(applyConstraintPick(placement('equal', [line('ab')]), line('ab'), document)).toEqual({
      status: 'rejected',
      picks: [line('ab')],
      reason: 'distinct',
    });
  });
});

describe('constraintParams', () => {
  it('returns null until every slot is complete', () => {
    expect(constraintParams('horizontal', [], document)).toBeNull();
    expect(constraintParams('horizontal', [point('a')], document)).toBeNull();
    expect(constraintParams('angle', [point('a'), point('b')], document)).toBeNull();
  });

  it('returns null for a missing or non-line segment reference', () => {
    expect(constraintParams('horizontal', [line('missing')], document)).toBeNull();
    expect(constraintParams('horizontal', [line('curve')], document)).toBeNull();
  });

  it('returns null when a pick cannot fill any slot', () => {
    expect(constraintParams('coincident', [line('ab')], document)).toBeNull();
  });

  it('rejects degenerate tuples for every shape', () => {
    expect(constraintParams('horizontal', [point('a'), point('a')], document)).toBeNull();
    expect(constraintParams('vertical', [point('b'), point('b')], document)).toBeNull();
    expect(constraintParams('distance', [point('c'), point('c')], document)).toBeNull();
    expect(
      constraintParams('point_on_line', [point('a'), point('a'), point('b')], document),
    ).toBeNull();
    expect(
      constraintParams('point_on_line', [point('c'), point('a'), point('a')], document),
    ).toBeNull();
    expect(constraintParams('angle', [point('a'), point('b'), point('a')], document)).toBeNull();
    expect(
      constraintParams('equal', [point('a'), point('a'), point('b'), point('c')], document),
    ).toBeNull();
    expect(
      constraintParams('equal', [point('a'), point('b'), point('c'), point('c')], document),
    ).toBeNull();
    expect(
      constraintParams('equal', [point('a'), point('b'), point('a'), point('b')], document),
    ).toBeNull();
    expect(
      constraintParams('equal', [point('a'), point('b'), point('b'), point('a')], document),
    ).toBeNull();
  });

  it('maps a rounded line to its support anchors for direction relations', () => {
    expect(constraintParams('horizontal', [line('ab')], roundedDocument)).toEqual({
      type: 'horizontal',
      entities: ['a', 'b'],
    });
    expect(constraintParams('vertical', [line('bc')], roundedDocument)).toEqual({
      type: 'vertical',
      entities: ['b', 'c'],
    });
    expect(constraintParams('point_on_line', [point('e'), line('ab')], roundedDocument)).toEqual({
      type: 'point_on_line',
      entities: ['e', 'a', 'b'],
    });
  });

  it('returns null when a direction relation line has a missing endpoint', () => {
    expect(constraintParams('horizontal', [line('bad')], document)).toBeNull();
    expect(constraintParams('point_on_line', [point('c'), line('bad')], document)).toBeNull();
  });

  it('keeps the visible endpoints for length relations on a rounded line', () => {
    const params = constraintParams('equal', [line('ab'), line('cd')], roundedDocument);

    expect(params).toEqual({
      type: 'equal',
      entities: ['a', 'r1:a', 'c', 'd'],
    });
    expect(constraintParams('distance', [line('ab')], roundedDocument)).toEqual({
      type: 'distance',
      entities: ['a', 'r1:a'],
    });
  });

  it('accepts a line or two points as one segment', () => {
    expect(constraintParams('horizontal', [line('ab')], document)).toEqual({
      type: 'horizontal',
      entities: ['a', 'b'],
    });
    expect(constraintParams('horizontal', [point('a'), point('b')], document)).toEqual({
      type: 'horizontal',
      entities: ['a', 'b'],
    });
  });
});

describe('constraintPrompt', () => {
  it('names each next pick', () => {
    expect(constraintPrompt('coincident', [])).toBe('Pick the first point.');
    expect(constraintPrompt('coincident', [point('a')])).toBe('Pick the second point.');
    expect(constraintPrompt('horizontal', [])).toBe('Pick a line, or two points.');
    expect(constraintPrompt('vertical', [point('a')])).toBe('Pick the second point.');
    expect(constraintPrompt('distance', [line('ab')])).toBe('Pick a line, or two points.');
    expect(constraintPrompt('point_on_line', [])).toBe('Pick the point to constrain.');
    expect(constraintPrompt('point_on_line', [line('ab')])).toBe('Pick the point to constrain.');
    expect(constraintPrompt('point_on_line', [point('c')])).toBe('Pick a line, or two points.');
    expect(constraintPrompt('point_on_line', [point('c'), point('d')])).toBe(
      "Pick the line's second point.",
    );
    expect(constraintPrompt('point_on_line', [line('ab'), point('c')])).toBe(
      'Pick the point to constrain.',
    );
    expect(constraintPrompt('angle', [])).toBe('Pick the first ray point.');
    expect(constraintPrompt('angle', [point('a')])).toBe('Pick the vertex.');
    expect(constraintPrompt('angle', [point('a'), point('b')])).toBe('Pick the second ray point.');
    expect(constraintPrompt('angle', [point('a'), point('b'), point('c')])).toBe(
      'Pick the first ray point.',
    );
    expect(constraintPrompt('equal', [])).toBe('Pick the first line, or two points.');
    expect(constraintPrompt('equal', [point('a')])).toBe("Pick the first line's second point.");
    expect(constraintPrompt('equal', [line('ab')])).toBe('Pick the second line, or two points.');
    expect(constraintPrompt('equal', [line('ab'), point('c')])).toBe(
      "Pick the second line's second point.",
    );
    expect(constraintPrompt('equal', [line('ab'), line('bc')])).toBe(
      'Pick the first line, or two points.',
    );
  });

  it('falls back gracefully when picks cannot be assigned', () => {
    expect(constraintPrompt('equal', [line('ab'), line('bc'), line('cd')])).toBe(
      'Pick the first line, or two points.',
    );
    expect(constraintPrompt('point_on_line', [line('ab'), line('bc')])).toBe(
      'Pick the point to constrain.',
    );
  });
});

describe('constraintRejection', () => {
  it('explains each rejection', () => {
    expect(constraintRejection('curve')).toBe(
      'Curves and arcs are not supported yet; pick a point or a line.',
    );
    expect(constraintRejection('point')).toBe('Pick a point.');
    expect(constraintRejection('distinct')).toBe('Pick distinct points.');
  });
});

describe('prunePicks', () => {
  it('keeps picks whose entities still resolve', () => {
    expect(prunePicks([point('a'), line('ab')], document)).toEqual([point('a'), line('ab')]);
  });

  it('drops missing points, lines, curves, arcs and lines without endpoints', () => {
    expect(
      prunePicks(
        [point('missing'), line('bad'), line('missing'), curve('curve'), arc('arc')],
        document,
      ),
    ).toEqual([]);
  });
});

describe('constraintValueSpec', () => {
  it('returns null for non-dimensional constraints', () => {
    expect(constraintValueSpec('horizontal')).toBeNull();
  });

  it('validates and converts distance values', () => {
    const spec = constraintValueSpec('distance')!;
    expect(spec.unit).toBe('mm');
    expect(spec.label).toBe('Distance (mm)');
    expect(spec.invalidMessage).toContain('greater than 0');
    expect(spec.isValid(12.5)).toBe(true);
    expect(spec.isValid(0)).toBe(false);
    expect(spec.isValid(-1)).toBe(false);
    expect(spec.isValid(Number.NaN)).toBe(false);
    expect(spec.isValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(spec.toCommandValue(12.5)).toBe(12.5);
  });

  it('validates and converts angle degrees to radians', () => {
    const spec = constraintValueSpec('angle')!;
    expect(spec.unit).toBe('°');
    expect(spec.label).toBe('Angle (°)');
    expect(spec.invalidMessage).toContain('valid angle');
    expect(spec.isValid(-45)).toBe(true);
    expect(spec.isValid(Number.NaN)).toBe(false);
    expect(spec.isValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(spec.toCommandValue(180)).toBeCloseTo(Math.PI);
  });
});

describe('constraintInitialValue', () => {
  it('is empty for non-dimensional constraints', () => {
    expect(constraintInitialValue('horizontal', [line('ab')], document)).toBe('');
  });

  it('is empty for an incomplete or missing tuple', () => {
    expect(constraintInitialValue('distance', [], document)).toBe('');
    expect(constraintInitialValue('distance', [point('missing'), point('a')], document)).toBe('');
    expect(constraintInitialValue('distance', [point('a'), point('missing')], document)).toBe('');
    expect(
      constraintInitialValue('angle', [point('missing'), point('b'), point('c')], document),
    ).toBe('');
    expect(
      constraintInitialValue('angle', [point('a'), point('missing'), point('c')], document),
    ).toBe('');
    expect(
      constraintInitialValue('angle', [point('a'), point('b'), point('missing')], document),
    ).toBe('');
  });

  it('shows the measured distance rounded to three decimals', () => {
    expect(constraintInitialValue('distance', [line('ab')], document)).toBe('100');
    expect(constraintInitialValue('distance', [point('a'), point('tiny')], document)).toBe(
      '0.0004',
    );
  });

  it('is empty for a zero distance', () => {
    expect(constraintInitialValue('distance', [point('a'), point('e')], document)).toBe('');
  });

  it('shows the measured angle in degrees rounded to three decimals', () => {
    expect(constraintInitialValue('angle', [point('a'), point('b'), point('c')], document)).toBe(
      '-90',
    );
    expect(constraintInitialValue('angle', [point('c'), point('b'), point('a')], document)).toBe(
      '90',
    );
  });

  it('is empty for a degenerate angle', () => {
    expect(constraintInitialValue('angle', [point('a'), point('e'), point('c')], document)).toBe(
      '',
    );
    expect(constraintInitialValue('angle', [point('a'), point('b'), point('f')], document)).toBe(
      '',
    );
  });
});

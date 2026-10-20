import { describe, expect, it } from 'vitest';

import {
  constraintOffset,
  constraintOrientation,
  DEFAULT_DIMENSION_OFFSET,
  DIMENSION_CHEVRON_ANGLE,
  DIMENSION_CHEVRON_LENGTH,
  DIMENSION_EXTENSION_GAP,
  DIMENSION_EXTENSION_OVERSHOOT,
  DIMENSION_LABEL_GAP,
  createsReferenceCycle,
  dimensionGeometry,
  dimensionOffsetForPointer,
  dimensionState,
  dimensionValue,
  findDistanceConstraint,
  inferDimensionOrientation,
  isBrokenDimension,
  isDrivenDimension,
  isReferencedDimension,
  measureLinearDimension,
  referenceCandidates,
  resolveDimensionValue,
  resolveSetValue,
  createEmptyDocument,
  type Constraint,
  type DistanceConstraint,
  type EntityId,
  type PatternDocument,
  type PointEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
});

const documentOf = (entities: PointEntity[], constraints: Constraint[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  constraints,
});

const basePoints = [point('a', 0, 0), point('b', 100, 0), point('c', 100, 50), point('d', 0, 50)];

const distance = (
  id: string,
  a: EntityId,
  b: EntityId,
  value = 100,
  extra: { orientation?: DistanceConstraint['orientation']; offset?: number } = {},
): DistanceConstraint => ({ id, type: 'distance', a, b, value, ...extra });

const expectPoint = (actual: { x: number; y: number }, x: number, y: number): void => {
  expect(actual.x).toBeCloseTo(x, 6);
  expect(actual.y).toBeCloseTo(y, 6);
};

/** Arm endpoint of a chevron tip, rotated by `angle` from the reach vector. */
const arm = (tipX: number, tipY: number, reachX: number, reachY: number, angle: number) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: tipX + reachX * cos - reachY * sin,
    y: tipY + reachX * sin + reachY * cos,
  };
};

describe('constraintOrientation / constraintOffset', () => {
  it('pins the documented default offset to 20 mm', () => {
    expect(DEFAULT_DIMENSION_OFFSET).toBe(20);
  });

  it('defaults to aligned and the default offset', () => {
    const constraint = distance('d', 'a', 'b');
    expect(constraintOrientation(constraint)).toBe('aligned');
    expect(constraintOffset(constraint)).toBe(DEFAULT_DIMENSION_OFFSET);
  });

  it('honours explicit presentation fields', () => {
    const constraint = distance('d', 'a', 'b', 100, { orientation: 'horizontal', offset: -4 });
    expect(constraintOrientation(constraint)).toBe('horizontal');
    expect(constraintOffset(constraint)).toBe(-4);
  });
});

describe('measureLinearDimension', () => {
  const document = documentOf(basePoints);

  it('measures aligned, horizontal and vertical spans', () => {
    expect(measureLinearDimension(document, 'a', 'c', 'aligned')).toBeCloseTo(
      Math.hypot(100, 50),
      9,
    );
    expect(measureLinearDimension(document, 'a', 'c', 'horizontal')).toBe(100);
    expect(measureLinearDimension(document, 'a', 'c', 'vertical')).toBe(50);
  });

  it('returns null when a point is missing', () => {
    expect(measureLinearDimension(document, 'a', 'missing', 'aligned')).toBeNull();
    expect(measureLinearDimension(document, 'missing', 'a', 'aligned')).toBeNull();
  });
});

describe('isDrivenDimension / dimensionValue', () => {
  const document = documentOf(basePoints);

  it('reports whether a dimension has a driving value', () => {
    const driven: DistanceConstraint = { id: 'm', type: 'distance', a: 'a', b: 'b' };
    const set: DistanceConstraint = { id: 'd', type: 'distance', a: 'a', b: 'b', value: 100 };

    expect(isDrivenDimension(driven)).toBe(true);
    expect(isDrivenDimension(set)).toBe(false);
  });

  it('returns the stored value for a set dimension', () => {
    const set: DistanceConstraint = { id: 'd', type: 'distance', a: 'a', b: 'b', value: 42 };

    expect(dimensionValue(document, set)).toBe(42);
  });

  it('measures a driven dimension along every orientation', () => {
    const aligned: DistanceConstraint = { id: 'a', type: 'distance', a: 'a', b: 'c' };
    const horizontal: DistanceConstraint = {
      id: 'h',
      type: 'distance',
      a: 'a',
      b: 'c',
      orientation: 'horizontal',
    };
    const vertical: DistanceConstraint = {
      id: 'v',
      type: 'distance',
      a: 'a',
      b: 'c',
      orientation: 'vertical',
    };

    expect(dimensionValue(document, aligned)).toBeCloseTo(Math.hypot(100, 50), 9);
    expect(dimensionValue(document, horizontal)).toBe(100);
    expect(dimensionValue(document, vertical)).toBe(50);
  });

  it('returns null for a driven dimension whose point is missing', () => {
    const missing: DistanceConstraint = { id: 'm', type: 'distance', a: 'a', b: 'missing' };

    expect(dimensionValue(document, missing)).toBeNull();
  });
});

describe('findDistanceConstraint', () => {
  it('matches the pair in either order and ignores other constraint types', () => {
    const document = documentOf(basePoints, [
      { id: 'h', type: 'horizontal', a: 'a', b: 'b' },
      distance('d', 'a', 'b'),
    ]);

    expect(findDistanceConstraint(document, 'a', 'b')?.id).toBe('d');
    expect(findDistanceConstraint(document, 'b', 'a')?.id).toBe('d');
    expect(findDistanceConstraint(document, 'a', 'c')).toBeUndefined();
  });

  it('is undefined when no distance constraint exists', () => {
    expect(findDistanceConstraint(documentOf(basePoints), 'a', 'b')).toBeUndefined();
  });
});

describe('inferDimensionOrientation', () => {
  const document = documentOf(basePoints);

  it('keeps axis-aligned spans on their axis', () => {
    expect(inferDimensionOrientation(document, 'a', 'b', { x: 50, y: 40 })).toBe('horizontal');
    expect(inferDimensionOrientation(document, 'a', 'd', { x: 40, y: 25 })).toBe('vertical');
  });

  it('picks aligned when a diagonal span is dragged perpendicular to itself', () => {
    // Span a->c is (100, 50); its normal is roughly (-0.447, 0.894).
    const pointer = { x: 50 - 0.447 * 100, y: 25 + 0.894 * 100 };
    expect(inferDimensionOrientation(document, 'a', 'c', pointer)).toBe('aligned');
  });

  it('follows the dominant axis when a diagonal span is dragged along itself', () => {
    const along = { x: 50 + 0.894 * 100, y: 25 + 0.447 * 100 };
    expect(inferDimensionOrientation(document, 'a', 'c', along)).toBe('vertical');

    const steep = documentOf([point('a', 0, 0), point('e', 50, 100)]);
    expect(
      inferDimensionOrientation(steep, 'a', 'e', { x: 25 + 0.447 * 100, y: 50 + 0.894 * 100 }),
    ).toBe('horizontal');
  });

  it('falls back to aligned for missing or degenerate spans', () => {
    expect(inferDimensionOrientation(document, 'a', 'missing', { x: 0, y: 0 })).toBe('aligned');
    expect(inferDimensionOrientation(document, 'a', 'a', { x: 0, y: 0 })).toBe('aligned');
  });
});

describe('dimensionOffsetForPointer', () => {
  const document = documentOf(basePoints);

  it('measures horizontal and vertical offsets from the span midpoint', () => {
    expect(dimensionOffsetForPointer(document, 'a', 'b', 'horizontal', { x: 50, y: 30 })).toBe(30);
    expect(dimensionOffsetForPointer(document, 'a', 'd', 'vertical', { x: 20, y: 25 })).toBe(20);
  });

  it('measures aligned offsets as signed perpendicular distance', () => {
    expect(dimensionOffsetForPointer(document, 'a', 'b', 'aligned', { x: 50, y: 20 })).toBe(20);
    expect(dimensionOffsetForPointer(document, 'a', 'b', 'aligned', { x: 50, y: -20 })).toBe(-20);
  });

  it('falls back to the default for missing or degenerate spans', () => {
    expect(dimensionOffsetForPointer(document, 'a', 'missing', 'aligned', { x: 0, y: 0 })).toBe(
      DEFAULT_DIMENSION_OFFSET,
    );
    expect(dimensionOffsetForPointer(document, 'a', 'a', 'aligned', { x: 5, y: 5 })).toBe(
      DEFAULT_DIMENSION_OFFSET,
    );
  });
});

describe('dimensionGeometry', () => {
  const document = documentOf(basePoints);

  it('lays out an aligned dimension with extensions, chevrons and label', () => {
    const layout = dimensionGeometry(document, distance('d', 'a', 'b', 100, { offset: 10 }))!;

    expectPoint(layout.dimensionStart, 0, 10);
    expectPoint(layout.dimensionEnd, 100, 10);

    expectPoint(layout.extensions[0]!.start, 0, DIMENSION_EXTENSION_GAP);
    expectPoint(layout.extensions[0]!.end, 0, 10 + DIMENSION_EXTENSION_OVERSHOOT);
    expectPoint(layout.extensions[1]!.start, 100, DIMENSION_EXTENSION_GAP);
    expectPoint(layout.extensions[1]!.end, 100, 10 + DIMENSION_EXTENSION_OVERSHOOT);

    expectPoint(layout.chevrons[0]!.tip, 0, 10);
    expectPoint(
      layout.chevrons[0]!.armA,
      arm(0, 10, DIMENSION_CHEVRON_LENGTH, 0, DIMENSION_CHEVRON_ANGLE).x,
      arm(0, 10, DIMENSION_CHEVRON_LENGTH, 0, DIMENSION_CHEVRON_ANGLE).y,
    );
    expectPoint(layout.chevrons[1]!.tip, 100, 10);

    expectPoint(layout.label.position, 50, 10 + DIMENSION_LABEL_GAP);
    expect(layout.label.angleDegrees).toBe(0);
  });

  it('lays out a horizontal dimension and points extensions towards the line', () => {
    const layout = dimensionGeometry(
      document,
      distance('d', 'a', 'c', 100, { orientation: 'horizontal', offset: -10 }),
    )!;

    expectPoint(layout.dimensionStart, 0, 15);
    expectPoint(layout.dimensionEnd, 100, 15);
    expectPoint(layout.extensions[0]!.start, 0, DIMENSION_EXTENSION_GAP);
    expectPoint(layout.extensions[0]!.end, 0, 17);
    expectPoint(layout.extensions[1]!.start, 100, 50 - DIMENSION_EXTENSION_GAP);
    expectPoint(layout.extensions[1]!.end, 100, 13);
    expectPoint(layout.label.position, 50, 15 - DIMENSION_LABEL_GAP);
    expect(layout.label.angleDegrees).toBe(0);
  });

  it('lays out a vertical dimension with a 90 degree label', () => {
    const layout = dimensionGeometry(
      document,
      distance('d', 'a', 'c', 50, { orientation: 'vertical', offset: 10 }),
    )!;

    expectPoint(layout.dimensionStart, 60, 0);
    expectPoint(layout.dimensionEnd, 60, 50);
    expectPoint(layout.extensions[0]!.start, DIMENSION_EXTENSION_GAP, 0);
    expectPoint(layout.extensions[0]!.end, 62, 0);
    expectPoint(layout.extensions[1]!.start, 100 - DIMENSION_EXTENSION_GAP, 50);
    expectPoint(layout.extensions[1]!.end, 58, 50);
    expectPoint(layout.label.position, 62.5, 25);
    expect(layout.label.angleDegrees).toBe(90);
  });

  it('keeps a reversed aligned dimension label upright', () => {
    const layout = dimensionGeometry(document, distance('d', 'b', 'a', 100, { offset: 10 }))!;

    expectPoint(layout.dimensionStart, 100, -10);
    expectPoint(layout.label.position, 50, -12.5);
    expect(layout.label.angleDegrees).toBe(0);
  });

  it('uses the default offset and orientation when they are omitted', () => {
    const layout = dimensionGeometry(document, distance('d', 'a', 'b'))!;

    expectPoint(layout.dimensionStart, 0, DEFAULT_DIMENSION_OFFSET);
    expect(layout.chevrons).toHaveLength(2);
  });

  it('collapses an extension line that starts on the dimension line', () => {
    const layout = dimensionGeometry(
      document,
      distance('d', 'a', 'b', 100, { orientation: 'horizontal', offset: 0 }),
    )!;

    expectPoint(layout.extensions[0]!.start, 0, 0);
    expectPoint(layout.extensions[0]!.end, 0, 0);
    // Offset zero keeps a non-zero label normal so the value stays readable.
    expectPoint(layout.label.position, 50, DIMENSION_LABEL_GAP);
  });

  it('collapses a vertical extension line that starts on the dimension line', () => {
    // Midpoint x is 50, so offset -50 puts the line exactly through point `a`.
    const layout = dimensionGeometry(
      document,
      distance('d', 'a', 'c', 50, { orientation: 'vertical', offset: -50 }),
    )!;

    expectPoint(layout.dimensionStart, 0, 0);
    expectPoint(layout.extensions[0]!.start, 0, 0);
    expectPoint(layout.extensions[0]!.end, 0, 0);
    expectPoint(layout.extensions[1]!.start, 98.5, 50);
    expectPoint(layout.extensions[1]!.end, -2, 50);
  });

  it('flips the label to the other side of a vertical line for negative offsets', () => {
    const layout = dimensionGeometry(
      document,
      distance('d', 'a', 'c', 50, { orientation: 'vertical', offset: -10 }),
    )!;

    expectPoint(layout.dimensionStart, 40, 0);
    expectPoint(layout.dimensionEnd, 40, 50);
    expectPoint(layout.label.position, 37.5, 25);
    expect(layout.label.angleDegrees).toBe(90);
  });

  it('flips the label and extensions for a negative aligned offset', () => {
    const layout = dimensionGeometry(document, distance('d', 'a', 'b', 100, { offset: -10 }))!;

    expectPoint(layout.dimensionStart, 0, -10);
    expectPoint(layout.dimensionEnd, 100, -10);
    expectPoint(layout.extensions[0]!.start, 0, -1.5);
    expectPoint(layout.extensions[0]!.end, 0, -12);
    expectPoint(layout.label.position, 50, -12.5);
  });

  it('keeps a bottom-to-top dimension label upright', () => {
    const layout = dimensionGeometry(
      document,
      distance('d', 'd', 'a', 50, { orientation: 'vertical', offset: 10 }),
    )!;

    expect(layout.label.angleDegrees).toBe(90);
  });

  it('returns null for missing points or degenerate spans', () => {
    expect(dimensionGeometry(document, distance('d', 'a', 'missing'))).toBeNull();
    expect(dimensionGeometry(document, distance('d', 'missing', 'a'))).toBeNull();
    expect(
      dimensionGeometry(document, distance('d', 'a', 'a', 10, { orientation: 'aligned' })),
    ).toBeNull();
    expect(
      dimensionGeometry(document, distance('d', 'a', 'a', 10, { orientation: 'horizontal' })),
    ).toBeNull();
    expect(
      dimensionGeometry(document, distance('d', 'a', 'a', 10, { orientation: 'vertical' })),
    ).toBeNull();
  });
});

describe('dimension references', () => {
  const withConstraints = (constraints: Constraint[]): PatternDocument => ({
    ...documentOf(basePoints),
    constraints,
  });

  const set = (id: string, a: EntityId, b: EntityId, value: number): DistanceConstraint => ({
    id,
    type: 'distance',
    a,
    b,
    value,
  });

  const driven = (id: string, a: EntityId, b: EntityId): DistanceConstraint => ({
    id,
    type: 'distance',
    a,
    b,
  });

  const link = (
    id: string,
    a: EntityId,
    b: EntityId,
    reference: EntityId,
    lastKnownValue?: number,
  ): DistanceConstraint => ({
    id,
    type: 'distance',
    a,
    b,
    reference,
    ...(lastKnownValue === undefined ? {} : { lastKnownValue }),
  });

  it('classifies set, driven, referenced and broken dimensions', () => {
    const document = withConstraints([
      set('source', 'a', 'b', 120),
      driven('measure', 'b', 'c'),
      link('reference', 'c', 'd', 'source'),
      link('dangling', 'd', 'a', 'missing'),
    ]);

    expect(dimensionState(document, document.constraints[0] as DistanceConstraint)).toBe('set');
    expect(dimensionState(document, document.constraints[1] as DistanceConstraint)).toBe('driven');
    expect(isDrivenDimension(document.constraints[1] as DistanceConstraint)).toBe(true);
    expect(dimensionState(document, document.constraints[2] as DistanceConstraint)).toBe(
      'referenced',
    );
    expect(dimensionState(document, document.constraints[3] as DistanceConstraint)).toBe('broken');
  });

  it('never treats a driven source as a resolved reference', () => {
    const document = withConstraints([
      driven('measure', 'a', 'b'),
      link('dep', 'c', 'd', 'measure'),
    ]);
    const dependent = document.constraints[1] as DistanceConstraint;

    expect(dimensionState(document, dependent)).toBe('broken');
    expect(isReferencedDimension(document, dependent)).toBe(false);
    expect(isBrokenDimension(document, dependent)).toBe(true);
    expect(resolveSetValue(document.constraints, dependent)).toBeNull();
  });

  it('reports the resolved value through a chain', () => {
    const document = withConstraints([
      set('a', 'a', 'b', 120),
      link('b', 'b', 'c', 'a'),
      link('c', 'c', 'd', 'b'),
    ]);
    const [first, second, third] = document.constraints as DistanceConstraint[];

    expect(resolveSetValue(document.constraints, first!)).toBe(120);
    expect(resolveSetValue(document.constraints, second!)).toBe(120);
    expect(resolveSetValue(document.constraints, third!)).toBe(120);
    expect(dimensionValue(document, third!)).toBe(120);
  });

  it('shows a driven measurement for a driven dimension and the last known value when broken', () => {
    const document = withConstraints([
      driven('measure', 'a', 'b'),
      link('broken', 'c', 'd', 'missing', 42),
      link('broken-without-value', 'd', 'a', 'missing'),
    ]);

    expect(dimensionValue(document, document.constraints[0] as DistanceConstraint)).toBe(100);
    expect(resolveDimensionValue(document, document.constraints[1] as DistanceConstraint)).toBe(42);
    expect(
      resolveDimensionValue(document, document.constraints[2] as DistanceConstraint),
    ).toBeNull();
  });

  it('returns null when a referenced point is missing', () => {
    const document = withConstraints([driven('measure', 'a', 'missing')]);

    expect(dimensionValue(document, document.constraints[0] as DistanceConstraint)).toBeNull();
  });

  it('treats a hand-edited cycle as broken without recursing forever', () => {
    const document = withConstraints([
      link('one', 'a', 'b', 'two'),
      link('two', 'b', 'c', 'one'),
      link('three', 'c', 'd', 'one', 30),
    ]);
    const [one, two, three] = document.constraints as DistanceConstraint[];

    expect(dimensionState(document, one!)).toBe('broken');
    expect(dimensionState(document, two!)).toBe('broken');
    expect(dimensionValue(document, three!)).toBe(30);
    expect(resolveSetValue(document.constraints, one!)).toBeNull();
  });

  it('rejects an unusable literal as a source value', () => {
    const document = withConstraints([
      { id: 'zero', type: 'distance', a: 'a', b: 'b', value: 0 },
      link('dep', 'c', 'd', 'zero'),
    ]);

    expect(
      resolveSetValue(document.constraints, document.constraints[0] as DistanceConstraint),
    ).toBeNull();
    expect(dimensionState(document, document.constraints[1] as DistanceConstraint)).toBe('broken');
  });

  it('detects self, direct and indirect cycles', () => {
    const constraints: Constraint[] = [
      set('a', 'a', 'b', 10),
      link('b', 'b', 'c', 'a'),
      link('c', 'c', 'd', 'b'),
    ];

    expect(createsReferenceCycle(constraints, 'b', 'b')).toBe(true);
    expect(createsReferenceCycle(constraints, 'a', 'b')).toBe(true);
    expect(createsReferenceCycle(constraints, 'a', 'c')).toBe(true);
    expect(createsReferenceCycle(constraints, 'd', 'a')).toBe(false);
    expect(createsReferenceCycle(constraints, 'd', 'missing')).toBe(false);
    expect(
      createsReferenceCycle([link('x', 'a', 'b', 'y'), link('y', 'b', 'c', 'x')], 'z', 'x'),
    ).toBe(true);
  });

  it('offers only resolvable, distinct, non-cyclic sources', () => {
    const document = withConstraints([
      set('source', 'a', 'b', 120),
      driven('measure', 'b', 'c'),
      link('chain', 'c', 'd', 'source'),
      link('dangling', 'd', 'a', 'missing', 10),
      set('same-pair', 'c', 'd', 50),
      set('other', 'b', 'c', 30),
      link('loop', 'b', 'c', 'chain'),
    ]);
    const chain = document.constraints[2] as DistanceConstraint;
    const source = document.constraints[0] as DistanceConstraint;

    // Self, driven, broken, same-pair and cycle-creating rows are absent.
    expect(referenceCandidates(document, chain).map((entry) => entry.id)).toEqual([
      'source',
      'other',
    ]);
    expect(referenceCandidates(document, source).map((entry) => entry.id)).toEqual([
      'same-pair',
      'other',
    ]);
  });
});

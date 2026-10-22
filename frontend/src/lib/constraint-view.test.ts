import { createEmptyDocument, type Constraint, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  constraintLabel,
  constraintMarkers,
  CONSTRAINT_ICONS,
  CONSTRAINT_LABELS,
  CONSTRAINT_ROLES,
  constraintValueUnit,
  isValidConstraintValue,
} from './constraint-view';

const doc = (constraints: Constraint[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
    { id: 'c', kind: 'point', x: 100, y: 60, construction: false, fixed: false },
  ],
  constraints,
});

type SolverConstraint = Exclude<Constraint, { type: 'derived_distance' }>;

const ALL: SolverConstraint[] = [
  { id: 'coincident-ab', type: 'coincident', a: 'a', b: 'b' },
  { id: 'horizontal-ab', type: 'horizontal', a: 'a', b: 'b' },
  { id: 'vertical-bc', type: 'vertical', a: 'b', b: 'c' },
  { id: 'on-line', type: 'point_on_line', point: 'c', a: 'a', b: 'b' },
  { id: 'width', type: 'distance', a: 'a', b: 'b', value: 100 },
  { id: 'corner', type: 'angle', a: 'a', b: 'b', c: 'c', value: Math.PI / 2 },
  { id: 'equal', type: 'equal', a1: 'a', a2: 'b', b1: 'b', b2: 'c' },
];

describe('CONSTRAINT_LABELS / CONSTRAINT_ROLES', () => {
  it('names every constraint type with one role per entity slot', () => {
    for (const constraint of ALL) {
      expect(CONSTRAINT_LABELS[constraint.type]).toBeTruthy();
      expect(CONSTRAINT_ROLES[constraint.type].length).toBe(
        constraint.type === 'point_on_line' || constraint.type === 'angle'
          ? 3
          : constraint.type === 'equal'
            ? 4
            : 2,
      );
    }
  });
});

describe('constraintValueUnit', () => {
  it('returns mm for distance, rad for angle and null otherwise', () => {
    expect(constraintValueUnit('distance')).toBe('mm');
    expect(constraintValueUnit('angle')).toBe('rad');
    expect(constraintValueUnit('horizontal')).toBeNull();
    expect(constraintValueUnit('coincident')).toBeNull();
    expect(constraintValueUnit('vertical')).toBeNull();
    expect(constraintValueUnit('point_on_line')).toBeNull();
    expect(constraintValueUnit('equal')).toBeNull();
  });
});

describe('isValidConstraintValue', () => {
  it('requires a finite distance greater than zero', () => {
    expect(isValidConstraintValue('distance', 10)).toBe(true);
    expect(isValidConstraintValue('distance', 0)).toBe(false);
    expect(isValidConstraintValue('distance', -5)).toBe(false);
    expect(isValidConstraintValue('distance', Number.NaN)).toBe(false);
  });

  it('requires a finite angle value', () => {
    expect(isValidConstraintValue('angle', 0)).toBe(true);
    expect(isValidConstraintValue('angle', Number.NaN)).toBe(false);
  });

  it('accepts any value for types without a parameter', () => {
    expect(isValidConstraintValue('horizontal', Number.NaN)).toBe(true);
  });
});

describe('constraintLabel', () => {
  it('includes the parameter for distance and angle', () => {
    expect(constraintLabel(ALL[4]!)).toBe('Distance 100 mm');
    expect(constraintLabel(ALL[5]!)).toBe('Angle 90°');
  });

  it('uses the type name for parameterless constraints', () => {
    expect(constraintLabel(ALL[0]!)).toBe('Coincident');
    expect(constraintLabel(ALL[1]!)).toBe('Horizontal');
    expect(constraintLabel(ALL[2]!)).toBe('Vertical');
    expect(constraintLabel(ALL[3]!)).toBe('Point on line');
    expect(constraintLabel(ALL[6]!)).toBe('Equal length');
  });

  it('names a derived dimension as a cut dimension', () => {
    expect(
      constraintLabel({
        id: 'cut',
        type: 'derived_distance',
        piece: 'p1',
        a: { edge: 'ab', at: 'start' },
        b: { edge: 'bc', at: 'end' },
      }),
    ).toBe('Cut dimension');
  });
});

describe('CONSTRAINT_ICONS', () => {
  it('draws at least one stroke path for every constraint type', () => {
    for (const constraint of ALL) {
      expect(CONSTRAINT_ICONS[constraint.type].paths.length).toBeGreaterThan(0);
    }
  });

  it('marks point-on-line with a filled dot', () => {
    expect(CONSTRAINT_ICONS.point_on_line.dots).toEqual([{ cx: 6, cy: 6, r: 1.4 }]);
    expect(CONSTRAINT_ICONS.horizontal.dots).toBeUndefined();
  });
});

describe('constraintMarkers', () => {
  it('places an icon at the centroid of the referenced points', () => {
    expect(constraintMarkers(doc([ALL[1]!, ALL[5]!]))).toEqual([
      { id: 'horizontal-ab', type: 'horizontal', label: 'Horizontal', x: 50, y: 0 },
      { id: 'corner', type: 'angle', label: 'Angle 90°', x: 200 / 3, y: 60 / 3 },
    ]);
  });

  it('skips constraints whose referenced points are missing', () => {
    const dangling: Constraint = { id: 'dangling', type: 'horizontal', a: 'a', b: 'ghost' };
    expect(constraintMarkers(doc([dangling]))).toEqual([]);
  });

  it('returns no markers for a document without constraints', () => {
    expect(constraintMarkers(doc([]))).toEqual([]);
  });
});

import {
  cross,
  distance,
  dot,
  magnitude,
  roundToThousandth,
  sub,
  type ConstraintType,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';

import { constraintParams, pointMap, type ConstraintPick } from './constraint-pick';

export interface ConstraintValueSpec {
  unit: 'mm' | '°';
  label: string;
  invalidMessage: string;
  /** Whether the field also takes a formula over the document's variables. */
  acceptsFormula: boolean;
  isValid: (value: number) => boolean;
  toCommandValue: (value: number) => number;
}

/** Numeric input rules for dimensional constraints, or `null` for the others. */
export function constraintValueSpec(type: ConstraintType): ConstraintValueSpec | null {
  if (type === 'distance') {
    return {
      unit: 'mm',
      label: 'Distance (mm)',
      invalidMessage: 'Enter a distance greater than 0 mm, or a formula.',
      acceptsFormula: true,
      isValid: (value) => Number.isFinite(value) && value > 0,
      toCommandValue: (value) => value,
    };
  }

  if (type === 'angle') {
    return {
      unit: '°',
      label: 'Angle (°)',
      invalidMessage: 'Enter a valid angle in degrees.',
      acceptsFormula: false,
      isValid: (value) => Number.isFinite(value),
      toCommandValue: (value) => (value * Math.PI) / 180,
    };
  }

  return null;
}

function distanceMeasurement(a: PointEntity, b: PointEntity): string {
  const measured = distance(a, b);
  if (measured === 0) return '';
  const rounded = roundToThousandth(measured);
  return String(rounded === 0 ? measured : rounded);
}

function angleMeasurement(a: PointEntity, vertex: PointEntity, c: PointEntity): string {
  const u = sub(a, vertex);
  const v = sub(c, vertex);
  if (magnitude(u) === 0 || magnitude(v) === 0) return '';
  const degrees = (Math.atan2(cross(u, v), dot(u, v)) * 180) / Math.PI;
  return String(roundToThousandth(degrees));
}

/**
 * The measurement shown in the value field when a dimensional tuple is ready,
 * or an empty string when the geometry cannot produce one.
 */
export function constraintInitialValue(
  type: ConstraintType,
  picks: ConstraintPick[],
  document: PatternDocument,
): string {
  if (type !== 'distance' && type !== 'angle') return '';

  const params = constraintParams(type, picks, document);
  if (params === null) return '';

  const points = pointMap(document);
  const first = points.get(params.entities[0]!);
  const second = points.get(params.entities[1]!);

  if (type === 'distance') {
    if (first === undefined || second === undefined) return '';
    return distanceMeasurement(first, second);
  }

  const third = points.get(params.entities[2]!);
  if (first === undefined || second === undefined || third === undefined) return '';
  return angleMeasurement(first, second, third);
}

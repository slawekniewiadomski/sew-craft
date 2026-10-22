import {
  allPoints,
  constraintEntityIds,
  type Constraint,
  type ConstraintType,
  type EntityId,
  type PatternDocument,
} from '@sewcraft/geometry';

/** Human-readable names for each constraint type, for pickers and lists. */
export const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  coincident: 'Coincident',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  point_on_line: 'Point on line',
  distance: 'Distance',
  angle: 'Angle',
  equal: 'Equal length',
};

/** Label for each entity slot of a constraint, in `add_constraint` order. */
export const CONSTRAINT_ROLES: Record<ConstraintType, string[]> = {
  coincident: ['Point A', 'Point B'],
  horizontal: ['Point A', 'Point B'],
  vertical: ['Point A', 'Point B'],
  point_on_line: ['Point', 'Line point A', 'Line point B'],
  distance: ['From', 'To'],
  angle: ['First', 'Vertex', 'Second'],
  equal: ['A start', 'A end', 'B start', 'B end'],
};

/** The unit a constraint type's numeric parameter uses, or `null` when it has none. */
export function constraintValueUnit(type: ConstraintType): 'mm' | 'rad' | null {
  switch (type) {
    case 'distance':
      return 'mm';
    case 'angle':
      return 'rad';
    default:
      return null;
  }
}

/** Mirror of the `add_constraint` command's value rules, for form-side guarding. */
export function isValidConstraintValue(type: ConstraintType, value: number): boolean {
  if (type === 'distance') return Number.isFinite(value) && value > 0;
  if (type === 'angle') return Number.isFinite(value);
  return true;
}

/** Full display name of a constraint, including its parameter when it has one. */
export function constraintLabel(constraint: Constraint): string {
  switch (constraint.type) {
    case 'distance':
      return `Distance ${constraint.value} mm`;
    case 'angle':
      return `Angle ${radiansToDegrees(constraint.value)}°`;
    case 'derived_distance':
      return 'Cut dimension';
    default:
      return CONSTRAINT_LABELS[constraint.type];
  }
}

/** A stroke path and optional filled dots drawn inside a 12 × 12 icon box. */
export interface ConstraintIcon {
  paths: string[];
  dots?: { cx: number; cy: number; r: number }[];
}

/**
 * Compact constraint glyphs for the canvas overlay. Geometry is authored in a
 * 12 × 12 box so the canvas can draw every icon at the same size.
 */
export const CONSTRAINT_ICONS: Record<ConstraintType, ConstraintIcon> = {
  horizontal: { paths: ['M3 4 V8', 'M9 4 V8', 'M3 6 H9'] },
  vertical: { paths: ['M4 3 H8', 'M4 9 H8', 'M6 3 V9'] },
  coincident: {
    paths: ['M2.2 6 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M5.8 6 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0'],
  },
  point_on_line: {
    paths: ['M2 9.5 L10 2.5'],
    dots: [{ cx: 6, cy: 6, r: 1.4 }],
  },
  distance: {
    paths: ['M2 6 H10', 'M4 3.8 L2 6 L4 8.2', 'M8 3.8 L10 6 L8 8.2'],
  },
  angle: {
    paths: ['M3 9 H10.5', 'M3 9 L10 3', 'M6.5 9 A3.5 3.5 0 0 0 5.35 6.36'],
  },
  equal: { paths: ['M3 4.5 H9', 'M3 7.5 H9'] },
};

export interface ConstraintMarker {
  id: EntityId;
  type: ConstraintType;
  /** Full name, used as the marker's accessible label and tooltip. */
  label: string;
  /** Centroid of the referenced points, in world coordinates. */
  x: number;
  y: number;
}

/**
 * Icon markers for every constraint whose referenced points all resolve.
 * Constraints referencing missing points are skipped so a partially hidden
 * document never renders a marker at a bogus position.
 */
export function constraintMarkers(document: PatternDocument): ConstraintMarker[] {
  const points = new Map(allPoints(document).map((point) => [point.id, point]));

  return document.constraints.flatMap((constraint) => {
    // Cut dimensions anchor to piece loop vertices, not solver points; the
    // canvas draws them with the dimension layer instead of an icon.
    if (constraint.type === 'derived_distance') return [];
    const ids = constraintEntityIds(constraint);
    const resolved = ids.flatMap((id) => {
      const point = points.get(id);
      return point === undefined ? [] : [point];
    });
    if (resolved.length !== ids.length) return [];

    return [
      {
        id: constraint.id,
        type: constraint.type,
        label: constraintLabel(constraint),
        x: resolved.reduce((sum, point) => sum + point.x, 0) / resolved.length,
        y: resolved.reduce((sum, point) => sum + point.y, 0) / resolved.length,
      },
    ];
  });
}

function radiansToDegrees(radians: number): number {
  return Math.round((radians * 180) / Math.PI);
}

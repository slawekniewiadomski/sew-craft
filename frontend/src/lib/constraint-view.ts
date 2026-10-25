import {
  allPoints,
  constraintEntityIds,
  isLineAnchor,
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

/** A stroke path and optional filled dots drawn inside a 24 × 24 icon box. */
export interface ConstraintIcon {
  paths: string[];
  dots?: { cx: number; cy: number; r: number }[];
}

/**
 * Constraint glyphs for the canvas overlay. Geometry is authored in a 24 × 24
 * box, the common icon grid, so library glyphs can be dropped in unscaled; the
 * canvas renders them at half size inside its markers.
 */
export const CONSTRAINT_ICONS: Record<ConstraintType, ConstraintIcon> = {
  horizontal: { paths: ['M6 8 V16', 'M18 8 V16', 'M6 12 H18'] },
  vertical: { paths: ['M8 6 H16', 'M8 18 H16', 'M12 6 V18'] },
  coincident: {
    paths: ['M4.4 12 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0', 'M11.6 12 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0'],
  },
  point_on_line: {
    paths: ['M4 19 L20 5'],
    dots: [{ cx: 12, cy: 12, r: 2.8 }],
  },
  distance: {
    paths: ['M4 12 H20', 'M8 7.6 L4 12 L8 16.4', 'M16 7.6 L20 12 L16 16.4'],
  },
  angle: {
    paths: ['M6 18 H21', 'M6 18 L20 6', 'M13 18 A7 7 0 0 0 10.7 12.72'],
  },
  equal: { paths: ['M6 9 H18', 'M6 15 H18'] },
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
    // A line-anchored distance is drawn by the dimension layer too.
    if (
      constraint.type === 'distance' &&
      (isLineAnchor(document, constraint.a) || isLineAnchor(document, constraint.b))
    ) {
      return [];
    }
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

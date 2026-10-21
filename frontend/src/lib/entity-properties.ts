import {
  constraintEntityIds,
  constraintOrientation,
  dimensionState,
  dimensionValue,
  getEntity,
  measureLinearDimension,
  seamForEdge,
  seamSide,
  type Constraint,
  type ConstraintType,
  type DimensionOrientation,
  type DimensionState,
  type Entity,
  type EntityId,
  type PatternDocument,
  type SeamSide,
} from '@sewcraft/geometry';

import { constraintLabel } from './constraint-view';

/** Geometry a point contributes to the inspector. */
export type PointGeometry = { kind: 'point'; x: number; y: number };

/** Geometry a line contributes to the inspector. */
export type LineGeometry = { kind: 'line'; start: EntityId; end: EntityId };

/** Geometry a curve contributes to the inspector. */
export type CurveGeometry = {
  kind: 'curve';
  p0: EntityId;
  p1: EntityId;
  p2: EntityId;
  p3: EntityId;
};

export type EntityGeometry = PointGeometry | LineGeometry | CurveGeometry;

/** A dimension that acts on the selected entity. */
export type DimensionSummary = {
  id: EntityId;
  entities: [EntityId, EntityId];
  /** The resolved value: literal, source value, measurement or last known. */
  value: number | null;
  /** Set, driven, referenced or broken. */
  state: DimensionState;
  /** The linked source id, or `null` when this dimension holds no reference. */
  sourceId: EntityId | null;
  orientation: DimensionOrientation;
};

/** A non-dimension constraint that acts on the selected entity. */
export type ConstraintSummary = {
  id: EntityId;
  type: Exclude<ConstraintType, 'distance'>;
  label: string;
  entities: EntityId[];
};

/** Everything the Properties inspector shows for one selected entity. */
export type EntityProperties = {
  id: EntityId;
  kind: Entity['kind'];
  construction: boolean;
  /** Points only; lines and curves have no fixed flag. */
  fixed: boolean | null;
  geometry: EntityGeometry;
  /** Measured length in millimetres for lines only. */
  length: number | null;
  seam: { id: EntityId; width: number; side: SeamSide } | null;
  dimensions: DimensionSummary[];
  constraints: ConstraintSummary[];
};

function geometryOf(entity: Entity): EntityGeometry {
  switch (entity.kind) {
    case 'point':
      return { kind: 'point', x: entity.x, y: entity.y };
    case 'line':
      return { kind: 'line', start: entity.start, end: entity.end };
    case 'curve':
      return { kind: 'curve', p0: entity.p0, p1: entity.p1, p2: entity.p2, p3: entity.p3 };
  }
}

/** Order-insensitive endpoint comparison: `{a,b}` equals `{s,e}`. */
function samePair(a: EntityId, b: EntityId, s: EntityId, e: EntityId): boolean {
  return (a === s && b === e) || (a === e && b === s);
}

/**
 * Whether a constraint acts on the selected entity's own segment. A line matches
 * only its endpoint pair, so a neighbouring edge sharing a corner does not pull
 * its constraints in; points and curves keep the broader any-reference rule.
 * Matching reads the stored ids without resolving them, so a dangling reference
 * still lists on the line that stores it and never throws.
 */
function constraintActsOnEntity(constraint: Constraint, entity: Entity): boolean {
  if (entity.kind === 'point') {
    return constraintEntityIds(constraint).includes(entity.id);
  }

  if (entity.kind === 'curve') {
    const controlPoints = [entity.p0, entity.p1, entity.p2, entity.p3];
    return constraintEntityIds(constraint).some((id) => controlPoints.includes(id));
  }

  switch (constraint.type) {
    case 'coincident':
    case 'horizontal':
    case 'vertical':
    case 'distance':
    case 'point_on_line':
      return samePair(constraint.a, constraint.b, entity.start, entity.end);
    case 'angle':
      return (
        samePair(constraint.a, constraint.b, entity.start, entity.end) ||
        samePair(constraint.b, constraint.c, entity.start, entity.end)
      );
    case 'equal':
      return (
        samePair(constraint.a1, constraint.a2, entity.start, entity.end) ||
        samePair(constraint.b1, constraint.b2, entity.start, entity.end)
      );
  }
}

/**
 * Selection-scoped view model over the existing document. Pure and
 * framework-free: the panel receives the result and never reads the store.
 * A missing id returns `null` so a deleted selection degrades to the workspace
 * summary instead of rendering stale data.
 */
export function entityProperties(
  document: PatternDocument,
  id: EntityId | null,
): EntityProperties | null {
  if (id === null) return null;

  const entity = getEntity(document, id);
  if (entity === undefined) return null;

  const dimensions: DimensionSummary[] = [];
  const constraints: ConstraintSummary[] = [];

  for (const constraint of document.constraints) {
    if (!constraintActsOnEntity(constraint, entity)) continue;
    const entities = constraintEntityIds(constraint);

    if (constraint.type === 'distance') {
      dimensions.push({
        id: constraint.id,
        entities: [constraint.a, constraint.b],
        value: dimensionValue(document, constraint),
        state: dimensionState(document, constraint),
        sourceId: constraint.reference ?? null,
        orientation: constraintOrientation(constraint),
      });
      continue;
    }

    constraints.push({
      id: constraint.id,
      type: constraint.type,
      label: constraintLabel(constraint),
      entities,
    });
  }

  const seam = entity.kind === 'point' ? undefined : seamForEdge(document, entity.id);

  return {
    id: entity.id,
    kind: entity.kind,
    construction: entity.construction,
    fixed: entity.kind === 'point' ? entity.fixed : null,
    geometry: geometryOf(entity),
    length:
      entity.kind === 'line'
        ? measureLinearDimension(document, entity.start, entity.end, 'aligned')
        : null,
    seam: seam === undefined ? null : { id: seam.id, width: seam.width, side: seamSide(seam) },
    dimensions,
    constraints,
  };
}

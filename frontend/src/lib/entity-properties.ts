import {
  constraintEntityIds,
  constraintOrientation,
  dimensionValue,
  getEntity,
  isDrivenDimension,
  measureLinearDimension,
  seamForEdge,
  seamSide,
  type ConstraintType,
  type DimensionOrientation,
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

/** A dimension that references at least one of the entity's own points. */
export type DimensionSummary = {
  id: EntityId;
  entities: [EntityId, EntityId];
  /** The set value, or the live measurement when driven; `null` if unmeasurable. */
  value: number | null;
  driven: boolean;
  orientation: DimensionOrientation;
};

/** A non-dimension constraint that references at least one of the entity's points. */
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

/**
 * The points a constraint must reference to be related to the selected entity.
 * Missing references are skipped so a partially hidden document never throws.
 */
function ownPointIds(document: PatternDocument, entity: Entity): EntityId[] {
  if (entity.kind === 'point') return [entity.id];

  const ids =
    entity.kind === 'line'
      ? [entity.start, entity.end]
      : [entity.p0, entity.p1, entity.p2, entity.p3];
  return ids.filter((id) => {
    const referenced = getEntity(document, id);
    return referenced !== undefined && referenced.kind === 'point';
  });
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

  const pointIds = new Set(ownPointIds(document, entity));
  const dimensions: DimensionSummary[] = [];
  const constraints: ConstraintSummary[] = [];

  for (const constraint of document.constraints) {
    const entities = constraintEntityIds(constraint);
    if (!entities.some((entityId) => pointIds.has(entityId))) continue;

    if (constraint.type === 'distance') {
      dimensions.push({
        id: constraint.id,
        entities: [constraint.a, constraint.b],
        value: dimensionValue(document, constraint),
        driven: isDrivenDimension(constraint),
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
    seam:
      seam === undefined
        ? null
        : { id: seam.id, width: seam.width, side: seamSide(seam) },
    dimensions,
    constraints,
  };
}

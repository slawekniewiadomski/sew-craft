import {
  PATTERN_SCHEMA,
  type Constraint,
  type CurveEntity,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Seam,
} from './types.js';
import type { Vec2 } from './vector.js';

export interface Bounds {
  min: Vec2;
  max: Vec2;
}

export function createEmptyDocument(): PatternDocument {
  return {
    schema: PATTERN_SCHEMA,
    units: 'mm',
    entities: [],
    constraints: [],
    seams: [],
  };
}

export function getEntity(document: PatternDocument, id: EntityId): Entity | undefined {
  return document.entities.find((entity) => entity.id === id);
}

export function getConstraint(document: PatternDocument, id: EntityId): Constraint | undefined {
  return document.constraints.find((constraint) => constraint.id === id);
}

export function getSeam(document: PatternDocument, id: EntityId): Seam | undefined {
  return document.seams.find((seam) => seam.id === id);
}

/** The seam allowance attached to an edge, or `undefined` when it has none. */
export function seamForEdge(document: PatternDocument, edge: EntityId): Seam | undefined {
  return document.seams.find((seam) => seam.edge === edge);
}

export function allPoints(document: PatternDocument): PointEntity[] {
  return document.entities.filter((entity): entity is PointEntity => entity.kind === 'point');
}

/**
 * Every line or curve that is part of the cut pattern, in document order.
 * Construction entities are guides and are never cut or exported, so exports
 * and the cut-edge layer both derive their contents from this selector.
 */
export function cutEdges(document: PatternDocument): (LineEntity | CurveEntity)[] {
  return document.entities.filter(
    (entity): entity is LineEntity | CurveEntity => entity.kind !== 'point' && !entity.construction,
  );
}

/**
 * The point ids a constraint references, in their semantic order. The solver and
 * the command core share this mapping so a constraint's references stay in sync.
 */
export function constraintEntityIds(constraint: Constraint): EntityId[] {
  switch (constraint.type) {
    case 'coincident':
    case 'horizontal':
    case 'vertical':
    case 'distance':
      return [constraint.a, constraint.b];
    case 'point_on_line':
      return [constraint.point, constraint.a, constraint.b];
    case 'angle':
      return [constraint.a, constraint.b, constraint.c];
    case 'equal':
      return [constraint.a1, constraint.a2, constraint.b1, constraint.b2];
  }
}

/**
 * Resolve every point referenced by an entity, in reference order. Throws when a
 * reference is missing or does not point at a point entity.
 */
export function entityPoints(document: PatternDocument, entity: Entity): PointEntity[] {
  if (entity.kind === 'point') {
    return [entity];
  }

  const ids: EntityId[] =
    entity.kind === 'line'
      ? [entity.start, entity.end]
      : [entity.p0, entity.p1, entity.p2, entity.p3];

  return ids.map((id) => {
    const referenced = getEntity(document, id);
    if (referenced === undefined || referenced.kind !== 'point') {
      throw new Error(`Entity "${entity.id}" references unknown point: ${id}`);
    }
    return referenced;
  });
}

/**
 * Axis-aligned bounding box of every point in the document, including
 * construction points. Returns `null` when the document has no points.
 */
export function bounds(document: PatternDocument): Bounds | null {
  const points = allPoints(document);
  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

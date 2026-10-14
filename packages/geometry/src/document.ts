import { PATTERN_SCHEMA, type Entity, type EntityId, type PatternDocument, type PointEntity } from './types.js';
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

export function allPoints(document: PatternDocument): PointEntity[] {
  return document.entities.filter((entity): entity is PointEntity => entity.kind === 'point');
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

import { arcExtents, arcGeometry } from './arc.js';
import { DEFAULT_ALLOWANCE_PRESET } from './defaults.js';
import { isCut } from './roles.js';
import {
  PATTERN_SCHEMA,
  type ArcEntity,
  type CircleEntity,
  type Constraint,
  type CornerRound,
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
    pieces: [],
    assemblies: [],
    tabs: [],
    defaults: { allowance: { ...DEFAULT_ALLOWANCE_PRESET } },
  };
}

/** Every legacy seam in the document; `[]` for documents written without the field. */
export function documentSeams(document: PatternDocument): Seam[] {
  return document.seams ?? [];
}

export function getEntity(document: PatternDocument, id: EntityId): Entity | undefined {
  return document.entities.find((entity) => entity.id === id);
}

/** Every corner round in the document; `[]` for documents written before the feature. */
export function cornerRounds(document: PatternDocument): CornerRound[] {
  return document.cornerRounds ?? [];
}

export function getConstraint(document: PatternDocument, id: EntityId): Constraint | undefined {
  return document.constraints.find((constraint) => constraint.id === id);
}

export function getSeam(document: PatternDocument, id: EntityId): Seam | undefined {
  return documentSeams(document).find((seam) => seam.id === id);
}

/** The seam allowance attached to an edge, or `undefined` when it has none. */
export function seamForEdge(document: PatternDocument, edge: EntityId): Seam | undefined {
  return documentSeams(document).find((seam) => seam.edge === edge);
}

export function allPoints(document: PatternDocument): PointEntity[] {
  return document.entities.filter((entity): entity is PointEntity => entity.kind === 'point');
}

/**
 * Every line, curve, circle or arc that is part of the cut pattern, in document
 * order. Construction and annotation entities are never cut or exported, so
 * exports and the cut-edge layer both derive their contents from this selector.
 */
export function cutEdges(
  document: PatternDocument,
): (LineEntity | CurveEntity | CircleEntity | ArcEntity)[] {
  return document.entities.filter(
    (entity): entity is LineEntity | CurveEntity | CircleEntity | ArcEntity =>
      entity.kind !== 'point' && entity.kind !== 'text' && isCut(entity),
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
    case 'midpoint':
      // The line form references the line; its endpoints are resolved separately.
      return 'line' in constraint
        ? [constraint.point, constraint.line]
        : [constraint.point, constraint.a, constraint.b];
    case 'derived_distance':
      // Anchored to piece loop edges, never to solver points.
      return [];
  }
}

/**
 * The ids a constraint references that must be solver points. A distance anchor
 * may name a straight line instead, so the solver validates those against the
 * line map rather than reporting them as unknown points.
 */
export function constraintPointIds(
  constraint: Constraint,
  isLineAnchor: (id: EntityId) => boolean,
): EntityId[] {
  const ids = constraintEntityIds(constraint);
  if (constraint.type === 'midpoint' && 'line' in constraint) {
    // The line itself is validated against the line map, not as a point.
    return [constraint.point];
  }
  return constraint.type === 'distance' ? ids.filter((id) => !isLineAnchor(id)) : ids;
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
    entity.kind === 'text'
      ? [entity.anchor]
      : entity.kind === 'mark'
        ? entity.type === 'notch'
          ? [entity.point]
          : [entity.start, entity.end]
        : entity.kind === 'line'
          ? [entity.start, entity.end]
          : entity.kind === 'arc'
            ? [entity.start, entity.through, entity.end]
            : entity.kind === 'circle'
              ? [entity.center, entity.rim]
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
 * construction points, widened by each circle's radius and each arc's cardinal
 * extents. Returns `null` when the document has no points.
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

  // An arc can bulge past all three of its points and a circle extends one
  // radius beyond its centre in every direction; neither is covered by the
  // points alone, so both matter for a correct fit view and export viewBox. An
  // invalid (collinear) arc has no extents and is skipped.
  for (const entity of document.entities) {
    if (entity.kind === 'arc') {
      const geometry = arcGeometry(document, entity);
      if (geometry === null) continue;
      for (const extent of arcExtents(geometry)) {
        minX = Math.min(minX, extent.x);
        minY = Math.min(minY, extent.y);
        maxX = Math.max(maxX, extent.x);
        maxY = Math.max(maxY, extent.y);
      }
      continue;
    }

    if (entity.kind !== 'circle') continue;
    const center = getEntity(document, entity.center);
    const rim = getEntity(document, entity.rim);
    if (center?.kind !== 'point' || rim?.kind !== 'point') continue;

    const radius = Math.hypot(rim.x - center.x, rim.y - center.y);
    if (!Number.isFinite(radius)) continue;

    minX = Math.min(minX, center.x - radius);
    minY = Math.min(minY, center.y - radius);
    maxX = Math.max(maxX, center.x + radius);
    maxY = Math.max(maxY, center.y + radius);
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** Every point id a line, curve, arc, circle or text entity references. */
function entityReferenceIds(entity: Entity): EntityId[] {
  switch (entity.kind) {
    case 'point':
      return [];
    case 'line':
    case 'arc':
      return entity.kind === 'line'
        ? [entity.start, entity.end]
        : [entity.start, entity.through, entity.end];
    case 'curve':
      return [entity.p0, entity.p1, entity.p2, entity.p3];
    case 'circle':
      return [entity.center, entity.rim];
    case 'text':
      return entity.leader === undefined ? [entity.anchor] : [entity.anchor, entity.leader];
    case 'mark':
      return entity.type === 'notch' ? [entity.point] : [entity.start, entity.end];
  }
}

/**
 * A valid document containing only the given pieces and everything they own:
 * entities, constraints, corner rounds and legacy seams. `assemblies` and `tabs`
 * are empty so a piece view never sees another piece.
 */
function documentForPieces(
  document: PatternDocument,
  pieceIds: ReadonlySet<EntityId>,
): PatternDocument {
  const pieces = document.pieces.filter((piece) => pieceIds.has(piece.id));
  const loopEdges = new Set(pieces.flatMap((piece) => piece.edges));

  // Start from the entities the pieces name directly, then close over the points
  // those entities reference so a partially owned legacy fixture still renders.
  const kept = new Set<EntityId>();
  for (const entity of document.entities) {
    if (entity.piece !== undefined ? pieceIds.has(entity.piece) : loopEdges.has(entity.id)) {
      kept.add(entity.id);
    }
  }
  const queue = [...kept];
  let changed = queue.length > 0;
  while (changed) {
    changed = false;
    for (const entity of document.entities) {
      if (!kept.has(entity.id)) continue;
      for (const reference of entityReferenceIds(entity)) {
        if (kept.has(reference) || getEntity(document, reference)?.kind !== 'point') continue;
        kept.add(reference);
        changed = true;
      }
    }
  }

  const rounds = cornerRounds(document).filter(
    (round) =>
      kept.has(round.corner) || kept.has(round.arc) || round.ends.some((end) => kept.has(end.line)),
  );

  // A round's arc, controls, centre, tangents and anchors are derived geometry:
  // no loop edge names them, and documents written before per-entity ownership
  // leave them untagged. Keep them with their round, or the slice loses the
  // bridge and both the piece loop and its cut line stop resolving.
  for (const round of rounds) {
    kept.add(round.corner);
    kept.add(round.arc);
    if (round.center !== undefined) kept.add(round.center);
    for (const control of round.controls) kept.add(control);
    for (const end of round.ends) {
      kept.add(end.tangent);
      kept.add(end.anchor);
    }
  }

  const constraints = document.constraints.filter((constraint) =>
    constraint.piece !== undefined
      ? pieceIds.has(constraint.piece)
      : constraintEntityIds(constraint).every((id) => kept.has(id)),
  );

  return {
    ...document,
    entities: document.entities.filter((entity) => kept.has(entity.id)),
    constraints,
    pieces,
    assemblies: [],
    tabs: [],
    ...(document.cornerRounds === undefined ? {} : { cornerRounds: rounds }),
    ...(document.seams === undefined
      ? {}
      : { seams: documentSeams(document).filter((seam) => kept.has(seam.edge)) }),
  };
}

/**
 * The document a piece tab edits: only that piece's entities, constraints and
 * corner rounds, with no assemblies or tabs. An unknown piece yields an empty
 * piece list rather than an invalid document.
 */
export function documentForPiece(document: PatternDocument, piece: EntityId): PatternDocument {
  const exists = document.pieces.some((candidate) => candidate.id === piece);
  return documentForPieces(document, new Set(exists ? [piece] : []));
}

/**
 * The document an assembly tab edits: the pieces its instances reference, with
 * that assembly kept and the tab order cleared.
 */
export function documentForAssembly(
  document: PatternDocument,
  assembly: EntityId,
): PatternDocument {
  const target = document.assemblies.find((candidate) => candidate.id === assembly);
  if (target === undefined) {
    return documentForPieces(document, new Set());
  }
  const referenced = new Set(target.instances.map((instance) => instance.piece));
  const filtered = documentForPieces(document, referenced);
  return { ...filtered, assemblies: [target] };
}

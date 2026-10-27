import { lineEndpoints } from './dimension.js';
import type {
  Constraint,
  CornerRound,
  Entity,
  EntityId,
  MidpointConstraint,
  PatternDocument,
  PointEntity,
} from './types.js';
import type { Vec2 } from './vector.js';

/** Distances at or below this are treated as a degenerate midpoint source. */
export const MIDPOINT_EPSILON = 1e-6;

/** The parts of a document the midpoint helpers need; a solver call can build one. */
export interface MidpointContext {
  entities: readonly Entity[];
  constraints: readonly Constraint[];
  cornerRounds?: readonly CornerRound[];
}

/** The two point ids a midpoint target is the average of. */
export interface MidpointSources {
  a: EntityId;
  b: EntityId;
}

/** Why a midpoint relation cannot resolve, in the order the checks run. */
export type MidpointIssue =
  | 'missing-target'
  | 'target-not-point'
  | 'target-derived'
  | 'missing-source'
  | 'source-not-point'
  | 'source-not-line'
  | 'target-source'
  | 'degenerate'
  | 'chain';

function entityById(context: MidpointContext, id: EntityId): Entity | undefined {
  return context.entities.find((entity) => entity.id === id);
}

/** Whether a corner round or another midpoint already owns this point. */
function isDerivedPoint(context: MidpointContext, id: EntityId, exceptId: EntityId): boolean {
  const round = (context.cornerRounds ?? []).some(
    (candidate) =>
      candidate.arc === id ||
      candidate.center === id ||
      candidate.controls.includes(id) ||
      candidate.ends.some((end) => end.tangent === id),
  );
  if (round) return true;
  return context.constraints.some(
    (constraint) =>
      constraint.type === 'midpoint' && constraint.point === id && constraint.id !== exceptId,
  );
}

/** The midpoint relation that pins `pointId`, ignoring the constraint itself. */
export function midpointTargetFor(
  context: MidpointContext,
  pointId: EntityId,
  exceptConstraintId?: EntityId,
): MidpointConstraint | undefined {
  return context.constraints.find(
    (constraint): constraint is MidpointConstraint =>
      constraint.type === 'midpoint' &&
      constraint.point === pointId &&
      constraint.id !== exceptConstraintId,
  );
}

/** Every point a midpoint relation owns. */
export function midpointTargets(context: MidpointContext): Set<EntityId> {
  return new Set(
    context.constraints.flatMap((constraint) =>
      constraint.type === 'midpoint' ? [constraint.point] : [],
    ),
  );
}

/**
 * The two points a midpoint target averages. A line form resolves the line's
 * current endpoints, so a corner-round trim moves the target to the middle of the
 * visible segment. `null` when a reference is missing or the wrong kind.
 */
export function midpointSources(
  context: MidpointContext,
  constraint: MidpointConstraint,
): MidpointSources | null {
  if ('line' in constraint) {
    const line = entityById(context, constraint.line);
    if (line === undefined || line.kind !== 'line') return null;
    return { a: line.start, b: line.end };
  }
  return { a: constraint.a, b: constraint.b };
}

/** Every resolvable midpoint dependency, keyed by its derived target point. */
export function midpointDependencies(context: MidpointContext): Map<EntityId, MidpointSources> {
  const dependencies = new Map<EntityId, MidpointSources>();
  for (const constraint of context.constraints) {
    if (constraint.type !== 'midpoint') continue;
    const sources = midpointSources(context, constraint);
    if (sources !== null) dependencies.set(constraint.point, sources);
  }
  return dependencies;
}

/**
 * The midpoint of a line's visible segment, or `null` when the id is not a
 * resolvable, non-degenerate straight line.
 */
export function lineMidpoint(document: PatternDocument, lineId: EntityId): Vec2 | null {
  const segment = lineEndpoints(document, lineId);
  if (segment === null) return null;
  if (
    Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) <= MIDPOINT_EPSILON
  ) {
    return null;
  }
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

/**
 * Whether a midpoint relation can resolve, or the first rule it breaks. The
 * command core and the solver share it so creation and a hand-edited document
 * report the same reasons.
 */
export function midpointIssue(
  context: MidpointContext,
  constraint: MidpointConstraint,
): MidpointIssue | null {
  const target = entityById(context, constraint.point);
  if (target === undefined) return 'missing-target';
  if (target.kind !== 'point') return 'target-not-point';
  if (isDerivedPoint(context, constraint.point, constraint.id)) return 'target-derived';

  let a: PointEntity;
  let b: PointEntity;

  if ('line' in constraint) {
    const line = entityById(context, constraint.line);
    if (line === undefined) return 'missing-source';
    if (line.kind !== 'line') return 'source-not-line';

    const start = entityById(context, line.start);
    const end = entityById(context, line.end);
    if (start === undefined || end === undefined) return 'missing-source';
    if (start.kind !== 'point' || end.kind !== 'point') return 'source-not-point';
    a = start;
    b = end;
  } else {
    const first = entityById(context, constraint.a);
    const second = entityById(context, constraint.b);
    if (first === undefined || second === undefined) return 'missing-source';
    if (first.kind !== 'point' || second.kind !== 'point') return 'source-not-point';
    a = first;
    b = second;
  }

  if (constraint.point === a.id || constraint.point === b.id) return 'target-source';
  if (Math.hypot(b.x - a.x, b.y - a.y) <= MIDPOINT_EPSILON) return 'degenerate';

  const targets = midpointTargets(context);
  if (targets.has(a.id) || targets.has(b.id)) return 'chain';

  return null;
}

/**
 * Write every midpoint target's exact average into a new document. Runs after
 * corner rounds so a line-form target follows a just-trimmed visible segment.
 */
export function regenerateMidpoints(document: PatternDocument): PatternDocument {
  const dependencies = midpointDependencies(document);
  if (dependencies.size === 0) return document;

  const points = new Map(
    document.entities
      .filter((entity): entity is PointEntity => entity.kind === 'point')
      .map((point) => [point.id, point]),
  );
  const coordinates = new Map<EntityId, Vec2>();
  for (const [target, sources] of dependencies) {
    const a = points.get(sources.a);
    const b = points.get(sources.b);
    if (a === undefined || b === undefined) continue;
    coordinates.set(target, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  if (coordinates.size === 0) return document;

  return {
    ...document,
    entities: document.entities.map((entity) => {
      if (entity.kind !== 'point') return entity;
      const coordinate = coordinates.get(entity.id);
      return coordinate === undefined ? entity : { ...entity, x: coordinate.x, y: coordinate.y };
    }),
  };
}

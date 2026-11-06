import { arcThroughPoints } from './arc.js';
import { FLATTEN_SEGMENTS } from './flatten.js';
import { curvePoints } from './offset.js';
import type { Entity, EntityId, PointEntity, Variable } from './types.js';
import { distance } from './vector.js';

/** Shortest circle radius the geometry layer treats as renderable. */
const MIN_MEASURED_RADIUS = 0.001;

/**
 * The entities a measured variable may sum. Points and annotations have no length,
 * and a piece's seam allowance or cut loop is derived geometry rather than a
 * source, so neither is offered.
 */
function isMeasurable(entity: Entity | undefined): boolean {
  return (
    entity !== undefined &&
    (entity.kind === 'line' ||
      entity.kind === 'curve' ||
      entity.kind === 'arc' ||
      entity.kind === 'circle')
  );
}

/** The two endpoints of an edge, or `null` for a closed circle. */
function endpointsOf(entity: Entity): [EntityId, EntityId] | null {
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end];
    case 'curve':
      return [entity.p0, entity.p3];
    case 'arc':
      return [entity.start, entity.end];
    /* v8 ignore start -- a circle is the only other measurable kind, and it is
       handled before the chain walk because it has no endpoints */
    default:
      return null;
    /* v8 ignore stop */
  }
}

function pointOf(entities: ReadonlyMap<EntityId, Entity>, id: EntityId): PointEntity | undefined {
  const entity = entities.get(id);
  return entity !== undefined && entity.kind === 'point' ? entity : undefined;
}

/** Why a set of ids is not a connected chain, as a code the caller can format. */
export type MeasurementChainProblem =
  | { code: 'empty' }
  | { code: 'unknown'; id: EntityId }
  | { code: 'kind'; id: EntityId }
  | { code: 'duplicate'; id: EntityId }
  | { code: 'circle'; id: EntityId }
  | { code: 'gap'; from: EntityId; to: EntityId }
  | { code: 'branch'; id: EntityId };

/** A canonical ordered chain, or the first reason the ids are not one. */
export type MeasurementChainResult =
  | { chain: EntityId[]; closed: boolean; problem?: undefined }
  | { chain?: undefined; closed?: false; problem: MeasurementChainProblem };

/** A human-readable explanation for a chain problem. */
export function measurementChainMessage(problem: MeasurementChainProblem): string {
  switch (problem.code) {
    case 'empty':
      return 'a measured variable needs at least one source edge';
    case 'unknown':
      return `source ${problem.id} does not exist`;
    case 'kind':
      return `source ${problem.id} is not a line, curve, arc or circle`;
    case 'duplicate':
      return `source ${problem.id} appears more than once`;
    case 'circle':
      return `circle ${problem.id} cannot be combined with other edges`;
    case 'gap':
      return `sources ${problem.from} and ${problem.to} do not share an endpoint`;
    case 'branch':
      return `source ${problem.id} joins more than two edges`;
  }
}

/**
 * Validate a set of source ids and return them in traversal order. The caller may
 * pass a selection in any order: an open chain is walked from its free end and a
 * closed loop from the first id given, so the stored list is stable.
 */
export function measurementChain(
  entities: readonly Entity[],
  ids: readonly EntityId[],
): MeasurementChainResult {
  if (ids.length === 0) return { problem: { code: 'empty' } };

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const seen = new Set<EntityId>();
  for (const id of ids) {
    if (seen.has(id)) return { problem: { code: 'duplicate', id } };
    seen.add(id);

    const entity = byId.get(id);
    if (entity === undefined) return { problem: { code: 'unknown', id } };
    if (!isMeasurable(entity)) return { problem: { code: 'kind', id } };
  }

  const circles = ids.filter((id) => byId.get(id)!.kind === 'circle');
  if (circles.length > 0) {
    if (ids.length > 1) return { problem: { code: 'circle', id: circles[0]! } };
    return { chain: [ids[0]!], closed: false };
  }

  // Every endpoint id maps to the edges that touch it; a valid chain uses each
  // interior endpoint exactly twice and each chain end exactly once.
  const incident = new Map<EntityId, EntityId[]>();
  const ends = new Map<EntityId, [EntityId, EntityId]>();
  for (const id of ids) {
    const pair = endpointsOf(byId.get(id)!)!;
    ends.set(id, pair);
    for (const endpoint of pair) {
      const list = incident.get(endpoint) ?? [];
      list.push(id);
      incident.set(endpoint, list);
    }
  }
  for (const [endpoint, list] of incident) {
    if (list.length > 2) return { problem: { code: 'branch', id: list[0]! } };
    /* v8 ignore next -- an endpoint always belongs to at least the edge that named it */
    if (list.length === 0) return { problem: { code: 'unknown', id: endpoint } };
  }

  /** The edge after `id` when leaving through `exit`, skipping what was visited. */
  const nextEdge = (
    id: EntityId,
    exit: EntityId,
    visited: ReadonlySet<EntityId>,
  ): EntityId | null =>
    incident.get(exit)!.find((candidate) => candidate !== id && !visited.has(candidate)) ?? null;

  const freeEnd = ids.find((id) =>
    ends.get(id)!.some((endpoint) => incident.get(endpoint)!.length === 1),
  );
  const first = freeEnd ?? ids[0]!;
  const firstEnds = ends.get(first)!;
  let start =
    freeEnd === undefined
      ? firstEnds[0]
      : firstEnds.find((endpoint) => incident.get(endpoint)!.length === 1)!;
  let exit = start === firstEnds[0] ? firstEnds[1] : firstEnds[0];

  const chain: EntityId[] = [first];
  const visited = new Set<EntityId>([first]);
  const origin = start;

  while (chain.length < ids.length) {
    const next = nextEdge(chain[chain.length - 1]!, exit, visited);
    if (next === null) {
      // `exit` stops at a free end only when the chain is whole; otherwise the
      // walk hit a disconnected group.
      return {
        problem: {
          code: 'gap',
          from: chain[chain.length - 1]!,
          to: ids.find((id) => !visited.has(id))!,
        },
      };
    }
    chain.push(next);
    visited.add(next);
    const [from, to] = ends.get(next)!;
    exit = exit === from ? to : from;
  }

  return { chain, closed: exit === origin };
}

/** The length of one measured source in millimetres, or `null` when it cannot resolve. */
function sourceLength(byId: ReadonlyMap<EntityId, Entity>, id: EntityId): number | null {
  const entity = byId.get(id);
  if (entity === undefined) return null;

  switch (entity.kind) {
    case 'line': {
      const start = pointOf(byId, entity.start);
      const end = pointOf(byId, entity.end);
      return start === undefined || end === undefined
        ? null
        : distance({ x: start.x, y: start.y }, { x: end.x, y: end.y });
    }
    case 'curve': {
      const points = [entity.p0, entity.p1, entity.p2, entity.p3].map((point) =>
        pointOf(byId, point),
      );
      if (points.some((point) => point === undefined)) return null;
      const [p0, p1, p2, p3] = points as { x: number; y: number }[];
      return polylineLength(curvePoints(p0!, p1!, p2!, p3!, FLATTEN_SEGMENTS));
    }
    case 'arc': {
      const start = pointOf(byId, entity.start);
      const end = pointOf(byId, entity.end);
      const through = pointOf(byId, entity.through);
      if (start === undefined || end === undefined || through === undefined) return null;
      const geometry = arcThroughPoints(
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
        { x: through.x, y: through.y },
      );
      return geometry === null ? null : geometry.radius * Math.abs(geometry.sweep);
    }
    case 'circle': {
      const center = pointOf(byId, entity.center);
      const rim = pointOf(byId, entity.rim);
      if (center === undefined || rim === undefined) return null;
      const radius = distance({ x: center.x, y: center.y }, { x: rim.x, y: rim.y });
      return Number.isFinite(radius) && radius >= MIN_MEASURED_RADIUS ? 2 * Math.PI * radius : null;
    }
    default:
      return null;
  }
}

function polylineLength(points: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
  }
  return total;
}

/**
 * The total length of an ordered source chain, or `null` when any source is
 * missing or has degenerated since the chain was written.
 */
export function measurementLength(
  entities: readonly Entity[],
  sources: readonly EntityId[],
): number | null {
  if (sources.length === 0) return null;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let total = 0;
  for (const id of sources) {
    const length = sourceLength(byId, id);
    if (length === null || !Number.isFinite(length)) return null;
    total += length;
  }
  return total;
}

/** Whether a variable reads its value from geometry. */
export function isMeasuredVariable(
  variable: Variable,
): variable is Extract<Variable, { kind: 'measurement' }> {
  return variable.kind === 'measurement';
}

/** Whether a variable is written by the maker. */
export function isValueVariable(
  variable: Variable,
): variable is Extract<Variable, { kind?: 'value' }> {
  return variable.kind !== 'measurement';
}

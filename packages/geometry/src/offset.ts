import { arcPoints as flattenArc, arcThroughPoints } from './arc.js';
import { documentSeams, entityPoints, getEntity } from './document.js';
import { FLATTEN_SEGMENTS } from './flatten.js';
import {
  seamSide,
  type EntityId,
  type PatternDocument,
  type Seam,
  type SeamSide,
} from './types.js';
import { add, cross, dot, magnitude, normalize, scale, sub, type Vec2 } from './vector.js';

export type JoinStyle = 'miter' | 'round';

export interface OffsetOptions {
  /** Treat the polyline as a closed loop, joining the last vertex back to the first. */
  closed?: boolean;
  /** Corner join style. Defaults to `'miter'`. */
  join?: JoinStyle;
  /** Miter length limit, as a multiple of the offset distance. Defaults to `4`. */
  miterLimit?: number;
}

export interface SelfIntersection {
  /** Index of the first crossing segment in the offset path. */
  first: number;
  /** Index of the second crossing segment in the offset path. */
  second: number;
  /** The crossing point. */
  point: Vec2;
}

/** A generated seam-allowance offset for one edge, with any self-intersections. */
export interface SeamAllowancePath {
  edge: EntityId;
  width: number;
  /** The edge-relative side the allowance was offset to. */
  side: SeamSide;
  join: JoinStyle;
  path: Vec2[];
  selfIntersections: SelfIntersection[];
}

const EPSILON = 1e-9;
const DEFAULT_MITER_LIMIT = 4;
const ARC_STEP = Math.PI / 8;

const leftNormal = (direction: Vec2): Vec2 => ({ x: -direction.y, y: direction.x });

const dedupe = (points: Vec2[]): Vec2[] => {
  const result: Vec2[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous === undefined || magnitude(sub(point, previous)) > EPSILON) {
      result.push(point);
    }
  }
  return result;
};

/**
 * Intersection of two infinite lines. Callers must pass non-parallel
 * directions; `joinPoints` only calls this after excluding a near-zero turn.
 */
function intersectLines(
  origin: Vec2,
  direction: Vec2,
  otherOrigin: Vec2,
  otherDirection: Vec2,
): Vec2 {
  const denominator = cross(direction, otherDirection);
  const t = cross(sub(otherOrigin, origin), otherDirection) / denominator;
  return { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
}

/** Proper segment intersection, or `null` when parallel or outside either segment. */
function intersectSegments(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= EPSILON) {
    return null;
  }
  const t = cross(sub(c, a), s) / denominator;
  const u = cross(sub(c, a), r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** Intermediate points of the minor arc from `from` to `to` around `center`. */
function arcPoints(center: Vec2, from: Vec2, to: Vec2, radius: number): Vec2[] {
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const end = Math.atan2(to.y - center.y, to.x - center.x);
  let sweep = end - start;
  sweep -= 2 * Math.PI * Math.floor((sweep + Math.PI) / (2 * Math.PI));

  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const points: Vec2[] = [];
  for (let i = 1; i < steps; i += 1) {
    const angle = start + (sweep * i) / steps;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

/**
 * Join two offset segments that may carry different distances. The miter is the
 * intersection of the two offset lines; a zero distance keeps that edge on its
 * original line, which is what makes a shared piece edge coincide with the cut
 * outline. A miter longer than `miterLimit` times the larger adjacent distance
 * falls back to a bevel.
 */
function joinVariablePoints(
  center: Vec2,
  directionA: Vec2,
  directionB: Vec2,
  distanceA: number,
  distanceB: number,
  join: JoinStyle,
  miterLimit: number,
): Vec2[] {
  const normalA = leftNormal(directionA);
  const normalB = leftNormal(directionB);
  const incoming = add(center, scale(normalA, distanceA));
  const outgoing = add(center, scale(normalB, distanceB));
  const turn = cross(directionA, directionB);

  if (Math.abs(turn) <= EPSILON) {
    // Parallel segments: same direction keeps one offset unless the distances
    // differ, a reversal has no miter and bevels across.
    if (dot(directionA, directionB) <= 0) return [incoming, outgoing];
    return magnitude(sub(incoming, outgoing)) <= EPSILON ? [outgoing] : [incoming, outgoing];
  }

  const convex = turn * distanceA < 0;
  if (join === 'round' && convex && distanceA === distanceB) {
    return [incoming, ...arcPoints(center, incoming, outgoing, Math.abs(distanceA)), outgoing];
  }

  const miter = intersectLines(incoming, directionA, outgoing, directionB);
  const limit = miterLimit * Math.max(Math.abs(distanceA), Math.abs(distanceB));
  return magnitude(sub(miter, center)) <= limit + EPSILON ? [miter] : [incoming, outgoing];
}

/** Where each source vertex's join landed in `VariableOffsetResult.points`. */
export interface VariableOffsetVertex {
  /** Index of the first point generated for this vertex. */
  start: number;
  /** Index one past the last point generated for this vertex. */
  end: number;
}

export interface VariableOffsetResult {
  points: Vec2[];
  /** One entry per source vertex, in source order. */
  vertices: VariableOffsetVertex[];
}

/** Drop consecutive duplicate points while keeping one distance per live segment. */
function compactLoop(
  points: readonly Vec2[],
  distances: readonly number[],
): { points: Vec2[]; distances: number[] } {
  const keptPoints: Vec2[] = [];
  const keptDistances: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    const previous = keptPoints[keptPoints.length - 1];
    if (previous !== undefined && magnitude(sub(point, previous)) <= EPSILON) {
      // The zero-length segment is dropped; the surviving segment starts here.
      keptDistances[keptDistances.length - 1] = distances[i]!;
      continue;
    }
    keptPoints.push(point);
    keptDistances.push(distances[i]!);
  }

  if (keptPoints.length > 1) {
    const first = keptPoints[0]!;
    const last = keptPoints[keptPoints.length - 1]!;
    if (magnitude(sub(last, first)) <= EPSILON) {
      keptDistances[0] = keptDistances[keptDistances.length - 1]!;
      keptPoints.pop();
      keptDistances.pop();
    }
  }

  return { points: keptPoints, distances: keptDistances };
}

/** Drop consecutive duplicate points from an open polyline and its segment distances. */
function compactOpen(
  points: readonly Vec2[],
  distances: readonly number[],
): { points: Vec2[]; distances: number[] } {
  const keptPoints: Vec2[] = [];
  const keptDistances: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    const previous = keptPoints[keptPoints.length - 1];
    if (previous !== undefined && magnitude(sub(point, previous)) <= EPSILON) continue;
    if (keptPoints.length > 0) keptDistances.push(distances[i - 1]!);
    keptPoints.push(point);
  }

  return { points: keptPoints, distances: keptDistances };
}

/**
 * Offset a polyline by one signed distance per segment. A positive distance
 * offsets to the left of the travel direction, a negative distance to the right.
 * The result also reports which output points belong to each source vertex, so a
 * caller can anchor derived geometry to a loop vertex. The points are not
 * deduplicated, which keeps that mapping exact.
 */
export function offsetVariablePolylineDetailed(
  points: readonly Vec2[],
  distances: readonly number[],
  options: OffsetOptions = {},
): VariableOffsetResult {
  const { closed = false, join = 'miter', miterLimit = DEFAULT_MITER_LIMIT } = options;
  const expected = closed ? points.length : Math.max(points.length - 1, 0);
  if (distances.length !== expected) {
    const source = points.slice();
    return {
      points: source,
      vertices: source.map((_, index) => ({ start: index, end: index + 1 })),
    };
  }

  const compact = closed
    ? compactLoop(points, distances)
    : compactOpen(points, distances);
  const source = compact.points;
  const perSegment = compact.distances;
  const identity = (): VariableOffsetResult => ({
    points: source.slice(),
    vertices: source.map((_, index) => ({ start: index, end: index + 1 })),
  });

  if (source.length < 2 || (closed && source.length < 3)) return identity();

  const segmentCount = closed ? source.length : source.length - 1;
  if (perSegment.every((distance) => distance === 0)) return identity();

  const directions: Vec2[] = [];
  for (let i = 0; i < segmentCount; i += 1) {
    directions.push(normalize(sub(source[(i + 1) % source.length]!, source[i]!)));
  }

  const output: Vec2[] = [];
  const vertices: VariableOffsetVertex[] = [];

  if (closed) {
    for (let j = 0; j < segmentCount; j += 1) {
      const previous = (j - 1 + segmentCount) % segmentCount;
      const joinPoints = joinVariablePoints(
        source[j]!,
        directions[previous]!,
        directions[j]!,
        perSegment[previous]!,
        perSegment[j]!,
        join,
        miterLimit,
      );
      vertices.push({ start: output.length, end: output.length + joinPoints.length });
      output.push(...joinPoints);
    }
    return { points: output, vertices };
  }

  output.push(add(source[0]!, scale(leftNormal(directions[0]!), perSegment[0]!)));
  vertices.push({ start: 0, end: 1 });
  for (let j = 1; j < segmentCount; j += 1) {
    const joinPoints = joinVariablePoints(
      source[j]!,
      directions[j - 1]!,
      directions[j]!,
      perSegment[j - 1]!,
      perSegment[j]!,
      join,
      miterLimit,
    );
    vertices.push({ start: output.length, end: output.length + joinPoints.length });
    output.push(...joinPoints);
  }
  output.push(
    add(source[segmentCount]!, scale(leftNormal(directions[segmentCount - 1]!), perSegment[segmentCount - 1]!)),
  );
  vertices.push({ start: output.length - 1, end: output.length });

  return { points: output, vertices };
}

/**
 * Offset a polyline by one signed distance per segment, with duplicate output
 * points removed. Degenerate input (fewer than two distinct points, a distance
 * count that does not match, or every distance zero) is returned unchanged.
 */
export function offsetVariablePolyline(
  points: readonly Vec2[],
  distances: readonly number[],
  options: OffsetOptions = {},
): Vec2[] {
  return dedupe(offsetVariablePolylineDetailed(points, distances, options).points);
}

/**
 * Offset a polyline by `distance` millimetres. A positive distance offsets to
 * the left of the travel direction, a negative distance to the right. Corners
 * are joined with a miter (falling back to a bevel past `miterLimit`) or a
 * round arc. Degenerate input (fewer than two distinct points, or a zero
 * distance) is returned unchanged.
 */
export function offsetPolyline(
  points: Vec2[],
  distance: number,
  options: OffsetOptions = {},
): Vec2[] {
  const { closed = false } = options;
  const source = dedupe(points);
  if (source.length < 2 || distance === 0 || (closed && source.length < 3)) {
    return source.slice();
  }

  const segmentCount = closed ? source.length : source.length - 1;
  return offsetVariablePolyline(
    source,
    Array.from({ length: segmentCount }, () => distance),
    options,
  );
}

/**
 * Every non-adjacent pair of segments in a path that properly cross. Adjacent
 * segments sharing a vertex are ignored, as are the first and last segments of
 * a closed loop. An empty result means the offset is simple (no self-crossing).
 */
export function findSelfIntersections(
  path: Vec2[],
  options: { closed?: boolean } = {},
): SelfIntersection[] {
  const { closed = false } = options;
  const points = dedupe(path);
  const segmentCount = closed ? points.length : points.length - 1;
  const intersections: SelfIntersection[] = [];

  for (let i = 0; i < segmentCount; i += 1) {
    for (let j = i + 1; j < segmentCount; j += 1) {
      if (j === i + 1) continue;
      if (closed && i === 0 && j === segmentCount - 1) continue;

      const hit = intersectSegments(
        points[i]!,
        points[(i + 1) % points.length]!,
        points[j]!,
        points[(j + 1) % points.length]!,
      );
      if (hit !== null) {
        intersections.push({ first: i, second: j, point: hit });
      }
    }
  }

  return intersections;
}

/** A point on the cubic Bézier `p0..p3` at parameter `t` in `[0, 1]`. */
export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Flatten a cubic Bézier into `segments + 1` points, inclusive of both ends. */
export function curvePoints(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  segments: number = FLATTEN_SEGMENTS,
): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    points.push(cubicPoint(p0, p1, p2, p3, i / segments));
  }
  return points;
}

/**
 * The polyline a cut edge traces. Lines are two points; curves and arcs are
 * flattened to `segments` intervals. Returns `null` when the id is missing, is a
 * point, or is an arc that has become degenerate.
 */
export function edgePolyline(
  document: PatternDocument,
  edge: EntityId,
  segments: number = FLATTEN_SEGMENTS,
): Vec2[] | null {
  const entity = getEntity(document, edge);
  if (entity === undefined || entity.kind === 'point' || entity.kind === 'circle') {
    return null;
  }

  const referenced = entityPoints(document, entity).map((point) => ({ x: point.x, y: point.y }));
  if (entity.kind === 'line') {
    return referenced;
  }

  if (entity.kind === 'arc') {
    const geometry = arcThroughPoints(referenced[0]!, referenced[2]!, referenced[1]!);
    return geometry === null
      ? null
      : flattenArc(geometry, referenced[0]!, referenced[2]!, segments);
  }

  return curvePoints(referenced[0]!, referenced[1]!, referenced[2]!, referenced[3]!, segments);
}

/**
 * The offset path for one edge's seam allowance, or `null` when the seam's edge
 * is missing, is not a line, curve or arc, or is an arc that has become
 * degenerate. Self-intersections are reported rather than hidden: a caller can
 * flag an allowance that folds over itself.
 */
export function seamAllowancePath(
  document: PatternDocument,
  seam: Seam,
  options: OffsetOptions = {},
): SeamAllowancePath | null {
  const polyline = edgePolyline(document, seam.edge);
  if (polyline === null) {
    return null;
  }

  const join = options.join ?? 'miter';
  const side = seamSide(seam);
  const distance = side === 'left' ? seam.width : -seam.width;
  const path = offsetPolyline(polyline, distance, options);
  return {
    edge: seam.edge,
    width: seam.width,
    side,
    join,
    path,
    selfIntersections: findSelfIntersections(path, { closed: options.closed ?? false }),
  };
}

/** Offset paths for every seam in the document, skipping seams with no valid edge. */
export function seamAllowancePaths(
  document: PatternDocument,
  options: OffsetOptions = {},
): SeamAllowancePath[] {
  const paths: SeamAllowancePath[] = [];
  for (const seam of documentSeams(document)) {
    const path = seamAllowancePath(document, seam, options);
    if (path !== null) {
      paths.push(path);
    }
  }
  return paths;
}

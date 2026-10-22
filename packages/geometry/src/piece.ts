import { getEntity, entityPoints, type Bounds } from './document.js';
import {
  edgePolyline,
  findSelfIntersections,
  offsetVariablePolyline,
  offsetVariablePolylineDetailed,
  type SelfIntersection,
  type VariableOffsetVertex,
} from './offset.js';
import type {
  Allowance,
  AllowanceKind,
  ArcEntity,
  CutAnchor,
  CurveEntity,
  EntityId,
  LineEntity,
  PatternDocument,
  Piece,
  PointEntity,
} from './types.js';
import { magnitude, sub, type Vec2 } from './vector.js';

/** Millimetres within which two edge endpoints count as the same loop vertex. */
const VERTEX_TOLERANCE = 1e-6;

type PieceEdgeEntity = LineEntity | CurveEntity | ArcEntity;

/** A piece loop resolved against the current document. */
export interface PieceLoop {
  /** Closed polyline of the stitch boundary, in loop order. */
  points: Vec2[];
  /** One signed outward distance per boundary segment. */
  distances: number[];
  /** Boundary vertex index of each edge's natural start. */
  naturalStart: number[];
  /** Segment count contributed by each edge. */
  spans: number[];
}

/** The cut loop of a piece, with the join point generated at every loop vertex. */
export interface PieceCutLoop {
  points: Vec2[];
  vertices: VariableOffsetVertex[];
  selfIntersections: SelfIntersection[];
}

/** Per-piece measurements shown in the inspector and exported as metadata. */
export interface PieceMetrics {
  finished: { width: number; height: number };
  cut: { width: number; height: number };
  cutArea: number;
  allowanceArea: number;
  quantity: number;
}

export type PieceValidation = { ok: true } | { ok: false; message: string; edge?: EntityId };

/** The finished width a kind contributes to the cut distance. */
export function allowanceDistance(allowance: Allowance): number {
  return allowance.kind === 'double' ? allowance.width * 2 : allowance.width;
}

/** The allowance for one loop edge, or `undefined` when it has none. */
export function allowanceForEdge(piece: Piece, edge: EntityId): Allowance | undefined {
  return piece.allowances.find((allowance) => allowance.edge === edge);
}

/** The piece a loop edge belongs to, or `undefined`. */
export function pieceForEdge(
  document: PatternDocument,
  edge: EntityId,
  ignorePiece?: EntityId,
): Piece | undefined {
  return document.pieces.find((piece) => piece.id !== ignorePiece && piece.edges.includes(edge));
}

/** A piece by id. */
export function pieceById(document: PatternDocument, id: EntityId): Piece | undefined {
  return document.pieces.find((piece) => piece.id === id);
}

/** The edge entities of a piece, in stored loop order, skipping anything missing. */
export function pieceEdges(document: PatternDocument, piece: Piece): PieceEdgeEntity[] {
  return piece.edges.flatMap((id) => {
    const entity = getEntity(document, id);
    if (
      entity === undefined ||
      entity.kind === 'point' ||
      entity.kind === 'circle' ||
      entity.construction
    ) {
      return [];
    }
    return [entity];
  });
}

/** The two point ids an edge runs between, or `null` for points and circles. */
export function edgeEndpointIds(entity: PieceEdgeEntity): [EntityId, EntityId] {
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end];
    case 'curve':
      return [entity.p0, entity.p3];
    case 'arc':
      return [entity.start, entity.end];
  }
}

function endpointPosition(document: PatternDocument, id: EntityId): Vec2 {
  // `validatePiece` has already resolved every referenced point of every edge.
  const entity = getEntity(document, id) as PointEntity;
  return { x: entity.x, y: entity.y };
}

const first = (points: Vec2[]): Vec2 => points[0]!;
const last = (points: Vec2[]): Vec2 => points[points.length - 1]!;

function connects(a: Vec2, b: Vec2): boolean {
  return magnitude(sub(a, b)) <= VERTEX_TOLERANCE;
}

/**
 * Validate that a selection forms one closed chain a piece can own: at least
 * three distinct cut line/curve/arc edges, no circle or construction edge, no
 * edge already in another piece, and every consecutive pair meeting at a vertex
 * with the last meeting the first.
 */
export function validatePiece(
  document: PatternDocument,
  edges: readonly EntityId[],
  options: { ignorePiece?: EntityId } = {},
): PieceValidation {
  if (edges.length < 3) {
    return { ok: false, message: 'A piece needs at least three edges.' };
  }
  if (new Set(edges).size !== edges.length) {
    const duplicate = edges.find((id, index) => edges.indexOf(id) !== index)!;
    return {
      ok: false,
      message: `Edge ${duplicate} is selected more than once.`,
      edge: duplicate,
    };
  }

  const entities: PieceEdgeEntity[] = [];
  for (const id of edges) {
    const entity = getEntity(document, id);
    if (entity === undefined) {
      return { ok: false, message: `Edge ${id} does not exist.`, edge: id };
    }
    if (entity.kind === 'point') {
      return { ok: false, message: `Edge ${id} is a point, not a cut edge.`, edge: id };
    }
    if (entity.kind === 'circle') {
      return {
        ok: false,
        message: `Edge ${id} is a circle; circle pieces are not supported yet.`,
        edge: id,
      };
    }
    if (entity.construction) {
      return { ok: false, message: `Edge ${id} is construction geometry.`, edge: id };
    }
    if (pieceForEdge(document, id, options.ignorePiece) !== undefined) {
      return { ok: false, message: `Edge ${id} already belongs to another piece.`, edge: id };
    }
    try {
      // A dangling point reference makes `edgePolyline` throw; report it as a
      // rejected selection instead of leaking a raw error through the command layer.
      entityPoints(document, entity);
    } catch {
      return { ok: false, message: `Edge ${id} references a missing point.`, edge: id };
    }
    const polyline = edgePolyline(document, id);
    if (polyline === null || polyline.length < 2) {
      return { ok: false, message: `Edge ${id} has no usable geometry.`, edge: id };
    }
    entities.push(entity);
  }

  for (let i = 0; i < entities.length; i += 1) {
    const current = entities[i]!;
    const next = entities[(i + 1) % entities.length]!;
    const currentPoints = edgeEndpointIds(current).map((id) => endpointPosition(document, id));
    const nextPoints = edgeEndpointIds(next).map((id) => endpointPosition(document, id));
    const meets = currentPoints.some((point) =>
      nextPoints.some((candidate) => connects(point, candidate)),
    );
    if (!meets) {
      return {
        ok: false,
        message: `Edge ${current.id} does not connect to edge ${next.id}.`,
        edge: next.id,
      };
    }
  }

  return { ok: true };
}

/** Signed area of a closed polyline; positive means counter-clockwise. */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function reverse(points: readonly Vec2[]): Vec2[] {
  return [...points].reverse();
}

/**
 * Flatten the piece's edges into one closed boundary, reversing any edge whose
 * stored direction runs against the walk. Returns `null` when the edges cannot
 * be walked as one closed loop.
 */
function orientedPolylines(
  document: PatternDocument,
  piece: Piece,
): { polylines: Vec2[][]; reversed: boolean[] } | null {
  const edges = pieceEdges(document, piece);
  if (edges.length !== piece.edges.length || edges.length < 3) return null;

  const polylines = edges.map((edge) => edgePolyline(document, edge.id));
  if (polylines.some((polyline) => polyline === null)) return null;
  const resolved = polylines as Vec2[][];
  const reversed = resolved.map(() => false);

  const second = resolved[1]!;
  const firstEnd = last(resolved[0]!);
  if (!connects(firstEnd, first(second)) && !connects(firstEnd, last(second))) {
    resolved[0] = reverse(resolved[0]!);
    reversed[0] = true;
  }

  let current = last(resolved[0]!);
  for (let i = 1; i < resolved.length; i += 1) {
    const polyline = resolved[i]!;
    if (connects(current, first(polyline))) {
      current = last(polyline);
      continue;
    }
    if (connects(current, last(polyline))) {
      resolved[i] = reverse(polyline);
      reversed[i] = true;
      current = last(resolved[i]!);
      continue;
    }
    return null;
  }

  if (!connects(current, first(resolved[0]!))) return null;
  return { polylines: resolved, reversed };
}

/**
 * Resolve the stitch boundary and the signed outward distance of every segment.
 * Outward is away from the loop interior, derived from the walk's winding, so
 * no stored side is needed. Returns `null` for an unresolvable loop.
 */
export function pieceLoop(document: PatternDocument, piece: Piece): PieceLoop | null {
  const oriented = orientedPolylines(document, piece);
  if (oriented === null) return null;

  const boundary: Vec2[] = [];
  const naturalStart: number[] = [];
  const spans: number[] = [];

  for (const polyline of oriented.polylines) {
    naturalStart.push(boundary.length);
    spans.push(polyline.length - 1);
    for (let i = 0; i < polyline.length - 1; i += 1) {
      boundary.push(polyline[i]!);
    }
  }

  const sign = signedArea(boundary) > 0 ? -1 : 1;
  const distances: number[] = [];
  const edges = pieceEdges(document, piece);
  edges.forEach((edge, index) => {
    const allowance = allowanceForEdge(piece, edge.id);
    const distance = allowance === undefined ? 0 : sign * allowanceDistance(allowance);
    for (let i = 0; i < spans[index]!; i += 1) distances.push(distance);
  });

  // A reversed edge traverses its natural start at the far end of its span.
  const naturalStarts = naturalStart.map((start, index) => {
    if (!oriented.reversed[index]) return start;
    const end = (start + spans[index]!) % boundary.length;
    return end;
  });

  return { points: boundary, distances, naturalStart: naturalStarts, spans };
}

/** The cut loop: the stitch boundary offset per edge and joined at every vertex. */
export function pieceCutLoop(document: PatternDocument, piece: Piece): PieceCutLoop | null {
  const loop = pieceLoop(document, piece);
  if (loop === null) return null;

  const detailed = offsetVariablePolylineDetailed(loop.points, loop.distances, { closed: true });
  return {
    points: detailed.points,
    vertices: detailed.vertices,
    selfIntersections: findSelfIntersections(detailed.points, { closed: true }),
  };
}

/**
 * The fold line of a double-fold piece, at the finished width inside the cut
 * line. Empty when no loop edge is a double fold. For a uniformly doubled piece
 * this loop is exactly the single-fold cut outline.
 */
export function pieceFoldLines(document: PatternDocument, piece: Piece): Vec2[][] {
  const loop = pieceLoop(document, piece);
  if (loop === null) return [];

  const sign = signedArea(loop.points) > 0 ? -1 : 1;
  let hasDouble = false;
  const distances: number[] = [];
  const edges = pieceEdges(document, piece);

  edges.forEach((edge, index) => {
    const allowance = allowanceForEdge(piece, edge.id);
    const distance =
      allowance !== undefined && allowance.kind === 'double' ? sign * allowance.width : 0;
    if (distance !== 0) hasDouble = true;
    for (let i = 0; i < loop.spans[index]!; i += 1) distances.push(distance);
  });

  if (!hasDouble) return [];
  return [offsetVariablePolyline(loop.points, distances, { closed: true })];
}

/**
 * The resolved cut-loop point at one end of a loop edge, or `null` when the
 * piece or its cut loop no longer resolves.
 */
export function pieceCutVertex(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): Vec2 | null {
  const edgeIndex = piece.edges.indexOf(anchor.edge);
  if (edgeIndex < 0) return null;

  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  const start = loop.naturalStart[edgeIndex]!;
  const vertexIndex =
    anchor.at === 'start' ? start : (start + loop.spans[edgeIndex]!) % loop.points.length;
  // The closed cut loop has one vertex entry per source point.
  const vertex = cut.vertices[vertexIndex]!;
  return cut.points[vertex.start]!;
}

/** Axis-aligned bounds of a closed loop, or `null` for an empty loop. */
export function loopBounds(points: readonly Vec2[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** The cut loop's bounding box, or `null` when the piece cannot resolve. */
export function pieceCutBounds(document: PatternDocument, piece: Piece): Bounds | null {
  const cut = pieceCutLoop(document, piece);
  return cut === null ? null : loopBounds(cut.points);
}

function areaOf(points: readonly Vec2[]): number {
  return Math.abs(signedArea(points));
}

/** Finished and cut sizes, cut area, allowance area and quantity for a piece. */
export function pieceMetrics(document: PatternDocument, piece: Piece): PieceMetrics | null {
  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  // A resolved loop always has at least three points.
  const finished = loopBounds(loop.points)!;
  const cutBounds = loopBounds(cut.points)!;

  const finishedArea = areaOf(loop.points);
  const cutArea = areaOf(cut.points);
  return {
    finished: {
      width: finished.max.x - finished.min.x,
      height: finished.max.y - finished.min.y,
    },
    cut: {
      width: cutBounds.max.x - cutBounds.min.x,
      height: cutBounds.max.y - cutBounds.min.y,
    },
    cutArea,
    allowanceArea: cutArea - finishedArea,
    quantity: piece.quantity ?? 1,
  };
}

/**
 * Every simple closed chain among `edgeIds` (default: every cut line, curve and
 * arc). A component qualifies only when every vertex joins exactly two of its
 * edges, so a branch or an open chain is never mistaken for a loop. Used by the
 * 0.1 migration to adopt closed seam chains.
 */
export function basicPieceForLoops(
  document: PatternDocument,
  edgeIds?: readonly EntityId[],
): EntityId[][] {
  const candidates = new Set(
    edgeIds ??
      document.entities
        .filter(
          (entity): entity is PieceEdgeEntity =>
            entity.kind === 'line' || entity.kind === 'curve' || entity.kind === 'arc',
        )
        .filter((entity) => !entity.construction)
        .map((entity) => entity.id),
  );

  const endpoints = new Map<EntityId, [EntityId, EntityId]>();
  const incident = new Map<EntityId, EntityId[]>();

  for (const id of candidates) {
    const entity = getEntity(document, id);
    if (
      entity === undefined ||
      entity.kind === 'point' ||
      entity.kind === 'circle' ||
      entity.construction
    ) {
      continue;
    }
    const [start, end] = edgeEndpointIds(entity);
    if (
      getEntity(document, start)?.kind !== 'point' ||
      getEntity(document, end)?.kind !== 'point'
    ) {
      continue;
    }
    endpoints.set(id, [start, end]);
    incident.set(start, [...(incident.get(start) ?? []), id]);
    incident.set(end, [...(incident.get(end) ?? []), id]);
  }

  const remaining = new Set(endpoints.keys());
  const loops: EntityId[][] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as EntityId;
    const component = new Set<EntityId>();
    const vertices = new Set<EntityId>();
    const stack = [seed];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (component.has(id)) continue;
      component.add(id);
      remaining.delete(id);
      for (const vertex of endpoints.get(id)!) {
        vertices.add(vertex);
        for (const neighbour of incident.get(vertex)!) {
          if (!component.has(neighbour) && remaining.has(neighbour)) stack.push(neighbour);
        }
      }
    }

    const simple = [...vertices].every((vertex) => incident.get(vertex)!.length === 2);
    if (!simple || component.size < 3) continue;

    const walk: EntityId[] = [];
    const start = component.values().next().value as EntityId;
    let current = start;
    let vertex = endpoints.get(start)![0];

    while (walk.length < component.size) {
      walk.push(current);
      const [a, b] = endpoints.get(current)!;
      const nextVertex = a === vertex ? b : a;
      const next = incident.get(nextVertex)!.find((id) => id !== current)!;
      if (next === start) break;
      current = next;
      vertex = nextVertex;
    }

    // Every vertex has degree two, so this walk is the component's single cycle.
    loops.push(walk);
  }

  return loops;
}

export const ALLOWANCE_KIND_LABELS: Record<AllowanceKind, string> = {
  seam: 'Seam',
  single: 'Single fold',
  double: 'Double fold',
};

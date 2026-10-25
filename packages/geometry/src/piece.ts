import { getEntity, entityPoints, type Bounds } from './document.js';
import { roundBridge } from './corner-round.js';
import { isAnnotation, isCut } from './roles.js';
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

/** One segment of a resolved piece loop: a stored edge or a derived round bridge. */
interface LoopSegment {
  /** Polyline in walk direction. */
  points: Vec2[];
  /** Index into `piece.edges`, or `null` for a derived bridge. */
  edgeIndex: number | null;
  /** Whether the stored edge runs against the walk; bridges are already oriented. */
  reversed: boolean;
}

type LoopAssembly = { ok: true; segments: LoopSegment[] } | { ok: false; edgeIndex: number };

/** A piece loop resolved against the current document. */
export interface PieceLoop {
  /** Closed polyline of the stitch boundary, in loop order. */
  points: Vec2[];
  /** One signed outward distance per boundary segment. */
  distances: number[];
  /** Boundary vertex index where each edge's span starts in walk order. */
  starts: number[];
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
      entity.kind === 'text' ||
      entity.kind === 'circle' ||
      !isCut(entity)
    ) {
      return [];
    }
    try {
      // A dangling point reference makes the whole loop unresolvable; report it
      // as an absent edge so every derived function degrades to `null` rather
      // than throwing during a render or an export.
      entityPoints(document, entity);
    } catch {
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

const first = (points: readonly Vec2[]): Vec2 => points[0]!;
const last = (points: readonly Vec2[]): Vec2 => points[points.length - 1]!;

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
  options: { ignorePiece?: EntityId; piece?: EntityId } = {},
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

  const polylines: Vec2[][] = [];
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
    if (isAnnotation(entity)) {
      return {
        ok: false,
        message: `Edge ${id} is annotation geometry and cannot be a cut edge.`,
        edge: id,
      };
    }
    if (!isCut(entity)) {
      return { ok: false, message: `Edge ${id} is construction geometry.`, edge: id };
    }
    if (
      options.piece !== undefined &&
      entity.piece !== undefined &&
      entity.piece !== options.piece
    ) {
      return { ok: false, message: `Edge ${id} belongs to another piece.`, edge: id };
    }
    if (
      options.piece === undefined &&
      pieceForEdge(document, id, options.ignorePiece) !== undefined
    ) {
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
    polylines.push(polyline);
  }

  // Walk the ordered edges as one chain: each edge must continue where the
  // previous one ended, and the last must close back to the first. A corner that
  // a committed round has trimmed leaves a gap; `assembleLoop` fills it with the
  // round's derived arc, so a piece stays one closed loop around the round.
  const assembly = assembleLoop(document, edges, polylines);
  if (!assembly.ok) {
    const index = assembly.edgeIndex;
    if (index === 0) {
      return {
        ok: false,
        message: `Edge ${edges[edges.length - 1]} does not connect to edge ${edges[0]}.`,
        edge: edges[0]!,
      };
    }
    return {
      ok: false,
      message: `Edge ${edges[index - 1]} does not connect to edge ${edges[index]}.`,
      edge: edges[index]!,
    };
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
 * Walk the stored edges in one direction, inserting a committed round's arc
 * wherever consecutive edges no longer meet because the round trimmed them.
 * Returns the failing edge index when the chain does not close.
 */
function walkLoop(
  document: PatternDocument,
  edgeIds: readonly EntityId[],
  polylines: readonly Vec2[][],
  reverseFirst: boolean,
): LoopAssembly {
  const firstPolyline = reverseFirst ? reverse(polylines[0]!) : [...polylines[0]!];
  const segments: LoopSegment[] = [{ points: firstPolyline, edgeIndex: 0, reversed: reverseFirst }];
  let current = last(firstPolyline);

  for (let i = 1; i < edgeIds.length; i += 1) {
    const polyline = polylines[i]!;
    let points: Vec2[] | null = null;
    let reversed = false;
    if (connects(current, first(polyline))) {
      points = [...polyline];
    } else if (connects(current, last(polyline))) {
      points = reverse(polyline);
      reversed = true;
    }

    if (points === null) {
      // `roundBridge` returns the arc already running from the previous edge's
      // tangent to the next one, which is exactly where the walk stands.
      const bridge = roundBridge(document, edgeIds[i - 1]!, edgeIds[i]!);
      if (bridge === null) return { ok: false, edgeIndex: i };

      segments.push({ points: bridge, edgeIndex: null, reversed: false });
      current = last(bridge);
      if (connects(current, first(polyline))) {
        points = [...polyline];
      } else if (connects(current, last(polyline))) {
        points = reverse(polyline);
        reversed = true;
      } else {
        return { ok: false, edgeIndex: i };
      }
    }

    segments.push({ points, edgeIndex: i, reversed });
    current = last(points);
  }

  const origin = first(firstPolyline);
  if (!connects(current, origin)) {
    const bridge = roundBridge(document, edgeIds[edgeIds.length - 1]!, edgeIds[0]!);
    if (bridge === null) return { ok: false, edgeIndex: 0 };

    segments.push({ points: bridge, edgeIndex: null, reversed: false });
    if (!connects(last(bridge), origin)) return { ok: false, edgeIndex: 0 };
  }

  return { ok: true, segments };
}

/**
 * Resolve the stored edges into one closed walk, trying the stored direction
 * first and the reversed direction second. Bridges are derived on read.
 */
function assembleLoop(
  document: PatternDocument,
  edgeIds: readonly EntityId[],
  polylines: readonly Vec2[][],
): LoopAssembly {
  // Mirror the walk's historical first-edge heuristic: when the first edge's
  // end does not meet the second edge, the walk probably runs the other way.
  const second = polylines[1]!;
  const firstEnd = last(polylines[0]!);
  const reverseFirst = !connects(firstEnd, first(second)) && !connects(firstEnd, last(second));

  const preferred = walkLoop(document, edgeIds, polylines, reverseFirst);
  if (preferred.ok) return preferred;

  const fallback = walkLoop(document, edgeIds, polylines, !reverseFirst);
  return fallback.ok ? fallback : preferred;
}

/**
 * The allowance a bridge carries: both adjacent edges must agree (both absent,
 * or the same width and effective kind). `null` when they disagree.
 */
function sharedAllowance(
  before: Allowance | undefined,
  after: Allowance | undefined,
): { allowance: Allowance | undefined } | null {
  if (before === undefined || after === undefined) {
    return before === after ? { allowance: undefined } : null;
  }
  if (before.width !== after.width || (before.kind ?? 'seam') !== (after.kind ?? 'seam')) {
    return null;
  }
  return { allowance: before };
}

/**
 * The unsigned allowance distance of every boundary segment, in walk order, or
 * `null` when a bridge joins two edges whose allowances disagree.
 */
function loopDistances(
  piece: Piece,
  edges: readonly PieceEdgeEntity[],
  segments: readonly LoopSegment[],
  fold: boolean,
): number[] | null {
  const distances: number[] = [];

  for (const [index, segment] of segments.entries()) {
    let allowance: Allowance | undefined;
    if (segment.edgeIndex === null) {
      const before = segments[index - 1]!.edgeIndex!;
      // Segments alternate edge/bridge, so the next segment is always an edge;
      // a closing bridge wraps to the first one.
      const after = segments[(index + 1) % segments.length]!.edgeIndex!;
      const shared = sharedAllowance(
        allowanceForEdge(piece, edges[before]!.id),
        allowanceForEdge(piece, edges[after]!.id),
      );
      if (shared === null) return null;
      allowance = shared.allowance;
    } else {
      allowance = allowanceForEdge(piece, edges[segment.edgeIndex]!.id);
    }

    const width =
      allowance === undefined
        ? 0
        : fold
          ? allowance.kind === 'double'
            ? allowance.width
            : 0
          : allowanceDistance(allowance);
    for (let i = 0; i < segment.points.length - 1; i += 1) distances.push(width);
  }

  return distances;
}

/**
 * Flatten the piece's edges into one closed boundary, reversing any edge whose
 * stored direction runs against the walk and inserting a committed round's arc
 * where a rounded corner leaves a gap. Returns `null` when the edges cannot be
 * walked as one closed loop.
 */
function orientedPolylines(document: PatternDocument, piece: Piece): LoopSegment[] | null {
  const edges = pieceEdges(document, piece);
  if (edges.length !== piece.edges.length || edges.length < 3) return null;

  const polylines = edges.map((edge) => edgePolyline(document, edge.id));
  if (polylines.some((polyline) => polyline === null)) return null;

  const assembly = assembleLoop(document, piece.edges, polylines as Vec2[][]);
  return assembly.ok ? assembly.segments : null;
}

/**
 * Resolve the stitch boundary and the signed outward distance of every segment.
 * Outward is away from the loop interior, derived from the walk's winding, so
 * no stored side is needed. Returns `null` for an unresolvable loop.
 */
export function pieceLoop(document: PatternDocument, piece: Piece): PieceLoop | null {
  const segments = orientedPolylines(document, piece);
  if (segments === null) return null;
  return loopFromSegments(piece, pieceEdges(document, piece), segments);
}

/** Resolve one loop from its already-oriented segments and per-edge allowances. */
function loopFromSegments(
  piece: Piece,
  edges: readonly PieceEdgeEntity[],
  segments: LoopSegment[],
): PieceLoop | null {
  const boundary: Vec2[] = [];
  const starts = new Array<number>(edges.length).fill(0);
  const spans = new Array<number>(edges.length).fill(0);

  for (const segment of segments) {
    if (segment.edgeIndex !== null) {
      starts[segment.edgeIndex] = boundary.length;
      spans[segment.edgeIndex] = segment.points.length - 1;
    }
    for (let i = 0; i < segment.points.length - 1; i += 1) {
      boundary.push(segment.points[i]!);
    }
  }

  const unsigned = loopDistances(piece, edges, segments, false);
  if (unsigned === null) return null;

  const sign = signedArea(boundary) > 0 ? -1 : 1;
  const distances = unsigned.map((distance) => sign * distance);

  // A reversed edge traverses its natural start at the far end of its span.
  const naturalStart = starts.map((start, index) => {
    const segment = segments.find((candidate) => candidate.edgeIndex === index)!;
    if (!segment.reversed) return start;
    const end = (start + spans[index]!) % boundary.length;
    return end;
  });

  return { points: boundary, distances, starts, naturalStart, spans };
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
  const segments = orientedPolylines(document, piece);
  if (segments === null) return [];

  const loop = loopFromSegments(piece, pieceEdges(document, piece), segments);
  if (loop === null) return [];

  // `loopFromSegments` above already rejected a bridge whose two edges carry
  // different allowances, so the fold distances resolve for the same segments.
  const unsigned = loopDistances(piece, pieceEdges(document, piece), segments, true)!;
  if (unsigned.every((distance) => distance === 0)) return [];

  const sign = signedArea(loop.points) > 0 ? -1 : 1;
  return [
    offsetVariablePolyline(
      loop.points,
      unsigned.map((distance) => sign * distance),
      { closed: true },
    ),
  ];
}

/**
 * The boundary vertex of an edge's natural start and end. `naturalStart` already
 * points at the far end of a reversed edge's span, so its own end is the walk
 * start rather than one span further on.
 */
function edgeVertexIndex(loop: PieceLoop, edgeIndex: number, at: 'start' | 'end'): number {
  const start = loop.naturalStart[edgeIndex]!;
  if (at === 'start') return start;
  const walkStart = loop.starts[edgeIndex]!;
  // Equal starts mean the edge runs with the walk.
  return walkStart === start ? (start + loop.spans[edgeIndex]!) % loop.points.length : walkStart;
}

/**
 * The resolved cut-loop point at one end of a loop edge, or `null` when the
 * anchor addresses a whole edge or the piece or its cut loop no longer resolves.
 */
export function pieceCutVertex(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): Vec2 | null {
  // An edge anchor has no single vertex; only `start`/`end` address a cut vertex.
  if (anchor.at === 'edge') return null;

  const edgeIndex = piece.edges.indexOf(anchor.edge);
  if (edgeIndex < 0) return null;

  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  const vertexIndex = edgeVertexIndex(loop, edgeIndex, anchor.at);
  // The closed cut loop has one vertex entry per source point.
  const vertex = cut.vertices[vertexIndex]!;
  return cut.points[vertex.start]!;
}

/**
 * The edge's **own** cut segment: from the outgoing offset point at the edge's
 * natural start to the incoming offset point at its natural end. This is the
 * source line offset by the edge's allowance, independent of the adjacent
 * allowance, the join style and a corner round, so a bevel join cannot tilt it.
 * `null` for a missing edge, a non-line source or a cut loop that no longer
 * resolves.
 */
export function pieceCutEdge(
  document: PatternDocument,
  piece: Piece,
  edge: EntityId,
): { a: Vec2; b: Vec2 } | null {
  const edgeIndex = piece.edges.indexOf(edge);
  if (edgeIndex < 0) return null;

  // A curve's or arc's cut segment is a chord, not the curve, so it is never a
  // straight edge anchor.
  if (getEntity(document, edge)?.kind !== 'line') return null;

  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  // A compacted cut loop no longer has one vertex entry per source point, so an
  // edge's own span cannot be addressed; report the piece as unresolvable.
  if (cut.vertices.length !== loop.points.length) return null;

  const start = loop.starts[edgeIndex]!;
  const end = (start + loop.spans[edgeIndex]!) % cut.vertices.length;
  const a = cut.points[cut.vertices[start]!.end - 1]!;
  const b = cut.points[cut.vertices[end]!.start]!;
  return { a, b };
}

/** A resolved cut anchor: a loop vertex point or a whole edge's cut segment. */
export type CutAnchorResolution =
  { kind: 'vertex'; point: Vec2 } | { kind: 'edge'; segment: { a: Vec2; b: Vec2 } };

/** Resolve one cut anchor against the piece's cut loop, or `null` when it cannot. */
export function resolveCutAnchor(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): CutAnchorResolution | null {
  if (anchor.at === 'edge') {
    const segment = pieceCutEdge(document, piece, anchor.edge);
    return segment === null ? null : { kind: 'edge', segment };
  }

  const point = pieceCutVertex(document, piece, anchor);
  return point === null ? null : { kind: 'vertex', point };
}

/**
 * The resolved stitch-loop point at one end of a loop edge, or `null` when the
 * piece, the edge or its stitch loop does not resolve. Mirrors `pieceCutVertex`
 * index for index, so both loops agree vertex for vertex; a whole-edge anchor
 * has no stitch equivalent and returns `null`.
 */
export function pieceLoopVertex(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): Vec2 | null {
  if (anchor.at === 'edge') return null;

  const edgeIndex = piece.edges.indexOf(anchor.edge);
  if (edgeIndex < 0) return null;

  const loop = pieceLoop(document, piece);
  if (loop === null) return null;

  return loop.points[edgeVertexIndex(loop, edgeIndex, anchor.at)]!;
}

/** Resolve one anchor against the loop it names, or `null` when it cannot. */
export function resolvePieceAnchor(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): CutAnchorResolution | null {
  if ((anchor.loop ?? 'cut') === 'stitch') {
    const point = pieceLoopVertex(document, piece, anchor);
    return point === null ? null : { kind: 'vertex', point };
  }
  return resolveCutAnchor(document, piece, anchor);
}

/** Axis-aligned bounds of a closed loop, or `null` for an empty loop. */ export function loopBounds(
  points: readonly Vec2[],
): Bounds | null {
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

/**
 * A piece's own bounds: the stitch loop when it resolves, otherwise the bounds
 * of the points it owns. Shared by the piece-tab fit and the assembly anchor, so
 * an allowance edit never moves a placed instance.
 */
export function pieceBounds(document: PatternDocument, piece: Piece): Bounds | null {
  const loop = pieceLoop(document, piece);
  if (loop !== null) return loopBounds(loop.points);

  const owned = document.entities.filter(
    (entity): entity is PointEntity => entity.kind === 'point' && entity.piece === piece.id,
  );
  if (owned.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of owned) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
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
        .filter((entity) => isCut(entity))
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
      entity.kind === 'text' ||
      !isCut(entity)
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
